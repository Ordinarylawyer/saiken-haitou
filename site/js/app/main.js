// 債権執行 配当計算 ― 画面
(function () {
  'use strict';
  const HT = window.HT;
  const esc = HT.esc;
  const $ = (s, el = document) => el.querySelector(s);

  // ---------------------------------------------------------------
  // 状態
  // ---------------------------------------------------------------
  let seq = 0;
  const newId = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
  const blankDeposit = () => ({ id: newId('d'), date: '', at: '', caseNo: '', depositNo: '', office: '', thirdParty: '', mixed: false, mixedResolved: false, preservation: false, convertedAt: '', releaseAmount: '', amount: '', interest: '', depositCost: '', net: '', capT: '',
    wage: { gross: '', incomeTax: '', residentTax: '', socialInsurance: '', dependents: '' } });
  const blankClaim = () => ({ id: newId('c'), creditor: '', caseNo: '', filedOn: '', effectiveOn: '', kind: 'GEN', label: '',
    gppClass: 2, secType: 'MTG', perfectedOn: '', maxAmount: '', taxPriority: false, legalDue: '', demandAt: '', secured: false,
    taxSeizure: false, group: '', regNote: '', beyond2y: '', cost: '', interest: '', damages: '', principal: '', withheld: false, note: '',
    calcs: [], fromPrv: '' });
  const DEP_TYPES = [['normal', '第三債務者の供託（差押えに基づく執行供託）'], ['preservation', '仮差押えのみを原因とする第三債務者の供託（民事保全法50条5項）'],
    ['releaseByDebtor', '債務者が供託した仮差押解放金（民事保全法22条）'], ['residual', '滞納処分庁から交付を受けた残余金（滞調法）']];
  const depType = (d) => d.depType || (d.preservation ? 'preservation' : d.releaseByDebtor ? 'releaseByDebtor' : d.residual ? 'residual' : 'normal');
  const blankCalc = (c) => ({ target: 'damages', base: c && c.principal ? String(c.principal) : '', rate: '', from: '', to: '', basis: '365' });
  const blankState = () => ({
    version: 1,
    meta: { date: '', court: '', clerk: '', judge: '', debtor: '', debtorLabel: '債　務　者', caseNos: '', footnote: '' },
    fund: { kind: 'general', cutoffAt: '', deposits: [blankDeposit()] },
    procedureCosts: [{ payee: '', amount: '', note: '配当期日呼出状及び支払委託書送付費用' }],
    claims: [blankClaim()],
    agreement: { enabled: false, amounts: {} },
    settings: Object.assign({}, HT.DEFAULT_SETTINGS),
    history: [],
  });
  let state = blankState();
  // 以前の入力で「一般先取特権・子の監護の費用」としたものは、扶養義務等債権（子の監護費用の先取特権）に直す
  const fixKind = (c) => { if (c.kind === 'GPP' && String(c.gppClass) === '3') { c.kind = 'SUP3'; c.gppClass = 2; } return c; };
  // 印刷の選択（事件の入力ではないので JSON には保存しない）
  const printOpts = { pageNo: true, start: 1, heading: true };
  let printPanel = false;
  function readPrintOpts() {
    const pn = document.getElementById('po-pageNo'); if (!pn) return;
    printOpts.pageNo = pn.checked;
    printOpts.heading = document.getElementById('po-heading').checked;
    const n = HT.int(document.getElementById('po-start').value);
    printOpts.start = n >= 1 ? n : 1;
  }
  document.addEventListener('change', (e) => { if (e.target.id && e.target.id.startsWith('po-')) readPrintOpts(); });
  // 印刷の直前に、いま表示している表をページに組む（Ctrl+P で印刷したときも同じ）
  window.addEventListener('beforeprint', () => {
    const t = document.getElementById('print-pages');
    if (!t) return;
    readPrintOpts();
    t.innerHTML = '';
    if (lastResult) HT.buildPrintPages(t, HT.renderTableHTML(lastResult), printOpts);
  });

  function getPath(path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), state); }
  function setPath(path, v) {
    const ks = path.split('.');
    const last = ks.pop();
    const o = ks.reduce((p, k) => p[k], state);
    o[last] = v;
  }

  // ---------------------------------------------------------------
  // 入力欄の部品
  // ---------------------------------------------------------------
  const val = (p) => { const v = getPath(p); return v == null ? '' : v; };
  const inp = (p, label, cls = '', type = 'text', extra = '') =>
    `<label class="field ${cls}"><span class="label">${label}</span><input class="in${type === 'num' ? ' num' : ''}" ${type === 'num' ? 'inputmode="numeric"' : `type="${type}"`} data-bind="${p}" value="${esc(val(p))}" ${extra}></label>`;
  const chk = (p, label) => `<label class="chk"><input type="checkbox" data-bind="${p}" ${getPath(p) ? 'checked' : ''}> ${label}</label>`;
  const sel = (p, label, opts, rerender = false) =>
    `<label class="field"><span class="label">${label}</span><select class="in" data-bind="${p}" ${rerender ? 'data-rerender="1"' : ''}>${
      opts.map(([v, t]) => `<option value="${esc(v)}" ${String(val(p)) === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;

  // ---------------------------------------------------------------
  // 画面
  // ---------------------------------------------------------------
  function renderForm() {
    const s = state;
    const wage = s.fund.kind === 'wage';
    $('#form').innerHTML = `
<section class="card">
  <h2>1 事件</h2>
  <div class="grid">
    ${inp('meta.date', '配当期日（弁済金交付日）', '', 'date')}
    ${inp('meta.court', '裁判所・部', 'wide2', 'text', 'placeholder="○○地方裁判所第○民事部"')}
    ${inp('meta.clerk', '裁判所書記官')}
    ${inp('meta.judge', '裁判官（弁済金交付計算書）')}
    ${inp('meta.debtor', '債務者')}
    ${sel('meta.debtorLabel', '債務者欄の表示', [['債　務　者', '債務者'], ['債務者兼所有者', '債務者兼所有者（担保権の実行）']])}
  </div>
  <label class="field"><span class="label">事件番号（1行に1件。併合した事件をすべて）</span>
    <textarea class="in wide" rows="2" data-bind="meta.caseNos" placeholder="令和○年（リ）第○号&#10;令和○年（ル）第○号">${esc(s.meta.caseNos)}</textarea></label>
  ${renderHistory()}
</section>

<section class="card">
  <h2>2 配当原資</h2>
  <div class="grid">
    ${sel('fund.kind', '差押債権の種類', [['general', '預金・売掛金など（差押禁止の範囲の違いなし）'], ['wage', '給料等（民執法152条）']], true)}
    ${inp('fund.cutoffAt', '配当要求の終期（供託の日時）', '', 'datetime-local')}
    ${inp('fund.saleProceeds', '売得金（円・売却命令のとき）', '', 'num')}
    ${inp('fund.saleAt', '売得金：執行官が交付を受けた日時（終期）', '', 'datetime-local')}
  </div>
  ${s.fund.deposits.map((d, i) => `
  <div class="sub-card">
    <div class="row between"><strong>供託金 ${i + 1}</strong>${s.fund.deposits.length > 1 ? `<button class="btn small danger" data-act="delDeposit" data-i="${i}">削除</button>` : ''}</div>
    <div class="grid">
      ${inp(`fund.deposits.${i}.date`, '供託日（受入日）', '', 'date')}
      ${inp(`fund.deposits.${i}.at`, '供託の日時（同じ日に差押え等があるとき）', '', 'datetime-local')}
      ${inp(`fund.deposits.${i}.amount`, '供託金（円）', '', 'num')}
      ${inp(`fund.deposits.${i}.interest`, '供託利息（円・空欄なら自動計算）', '', 'num')}
      ${inp(`fund.deposits.${i}.depositCost`, '第三債務者の供託費用（円）', '', 'num')}
      ${wage ? inp(`fund.deposits.${i}.net`, '手取額（給料等−所得税・住民税・社会保険料）', '', 'num') : ''}
      ${inp(`fund.deposits.${i}.caseNo`, '配当事件の番号（リ）', '', 'text', 'placeholder="令和○年（リ）第○号"')}
      ${inp(`fund.deposits.${i}.depositNo`, '供託番号')}
      ${inp(`fund.deposits.${i}.office`, '供託所')}
      ${inp(`fund.deposits.${i}.thirdParty`, '第三債務者（多数のとき状況表でまとめる）')}
    </div>
    <div class="row">${chk(`fund.deposits.${i}.mixed`, '混合供託（民法494条と執行供託の併記）')}${d.mixed ? chk(`fund.deposits.${i}.mixedResolved`, '還付請求権が債務者に属することを証明する文書の提出あり') : ''}</div>
    <div class="grid">${sel(`fund.deposits.${i}.depType`, '供託金の種類', DEP_TYPES, true)}</div>
    ${depType(d) === 'releaseByDebtor' ? `<div class="row">${chk(`fund.deposits.${i}.treatAsCompeting`, '仮差押債権者の本執行を競合として扱う（本執行が仮差押えにない遅延損害金を含むなど）')}</div>
    <p class="hint">債務者が供託した仮差押解放金の取戻請求権には、仮差押えの効力が及びます。他の債権者の差押え等（仮差押債権者の別の債権によるものを含む）があれば、その時に競合し、その時が配当要求の終期です（民執法156条2項、165条1号）。仮差押債権者が同じ債権で本執行しただけなら競合せず、配当にならない（払渡しで足りる）ので、その旨を表示します。</p>` : ''}
    ${depType(d) === 'residual' ? `<div class="grid">
      ${sel(`fund.deposits.${i}.residualVia`, '残余金の経路', [['cash', '徴収職員が取り立てて交付（供託を経ない）'], ['deposit', '第三債務者の供託を経た']])}
      ${inp(`fund.deposits.${i}.depositedAt`, '第三債務者の供託の日時（供託を経たとき）', '', 'datetime-local')}
      ${inp(`fund.deposits.${i}.deliveredAt`, '執行裁判所が残余金の交付を受けた日時', '', 'datetime-local')}
    </div>
    <p class="hint">滞納処分が先行し、その残余金が執行裁判所に交付された場合です。供託金の欄に残余金の額を入れます。配当要求の終期は、供託を経たときは供託の時、経ないとき（又は執行側が仮差押えだけのとき）は残余金の交付を受けた時です（滞調法20条の7）。滞納処分をした租税は残余金からは配当しないので、債権者には入れません。供託利息は空欄なら0円とします。</p>` : ''}
    <div class="row">${chk(`fund.deposits.${i}.stayed`, '執行停止中の供託')}</div>
    ${d.stayed ? `<div class="grid">${inp(`fund.deposits.${i}.stayLiftedAt`, '執行停止が解けた日時（遮断効を否定する扱いのとき）', 'wide2', 'datetime-local')}</div>
    <p class="hint">遮断効を認める見解（供託の時が終期。民執法165条1号の文言）と、仮差押え後の供託と同様に否定する見解があります。「7 設定」で切り替えます。執行を停止された差押債権者には、債権者欄の「執行停止」に印を付けると配当額を留保します（民執法91条1項6号）。</p>` : ''}
    ${depType(d) === 'preservation' ? `<div class="grid">
      ${inp(`fund.deposits.${i}.convertedAt`, '還付請求権に対する最初の差押命令が供託所に送達された日時', 'wide2', 'datetime-local')}
      ${inp(`fund.deposits.${i}.releaseAmount`, '仮差押解放金の額（円。仮差押えが1件のとき。複数なら各仮差押えの欄に入れる）', 'wide2', 'num')}
    </div>
    <p class="hint">この供託だけでは配当要求の終期は来ません。仮差押えの範囲（給料等は手取額の1/4）で仮差押解放金の額までの部分は解放金とみなされ、最初の差押命令が供託所に送達された時に執行供託に変わって、その時が終期になります（複数の供託にわたるときは古い供託から解放金の額まで充てます）。それを超える部分は弁済供託に当たり、仮差押債権者は加入せず、還付請求権に対する差押え等が競合した時が終期です。競合がなければ配当の対象外として示します。「供託の日時」と「配当要求の終期」の欄は使わず、供託日は供託利息の計算に使います。手取額を入れると1/4を超える部分を分けます。仮差押えが複数あるときは、解放金とみなす額を各仮差押えの解放金の額の合計までとし、その範囲を全員で按分します（各仮差押債権者は自分の解放金の額まで）。</p>` : ''}
    ${wage && s.claims.some((c) => HT.isPublic(c) && c.taxSeizure) ? `
    <details class="tax76"><summary>国税徴収法76条の差押可能額（滞納処分の差押えがあるとき）</summary>
      <div class="grid">
        ${inp(`fund.deposits.${i}.wage.gross`, '給料等の額', '', 'num')}
        ${inp(`fund.deposits.${i}.wage.incomeTax`, '所得税', '', 'num')}
        ${inp(`fund.deposits.${i}.wage.residentTax`, '住民税', '', 'num')}
        ${inp(`fund.deposits.${i}.wage.socialInsurance`, '社会保険料', '', 'num')}
        ${inp(`fund.deposits.${i}.wage.dependents`, '生計を一にする親族の数', '', 'num')}
        ${inp(`fund.deposits.${i}.capT`, '差押可能額を直接入力（円）', '', 'num')}
      </div>
      <p class="hint">直接入力が空欄なら、給料等の額などから計算します（1か月以上の期間を前提に、給料等は千円未満切捨て、控除額は千円未満切上げ）。</p>
    </details>` : ''}
  </div>`).join('')}
  <button class="btn small" data-act="addDeposit">＋ 供託金を追加</button>
  <p class="hint">債権者の「効力発生（送達・受理）日時」が供託の時より後なら、その供託には配当加入しません。配当加入の状況が同じ供託はまとめて1つの部分として計算し、状況が違えば配当加入等の状況表を付けます。</p>
  ${wage ? '<p class="hint">給料等では、手取額から差押えの範囲（一般債権は1/4、扶養義務等債権は1/2。33万円の調整あり）を計算し、参加者の少ない部分から先に配ります。</p>' : ''}
</section>

<section class="card">
  <h2>3 手続費用（共益費用となる執行費用）</h2>
  ${s.procedureCosts.map((p, i) => `
  <div class="row">
    ${inp(`procedureCosts.${i}.payee`, '予納者')}
    ${inp(`procedureCosts.${i}.amount`, '金額（円）', '', 'num')}
    ${inp(`procedureCosts.${i}.note`, '内訳（備考）', 'wide2')}
    <button class="btn small danger" data-act="delCost" data-i="${i}">削除</button>
  </div>`).join('')}
  <button class="btn small" data-act="addCost">＋ 手続費用を追加</button>
  <p class="hint">申立手数料・送達費用などは手続費用ではありません。各債権者の「費用」に入れてください（差押命令の請求債権に記載があるものに限ります）。</p>
</section>

<section class="card">
  <h2>4 債権者</h2>
  ${s.claims.map((c, i) => renderClaim(c, i, wage)).join('')}
  <div class="row">
    <button class="btn small" data-act="addClaim">＋ 債権者を追加</button>
  </div>
</section>

<section class="card">
  <h2>5 扶養義務等債権を先取特権の部分とそれ以外に分ける</h2>
  <p class="hint">定期金の各期を入れると、子の監護費用の先取特権が付く部分（月8万円×子の数まで。施行日前の取決めは令和8年4月以後の期に限る）と、それ以外に分けて債権者欄に加えます。先取特権の部分として扱うのは、配当要求の終期までに担保権の実行か、先取特権を証する文書による配当要求をした場合だけです。</p>
  <div class="grid">
    ${inp('_sup.creditor', '債権者')}
    ${inp('_sup.monthly', '月額（円）', '', 'num')}
    ${inp('_sup.children', '子の数', '', 'num')}
    ${inp('_sup.from', '未払の最初の支払期', '', 'date')}
    ${inp('_sup.to', '未払の最後の支払期', '', 'date')}
    ${inp('_sup.agreedOn', '取決めの日', '', 'date')}
  </div>
  ${chk('_sup.asserted', '先取特権を行使した（担保権の実行又は文書による配当要求）')}
  <div class="row"><button class="btn small" data-act="splitSupport">債権者欄に加える</button><span id="supmsg" class="sub"></span></div>
</section>

<section class="card">
  <h2>6 合意配当</h2>
  ${chk('agreement.enabled', '配当期日に全債権者が合意した（民執法85条1項ただし書）')}
  ${s.agreement.enabled ? `<p class="hint">各債権者の合意額を入れます。合計に費用を足した額が配当原資を超えないこと、各債権の請求債権額を超えないことを確かめます。手続費用は変えられません。残りは債務者に交付します。</p>
  <div class="grid">${s.claims.map((c) => inp(`agreement.amounts.${c.id}`, `${esc(c.creditor || '（債権者）')}・${esc(c.label || HT.KIND_LABEL[c.kind])}`, '', 'num')).join('')}</div>` : ''}
</section>

<section class="card">
  <h2>7 設定</h2>
  <div class="grid">
    ${sel('settings.remainder', '按分の端数の残り', [['order', '配当表の記載順に1円ずつ'], ['fraction', '端数の大きい順に1円ずつ']])}
    ${sel('settings.costAllocation', '供託費用・手続費用の負担（給料等）', [['outer', '最初に配る部分（1/4を超える部分）から'], ['inner', '1/4までの部分（全員が加入）から'], ['proportional', '各部分の大きさに比例']])}
    ${sel('settings.stayedDeposit', '執行停止中の供託の配当加入遮断効', [['cutoff', '認める（供託の時が終期）'], ['nocutoff', '認めない（停止が解けた時を基準）']])}
    ${sel('settings.supportApplication', '先取特権のない部分への配当と、先取特権の被担保債権額（次回への繰越）', [['statutory', '法定充当により先取特権の部分から減る'], ['fixed', '先取特権の部分は減らない']])}
  </div>
</section>`;
  }

  function renderClaim(c, i, wage) {
    const p = (k) => `claims.${i}.${k}`;
    const k = c.kind;
    const extra = [];
    if (k === 'GPP') extra.push(`<p class="hint span-all">子の監護の費用の先取特権は、種別「扶養義務等債権（子の監護費用の先取特権）」で入れてください（給料等では2分の1まで加入します）。</p>`);
    if (k === 'GPP') extra.push(sel(p('gppClass'), '一般先取特権の種類', Object.entries(HT.GPP_CLASS_LABEL).filter(([v]) => v !== '3')));
    if (k === 'SEC') {
      extra.push(sel(p('secType'), '担保権の種類', Object.entries(HT.SEC_TYPE_LABEL), true));
      extra.push(inp(p('perfectedOn'), c.secType === 'SPP' ? '先取特権の成立・差押えの日' : '設定登記・対抗要件の日', '', 'date'));
      if (c.secType === 'MTG') extra.push(inp(p('maxAmount'), '極度額（根抵当権）', '', 'num'));
      if (c.secType !== 'SPP') extra.push(inp(p('regNote'), '備考に書く登記等（例：○○法務局令和○年○月○日受付第○号・順位番号1）', 'wide2'));
      if (c.secType === 'SPP') extra.push(chk(p('taxPriority'), '国税徴収法19条・20条に当たる（公租公課に優先）'));
    }
    if ((k === 'SEC' && c.secType !== 'SPP' && !HT.int(c.maxAmount)) || k === 'GPP' || k === 'SUP3') {
      extra.push(inp(p('beyond2y'), '利息・損害金のうち最後の2年分を超える額（一般債権と同順位）', '', 'num'));
    }
    if (k === 'TAX' || k === 'PUB') {
      extra.push(inp(p('legalDue'), '法定納期限等', '', 'date'));
      extra.push(inp(p('demandAt'), '交付要求の受理（みなし交付要求は滞納処分の差押え）日時', '', 'datetime-local'));
      extra.push(chk(p('secured'), '担保を徴した'));
      if (wage) extra.push(chk(p('taxSeizure'), '滞納処分の差押えがある（国税徴収法76条の範囲まで参加）'));
    }
    if (k === 'SUP2' || k === 'SUP3') extra.push(inp(p('group'), '同じ扶養義務等債権の組（先取特権の部分とそれ以外で同じ名前）'));
    if (k !== 'PRV') extra.push(inp(p('transferServedAt'), '転付命令の第三債務者への送達日時（転付命令を得ているとき）', 'wide2', 'datetime-local'));
    if (k === 'PRV' && state.fund.deposits.some((d) => depType(d) === 'preservation')) extra.push(inp(p('releaseAmount'), '仮差押解放金の額（空欄なら請求債権額）', '', 'num'));
    const prvs = state.claims.filter((x) => x.kind === 'PRV' && x.id !== c.id);
    if (k !== 'PRV' && (prvs.length || c.fromPrv)) {
      extra.push(sel(p('fromPrv'), '仮差押えから本執行に移行したとき、元の仮差押え', [['', '（移行なし）']].concat(
        prvs.map((x) => [x.id, `${x.creditor || '（債権者）'}${x.caseNo ? '・' + x.caseNo : ''}・${HT.yen(HT.claimTotal(x))}円`]))));
    }
    return `
  <div class="sub-card claim">
    <div class="row between"><strong>債権者 ${i + 1}</strong>
      <span><button class="btn small" data-act="upClaim" data-i="${i}" ${i ? '' : 'disabled'}>↑</button>
      <button class="btn small danger" data-act="delClaim" data-i="${i}">削除</button></span></div>
    <div class="grid">
      ${inp(p('creditor'), '債権者')}
      ${sel(p('kind'), '種別', HT.KINDS.map((x) => [x, HT.KIND_LABEL[x]]), true)}
      ${inp(p('caseNo'), '事件番号（差押え・配当要求等）', '', 'text', 'placeholder="令和○年（ル）第○号"')}
      ${inp(p('label'), '債権の種類（配当表の表示）', '', 'text', 'placeholder="貸金、給料・一般先取特権 など"')}
      ${inp(p('filedOn'), '申立日（同順位の記載順）', '', 'date')}
      ${inp(p('effectiveOn'), '効力発生（送達・受理）日時', '', 'datetime-local')}
    </div>
    ${extra.length ? `<div class="grid">${extra.join('')}</div>` : ''}
    <div class="grid">
      ${inp(p('cost'), '費用（円）', '', 'num')}
      ${inp(p('interest'), '利息（円）', '', 'num')}
      ${inp(p('damages'), k === 'TAX' || k === 'PUB' ? '損害金欄（本税）（円）' : '損害金（円）', '', 'num')}
      ${inp(p('principal'), k === 'TAX' || k === 'PUB' ? '元金欄（延滞税等）（円）' : '元金（円）', '', 'num')}
    </div>
    ${renderCalcs(c, i)}
    ${k === 'TAX' || k === 'PUB' ? '<p class="hint">本税が延滞税より先に充当されるため、損害金欄に本税、元金欄に延滞税を入れます（近藤基「債権配当の実務と書式〔第3版〕」187頁（民事法研究会・2021年））。備考に「本税が損害金欄、延滞税が元金欄」などと書いてください。</p>' : ''}
    <div class="row">
      ${chk(p('withheld'), '支払留保（配当異議・停止条件付など）')}
      ${k !== 'PRV' ? chk(p('stayed'), '執行停止（配当額を留保）') : ''}
      ${inp(p('note'), '備考', 'wide2')}
    </div>
  </div>`;
  }

  // 利息・損害金の自動計算の行
  function renderCalcs(c, i) {
    const list = c.calcs || [];
    const lines = list.map((l, j) => {
      const q = (k) => `claims.${i}.calcs.${j}.${k}`;
      return `<div class="calc-line">
        ${sel(q('target'), '欄', [['damages', '損害金'], ['interest', '利息']])}
        ${inp(q('base'), '元金（基礎）（円）', '', 'num')}
        ${inp(q('rate'), '年利（%）', 'narrow', 'text', 'inputmode="decimal" placeholder="3"')}
        ${inp(q('from'), '起算日', '', 'date')}
        ${inp(q('to'), '終期（空欄＝配当期日）', '', 'date')}
        ${sel(q('basis'), 'うるう年', [['365', '年365日の日割'], ['actual', 'うるう年は366日']])}
        <span class="calc-out" id="calc-${i}-${j}"></span>
        <button class="btn small danger" data-act="delCalc" data-i="${i}" data-j="${j}">削除</button>
      </div>`;
    }).join('');
    return `<details class="calcs" ${list.length ? 'open' : ''}><summary>利息・損害金を日割で計算する${list.length ? `（${list.length}行）` : ''}</summary>
      ${lines}
      <button class="btn small" data-act="addCalc" data-i="${i}">＋ 計算する行を追加</button>
      <p class="hint">計算した額は、上の利息・損害金の欄の額（申立て時の確定額など）に加えます。起算日と終期の両日を含み、1円未満は切り捨てます。期限の利益の喪失の前後で利率が変わるときは、行を分けてください。次回へ繰り越すと、終期が空欄の行は配当期日の翌日から、充当で減った元金を基礎にして続けます。</p>
    </details>`;
  }

  function renderHistory() {
    const h = state.history || [];
    if (!h.length) return '';
    const names = [];
    for (const r of h) for (const x of r.paid) { const n = `${x.payee}（${x.label}）`; if (!names.includes(n)) names.push(n); }
    const cell = (r, n) => { const xs = r.paid.filter((x) => `${x.payee}（${x.label}）` === n); return xs.length ? HT.yen(xs.reduce((t, x) => t + x.paid, 0)) + (xs.some((x) => x.held) ? '（留保）' : '') : '—'; };
    const acts = (r, i) => r.input ? `<button class="btn small" data-act="viewRound" data-i="${i}">配当表を表示</button>
      <button class="btn small" data-act="restoreRound" data-i="${i}" title="この回の入力に戻し、この回以後の記録を消します">この回に戻す</button>` : '（入力の記録なし）';
    return `<details class="history" ${viewing != null ? 'open' : ''}><summary>これまでの回次（${h.length}回）</summary>
      <table class="mini"><tr><th>回</th><th>配当期日</th><th>原資（円）</th>${names.map((n) => `<th>${esc(n)}</th>`).join('')}<th></th></tr>
      ${h.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(HT.wareki(r.date))}</td><td class="n">${HT.yen(r.fund)}</td>${names.map((n) => `<td class="n">${cell(r, n)}</td>`).join('')}<td>${acts(r, i)}</td></tr>`).join('')}
      </table>
      <p class="hint">各回の入力をこのファイルに残しているので、過去の回の配当表をいつでも表示・印刷・Excel 保存できます。</p>
      <button class="btn small danger" data-act="clearHistory">記録を消す</button>
    </details>`;
  }

  // ---------------------------------------------------------------
  // 計算と表示
  // ---------------------------------------------------------------
  let lastResult = null;
  let viewing = null; // 過去の回次を表示しているときはその番号
  let viewingAdd = false; // 追加配当表を表示しているとき
  function toInput() {
    const s = JSON.parse(JSON.stringify(state));
    delete s._sup;
    return s;
  }
  function compute() {
    viewing = null; viewingAdd = false;
    try {
      lastResult = HT.distribute(toInput());
      renderResult();
      state.claims.forEach((c, i) => {
        const ex = HT.calcClaimExtras(c, state.meta.date);
        ex.lines.forEach((l, j) => { const el = document.getElementById(`calc-${i}-${j}`); if (el) el.textContent = l.days ? `${l.days}日・${HT.yen(l.amount)}円` : ''; });
      });
    } catch (e) {
      $('#result').innerHTML = `<p class="err">計算できませんでした：${esc(e.message)}</p>`;
      lastResult = null;
    }
  }
  function renderResult() {
    const r = lastResult;
    const warn = r.warnings.length ? `<div class="hint warn"><strong>確認してください</strong><ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '';
    const regions = r.regions.length > 1 || state.fund.kind === 'wage' ? `
<details class="regions"><summary>部分（区画）ごとの配分</summary>
<table class="mini"><tr><th>供託金</th><th>範囲（円）</th><th>原資（円）</th><th>参加者と配当（円）</th><th>残り（円）</th></tr>
${r.regions.map((g) => `<tr><td>${g.deposit === 'sale' ? '売得金' : (g.deposits || []).map((x) => esc(`供託金${x.index + 1}${x.date ? '（' + HT.wareki(x.date) + '）' : ''}${x.part ? 'の' + x.part : ''}`)).join('<br>')}</td><td>${HT.yen(g.lower)}〜${HT.yen(g.upper)}</td><td class="n">${HT.yen(g.amount)}</td>
<td>${g.members.map((id) => { const row = r.rows.find((x) => x.id === id); return `${esc(row ? row.payee + '（' + row.label + '）' : id)}：${HT.yen(g.got[id])}`; }).join('<br>')}</td><td class="n">${HT.yen(g.rest)}</td></tr>`).join('')}
</table></details>` : '';
    const banner = viewingAdd ? `<div class="hint warn noprint"><strong>追加配当表（支払を留保した配当額の配当）を表示しています。</strong>
  <button class="btn small" data-act="backToCurrent">元の配当表に戻る</button></div>` : viewing != null ? `<div class="hint warn noprint"><strong>第${viewing + 1}回（${esc(HT.wareki(state.history[viewing].date))}）の配当表を表示しています。</strong>入力欄は現在の回のままです。
  <button class="btn small" data-act="backToCurrent">現在の回に戻る</button></div>` : '';
    const heldRows = viewing == null && !viewingAdd ? r.rows.filter((x) => x.type === 'claim' && x.held > 0) : [];
    const claimOpts = r.rows.filter((x) => x.type === 'claim').map((x) => [x.id, `${x.payee}（${x.label}）`]);
    const add = state.additional = state.additional || { decisions: {} };
    const addPanel = heldRows.length ? `
<details class="additional noprint" ${heldRows.some((x) => (add.decisions[x.id] || {}).outcome) ? 'open' : ''}><summary>支払を留保した配当額の配当（追加配当。民執法92条）</summary>
<p class="hint">供託の事由が消滅したときの配当を計算します。「配当できなくなった」「債権額を減らす」は配当異議の申出をしなかった債権者のためにも配当表を変更し（92条2項）、「債権者間の配当異議」は原告と被告の間だけで解決します（個別的・相対的解決。最判平6.7.14民集48巻5号1109頁）。</p>
${heldRows.map((x) => { const q = (k) => `additional.decisions.${x.id}.${k}`; const dc = add.decisions[x.id] || {}; return `<div class="sub-card"><strong>${esc(x.payee)}（${esc(x.label)}）留保額 ${HT.yen(x.held)}円</strong>
<div class="grid">
<label class="field"><span class="label">結果</span><select class="in" data-bind="${q('outcome')}" data-rerender="1">${[['', '引き続き留保'], ['pay', '留保額を支払う（本案勝訴・異議の取下げ等）'], ['void', '配当できなくなった（全員のため変更）'], ['reduce', '債権額を減らす（全員のため変更）'], ['relative', '債権者間の配当異議で債権額が減った（相対的）']].map(([v, t]) => `<option value="${v}" ${(dc.outcome || '') === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
${dc.outcome === 'reduce' || dc.outcome === 'relative' ? `<label class="field"><span class="label">認められた債権額（円）</span><input class="in num" inputmode="numeric" data-bind="${q('amount')}" value="${esc(dc.amount || '')}"></label>` : ''}
${dc.outcome === 'relative' ? `<label class="field"><span class="label">異議の原告</span><select class="in" data-bind="${q('plaintiff')}">${[['', '（選ぶ）']].concat(claimOpts.filter(([id]) => id !== x.id)).map(([v, t]) => `<option value="${esc(v)}" ${(dc.plaintiff || '') === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>` : ''}
</div></div>`; }).join('')}
<div class="grid"><label class="field"><span class="label">追加配当の期日</span><input class="in" type="date" data-bind="additional.date" value="${esc(add.date || '')}"></label></div>
<p class="hint">留保していた供託金に付いた供託利息は含めていません。</p>
<button class="btn" data-act="showAdditional">追加配当表を表示</button>
</details>` : '';
    $('#result').innerHTML = `${banner}${warn}
<div class="row between noprint"><strong>${esc(r.type)}</strong>
  <span>${viewing != null || viewingAdd ? '' : '<button class="btn" data-act="carry" title="給料・賃料など継続的な給付の差押えで、この回の配当を充当した残額を次の供託の入力に引き継ぎます">次回の配当へ繰り越す</button>'}
  <button class="btn" data-act="print">印刷（A4横）</button>
  <button class="btn primary" data-act="excel">Excel で保存</button></span></div>
${printPanel ? `<div class="sub-card print-opts noprint">
  <label class="chk"><input type="checkbox" id="po-pageNo" ${printOpts.pageNo ? 'checked' : ''}> ページ番号を付ける</label>
  <label class="chk">開始番号 <input class="in num po-start" id="po-start" inputmode="numeric" value="${esc(printOpts.start)}"></label>
  <label class="chk"><input type="checkbox" id="po-heading" ${printOpts.heading ? 'checked' : ''}> 2ページ目以降にも列の見出しを付ける</label>
  <span class="po-btns"><button class="btn primary" data-act="doPrint">印刷する</button> <button class="btn" data-act="cancelPrint">やめる</button></span>
</div>` : ''}
<div id="print-area" class="print-area">${HT.renderTableHTML(r)}</div>
${addPanel}
${regions}`;
  }

  // ---------------------------------------------------------------
  // 操作
  // ---------------------------------------------------------------
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(compute, 150); };

  document.addEventListener('input', (e) => {
    const el = e.target;
    const path = el.dataset && el.dataset.bind;
    if (!path) return;
    if (path.startsWith('_sup.')) { state._sup = state._sup || {}; state._sup[path.slice(5)] = el.type === 'checkbox' ? el.checked : el.value; return; }
    if (path === 'additional.date') { state.additional = state.additional || { decisions: {} }; state.additional.date = el.value; return; }
    if (path.startsWith('additional.')) {
      const [, , id, key] = path.split('.');
      state.additional = state.additional || { decisions: {} };
      state.additional.decisions[id] = state.additional.decisions[id] || {};
      state.additional.decisions[id][key] = el.value;
      if (el.dataset.rerender) renderResult();
      return;
    }
    setPath(path, el.type === 'checkbox' ? el.checked : el.value);
    if (el.dataset.rerender || path.endsWith('.taxSeizure') || path.endsWith('.mixed') || path.endsWith('.preservation') || path.endsWith('.stayed') || path === 'agreement.enabled') renderForm();
    schedule();
  });

  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  const stamp = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`; };

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const i = Number(b.dataset.i);
    switch (b.dataset.act) {
      case 'addDeposit': state.fund.deposits.push(blankDeposit()); break;
      case 'delDeposit': state.fund.deposits.splice(i, 1); break;
      case 'addCost': state.procedureCosts.push({ payee: '', amount: '', note: '' }); break;
      case 'delCost': state.procedureCosts.splice(i, 1); break;
      case 'addClaim': state.claims.push(blankClaim()); break;
      case 'delClaim': state.claims.splice(i, 1); break;
      case 'upClaim': if (i > 0) { const [c] = state.claims.splice(i, 1); state.claims.splice(i - 1, 0, c); } break;
      case 'splitSupport': splitSupport(); break;
      case 'addCalc': state.claims[i].calcs = (state.claims[i].calcs || []).concat([blankCalc(state.claims[i])]); break;
      case 'delCalc': state.claims[i].calcs.splice(Number(b.dataset.j), 1); break;
      case 'viewRound': {
        const h = state.history[i];
        if (!h || !h.input) return;
        try { lastResult = HT.distribute(h.input); viewing = i; renderResult(); $('#result').scrollIntoView({ behavior: 'smooth' }); }
        catch (err) { alert(`表示できませんでした：${err.message}`); }
        return;
      }
      case 'backToCurrent': compute(); return;
      case 'showAdditional': {
        if (!lastResult) return;
        const dec = {};
        for (const [id, v] of Object.entries((state.additional || {}).decisions || {})) {
          if (!v.outcome) continue;
          if (v.outcome === 'relative' && !v.plaintiff) { alert('債権者間の配当異議では、異議の原告を選んでください。'); return; }
          dec[id] = { outcome: v.outcome, amount: HT.int(v.amount), plaintiff: v.plaintiff };
        }
        if (!Object.keys(dec).length) { alert('結果を選んだ留保分がありません。'); return; }
        const a = HT.additionalDistribution(toInput(), lastResult, dec);
        if (state.additional.date) a.result.meta.date = state.additional.date;
        lastResult = a.result; viewingAdd = true; renderResult();
        return;
      }
      case 'restoreRound': {
        const h = state.history[i];
        if (!h || !h.input) return;
        if (!confirm(`第${i + 1}回の入力に戻します。第${i + 1}回以後の記録（${state.history.length - i}回分）と、いまの入力は消えます。よろしいですか。`)) return;
        const keep = state.history.slice(0, i);
        state = Object.assign(blankState(), JSON.parse(JSON.stringify(h.input)));
        state.claims = state.claims.map((c) => Object.assign(blankClaim(), c));
        state.history = keep;
        break;
      }
      case 'clearHistory': if (!confirm('これまでの回次の記録（過去の回の入力を含む）を消します。よろしいですか。')) return; state.history = []; break;
      case 'carry': {
        if (!lastResult) return;
        if (!state.meta.date) { alert('配当期日を入れてから繰り越してください（損害金の計算と記録に使います）。'); return; }
        if (!confirm('この回の配当（留保分を含む）を各債権に充当した残額で、次回の入力に切り替えます。\nこの回の入力は「これまでの回次」に残り、あとから配当表を表示できます（ファイルに残すには「JSON に保存」）。')) return;
        const cf = HT.carryForward(toInput(), lastResult);
        const s = cf.input;
        s.fund.deposits = s.fund.deposits.map((d) => { const b0 = blankDeposit(); return Object.assign(b0, d, { id: b0.id, wage: Object.assign(b0.wage, d.wage || {}) }); });
        state = Object.assign(blankState(), s);
        state.claims = state.claims.map((c) => Object.assign(blankClaim(), c));
        state.additional = { decisions: {} };
        renderForm(); compute();
        alert(`次回の入力に切り替えました。${cf.dropped.length ? `\n完済した債権を外しました：${cf.dropped.join('、')}` : ''}${cf.zeroed.length ? `\n0円になった扶養義務等債権の行は、新しい期を加えるために残しました：${cf.zeroed.join('、')}` : ''}\n供託金・配当期日・手続費用を入れてください。扶養義務等債権の新しい期の分は「5」で加えます。`);
        return;
      }
      case 'print': printPanel = !printPanel; renderResult(); return;
      case 'cancelPrint': printPanel = false; renderResult(); return;
      case 'doPrint': readPrintOpts(); window.print(); return;
      case 'excel': {
        if (!lastResult) return;
        const zip = await HT.buildXlsx(lastResult, window.JSZip);
        const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        download(`${lastResult.type}_${stamp()}.xlsx`, blob);
        return;
      }
      case 'save': download(`配当計算_${stamp()}.json`, new Blob([JSON.stringify(toInput(), null, 2)], { type: 'application/json' })); return;
      case 'load': $('#loadfile').click(); return;
      case 'clear': if (!confirm('入力をすべて消します。よろしいですか。')) return; state = blankState(); break;
      default: return;
    }
    renderForm();
    compute();
  });

  $('#loadfile').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const s = JSON.parse(rd.result);
        state = Object.assign(blankState(), s);
        state.settings = Object.assign({}, HT.DEFAULT_SETTINGS, s.settings || {});
        state.agreement = Object.assign({ enabled: false, amounts: {} }, s.agreement || {});
        state.claims = (state.claims || []).map((c) => fixKind(Object.assign(blankClaim(), c)));
        state.history = state.history || [];
        renderForm(); compute();
      } catch (err) { alert(`読み込めませんでした：${err.message}`); }
      e.target.value = '';
    };
    rd.readAsText(f);
  });

  function splitSupport() {
    const sp = state._sup || {};
    const monthly = HT.int(sp.monthly), children = HT.int(sp.children) || 1;
    if (!monthly || !sp.from || !sp.to) { $('#supmsg').textContent = '月額と支払期を入れてください。'; return; }
    const inst = [];
    let [y, m] = sp.from.split('-').map(Number);
    const [y2, m2] = sp.to.split('-').map(Number);
    const day = sp.from.split('-')[2];
    while (y < y2 || (y === y2 && m <= m2)) {
      inst.push({ due: `${y}-${String(m).padStart(2, '0')}-${day}`, amount: monthly, children });
      m++; if (m > 12) { m = 1; y++; }
    }
    const r = HT.splitSupport(inst, sp.agreedOn, !!sp.asserted);
    const group = sp.creditor || newId('g');
    const [ty, tm] = sp.to.split('-').map(Number);
    const upto = `元金欄に記載された金額は、${HT.wareki(`${ty}-${String(tm).padStart(2, '0')}-01`).replace(/1日$/, '')}分までの養育費債権である`;
    // 同じ債権者（又は組）の行が既にあれば（前回からの繰越など）、その元金に加える。片方しかなければ、もう片方は差押え等の情報を写して作る
    const key = (sp.creditor || '').trim();
    const same = key ? state.claims.filter((c) => (c.kind === 'SUP2' || c.kind === 'SUP3') && (c.group === key || (c.creditor || '').trim() === key)) : [];
    const sib = same[0];
    const base = { creditor: sib ? sib.creditor : sp.creditor || '', group: sib ? sib.group || group : group, note: upto };
    for (const c of same) c.group = base.group;
    const inherit = sib ? { caseNo: sib.caseNo, filedOn: sib.filedOn, effectiveOn: sib.effectiveOn } : {};
    const addTo = (kind, amount, label) => {
      if (!amount) return;
      const row = same.find((c) => c.kind === kind);
      if (row) { row.principal = String(HT.int(row.principal) + amount); row.note = upto; }
      else state.claims.push(Object.assign(blankClaim(), inherit, base, { kind, label, principal: String(amount) }));
    };
    addTo('SUP3', r.lien, '養育費・先取特権');
    addTo('SUP2', r.other, '養育費');
    state._sup = {};
    setTimeout(() => { $('#supmsg').textContent = `${inst.length}期分：先取特権の部分 ${HT.yen(r.lien)}円、それ以外 ${HT.yen(r.other)}円 を加えました。`; }, 0);
  }

  renderForm();
  compute();
})();
