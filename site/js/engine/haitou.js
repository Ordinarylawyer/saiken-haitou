// 債権執行 配当計算 ― 計算エンジン
// ファイルを開くだけで動くように（file://）、モジュールにせず名前空間 HT に載せる。
// 画面からも Node のテストからも同じものを使う。DOM には触れない。
(function (g) {
  'use strict';
  const HT = (g.HT = g.HT || {});

  // ---------------------------------------------------------------
  // 定数
  // ---------------------------------------------------------------
  // 債権の種別
  //   GEN  一般債権（強制執行の差押え・配当要求）
  //   SUP2 扶養義務等債権のうち先取特権を行使していない部分
  //   SUP3 扶養義務等債権のうち子の監護費用の先取特権を行使した部分
  //   GPP  一般先取特権（gppClass: 1 共益費用 2 雇用関係 3 子の監護の費用 4 葬式の費用 5 日用品の供給）
  //   SEC  担保権（secType: MTG 抵当権の物上代位 / PLG 債権質権 / SPP 特別の先取特権）
  //   TAX  租税  PUB 公課
  //   PRV  仮差押え（一般債権として扱い、配当額は供託）
  HT.KINDS = ['GEN', 'SUP2', 'SUP3', 'GPP', 'SEC', 'TAX', 'PUB', 'PRV'];
  HT.KIND_LABEL = {
    GEN: '一般債権', SUP2: '扶養義務等債権', SUP3: '扶養義務等債権（子の監護費用の先取特権）', GPP: '一般先取特権',
    SEC: '担保権', TAX: '租税', PUB: '公課', PRV: '仮差押え',
  };
  HT.GPP_CLASS_LABEL = { 1: '共益費用', 2: '雇用関係', 3: '子の監護の費用', 4: '葬式の費用', 5: '日用品の供給' };
  HT.SEC_TYPE_LABEL = { MTG: '抵当権（物上代位）', PLG: '債権質権', SPP: '特別の先取特権' };

  // 子の監護費用の先取特権（民法308条の2、令和7年法務省令第56号1条）
  HT.SUPPORT_LIEN_START = '2026-04-01';
  HT.SUPPORT_LIEN_PER_CHILD = 80000;

  // 国税徴収法76条1項4号（国税徴収法施行令34条）。施行日ごとの額
  HT.NTA76_TABLE = [
    { from: '0000-01-01', base: 100000, perDependent: 45000 },
    { from: '2026-04-01', base: 107000, perDependent: 48000 },
  ];

  // 供託利息（供託規則33条）。利率は期間ごと。現行利率は実装前に確認すること
  HT.DEPOSIT_RATE_TABLE = [
    { from: '1978-03-01', rate: 0.012 },
    { from: '1982-04-01', rate: 0 },
    { from: '1991-04-01', rate: 0.012 },
    { from: '1994-04-01', rate: 0.006 },
    { from: '1996-04-01', rate: 0.0024 },
    { from: '1998-04-01', rate: 0.0012 },
    { from: '2002-04-01', rate: 0.00024 },
  ];

  HT.DEFAULT_SETTINGS = {
    remainder: 'fraction',   // D-13 端数の配り方: fraction（小数点以下の大きい順。近藤基「債権配当の実務と書式〔第3版〕」187頁（民事法研究会・2021年））| order（記載順）
    costAllocation: 'outer', // 供託費用・手続費用を差し引く部分: outer（最初に配る超過部分から。最優先なので最初の部分で償還される）| inner | proportional
    stayedDeposit: 'cutoff',  // 執行停止中の供託: cutoff（供託の時に終期。民執法165条1号の文言）| nocutoff（停止が解けた時を基準）
    supportApplication: 'statutory', // D-14 先取特権のない部分への配当で先取特権の被担保債権額が減るか: statutory（減る）| fixed（減らない）
  };

  // ---------------------------------------------------------------
  // 小道具
  // ---------------------------------------------------------------
  const int = (v) => {
    const n = typeof v === 'string' ? Number(v.replace(/[,，\s円]/g, '')) : Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  };
  HT.int = int;
  const sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);
  const floor1000 = (x) => Math.floor(x / 1000) * 1000;
  const ceil1000 = (x) => Math.ceil(x / 1000) * 1000;
  const isPublic = (c) => c.kind === 'TAX' || c.kind === 'PUB';
  HT.isPublic = isPublic;

  // 債権の請求額（按分の基礎）。根抵当権は極度額と少ない方
  function claimTotal(c) {
    const t = int(c.cost) + int(c.interest) + int(c.damages) + int(c.principal);
    return c.maxAmount ? Math.min(t, int(c.maxAmount)) : t;
  }
  HT.claimTotal = claimTotal;

  // 順位の層（tier）
  function tierOf(c) {
    switch (c.kind) {
      case 'SEC': return c._relative ? 'GEN' : 'SEC';
      case 'TAX': return 'TAX';
      case 'PUB': return 'PUB';
      case 'GPP': case 'SUP3': return 'GPP';
      default: return 'GEN';
    }
  }
  const gppClass = (c) => (c.kind === 'SUP3' ? 3 : int(c.gppClass) || 2);

  // ---------------------------------------------------------------
  // 給料等の差押可能額（区画の区切り）
  // ---------------------------------------------------------------
  // 民執法152条1項・3項、同法施行令2条。net = 給料等から所得税・住民税・社会保険料を控除した残額（手取額）
  HT.wageCaps = function (net) {
    net = int(net);
    const q = net - Math.min(Math.ceil(net * 3 / 4), 330000);
    const h = net - Math.min(Math.ceil(net / 2), 330000);
    return { Q: Math.max(0, q), H: Math.max(0, h) };
  };

  // 国税徴収法76条1項による差押可能額（区画T）
  // w: { gross, incomeTax, residentTax, socialInsurance, dependents, payDate }
  // 1か月以上の期間を前提に、給料等は千円未満切捨て、各号の額は千円未満切上げ（国税徴収法基本通達76条関係3）
  HT.taxSeizable = function (w) {
    const row = HT.NTA76_TABLE.filter((r) => (w.payDate || '9999-12-31') >= r.from).pop();
    const gross = floor1000(int(w.gross));
    const d1 = ceil1000(int(w.incomeTax));
    const d2 = ceil1000(int(w.residentTax));
    const d3 = ceil1000(int(w.socialInsurance));
    const d4 = ceil1000(row.base + row.perDependent * int(w.dependents));
    const rest = gross - d1 - d2 - d3 - d4;
    const d5 = rest > 0 ? Math.min(ceil1000(rest * 0.2), d4 * 2) : 0;
    return Math.max(0, gross - d1 - d2 - d3 - d4 - d5);
  };

  // ---------------------------------------------------------------
  // 供託利息（供託規則33条）
  // 受入れの月と払渡しの月を除いた月数に付す。元金は1万円未満切捨て、利息は1円未満切捨て
  // ---------------------------------------------------------------
  HT.depositInterest = function (amount, depositDate, payDate) {
    const principal = Math.floor(int(amount) / 10000) * 10000;
    if (!principal || !depositDate || !payDate) return 0;
    const [y1, m1] = depositDate.split('-').map(Number);
    const [y2, m2] = payDate.split('-').map(Number);
    let total = 0;
    const end = y2 * 12 + (m2 - 1);
    for (let k = y1 * 12 + (m1 - 1) + 1; k < end; k++) {
      const ym = `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}-01`;
      const row = HT.DEPOSIT_RATE_TABLE.filter((r) => ym >= r.from).pop();
      total += principal * (row ? row.rate : 0) / 12;
    }
    return Math.floor(total + 1e-9);
  };

  // ---------------------------------------------------------------
  // 日付
  // ---------------------------------------------------------------
  const dayNum = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
  const isoOf = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
  HT.addDays = (iso, k) => (iso ? isoOf(dayNum(iso) + k) : '');
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

  // ---------------------------------------------------------------
  // 利息・損害金の日割計算
  // base 円、ratePct 年利（%。"14.6" のような小数も可）、from〜to（両端を含む）
  // basis: '365'（うるう年も365日で割る。「年365日の日割計算」）| 'actual'（うるう年の日は366日で割る）
  // 1円未満は切り捨てる。誤差を避けるため整数（BigInt）で計算する
  // ---------------------------------------------------------------
  HT.calcInterest = function (base, ratePct, from, to, basis) {
    base = int(base);
    const rs = String(ratePct == null ? '' : ratePct).replace(/[%％\s]/g, '');
    if (!base || !rs || !from || !to || !/^\d+(\.\d+)?$/.test(rs)) return { amount: 0, days: 0 };
    const dec = (rs.split('.')[1] || '').length;
    const rNum = BigInt(rs.replace('.', ''));
    const rDen = 10n ** BigInt(dec) * 100n;
    const d0 = dayNum(from), d1 = dayNum(to);
    if (d1 < d0) return { amount: 0, days: 0 };
    const days = d1 - d0 + 1;
    let amount;
    if (basis === 'actual') {
      // 年ごとに 365日・366日の日数を数える
      let n365 = 0n, n366 = 0n;
      let y = Number(from.slice(0, 4));
      let cur = d0;
      while (cur <= d1) {
        const yEnd = Math.min(d1, dayNum(`${y}-12-31`));
        const n = BigInt(yEnd - cur + 1);
        if (isLeap(y)) n366 += n; else n365 += n;
        cur = yEnd + 1; y++;
      }
      amount = (BigInt(base) * rNum * (n365 * 366n + n366 * 365n)) / (rDen * 365n * 366n);
    } else {
      amount = (BigInt(base) * rNum * BigInt(days)) / (rDen * 365n);
    }
    return { amount: Number(amount), days };
  };

  // 債権の計算行（calcs）を配当期日まで計算した額。戻り値 { interest, damages, lines }
  HT.calcClaimExtras = function (c, payDate) {
    const out = { interest: 0, damages: 0, lines: [] };
    for (const l of c.calcs || []) {
      const to = l.to || payDate || '';
      const r = HT.calcInterest(l.base, l.rate, l.from, to, l.basis);
      const target = l.target === 'interest' ? 'interest' : 'damages';
      out[target] += r.amount;
      out.lines.push(Object.assign({}, l, { to, amount: r.amount, days: r.days }));
    }
    return out;
  };

  // ---------------------------------------------------------------
  // 扶養義務等債権の分解（子の監護費用の先取特権の部分とそれ以外）
  // installments: [{ due, amount, children }], agreedOn: 取決めの日, asserted: 先取特権を行使したか
  // 改正法附則3条1項：施行日前の取決めは、施行日以後に生じた各期の定期金に限り先取特権
  // ---------------------------------------------------------------
  HT.splitSupport = function (installments, agreedOn, asserted) {
    let lien = 0, other = 0;
    for (const it of installments || []) {
      const p = int(it.amount);
      const covered = asserted && ((it.due || '') >= HT.SUPPORT_LIEN_START || (agreedOn || '') >= HT.SUPPORT_LIEN_START);
      const l = covered ? Math.min(p, HT.SUPPORT_LIEN_PER_CHILD * Math.max(1, int(it.children) || 1)) : 0;
      lien += l; other += p - l;
    }
    return { lien, other };
  };

  // ---------------------------------------------------------------
  // 二者間の優劣
  // 戻り値: 1 = a が先順位、-1 = b が先順位、0 = 同順位
  // ignorePublicMutual: 国税徴収法26条の第1段階（公債権相互の順位を考えない）
  // ---------------------------------------------------------------
  function cmpPublic(a, b) {
    if (a.kind !== b.kind) return a.kind === 'TAX' ? 1 : -1;   // 租税は公課に常に優先
    if (!!a.secured !== !!b.secured) return a.secured ? 1 : -1; // 担保を徴した租税（国税徴収法14条）
    const da = a.demandAt || '', db = b.demandAt || '';         // 交付要求先着手（みなし交付要求を含む。同法13条）
    if (da && db && da !== db) return da < db ? 1 : -1;
    return 0;
  }
  function secVsPublic(s, p) {
    if (s.taxPriority) return 1;                     // 国税徴収法19条・20条に当たる先取特権
    if (s.secType === 'SPP') return -1;              // それ以外の先取特権は公租公課に劣後
    if (!s.perfectedOn || !p.legalDue) return -1;
    return s.perfectedOn <= p.legalDue ? 1 : -1;     // 法定納期限等以前に設定（対抗要件）なら担保権が優先
  }
  function cmpSec(a, b) {
    const da = a.perfectedOn || '', db = b.perfectedOn || '';
    if (da && db && da !== db) return da < db ? 1 : -1;
    return 0;
  }
  function secVsGpp(s, p) {
    if (s.secType === 'SPP') return gppClass(p) === 1 ? -1 : 1; // 特別の先取特権は一般の先取特権に優先（共益費用を除く。民法329条2項）
    const ds = s.perfectedOn || '', dp = p.effectiveOn || '';     // 先取特権の差押えの効力発生時と設定登記・対抗要件の先後
    if (ds && dp) return ds <= dp ? 1 : -1;
    return 1;
  }
  function rel(a, b, ignorePublicMutual) {
    const ta = tierOf(a), tb = tierOf(b);
    if (isPublic(a) && isPublic(b)) return ignorePublicMutual ? 0 : cmpPublic(a, b);
    if (ta === 'SEC' && isPublic(b)) return secVsPublic(a, b);
    if (tb === 'SEC' && isPublic(a)) return -secVsPublic(b, a);
    if (ta === 'SEC' && tb === 'SEC') return cmpSec(a, b);
    if (ta === 'SEC' && tb === 'GPP') return secVsGpp(a, b);
    if (tb === 'SEC' && ta === 'GPP') return -secVsGpp(b, a);
    if (ta === 'SEC') return 1;
    if (tb === 'SEC') return -1;
    if (isPublic(a)) return 1;
    if (isPublic(b)) return -1;
    if (ta === 'GPP' && tb === 'GPP') { const x = gppClass(a), y = gppClass(b); return x === y ? 0 : (x < y ? 1 : -1); }
    if (ta === 'GPP') return 1;
    if (tb === 'GPP') return -1;
    return 0;
  }
  HT.rel = rel;

  // 順位の層に分ける（先順位から）。循環すれば null
  function layers(claims, ignorePublicMutual) {
    let remaining = claims.slice();
    const out = [];
    while (remaining.length) {
      const top = remaining.filter((a) => !remaining.some((b) => b !== a && rel(b, a, ignorePublicMutual) === 1));
      if (!top.length) return null;
      out.push(top);
      remaining = remaining.filter((x) => !top.includes(x));
    }
    return out;
  }
  HT.layers = layers;

  // ---------------------------------------------------------------
  // 按分（整数で計算し、端数の残りを配る）
  // items: [{ key, base, order }]。戻り値 Map(key -> 額)
  // ---------------------------------------------------------------
  function prorata(amount, items, mode) {
    const res = new Map();
    const total = sum(items, (x) => x.base);
    if (amount <= 0 || total <= 0) { items.forEach((x) => res.set(x.key, 0)); return res; }
    if (amount >= total) { items.forEach((x) => res.set(x.key, x.base)); return res; }
    const A = BigInt(amount), T = BigInt(total);
    let given = 0;
    const fr = [];
    for (const x of items) {
      const num = A * BigInt(x.base);
      const q = Number(num / T);
      res.set(x.key, q);
      given += q;
      fr.push({ x, frac: Number(num % T) });
    }
    let left = amount - given;
    const order = mode === 'fraction'
      ? fr.slice().sort((p, q) => q.frac - p.frac || p.x.order - q.x.order)
      : fr.slice().sort((p, q) => p.x.order - q.x.order);
    for (const { x } of order) {
      if (left <= 0) break;
      if (res.get(x.key) < x.base) { res.set(x.key, res.get(x.key) + 1); left--; }
    }
    return res;
  }
  HT.prorata = prorata;

  // 同順位の層の中で配る（抵当権の物上代位の相対的優劣は吸収方式。D-7）
  function allocLayer(amount, layer, rem, settings) {
    const items = layer.map((c) => ({ key: c.id, base: rem.get(c.id), order: c._order }));
    const got = prorata(amount, items, settings.remainder);
    for (const s of layer.filter((c) => c._relative)) {
      const short = rem.get(s.id) - got.get(s.id);
      if (short <= 0) continue;
      const victims = layer.filter((c) => s._absorbFrom.includes(c.id) && got.get(c.id) > 0);
      const avail = sum(victims, (c) => got.get(c.id));
      const take = Math.min(short, avail);
      if (take <= 0) continue;
      const cut = prorata(take, victims.map((c) => ({ key: c.id, base: got.get(c.id), order: c._order })), settings.remainder);
      for (const c of victims) got.set(c.id, got.get(c.id) - cut.get(c.id));
      got.set(s.id, got.get(s.id) + take);
    }
    return got;
  }

  // 1つの区画を配る。国税徴収法26条の2段階（D-5）
  function allocRegion(amount, eligible, rem, settings, warn) {
    const got = new Map(eligible.map((c) => [c.id, 0]));
    if (amount <= 0 || !eligible.length) return { got, rest: amount };
    let ls = layers(eligible, true);
    if (!ls) {
      warn('順位を決められない組合せがあります（二者間の優劣が循環）。種別ごとの原則順で配りました。');
      const rank = { SEC: 1, TAX: 2, PUB: 3, GPP: 4, GEN: 5 };
      const byTier = {};
      for (const c of eligible) (byTier[rank[tierOf(c)]] = byTier[rank[tierOf(c)]] || []).push(c);
      ls = Object.keys(byTier).sort().map((k) => byTier[k]);
    }
    let rest = amount;
    for (const L of ls) {
      if (rest <= 0) break;
      const need = sum(L, (c) => rem.get(c.id));
      const g2 = allocLayer(Math.min(rest, need), L, rem, settings);
      for (const [k, v] of g2) got.set(k, got.get(k) + v);
      rest -= sum([...g2.values()]);
    }
    // 第2段階：公債権グループの取り分を公債権相互の順位で配り直す
    const pubs = eligible.filter(isPublic);
    if (pubs.length > 1) {
      let pool = sum(pubs, (c) => got.get(c.id));
      pubs.forEach((c) => got.set(c.id, 0));
      for (const L of layers(pubs, false) || [pubs]) {
        if (pool <= 0) break;
        const need = sum(L, (c) => rem.get(c.id));
        const g2 = prorata(Math.min(pool, need), L.map((c) => ({ key: c.id, base: rem.get(c.id), order: c._order })), settings.remainder);
        for (const [k, v] of g2) got.set(k, v);
        pool -= sum([...g2.values()]);
      }
    }
    return { got, rest };
  }

  // 額を区画の大きさに比例して割り付ける（端数は内側の区画へ）
  function apportion(total, regions) {
    const size = sum(regions, (r) => r.amount);
    if (!total || !size) return regions.map(() => 0);
    const parts = regions.map((r) => Math.floor(total * r.amount / size));
    parts[0] += total - sum(parts);
    return parts;
  }

  // 供託金が給料等の差押えによるものか。fund.kind が 'mixed'（預金等と給料等の両方）のときは供託金ごとの debtKind で決める
  HT.isWageDeposit = (d, fund) => (fund.kind === 'mixed' ? (d && d.debtKind) === 'wage' : fund.kind === 'wage');

  // 債権ごとの差押可能額の種類
  function capKind(c, wage) {
    if (!wage) return 'ALL';
    if (c.kind === 'SUP2' || c.kind === 'SUP3') return 'H';
    if (isPublic(c) && c.taxSeizure) return 'T';
    return 'Q';
  }

  // ---------------------------------------------------------------
  // 配当の計算
  // ---------------------------------------------------------------
  HT.distribute = function (input) {
    const settings = Object.assign({}, HT.DEFAULT_SETTINGS, input.settings || {});
    const warnings = [];
    const warn = (m) => { if (!warnings.includes(m)) warnings.push(m); };
    const meta = input.meta || {};
    const fund = Object.assign({ kind: 'general', deposits: [] }, input.fund || {});
    // 供託金の種類（画面の選択 depType）を各フラグに直す
    fund.deposits = (fund.deposits || []).map((d) => {
      const x = Object.assign({}, d);
      if (x.depType === 'preservation') x.preservation = true;
      if (x.depType === 'releaseByDebtor') x.releaseByDebtor = true;
      if (x.depType === 'residual') x.residual = true;
      if (x.depType === 'normal') { x.preservation = false; x.releaseByDebtor = false; x.residual = false; }
      return x;
    });
    // 配当要求の終期（日時）。仮差押えのみを原因とする供託の部分ごとの終期は、供託金の側（加入の基準時）で扱う
    const cutoff = fund.cutoffAt || '';

    // 債権の正規化
    const claims = [];
    (input.claims || []).forEach((raw, i) => {
      const c = Object.assign({}, raw);
      c.id = c.id || `c${i + 1}`;
      c._index = i;
      if (!HT.KINDS.includes(c.kind)) { warn(`${c.creditor || c.id}: 種別が不明です（${c.kind}）。一般債権として扱いました。`); c.kind = 'GEN'; }
      // 子の監護の費用の先取特権（民法308条の2）の被担保債権は民執法151条の2第1項各号の義務に係る債権と一致するので、
      // 一般先取特権の種類として入れられても、扶養義務等債権（子の監護費用の先取特権）として扱う（152条3項の範囲に加入する）
      if (c.kind === 'GPP' && int(c.gppClass) === 3) { warn(`${c.creditor || c.id}: 子の監護の費用の先取特権は、種別「扶養義務等債権（子の監護費用の先取特権）」として扱いました。`); c.kind = 'SUP3'; }
      // 利息・損害金の自動計算（配当期日まで。計算書による拡張を認める。D-12）
      if ((c.calcs || []).length) {
        if (!meta.date && c.calcs.some((l) => !l.to)) warn(`${c.creditor || c.id}: 配当期日が空欄のため、終期が空欄の利息・損害金を計算できません。`);
        const ex = HT.calcClaimExtras(c, meta.date);
        c.interest = int(c.interest) + ex.interest;
        c.damages = int(c.damages) + ex.damages;
        c._calc = ex;
      }
      c._base = claimTotal(c);
      c._hold = c.kind === 'PRV' || !!c.withheld || !!c.stayed;
      if (cutoff && c.effectiveOn && c.effectiveOn > cutoff) {
        c._excluded = '配当要求の終期後の参加';
      }
      claims.push(c);
    });

    // 仮差押えのみを原因とする供託があるときの仮差押解放金の額（民事保全法22条1項・50条3項）
    // 仮差押えごとに決まる。各仮差押債権者は解放金の額を超えて加入しない。仮差押えが複数あるときは、
    // 解放金とみなす額を各解放金の額の合計までとする（合算方式。一部差押えの競合に関する民執法149条と同じ考え方）
    const presDeps = (fund.deposits || []).filter((d) => d.preservation);
    let relTotal = null;
    if (presDeps.length) {
      const prvs = claims.filter((c) => c.kind === 'PRV' && !c._excluded);
      const depRel = presDeps.map((d) => int(d.releaseAmount)).find((v) => v > 0);
      let guessed = false;
      relTotal = 0;
      for (const c of prvs) {
        let r = int(c.releaseAmount);
        if (!r && prvs.length === 1 && depRel) r = depRel;
        if (!r) { r = c._base; guessed = true; }
        c._relAmt = r;
        if (c._base > r) { c._relCut = c._base - r; c._base = r; }
        relTotal += r;
      }
      if (!prvs.length && depRel) relTotal = depRel;
      if (!prvs.length && !depRel) relTotal = null;
      if (guessed) warn('仮差押解放金の額が入力されていない仮差押えは、請求債権額を解放金の額としました。');
    }

    // 仮差押えから本執行への移行：本差押え（fromPrv で仮差押えを指す）に統合する
    // 仮差押えの請求債権額の範囲は仮差押えの執行の時から配当加入し、超える部分は本差押えの効力発生の時から加入する
    for (const c of claims) {
      if (!c.fromPrv) continue;
      const p = claims.find((x) => x.id === c.fromPrv);
      const who = c.creditor || c.id;
      if (!p || p.kind !== 'PRV') { warn(`${who}: 移行元の仮差押えが見つかりません。紐付けを無視しました。`); continue; }
      if (p._linked) { warn(`${who}: 仮差押え（${p.creditor || p.id}）は既に別の本差押えに紐付けられています。`); continue; }
      if (c.kind === 'PRV') { warn(`${who}: 移行先が仮差押えになっています。紐付けを無視しました。`); continue; }
      if ((p.creditor || '').trim() && (c.creditor || '').trim() && p.creditor.trim() !== c.creditor.trim()) warn(`${who}: 移行元の仮差押えの債権者名（${p.creditor}）と違います。`);
      p._linked = c.id;
      if (p._excluded) { p._mergedInto = c.id; continue; } // 仮差押え自体が終期後なら、本差押えは本差押えとして扱う
      c._prv = p;
      c._ownEffective = c.effectiveOn || '';
      c._ownDepositIds = c.depositIds;
      c._excluded = undefined;
      c.effectiveOn = p.effectiveOn || c.effectiveOn;
      if (p.depositIds) c.depositIds = p.depositIds;
      if ((p.filedOn || '9999') < (c.filedOn || '9999')) c._sortKey = p.filedOn;
      const covered = Math.min(c._base, p._base);
      const excess = c._base - covered;
      c._base = covered;
      // 本差押えが仮差押えより小さいときは、本差押えに引き継がれなかった仮差押えの部分を仮差押えの欄に残して支払留保（民執法166条2項による91条1項2号の準用）
      if (p._base > covered) { p._base -= covered; p._partialOf = c.id; p._covered = covered; }
      else p._mergedInto = c.id;
      if (excess > 0) {
        if (cutoff && c._ownEffective && c._ownEffective > cutoff) {
          c._cut = excess;
          warn(`${who}: 仮差押えの請求債権額を超える${excess.toLocaleString()}円は、本差押えが配当要求の終期後のため配当を受けられません。`);
        } else {
          c._excess = { id: `${c.id}#nx`, base: excess };
        }
      }
    }
    // 記載順（同順位は差押命令申立ての早い順）
    claims.slice().sort((a, b) => (a._sortKey || a.filedOn || '9999').localeCompare(b._sortKey || b.filedOn || '9999') || a._index - b._index)
      .forEach((c, i) => { c._order = i; });
    const active = claims.filter((c) => !c._excluded && !c._mergedInto && c._base > 0);
    for (const c of active.slice()) {
      if (!c._excess) continue;
      active.push(Object.assign({}, c, { id: c._excess.id, _parent: c.id, _childType: 'nx', _base: c._excess.base, beyond2y: 0,
        effectiveOn: c._ownEffective, depositIds: c._ownDepositIds, _prv: undefined, _excess: undefined }));
    }
    // 担保権・先取特権の利息・損害金で優先するのは最後の2年分（民法375条、341条による準用）。超える部分は一般債権と同順位
    for (const c of active.slice()) {
      const ex = int(c.beyond2y);
      if (!ex) continue;
      if (!['SEC', 'GPP', 'SUP3'].includes(c.kind)) { warn(`${c.creditor || c.id}: 2年分を超える利息・損害金は担保権・先取特権にだけ入れられます。無視しました。`); continue; }
      if (c.maxAmount) { warn(`${c.creditor || c.id}: 根抵当権は極度額の範囲で優先するため、2年分の区別は使いません。`); continue; }
      const take = Math.min(ex, int(c.interest) + int(c.damages), c._base);
      if (take <= 0) continue;
      c._base -= take;
      const child = Object.assign({}, c, { id: `${c.id}#ex`, kind: 'GEN', secType: undefined, _parent: c.id, _childType: 'ex', _base: take, _relative: false, _hold: c._hold });
      active.push(child);
    }
    claims.filter((c) => c._excluded && !c._mergedInto).forEach((c) => warn(`${c.creditor || c.id}: ${c._excluded}のため除外しました。`));

    // 抵当権の物上代位の相対的優劣（D-7）：登記前に効力を生じた一般債権者の差押え等があれば、一般債権と同じ層に置いて吸収方式で配る
    for (const s of active.filter((c) => c.kind === 'SEC' && (c.secType === 'MTG' || c.secType === 'PLG'))) {
      const gens = active.filter((c) => tierOf(c) === 'GEN' && c !== s);
      const notBeaten = gens.filter((g) => g.effectiveOn && s.perfectedOn && g.effectiveOn < s.perfectedOn);
      if (notBeaten.length) {
        s._relative = true;
        s._absorbFrom = gens.filter((g) => !notBeaten.includes(g)).map((g) => g.id);
        if (active.some((c) => isPublic(c) || c.kind === 'GPP' || c.kind === 'SUP3')) {
          warn(`${s.creditor || s.id}: 抵当権の物上代位の相対的な優劣（登記の前後で差し押さえた一般債権者への優劣が違う場合）と、公租公課・先取特権が重なっています。結果を確かめてください。`);
        }
      }
    }

    const rem = new Map(active.map((c) => [c.id, c._base]));
    const paid = new Map(active.map((c) => [c.id, 0]));
    const regionLog = [];
    let debtorSurplus = 0;
    let depositTotal = 0, interestTotal = 0;
    const costRows = [];

    // 手続費用（1回の配当につき1回。最初の供託金から）
    // 内訳（items）があれば、その合計を手続費用の額とする（手続費用計算書の項目）
    const procCosts = (input.procedureCosts || []).map((x) => {
      const items = (x.items || []).filter((it) => it && (String(it.label || '').trim() || int(it.amount)));
      const amount = items.some((it) => int(it.amount)) ? sum(items, (it) => int(it.amount)) : int(x.amount);
      return { payee: x.payee || '', amount, note: x.note || '', items: items.map((it) => ({ label: it.label || '', amount: int(it.amount), note: it.note || '' })) };
    });
    const costStatement = !!input.costStatement;
    let procLeft = sum(procCosts, (x) => x.amount);
    procCosts.forEach((x) => costRows.push({ kind: 'PROC', payee: x.payee, amount: x.amount, note: costStatement ? '別紙手続費用計算書のとおり' : x.note }));

    // 供託ごとの配当加入：差押え等の効力発生が供託の時までのもの（民執法165条1号）
    const sortedRaw = (fund.deposits || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (!sortedRaw.length) warn('供託金がありません。');
    // 仮差押えのみを原因とする供託（民事保全法50条5項・民執法156条1項。みなし解放金＝同法50条3項）
    // (1) 仮差押えの範囲（給料等は手取額の1/4）で、仮差押解放金の額に達するまでの部分は解放金とみなされる。
    //     供託しただけでは終期は来ず、還付請求権に対する最初の差押命令が供託所に送達された時に執行供託に変わり、その時が終期。
    //     複数の供託にわたるときは、供託日の古い順に解放金の額まで充てる。
    // (2) それを超える部分（1/4を超える部分・解放金の額を超える部分。同項ただし書）は弁済供託に当たり、債務者が自由に還付請求できる。
    //     仮差押債権者は加入しない。差押禁止（民執法152条）は還付請求権に及ばない（救済は153条）。
    //     この部分の終期は、還付請求権に対する差押え等が競合した時。競合がなければ配当の対象外（取立て又は債務者の還付請求）。
    const sortedDeps = [];
    const outsideParts = [];
    const relInput = relTotal;
    let relLeft = relInput != null ? relInput : Infinity;
    const ownEff = (c) => (c._prv ? c._ownEffective : c.effectiveOn) || '';
    // 還付請求権に対する差押え等（仮差押え以外）の効力発生時。競合した時＝2件目の時
    const seizeTimes = active.filter((c) => c.kind !== 'PRV' && !c._parent && ownEff(c)).map(ownEff).sort();
    const competeAt = seizeTimes.length >= 2 ? seizeTimes[1] : '';
    sortedRaw.forEach((d, i) => {
      // 債務者が供託した仮差押解放金（民事保全法22条1項）。取戻請求権に仮差押えの効力が及ぶ
      // 他の債権者の差押え等（仮差押債権者の別の債権によるものを含む）があれば、その時に競合して供託官に供託義務が生じ、その時が終期
      // （民執法156条2項、165条1号）。仮差押債権者が同じ債権で本執行しただけなら競合せず、配当にならない（払渡しで足りる）
      if (d.releaseByDebtor) {
        const amount = int(d.amount);
        const interest = d.interest != null && d.interest !== '' ? int(d.interest) : HT.depositInterest(amount, d.date, meta.date);
        const times = active.filter((c) => c.kind !== 'PRV' && !c._parent && (!c._prv || d.treatAsCompeting) && ownEff(c)).map(ownEff).sort();
        if (!times.length) {
          outsideParts.push({ index: i, amount, interest, msg: `供託${i + 1}（債務者が供託した仮差押解放金）は、取戻請求権に対する差押え等の競合がないため配当にならず、払渡しで足ります（仮差押債権者が同じ債権で本執行しただけの場合を含む）。本執行が仮差押えにない遅延損害金を含むなどの理由で競合として扱うときは「競合として扱う」に印を付けてください。` });
          return;
        }
        sortedDeps.push(Object.assign({}, d, { _origIndex: i, at: times[0], interest, _flat: true, _part: '債務者が供託した仮差押解放金' }));
        return;
      }
      // 滞納処分庁からの残余金（滞調法20条の7）。第三債務者の供託を経たときは供託の時、経ないとき（又は仮差押えだけのとき）は
      // 執行裁判所が残余金の交付を受けた時が終期
      if (d.residual) {
        const viaDep = d.residualVia === 'deposit';
        const seized = active.some((c) => c.kind !== 'PRV' && !c._parent && ownEff(c) && (!d.depositedAt || ownEff(c) <= d.depositedAt));
        const at = viaDep && seized && d.depositedAt ? d.depositedAt : (d.deliveredAt || d.at || '');
        if (!at) warn(`供託${i + 1}（残余金）：残余金の交付を受けた日時（第三債務者の供託を経たときは供託の日時も）を入れてください。`);
        sortedDeps.push(Object.assign({}, d, { _origIndex: i, at, interest: d.interest != null && d.interest !== '' ? int(d.interest) : 0, _flat: HT.isWageDeposit(d, fund) ? !!d._flat : false,
          _part: '滞納処分庁から交付を受けた残余金' }));
        return;
      }
      // 執行停止中の供託：配当加入遮断効を否定する見解では、停止が解けた時を基準にする（設定で切替）
      if (d.stayed && settings.stayedDeposit === 'nocutoff') {
        if (!d.stayLiftedAt) warn(`供託${i + 1}（執行停止中の供託）：遮断効を否定する扱いにしていますが、執行停止が解けた日時が入っていません。供託の時で判定しました。`);
        sortedDeps.push(Object.assign({}, d, { _origIndex: i, at: d.stayLiftedAt || d.at, _part: d.stayLiftedAt ? '執行停止中の供託（停止が解けた時を基準）' : '' }));
        return;
      }
      if (!d.preservation) { sortedDeps.push(Object.assign({}, d, { _origIndex: i })); return; }
      if (!d.convertedAt) warn(`供託${i + 1}は仮差押えのみを原因とする供託です。還付請求権に対する最初の差押命令が供託所に送達された日時を入れてください（その時に配当要求の終期が到来します）。`);
      const amount = int(d.amount);
      const interest = d.interest != null && d.interest !== '' ? int(d.interest) : HT.depositInterest(amount, d.date, meta.date);
      let seizable = amount;
      if (HT.isWageDeposit(d, fund)) {
        const q = d.capQ != null && d.capQ !== '' ? int(d.capQ) : d.net != null && d.net !== '' ? HT.wageCaps(d.net).Q : null;
        if (q != null) seizable = Math.min(amount, q);
      }
      const rel = Math.min(seizable, relLeft);
      relLeft -= rel;
      const repay = amount - rel;
      const i1 = repay ? Math.floor(interest * rel / amount) : interest;
      const base = Object.assign({}, d, { _origIndex: i, _flat: true });
      if (rel > 0) sortedDeps.push(Object.assign({}, base, { at: d.convertedAt || d.at, amount: rel, interest: i1, _part: '仮差押解放金とみなされる部分' }));
      if (repay > 0) {
        const why = [amount > seizable ? '仮差押えの範囲を超える部分' : '', rel < seizable ? '仮差押解放金の額を超える部分' : ''].filter(Boolean).join('・');
        const part = Object.assign({}, base, { at: competeAt, amount: repay, interest: interest - i1, depositCost: rel > 0 ? 0 : d.depositCost, _repay: true,
          _part: `弁済供託に当たる部分（${why}）` });
        if (competeAt) sortedDeps.push(part);
        else outsideParts.push({ index: i, amount: repay, interest: interest - i1, why });
      }
    });
    if (relInput != null && relLeft > 0 && relLeft !== Infinity) warn(`仮差押解放金の額のうち${relLeft.toLocaleString()}円に見合う供託がありません。入力を確かめてください。`);
    for (const o of outsideParts) {
      if (o.msg) { warn(o.msg); continue; }
      const who = seizeTimes.length ? '差押債権者の取立て' : '債務者の還付請求';
      warn(`供託${o.index + 1}のうち${(o.amount + o.interest).toLocaleString()}円（${o.why}。利息を含む）は弁済供託に当たり、還付請求権に対する差押え等の競合がないため配当の対象外です（${who}による）。`);
    }
    const depAt = (d) => d.at || (d.date ? `${d.date}T23:59` : '');
    const eligOf = (d) => active.filter((c) => {
      if (c.depositIds && !c.depositIds.includes(d.id)) return false;
      if (d._repay) {
        // 弁済供託に当たる部分：仮差押え（本差押えに移った額の範囲を含む）は加入しない。還付請求権に対する差押え等の効力で判断する
        if (c.kind === 'PRV') return false;
        return !!ownEff(c) && ownEff(c) <= depAt(d);
      }
      return !c.effectiveOn || !depAt(d) || c.effectiveOn <= depAt(d);
    });
    // 配当加入の状況が同じ供託をまとめて1つの部分にする（給料等は供託ごとに差押えの範囲が違うのでまとめない）
    const deposits = [];
    let provisional = false;
    sortedDeps.forEach((d) => {
      const i = d._origIndex;
      if (d.mixed && !d.mixedResolved) {
        provisional = true;
        warn(`供託${i + 1}は混合供託です。還付請求権が債務者に属することを証明する文書（帰属を確認した確定判決・和解調書、関係者全員の合意書、譲受人とされる者の承諾書等）が出るまで配当はできません。表示は参考計算です。`);
      }
      const amount = int(d.amount);
      const interest = d.interest != null && d.interest !== '' ? int(d.interest) : HT.depositInterest(amount, d.date, meta.date);
      const elig = eligOf(d);
      if (!elig.length && d._flat) { warn(`供託${i + 1}の${d._part}に配当加入する債権者がいません。`); }
      const sig = elig.map((c) => c.id).join(',');
      const info = { index: i, id: d.id || String(i + 1), date: d.date || '', amount, interest, caseNo: d.caseNo || '', depositNo: d.depositNo || '', office: d.office || '', thirdParty: d.thirdParty || '', mixed: !!d.mixed,
        preservation: !!d.preservation, convertedAt: d.convertedAt || '', part: d._part || '' };
      const last = deposits[deposits.length - 1];
      if ((!HT.isWageDeposit(d, fund) || d._flat) && last && HT.isWageDeposit(last, fund) === HT.isWageDeposit(d, fund) && last._flat === d._flat && last._sig === sig) {
        last.amount += amount; last._interest += interest; last.depositCost = int(last.depositCost) + int(d.depositCost); last._list.push(info);
      } else {
        deposits.push(Object.assign({}, d, { amount, _interest: interest, _elig: elig, _sig: sig, _list: [info] }));
      }
    });
    deposits.forEach((d, di) => {
      const amount = int(d.amount);
      const interest = d._interest;
      depositTotal += amount; interestTotal += interest;
      const depCost = int(d.depositCost);
      if (depCost) costRows.push({ kind: 'DEP', payee: d.depositCostPayee || '第三債務者', amount: Math.min(depCost, amount), note: '供託費用' });

      // 区画を作る（外側＝差押可能額の大きい方から）
      const caps = {};
      const wageDep = HT.isWageDeposit(d, fund);
      if (wageDep) {
        const net = d.net != null && d.net !== '' ? int(d.net) : null;
        const wc = net != null ? HT.wageCaps(net) : null;
        caps.Q = d.capQ != null && d.capQ !== '' ? int(d.capQ) : wc ? wc.Q : amount;
        caps.H = d.capH != null && d.capH !== '' ? int(d.capH) : wc ? wc.H : amount;
        caps.T = d.capT != null && d.capT !== '' ? int(d.capT) : d.wage ? HT.taxSeizable(Object.assign({ payDate: d.payDate || d.date }, d.wage)) : null;
        if (caps.T == null && active.some((c) => capKind(c, true) === 'T')) {
          warn('滞納処分の差押えがありますが、国税徴収法76条の差押可能額が入力されていません。1/4の範囲として計算しました。');
          caps.T = caps.Q;
        }
      }
      const elig = d._elig;
      const kindsPresent = new Set(elig.map((c) => capKind(c, wageDep)));
      let bounds;
      if (!wageDep || d._flat) bounds = [amount];
      else {
        const vals = [...kindsPresent].map((k) => (k === 'T' ? (caps.T != null ? caps.T : caps.H) : caps[k]));
        bounds = [...new Set(vals.map((v) => Math.min(v, amount)))].filter((v) => v > 0).sort((a, b) => a - b);
        if (!bounds.length) bounds = [amount];
        const maxCap = bounds[bounds.length - 1];
        if (amount > maxCap) {
          warn(`供託金（${d.date || di + 1}）が差押えの範囲を${(amount - maxCap).toLocaleString()}円超えています。超える部分は配当の対象外として債務者に交付する扱いにしました。`);
        }
      }
      const capOf = (c) => {
        if (!wageDep || d._flat) return amount;
        const k = capKind(c, true);
        return Math.min(amount, k === 'T' ? (caps.T != null ? caps.T : caps.H) : caps[k]);
      };
      const regions = bounds.map((u, i) => ({ lower: i ? bounds[i - 1] : 0, upper: u, amount: u - (i ? bounds[i - 1] : 0) }));
      const outside = amount - (regions.length ? regions[regions.length - 1].upper : 0);

      // 費用を差し引き、利息を加える（区画に比例して割り付け）
      let deduct = Math.min(depCost, amount);
      if (procLeft) { deduct += procLeft; procLeft = 0; }
      if (settings.costAllocation === 'inner' || settings.costAllocation === 'outer') {
        let left = deduct;
        const order = settings.costAllocation === 'inner' ? regions : regions.slice().reverse();
        for (const r of order) { const t = Math.min(left, r.amount); r.amount -= t; r.cost = t; left -= t; }
        if (left > 0) warn('費用が配当原資を上回っています。');
      } else {
        apportion(deduct, regions).forEach((v, i) => { regions[i].amount -= v; regions[i].cost = v; });
        if (regions.some((r) => r.amount < 0)) { warn('費用が配当原資を上回っています。'); regions.forEach((r) => { if (r.amount < 0) r.amount = 0; }); }
      }
      apportion(interest, regions).forEach((v, i) => { regions[i].amount += v; regions[i].interest = v; });
      debtorSurplus += outside;

      // 外側の区画から配る（非競合部分先行充当。D-9）
      for (let i = regions.length - 1; i >= 0; i--) {
        const r = regions[i];
        const inRegion = elig.filter((c) => capOf(c) >= r.upper && rem.get(c.id) > 0);
        const before = Object.fromEntries(inRegion.map((c) => [c.id, rem.get(c.id)]));
        const { got, rest } = allocRegion(r.amount, inRegion, rem, settings, warn);
        for (const [k, v] of got) { rem.set(k, rem.get(k) - v); paid.set(k, paid.get(k) + v); }
        const parts = [...new Set(d._list.map((x) => x.part).filter(Boolean))];
        regionLog.push({ deposit: d.id || String(di + 1), depositIndex: di, depositDate: d.date || '', deposits: d._list, wage: wageDep, what: parts.join('・'),
          lower: r.lower, upper: r.upper, gross: r.upper - r.lower, amount: r.amount, cost: r.cost || 0, interest: r.interest || 0,
          members: inRegion.map((c) => c.id), sig: inRegion.map((c) => c.id).sort().join(','), before, got: Object.fromEntries(got), rest });
        debtorSurplus += rest;
      }
    });

    // 結果の行
    const saleTotal = int(fund.saleProceeds);
    if (saleTotal && (fund.kind === 'wage' || fund.kind === 'mixed')) warn('売得金は、給料等の差押えの範囲（1/4・1/2）に分けずに配っています。');
    if (saleTotal && !fund.saleAt) warn('売得金：執行官が売得金の交付を受けた日時（配当要求の終期。民執法165条3号）を入れてください。');
    const fundTotal = depositTotal + interestTotal + saleTotal;
    if (saleTotal) {
      const r0 = { amount: saleTotal };
      const inAll = active.filter((c) => rem.get(c.id) > 0 && (!fund.saleAt || !c.effectiveOn || c.effectiveOn <= fund.saleAt));
      const before = Object.fromEntries(inAll.map((c) => [c.id, rem.get(c.id)]));
      const { got, rest } = allocRegion(r0.amount, inAll, rem, settings, warn);
      for (const [k, v] of got) { rem.set(k, rem.get(k) - v); paid.set(k, paid.get(k) + v); }
      regionLog.push({ deposit: 'sale', depositIndex: -1, depositDate: '', wage: false, lower: 0, upper: saleTotal, gross: saleTotal, amount: saleTotal, cost: 0, interest: 0,
        members: inAll.map((c) => c.id), sig: inAll.map((c) => c.id).sort().join(','), what: '売得金', before, got: Object.fromEntries(got), rest });
      debtorSurplus += rest;
    }
    // 仮差押えのみを原因とする供託では、どの部分の終期にも間に合わなかった債権者を除外として示す
    if (sortedRaw.some((d) => d.preservation || d.releaseByDebtor || d.residual || (d.stayed && settings.stayedDeposit === 'nocutoff'))) {
      const joined = new Set(regionLog.flatMap((g) => g.members));
      for (const c of active.slice()) {
        if (c._parent || joined.has(c.id) || active.some((x) => x._parent === c.id && joined.has(x.id))) continue;
        c._excluded = '配当要求の終期後の参加';
        warn(`${c.creditor || c.id}: ${c._excluded}のため除外しました。`);
        for (const x of active.filter((y) => y === c || y._parent === c.id)) active.splice(active.indexOf(x), 1);
      }
    }
    // 合意配当（民執法166条2項による85条1項ただし書の準用）
    let agreed = false;
    const ag = input.agreement;
    if (ag && ag.enabled) {
      const parents = active.filter((c) => !c._parent);
      const amt = (id) => int((ag.amounts || {})[id]);
      const costsTotal = sum(costRows, (r) => r.amount);
      const total = sum(parents, (c) => amt(c.id));
      const errs = [];
      for (const c of parents) {
        const cap = c._base + sum(active.filter((x) => x._parent === c.id), (x) => x._base);
        if (amt(c.id) > cap) errs.push(`${c.creditor || c.id} の合意額が請求債権額を超えています`);
      }
      if (total + costsTotal > fundTotal) errs.push(`合意額と費用の合計（${(total + costsTotal).toLocaleString()}円）が配当原資を超えています`);
      if (errs.length) warn(`合意配当にできません：${errs.join('、')}。計算による配当を表示しています。`);
      else {
        agreed = true;
        for (const c of active) { paid.set(c.id, c._parent ? 0 : amt(c.id)); rem.set(c.id, c._base - paid.get(c.id)); }
        debtorSurplus = fundTotal - costsTotal - total;
      }
    }

    // 転付命令（民執法159条）：第三債務者への送達の時までに他の債権者の差押え等がなければ効力を生じ（確定が条件）、配当に至らない。
    // あれば効力を生じず、転付を受けようとした債権者は差押債権者として配当を受ける
    let transferEffective = null;
    for (const c of claims.filter((x) => x.transferServedAt && !x._parent)) {
      const who = (c.creditor || '').trim();
      const others = claims.filter((x) => x !== c && !x._parent && !x._mergedInto && x.effectiveOn && x.effectiveOn <= c.transferServedAt && (x.creditor || '').trim() !== who);
      if (others.length) c._transferVoid = true;
      else if (!transferEffective) {
        transferEffective = c.creditor || c.id;
        warn(`${transferEffective}: 転付命令が第三債務者に送達される時までに他の債権者の差押え・仮差押えの執行・配当要求がないため、転付命令は効力を生じ（確定が条件。民執法159条3項・5項）、配当に至りません。表示は参考です。`);
      }
    }

    // 2年分を超える部分・仮差押えの額を超える部分（子）を元の債権（親）にまとめる
    for (const ch of active.filter((c) => c._parent)) {
      const par = active.find((c) => c.id === ch._parent);
      if (ch._childType === 'ex') par._beyondLeft = rem.get(ch.id);
      paid.set(ch._parent, paid.get(ch._parent) + paid.get(ch.id));
      rem.set(ch._parent, rem.get(ch._parent) + rem.get(ch.id));
      par._base += ch._base;
      if (ch._childType === 'ex') par._beyond = ch._base; else par._excessAmt = ch._base;
      for (const g of regionLog) {
        if (!g.members.includes(ch.id)) continue;
        if (!g.members.includes(par.id)) g.members.push(par.id);
        g.got[par.id] = (g.got[par.id] || 0) + (g.got[ch.id] || 0);
        g.before[par.id] = (g.before[par.id] || 0) + (g.before[ch.id] || 0);
        g.members = g.members.filter((id) => id !== ch.id);
        delete g.got[ch.id]; delete g.before[ch.id];
      }
    }
    const all = active.filter((c) => !c._parent);
    const rankLayers = layers(all, false) || layers(all, true) || [all];
    const rankOf = new Map();
    const costRank = costRows.length ? (costRows.some((r) => r.kind === 'DEP') && costRows.some((r) => r.kind === 'PROC') ? 2 : 1) : 0;
    rankLayers.forEach((L, i) => L.forEach((c) => rankOf.set(c.id, costRank + i + 1)));

    // 配当加入の状況が部分ごとに違い、しかも順位が一律でないときは、全体を通した順位は意味を持たないので
    // 順位欄を空け、差押えの順（申立ての順）に並べる（書籍の参考例XVI-4）
    const sigs = new Set(regionLog.map((g) => g.members.slice().sort().join(',')));
    const rankless = sigs.size > 1 && new Set(all.map((c) => rankOf.get(c.id))).size > 1;
    if (rankless) { for (const c of all) rankOf.set(c.id, null); }
    const rows = [];
    for (const r of costRows.filter((x) => x.kind === 'DEP')) rows.push({ type: 'cost', rank: rankless ? null : 1, payee: r.payee, label: '供託費用', total: r.amount, paid: r.amount, held: 0, note: r.note });
    for (const r of costRows.filter((x) => x.kind === 'PROC')) rows.push({ type: 'cost', rank: rankless ? null : costRank, payee: r.payee, label: '手続費用', total: r.amount, paid: r.amount, held: 0, note: r.note || '配当期日呼出状及び支払委託書送付費用' });
    const sorted = all.slice().sort((a, b) => (rankless ? 0 : rankOf.get(a.id) - rankOf.get(b.id)) || a._order - b._order);
    for (const c of sorted) {
      const p = paid.get(c.id);
      const notes = [];
      if (c._hold) notes.push(c.kind === 'PRV' ? '支払留保（仮差押え）' : c.stayed ? '支払留保（執行停止）' : '支払留保');
      if (c._transferVoid) notes.push('転付命令は効力を生じない（民執法159条3項）');
      if (c._relCut) notes.push(`仮差押解放金の額（${c._relAmt.toLocaleString()}円）を超える${c._relCut.toLocaleString()}円は解放金の部分に加入しない`);
      if (c._partialOf) notes.push(`本執行に移行しなかった残部（請求債権のうち${c._covered.toLocaleString()}円は本差押えの欄に記載）`);
      if (c.regNote) notes.push(c.regNote);
      if (c.note) notes.push(c.note);
      if (c.maxAmount && claimTotal(Object.assign({}, c, { maxAmount: 0 })) > int(c.maxAmount)) notes.push(`極度額${int(c.maxAmount).toLocaleString()}円`);
      if (c._beyond) notes.push(`最後の2年分を超える利息・損害金${c._beyond.toLocaleString()}円は一般債権と同順位`);
      if (c._prv) notes.push(`${c._prv.caseNo ? c._prv.caseNo + 'の' : ''}仮差押えから本執行に移行`);
      if (c._excessAmt) notes.push(`仮差押えの請求債権額を超える${c._excessAmt.toLocaleString()}円は本差押えの時から配当加入`);
      if (c._cut) notes.push(`仮差押えの請求債権額を超える${c._cut.toLocaleString()}円は配当要求の終期後のため除く`);
      if (agreed) notes.push('合意配当');
      // 配当実施額の充当（民法489条：費用→利息→損害金→元金。租税は損害金欄に本税、元金欄に延滞税を置く）
      const applied = {}, after = {};
      let left = p;
      for (const k of ['cost', 'interest', 'damages', 'principal']) { const t = Math.min(int(c[k]), left); applied[k] = t; after[k] = int(c[k]) - t; left -= t; }
      rows.push({
        type: 'claim', id: c.id, rank: rankOf.get(c.id), payee: c.creditor || '', caseNo: c.caseNo || '', label: c.label || HT.KIND_LABEL[c.kind],
        cost: int(c.cost), interest: int(c.interest), damages: int(c.damages), principal: int(c.principal), total: c._base,
        paid: p, held: c._hold ? p : 0, note: notes.join('、'), applied: c._hold ? null : applied, after: c._hold ? null : after,
      });
    }
    for (const c of claims.filter((x) => x._excluded && !x._mergedInto)) {
      rows.push({ type: 'excluded', id: c.id, rank: null, payee: c.creditor || '', caseNo: c.caseNo || '', label: c.label || HT.KIND_LABEL[c.kind],
        cost: int(c.cost), interest: int(c.interest), damages: int(c.damages), principal: int(c.principal), total: c._base, paid: 0, held: 0, note: c._excluded });
    }
    const lastRank = Math.max(costRank, ...[...rankOf.values()].filter((v) => v != null), 0);
    if (debtorSurplus > 0) rows.push({ type: 'debtor', rank: rankless ? null : lastRank + 1, payee: meta.debtor || '債務者', label: '剰余金', paid: debtorSurplus, held: 0, total: 0, note: '' });

    // 弁済金交付か配当か（民執法166条2項による84条の準用）
    // 債権者が1人のとき、又はどの部分でも競合（複数の債権者が取り合って不足すること）が生じないときは弁済金交付
    const creditors = new Set(all.map((c) => (c.creditor || c.id).trim()));
    const competing = regionLog.some((g) => {
      const who = g.members.filter((id) => g.before[id] > 0);
      const names = new Set(who.map((id) => ((active.find((c) => c.id === id) || {}).creditor || id).trim()));
      const short = who.some((id) => (g.got[id] || 0) < g.before[id]);
      return names.size > 1 && short;
    });
    const type = !agreed && (creditors.size <= 1 || !competing) ? '弁済金交付計算書' : '配当表';

    // 次回への繰越（D-14）
    const next = {};
    for (const c of all) {
      const p = paid.get(c.id);
      let left = p + (c._covered || 0); // 仮差押えの残部は、本差押えに移った額も差し引く
      const comp = {};
      for (const k of ['cost', 'interest', 'damages', 'principal']) { const t = Math.min(int(c[k]), left); comp[k] = int(c[k]) - t; left -= t; }
      comp.paid = p;
      comp.paidPrincipal = int(c.principal) - comp.principal;
      if (c._beyond) comp.beyond2yLeft = c._beyondLeft;
      if (c._cut) comp.cut = c._cut;
      if (c._prv) comp.prv = { id: c._prv.id, full: !c._prv._partialOf, effectiveOn: c._prv.effectiveOn || '', caseNo: c._prv.caseNo || '' };
      next[c.id] = comp;
    }
    if (settings.supportApplication === 'statutory') {
      const groups = {};
      for (const c of all.filter((x) => x.group && (x.kind === 'SUP2' || x.kind === 'SUP3'))) (groups[c.group] = groups[c.group] || []).push(c);
      for (const list of Object.values(groups)) {
        const s3 = list.find((x) => x.kind === 'SUP3'), s2 = list.find((x) => x.kind === 'SUP2');
        if (!s3 || !s2) continue;
        const totalLeft = rem.get(s3.id) + rem.get(s2.id);
        const s3Left = Math.max(0, s3._base - paid.get(s3.id) - paid.get(s2.id));
        next[s3.id].lienLeft = Math.min(s3Left, totalLeft);
        next[s2.id].otherLeft = totalLeft - next[s3.id].lienLeft;
      }
    }

    // 不変条件
    const out = sum(rows.filter((r) => r.type !== 'excluded'), (r) => r.paid);
    if (out !== fundTotal) warn(`配当等の合計（${out.toLocaleString()}円）が配当原資（${fundTotal.toLocaleString()}円）と一致しません。`);
    for (const c of all) if (paid.get(c.id) > c._base) warn(`${c.creditor}: 配当額が債権額を超えています。`);

    return {
      type, meta, settings, agreed, provisional: provisional || !!transferEffective, transferEffective,
      caption: transferEffective ? '（参考：転付命令が効力を生じるため、配当に至らない）' : provisional ? '（参考計算：混合供託で、還付請求権の帰属の証明前）' : '',
      fund: { sale: saleTotal, deposit: depositTotal, interest: interestTotal, total: fundTotal },
      rows, regions: regionLog, warnings, next,
      // 手続費用計算書（作るときだけ。立替者ごと）
      costStatements: costStatement ? procCosts.filter((x) => x.amount).map((x) => ({ payee: x.payee, total: x.amount,
        items: x.items.length ? x.items : [{ label: x.note || '配当期日呼出状及び支払委託書送付費用', amount: x.amount, note: '' }] })) : [],
      paid: Object.fromEntries(all.map((c) => [c.id, paid.get(c.id)])), remaining: Object.fromEntries(all.map((c) => [c.id, rem.get(c.id)])),
    };
  };

  // ---------------------------------------------------------------
  // 次回の配当への繰越（給料等の継続的な給付）
  // 今回の入力と結果から、次回の入力を作る。今回の入力は丸ごと history に残し、1つのファイルで全回次を再現できるようにする。
  // 供託金・配当期日・手続費用の額は空にし、
  // 各債権の費用・利息・損害金・元金を今回の配当（留保分を含む）を充当した後の額にする。
  // 完済した債権は外す。終期後で今回加入しなかった債権・本差押えに統合した仮差押えはそのまま残す。
  // 戻り値 { input, dropped: [完済で外した債権者名], zeroed: [0円で残した扶養義務等債権], log }
  // ---------------------------------------------------------------
  HT.carryForward = function (input, result) {
    const s = JSON.parse(JSON.stringify(input));
    const date = (s.meta && s.meta.date) || '';
    const nextDay = HT.addDays(date, 1);
    const next = result.next || {};
    const comps = ['cost', 'interest', 'damages', 'principal'];
    const setTotal = (o, target) => {
      let diff = comps.reduce((t, k) => t + int(o[k]), 0) - target;
      for (const k of comps) { if (diff <= 0) break; const t = Math.min(int(o[k]), diff); o[k] = int(o[k]) - t; diff -= t; }
      if (diff < 0) o.principal = int(o.principal) - diff;
    };
    // 回次の記録
    const snapshot = JSON.parse(JSON.stringify(input));
    delete snapshot.history;
    const log = {
      date, type: result.type, fund: result.fund.total, input: snapshot,
      paid: (result.rows || []).filter((r) => r.type === 'claim' || r.type === 'cost' || r.type === 'debtor')
        .map((r) => ({ id: r.id || '', payee: r.payee, label: r.label, paid: r.paid, held: r.held || 0 })),
    };
    s.history = (s.history || []).concat([log]);
    s.meta = Object.assign({}, s.meta, { date: '' });
    s.fund = Object.assign({}, s.fund, { cutoffAt: '', saleProceeds: '' });
    // 続く回は給料等の供託金（預金等と給料等の両方のときは、最後の給料等の供託金を引き継ぐ）
    const deps0 = s.fund.deposits || [];
    const lastDep = (s.fund.kind === 'mixed' ? deps0.filter((d) => d.debtKind === 'wage') : deps0).slice(-1)[0] || deps0.slice(-1)[0] || {};
    s.fund.deposits = [{ thirdParty: lastDep.thirdParty || '', office: lastDep.office || '', debtKind: lastDep.debtKind || undefined, wage: lastDep.wage ? { dependents: lastDep.wage.dependents || '' } : undefined }];
    s.procedureCosts = (s.procedureCosts || []).map((p) => ({ payee: p.payee || '', amount: '', note: p.note || '',
      items: (p.items || []).map((it) => ({ label: it.label || '', amount: '', note: it.note || '' })) }));
    s.agreement = { enabled: false, amounts: {} };
    const dropped = [];
    const mergedPrv = new Set();
    const zeroed = [];
    const out = [];
    for (const c of s.claims || []) {
      const n = next[c.id];
      if (!n) { out.push(c); continue; }
      const c2 = Object.assign({}, c);
      for (const k of comps) c2[k] = String(n[k]);
      if (c.kind === 'SUP3' && n.lienLeft != null) setTotal(c2, n.lienLeft);
      if (c.kind === 'SUP2' && n.otherLeft != null) setTotal(c2, n.otherLeft);
      for (const k of comps) c2[k] = String(int(c2[k]));
      if (int(c.maxAmount)) c2.maxAmount = String(Math.max(0, int(c.maxAmount) - int(n.paid)));
      if (int(c.beyond2y)) c2.beyond2y = String(int(n.beyond2yLeft));
      // 仮差押えから移行した本差押えは、次回からは仮差押えの時から加入している本差押えとして扱い、紐付けを外す
      if (n.prv) {
        c2.fromPrv = '';
        if (n.prv.effectiveOn && (!c.effectiveOn || n.prv.effectiveOn < c.effectiveOn)) c2.effectiveOn = n.prv.effectiveOn;
        const memo = `${n.prv.caseNo ? n.prv.caseNo + 'の' : ''}仮差押えから本執行に移行`;
        if (!(c.note || '').includes(memo)) c2.note = c.note ? `${c.note}、${memo}` : memo;
        if (n.prv.full) mergedPrv.add(n.prv.id);
      }
      // 自動計算：期間を決めた行は今回で計算済みなので外し、配当期日までの行は翌日から、元金の減った分を基礎から引いて続ける
      if ((c.calcs || []).length) {
        c2.calcs = c.calcs.filter((l) => !l.to).map((l) => Object.assign({}, l, {
          from: nextDay || l.from,
          base: String(Math.max(0, int(l.base) - int(n.paidPrincipal))),
        }));
      }
      const left = comps.reduce((t, k) => t + int(c2[k]), 0);
      // 扶養義務等債権は、確定期限が来た新しい期を同じ差押えのもとで加えるので、0円でも行を残す（民執法151条の2）
      if (left <= 0 && (c.kind === 'SUP2' || c.kind === 'SUP3')) { zeroed.push(c.creditor || c.id); out.push(c2); continue; }
      if (left <= 0) { dropped.push(c.creditor || c.id); continue; }
      out.push(c2);
    }
    // 本差押えに全部移った仮差押えは外す。統合先がなくなった紐付けは消す
    const kept = out.filter((c) => !mergedPrv.has(c.id));
    const ids = new Set(kept.map((c) => c.id));
    for (const c of kept) if (c.fromPrv && !ids.has(c.fromPrv)) c.fromPrv = '';
    s.claims = kept;
    return { input: s, dropped, zeroed, log };
  };

  // ---------------------------------------------------------------
  // 供託金の配当（追加配当。民執法92条、166条2項による準用）
  // 支払を留保した配当額（仮差押え・配当異議・停止条件付・執行停止など）について、供託の事由が消滅したときの配当を計算する。
  // decisions[債権のid] = { outcome, amount, plaintiff }
  //   pay      : 留保していた額をその債権者に支払う（本案勝訴、異議の取下げ・棄却、条件成就など）
  //   void     : その債権者に配当できなくなった（本案敗訴、債務者の配当異議訴訟で債権者敗訴など）。全債権者のために配当表を変更する（92条2項）
  //   reduce   : 同じく、債権額を amount に減らして全債権者のために変更する（92条2項）
  //   relative : 債権者間の配当異議訴訟で、原告 plaintiff の請求が認められ、被告の債権額が amount とされた。
  //              原告と被告の間だけで解決する（個別的・相対的解決。最判平6.7.14民集48巻5号1109頁）。原告は被告の債権が
  //              amount であったなら増えた配当額を、被告の留保額の範囲で受け、残りは被告に支払う
  //   （指定のないもの）: 引き続き留保する
  // 戻り値 { result（追加配当表として表示できる形）, lines: [{ id, payee, held, toSelf, toOthers }] }
  // ---------------------------------------------------------------
  HT.additionalDistribution = function (input, result, decisions) {
    decisions = decisions || {};
    const base = JSON.parse(JSON.stringify(input));
    delete base.history;
    base.agreement = { enabled: false, amounts: {} };
    const comps = ['cost', 'interest', 'damages', 'principal'];
    const claimRows = result.rows.filter((r) => r.type === 'claim');
    const held = claimRows.filter((r) => r.held > 0);
    const extra = {};
    const add = (id, v) => { if (v) extra[id] = (extra[id] || 0) + v; };
    const lines = [];
    // 債権額を amount に減らす（元金→損害金→利息→費用の順に減らす）
    const shrink = (c, amount) => {
      let over = comps.reduce((t, k) => t + int(c[k]), 0) - Math.max(0, int(amount));
      for (const k of ['principal', 'damages', 'interest', 'cost']) { if (over <= 0) break; const t = Math.min(int(c[k]), over); c[k] = String(int(c[k]) - t); over -= t; }
      c.calcs = [];
      if (c.maxAmount) c.maxAmount = String(Math.min(int(c.maxAmount), int(amount)));
    };
    const rerun = (mod) => HT.distribute(mod).paid;

    // (1) 全債権者のための変更（void・reduce）をまとめて計算する
    const absIds = held.map((r) => r.id).filter((id) => ['void', 'reduce'].includes((decisions[id] || {}).outcome));
    if (absIds.length) {
      const mod = JSON.parse(JSON.stringify(base));
      for (const c of mod.claims) {
        if (!absIds.includes(c.id)) continue;
        const dc = decisions[c.id];
        shrink(c, dc.outcome === 'void' ? 0 : dc.amount);
        if (dc.outcome === 'void') c._voided = true;
      }
      mod.claims = mod.claims.filter((c) => !c._voided);
      const p2 = rerun(mod);
      for (const r of claimRows) {
        const before = result.paid[r.id] || 0;
        const after = p2[r.id] || 0;
        if (absIds.includes(r.id)) {
          lines.push({ id: r.id, payee: r.payee, held: r.held, toSelf: after, toOthers: r.held - after, outcome: decisions[r.id].outcome });
          add(r.id, after);
        } else if (after > before) {
          add(r.id, after - before);
        }
      }
    }
    // (2) 債権者間の配当異議（相対的解決）
    for (const r of held) {
      const dc = decisions[r.id] || {};
      if (dc.outcome === 'pay') { add(r.id, r.held); lines.push({ id: r.id, payee: r.payee, held: r.held, toSelf: r.held, toOthers: 0, outcome: 'pay' }); }
      if (dc.outcome !== 'relative') continue;
      const mod = JSON.parse(JSON.stringify(base));
      const c = mod.claims.find((x) => x.id === r.id);
      if (c) shrink(c, dc.amount);
      const p2 = rerun(mod);
      const gain = Math.max(0, (p2[dc.plaintiff] || 0) - (result.paid[dc.plaintiff] || 0));
      const toP = Math.min(r.held, gain);
      add(dc.plaintiff, toP);
      add(r.id, r.held - toP);
      lines.push({ id: r.id, payee: r.payee, held: r.held, toSelf: r.held - toP, toOthers: toP, outcome: 'relative', plaintiff: dc.plaintiff });
    }

    // 追加配当表の行：請求債権は、元の配当で受けた額（留保分を除く）を充当した後の額
    const released = lines.reduce((t, l) => t + l.held, 0);
    const rows = [];
    for (const r of claimRows) {
      const v = extra[r.id] || 0;
      if (!v) continue;
      const c = (input.claims || []).find((x) => x.id === r.id) || {};
      const prior = r.held ? 0 : r.paid;
      const now = {};
      let left = prior;
      for (const k of comps) { const t = Math.min(r[k] || 0, left); now[k] = (r[k] || 0) - t; left -= t; }
      const applied = {}, after = {};
      left = v;
      for (const k of comps) { const t = Math.min(now[k], left); applied[k] = t; after[k] = now[k] - t; left -= t; }
      const l = lines.find((x) => x.id === r.id);
      const note = l ? (l.outcome === 'pay' ? '留保していた配当額の支払' : l.outcome === 'relative' ? '配当異議訴訟の結果、残りを支払' : '供託の事由の消滅による配当表の変更')
        : lines.some((x) => x.outcome === 'relative' && x.plaintiff === r.id) ? '配当異議訴訟の結果（相対的解決）' : '配当表の変更（民執法92条2項）';
      const stillHeld = r.held > 0 && !(decisions[r.id] || {}).outcome;
      rows.push({ type: 'claim', id: r.id, rank: r.rank, payee: r.payee, caseNo: r.caseNo, label: r.label,
        cost: now.cost, interest: now.interest, damages: now.damages, principal: now.principal, total: comps.reduce((t, k) => t + now[k], 0),
        paid: v, held: stillHeld ? v : 0, note: [stillHeld ? '配当表の変更による増加分も引き続き支払留保' : note, c.note].filter(Boolean).join('、'),
        applied: stillHeld ? null : applied, after: stillHeld ? null : after });
    }
    const paidTotal = rows.reduce((t, x) => t + x.paid, 0);
    const warnings = [];
    if (paidTotal !== released) warnings.push(`追加配当の合計（${paidTotal.toLocaleString()}円）が留保を解いた額（${released.toLocaleString()}円）と一致しません。`);
    const out = {
      type: '配当表', meta: Object.assign({}, result.meta), settings: result.settings, agreed: false, provisional: true,
      caption: '（供託金の配当：民事執行法92条。支払を留保した配当額についての追加配当）',
      fund: { sale: 0, deposit: released, interest: 0, total: released },
      rows, regions: [], warnings, next: {}, paid: Object.fromEntries(rows.map((x) => [x.id, x.paid])), remaining: {},
    };
    return { result: out, lines };
  };

  // ---------------------------------------------------------------
  // 和暦（令和）
  // ---------------------------------------------------------------
  HT.wareki = function (iso) {
    if (!iso) return '令和　　年　　月　　日';
    const [y, m, d] = iso.split('-').map(Number);
    if (iso >= '2019-05-01') return `令和${y - 2018 === 1 ? '元' : y - 2018}年${m}月${d}日`;
    if (iso >= '1989-01-08') return `平成${y - 1988 === 1 ? '元' : y - 1988}年${m}月${d}日`;
    return `${y}年${m}月${d}日`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
