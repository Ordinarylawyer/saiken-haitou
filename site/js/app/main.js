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
  const blankDeposit = () => ({ id: newId('d'), debtKind: 'general', date: '', at: '', caseNo: '', depositNo: '', office: '', thirdParty: '', mixed: false, mixedResolved: false, preservation: false, convertedAt: '', releaseAmount: '', amount: '', interest: '', depositCost: '', net: '', capT: '',
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
    meta: { date: '', court: '', clerk: '', judge: '', debtor: '', debtorLabel: '債　務　者', caseNos: '', cases: [{ year: '', no: '' }], footnote: '' },
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
  // 保存した JSON・設例の入力を、入力欄の形に整えて取り込む
  function adoptInput(s) {
    state = Object.assign(blankState(), s);
    state.meta = Object.assign(blankState().meta, s.meta || {});
    if (!s.meta || !Array.isArray(s.meta.cases)) state.meta.cases = parseCases(state.meta.caseNos);
    syncCaseNos();
    state.settings = Object.assign({}, HT.DEFAULT_SETTINGS, s.settings || {});
    state.agreement = Object.assign({ enabled: false, amounts: {} }, s.agreement || {});
    state.fund = Object.assign(blankState().fund, s.fund || {});
    state.fund.deposits = (state.fund.deposits || []).map((d) => { const b0 = blankDeposit(); return Object.assign(b0, d, { wage: Object.assign(b0.wage, d.wage || {}) }); });
    if (!s.procedureCosts) state.procedureCosts = [];
    state.claims = (state.claims || []).map((c) => fixKind(Object.assign(blankClaim(), c)));
    state.history = state.history || [];
  }
  let example = null; // 読み込んだ設例（期待値との一致を示す）
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
  // 配当等事件の番号：入力のたびに meta.caseNos を作り直し、欄から離れたら供託金の選択肢を更新する
  document.addEventListener('input', (e) => {
    const d = e.target.dataset || {};
    if (d.case == null) return;
    const k = Number(d.case);
    const c = state.meta.cases[k];
    if (!c) return;
    const before = caseText(c);
    c[d.part] = e.target.value;
    syncCaseNos();
    const dep = state.fund.deposits[k];
    if (dep && (!dep.caseNo || dep.caseNo === before)) dep.caseNo = caseText(c); // k番目の供託金はk番目の事件番号に合わせる
    schedule();
    // 供託金の欄の選択肢だけを作り直す（入力中の欄のフォーカスを失わないよう、全体は描き直さない）
    state.fund.deposits.forEach((dep, i) => {
      const sel0 = document.querySelector(`[data-bind="fund.deposits.${i}.caseNo"]`);
      const lab = sel0 && sel0.closest('label');
      if (lab) lab.outerHTML = caseSelect(dep, i);
    });
  });
  document.addEventListener('change', (e) => {
    const id = e.target.id || '';
    if (!id.startsWith('tpl-')) return;
    if (id === 'tpl-nGeneral') tpl.nGeneral = e.target.value;
    else if (id === 'tpl-nWage') tpl.nWage = e.target.value;
    else if (id === 'tpl-general' || id === 'tpl-wage') { tpl[id.slice(4)] = e.target.checked; renderForm(); }
    else if (id.startsWith('tpl-pattern-')) { tpl.pattern = e.target.value; if (tpl.pattern !== 'gen') tpl.wage = true; renderForm(); }
    else if (id.startsWith('tpl-lien-')) tpl.lien = e.target.value === '1';
  });
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
  // テンプレート（典型的な形の入力欄を用意する）
  // ---------------------------------------------------------------
  const TPL_PATTERNS = [
    ['gen', '一般債権どうし'],
    ['sup', '一般債権＋養育費'],
    ['supTax', '一般債権＋養育費＋公債権（租税・公課）'],
  ];
  const tpl = { pattern: 'gen', lien: true, general: true, wage: false, nGeneral: '1', nWage: '1' };
  let tplOpen = null; // null：入力が空のときだけ出す。true／false：ボタンで開閉
  let guide = null;   // テンプレートを当てた後の「次にすること」
  const isBlank = () => !state.meta.date && !(state.history || []).length
    && state.fund.deposits.every((d) => !d.amount && !d.date)
    && state.claims.every((c) => !c.creditor && !c.principal);
  function renderTemplate() {
    const show = tplOpen === true || (tplOpen === null && isBlank());
    if (guide && !show) {
      return `<section class="card tpl guide"><div class="row between"><h2>次に入れるもの</h2><button class="btn small" data-act="closeGuide">閉じる</button></div>
  <ol>${guide.map((g) => `<li>${g}</li>`).join('')}</ol></section>`;
    }
    if (!show) return '';
    const sup = tpl.pattern !== 'gen';
    return `<section class="card tpl">
  <div class="row between"><h2>テンプレートから始める</h2>${tplOpen ? '<button class="btn small" data-act="closeTpl">閉じる</button>' : ''}</div>
  <p class="hint">リ事件の数と債権者の構成を選ぶと、典型的な形の入力欄を用意します。あとは金額・日付・名前を入れていくだけです。入力欄はあとから追加・削除できます。</p>
  <div class="tpl-kinds">
    <span class="label">差押債権の種類（両方なら両方に印）と、それぞれのリ事件の数（＝供託金の数）</span>
    <div class="tpl-kind"><label class="chk"><input type="checkbox" id="tpl-general" ${tpl.general ? 'checked' : ''}> 預金・売掛金など</label>${tpl.general ? `<label class="chk">リ事件の数 <input class="in num tpl-n" id="tpl-nGeneral" inputmode="numeric" value="${esc(tpl.nGeneral)}"></label>` : ''}</div>
    <div class="tpl-kind"><label class="chk"><input type="checkbox" id="tpl-wage" ${tpl.wage ? 'checked' : ''}> 給料等（民執法152条）</label>${tpl.wage ? `<label class="chk">リ事件の数 <input class="in num tpl-n" id="tpl-nWage" inputmode="numeric" value="${esc(tpl.nWage)}"></label>` : ''}</div>
  </div>
  <div class="tpl-patterns">${TPL_PATTERNS.map(([v, t]) => `<label class="chk"><input type="radio" name="tpl-pattern" id="tpl-pattern-${v}" value="${v}" ${tpl.pattern === v ? 'checked' : ''}> ${t}</label>`).join('')}</div>
  ${sup ? `<div class="tpl-patterns"><label class="chk"><input type="radio" name="tpl-lien" id="tpl-lien-yes" value="1" ${tpl.lien ? 'checked' : ''}> 養育費に子の監護費用の先取特権あり（担保権の実行又は文書による配当要求）</label>
    <label class="chk"><input type="radio" name="tpl-lien" id="tpl-lien-no" value="0" ${tpl.lien ? '' : 'checked'}> 先取特権なし（債務名義による差押え・配当要求だけ）</label></div>` : ''}
  <div class="row"><button class="btn primary" data-act="applyTpl">この形で始める</button></div>
  ${renderExamples()}
</section>`;
  }
  const RONTEN_SECTIONS = { 1: '第1-手続の分岐と配当加入', 2: '第2-仮差押えを原因とする供託', 3: '第3-配当原資と区画', 4: '第4-順位', 5: '第5-扶養義務等債権', 6: '第6-仮差押えと本執行への移行', 7: '第7-債権額充当端数配当表の記載', 8: '第8-継続的給付と回次の繰越', 9: '第9-特殊な場面' };
  const rontenLink = (r) => `<a href="${REPO}/blob/main/docs/%E8%AB%96%E7%82%B9%E6%95%B4%E7%90%86.md#${encodeURIComponent(RONTEN_SECTIONS[r.split('-')[0]] || '')}" target="_blank" rel="noopener noreferrer">${esc(r)}</a>`;
  function renderExamples() {
    const list = HT.EXAMPLES || [];
    if (!list.length) return '';
    const groups = [...new Set(list.map((x) => x.group))];
    return `<div class="examples"><h3>または、設例から選ぶ</h3>
  <p class="hint">テストで計算の結果を確かめている事例です。読み込むと、そのまま書き換えてテンプレートの代わりに使えます。番号は論点整理の論点です。</p>
  ${groups.map((g) => `<details class="ex-group"><summary>${esc(g)}（${list.filter((x) => x.group === g).length}件）</summary>
    <ul>${list.filter((x) => x.group === g).map((x) => `<li><button class="btn small" data-act="loadExample" data-id="${esc(x.id)}">読み込む</button>
      <span class="ex-title">${esc(x.title)}</span>${x.source ? '<span class="ex-book">近藤本</span>' : ''}<span class="ex-desc">${esc(x.desc)}（論点 ${x.ronten.map(esc).join('・')}）</span></li>`).join('')}</ul></details>`).join('')}
</div>`;
  }
  function loadExample(id) {
    const ex = (HT.EXAMPLES || []).find((x) => x.id === id);
    if (!ex) return false;
    if (!isBlank() && !confirm('いまの入力を消して、設例の入力に入れ替えます。よろしいですか。')) return false;
    adoptInput(JSON.parse(JSON.stringify(ex.input)));
    example = ex; guide = null; tplOpen = false;
    return true;
  }
  // 設例の期待値と、いまの計算の結果が一致するか
  function exampleMatches(r) {
    if (!example || !r) return null;
    const e = example.expect;
    const paid = Object.fromEntries(r.rows.filter((x) => x.type === 'claim').map((x) => [x.id, x.paid]));
    const held = Object.fromEntries(r.rows.filter((x) => x.held).map((x) => [x.id, x.held]));
    const surplus = (r.rows.find((x) => x.type === 'debtor') || { paid: 0 }).paid;
    const same = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort());
    return r.type === e.type && same(paid, e.paid) && same(held, e.held || {}) && surplus === (e.surplus || 0);
  }
  function exampleBanner(r) {
    if (!example || viewing != null || viewingAdd) return '';
    const ok = exampleMatches(r);
    return `<div class="ex-banner noprint ${ok ? 'ok' : ''}"><div class="row between"><strong>設例：${esc(example.title)}</strong><button class="btn small" data-act="closeExample">閉じる</button></div>
  <p>${esc(example.desc)}　論点 ${example.ronten.map(rontenLink).join('・')}</p>
  ${example.source ? `<p class="hint">出典：${esc(example.source)}</p>` : ''}
  <p class="ex-check">${ok ? '✓ テストの期待値と一致しています。' : '入力を設例から変えているため、設例の結果とは異なります。'}</p></div>`;
  }
  function applyTemplate() {
    const cnt = (v) => Math.min(Math.max(HT.int(v) || 1, 1), 20);
    const nG = tpl.general ? cnt(tpl.nGeneral) : 0, nW = tpl.wage ? cnt(tpl.nWage) : 0, n = nG + nW;
    if (!n) { alert('差押債権の種類（預金・売掛金など／給料等）を選んでください。'); return false; }
    if (!isBlank() && !confirm('いまの入力を消して、テンプレートの形に入れ替えます。よろしいですか。')) return false;
    const sup = tpl.pattern !== 'gen', tax = tpl.pattern === 'supTax';
    state = blankState();
    state.meta.cases = Array.from({ length: n }, () => ({ year: '', no: '' }));
    state.fund.kind = nG && nW ? 'mixed' : nW ? 'wage' : 'general';
    state.fund.deposits = [...Array.from({ length: nG }, () => Object.assign(blankDeposit(), { debtKind: 'general' })),
      ...Array.from({ length: nW }, () => Object.assign(blankDeposit(), { debtKind: 'wage' }))];
    const gen = (label) => Object.assign(blankClaim(), { kind: 'GEN', label });
    state.claims = tpl.pattern === 'gen' ? [gen('貸金'), gen('売買代金')] : [gen('貸金')];
    if (tax) state.claims.push(Object.assign(blankClaim(), { kind: 'TAX', label: '（税目）・交付要求' }));
    if (sup) state._sup = { asserted: tpl.lien };
    const steps = [
      '「1 事件」：配当期日、裁判所・書記官、債務者と、配当等事件（リ）の番号を年と号に分けて入れます（リ事件の数だけ欄を用意してあります）。',
      `「2 配当原資」：供託金${n > 1 ? `1〜${n}` : ''}ごとに、供託日（日時）・供託金を入れ、配当等事件の番号（リ）を「1 事件」に入れた番号から選びます。${nG && nW ? `供託金1${nG > 1 ? `〜${nG}` : ''}は預金・売掛金など、供託金${nG + 1}${nW > 1 ? `〜${n}` : ''}は給料等として用意しました。` : ''}${nW ? '給料等は手取額も入れます。' : ''}`,
      '「4 債権者」：債権者ごとに、名前・事件番号・差押え等の効力発生の日時・請求債権の額を入れます。',
    ];
    if (sup) steps.push(`「5 扶養義務等債権」：養育費の債権者・月額・子の数・未払の支払期を入れて「債権者欄に加える」を押します。${tpl.lien ? '先取特権の部分（月8万円×子の数まで）とそれ以外の2行に分けて加えます。' : '先取特権の部分は作らず、1行で加えます。'}加えた行に事件番号・効力発生の日時を入れます。`);
    if (tax) steps.push('公債権の行：種別（租税／公課）、税目、法定納期限等、交付要求の受理の日時を入れます。');
    steps.push('右の配当表を確かめ、「印刷」又は「Excel で保存」で出力します。続きは「JSON に保存」で残せます。');
    guide = steps;
    tplOpen = false;
    example = null;
    return true;
  }

  // ---------------------------------------------------------------
  // 画面
  // ---------------------------------------------------------------
  // 「1 事件」に入れた配当等事件の番号（1行に1件）
  const caseList = () => String(state.meta.caseNos || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  // 配当等事件の番号は「令和○年（リ）第○号」の年と号を別々に入れ、改行の打ち方などによる誤りを防ぐ。
  // 入力は meta.cases（[{year, no}]）に持ち、計算・配当表に使う meta.caseNos（1行に1件）はそこから作る
  const CASE_RE = /^令和\s*(元|\d+)\s*年\s*[（(]\s*リ\s*[)）]\s*第\s*(\d+)\s*号$/;
  function parseCases(text) {
    const lines = String(text || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (!lines.length) return [{ year: '', no: '' }];
    return lines.map((l) => { const m = l.normalize('NFKC').match(CASE_RE); return m ? { year: m[1] === '元' ? '1' : m[1], no: m[2] } : { raw: l }; });
  }
  const caseText = (c) => {
    if (c.raw != null) return String(c.raw).trim();
    const y = String(c.year || '').normalize('NFKC').trim(), n = String(c.no || '').normalize('NFKC').trim();
    return y && n ? `令和${y === '1' || y === '元' ? '元' : y}年（リ）第${n}号` : '';
  };
  function syncCaseNos() { state.meta.caseNos = (state.meta.cases || []).map(caseText).filter(Boolean).join('\n'); }
  function renderCases() {
    const cases = state.meta.cases || [];
    return `<div class="cases">
    <div class="case-count"><label class="chk">リ事件の数 <input class="in num case-n" id="case-count" inputmode="numeric" value="${cases.length}"></label>
      <button class="btn small" data-act="setCaseCount">欄を作る</button><span class="hint">併合した事件も含めた数です。同じ数だけ「2 配当原資」の供託金の欄を用意し、順に事件番号を当てます。</span></div>
    ${cases.map((c, k) => c.raw != null ? `<div class="case-row bad-row"><span class="case-k">${k + 1}</span><input class="in case-raw" data-case="${k}" data-part="raw" value="${esc(c.raw)}">
      <button class="btn small" data-act="fixCase" data-i="${k}">年と号で入れ直す</button>
      <span class="hint warn">形式が「令和○年（リ）第○号」ではありません。${/[（(][ルナヨ][)）]/.test(c.raw) ? '差押え等の事件の番号（ル・ナ・ヨ）は、「4 債権者」の各債権者の欄に入れます。' : ''}</span></div>`
      : `<div class="case-row"><span class="case-k">${k + 1}</span>令和 <input class="in num case-y" data-case="${k}" data-part="year" inputmode="numeric" value="${esc(c.year)}" placeholder="8"> 年（リ）第 <input class="in num case-no" data-case="${k}" data-part="no" inputmode="numeric" value="${esc(c.no)}" placeholder="123"> 号</div>`).join('')}
  </div>`;
  }
  // 供託金ごとの配当等事件の番号は、誤入力を防ぐため「1 事件」に入れた番号から選ぶ
  function caseSelect(d, i) {
    const list = caseList().filter((c) => !/[（(][ルナヨ][)）]/.test(c)); // 差押事件等の番号は選ばせない
    const cur = d.caseNo || '';
    const opts = [['', list.length ? '（選ぶ）' : '（先に「1 事件」に番号を入れる）'], ...list.map((c) => [c, c])];
    if (cur && !list.includes(cur)) opts.push([cur, `${cur}（「1 事件」にない番号）`]);
    return `<label class="field"><span class="label">配当等事件の番号（リ）</span><select class="in${cur && !list.includes(cur) ? ' bad' : ''}" data-bind="fund.deposits.${i}.caseNo" ${list.length || cur ? '' : 'disabled'}>${
      opts.map(([v, t]) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  }
  function renderForm() {
    const s = state;
    const mixed = s.fund.kind === 'mixed';
    const wageDep = (d) => HT.isWageDeposit(d, s.fund);
    const wage = s.fund.deposits.some(wageDep); // 給料等の供託金が1つでもあるか
    $('#form').innerHTML = `
${renderTemplate()}
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
  <div class="field"><span class="label">配当等事件の番号（リ）</span>${renderCases()}</div>
  ${renderHistory()}
</section>

<section class="card">
  <h2>2 配当原資</h2>
  <div class="grid">
    ${sel('fund.kind', '差押債権の種類', [['general', '預金・売掛金など（差押禁止の範囲の違いなし）'], ['wage', '給料等（民執法152条）'], ['mixed', '預金・売掛金などと給料等の両方（供託金ごとに選ぶ）']], true)}
    ${inp('fund.cutoffAt', '配当要求の終期（供託の日時）', '', 'datetime-local')}
    ${inp('fund.saleProceeds', '売得金（円・売却命令のとき）', '', 'num')}
    ${inp('fund.saleAt', '売得金：執行官が交付を受けた日時（終期）', '', 'datetime-local')}
  </div>
  ${s.fund.deposits.map((d, i) => `
  <div class="sub-card">
    <div class="row between"><strong>供託金 ${i + 1}</strong>${s.fund.deposits.length > 1 ? `<button class="btn small danger" data-act="delDeposit" data-i="${i}">削除</button>` : ''}</div>
    ${mixed ? `<div class="grid">${sel(`fund.deposits.${i}.debtKind`, 'この供託金の差押債権', [['general', '預金・売掛金など'], ['wage', '給料等（民執法152条）']], true)}</div>` : ''}
    <div class="grid">
      ${inp(`fund.deposits.${i}.date`, '供託日（受入日）', '', 'date')}
      ${inp(`fund.deposits.${i}.at`, '供託の日時（同じ日に差押え等があるとき）', '', 'datetime-local')}
      ${inp(`fund.deposits.${i}.amount`, '供託金（円）', '', 'num')}
      ${inp(`fund.deposits.${i}.interest`, '供託利息（円・空欄なら自動計算）', '', 'num')}
      ${inp(`fund.deposits.${i}.depositCost`, '第三債務者の供託費用（円）', '', 'num')}
      ${wageDep(d) ? inp(`fund.deposits.${i}.net`, '手取額（給料等−所得税・住民税・社会保険料）', '', 'num') : ''}
      ${caseSelect(d, i)}
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
    ${wageDep(d) && s.claims.some((c) => HT.isPublic(c) && c.taxSeizure) ? `
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

  // ---------------------------------------------------------------
  // 誤りの報告・改善の提案（GitHub の Issue。事件を特定できる情報は送らない）
  // ---------------------------------------------------------------
  const REPO = 'https://github.com/Ordinarylawyer/saiken-haitou';
  const issueUrl = (template, title, fields) => `${REPO}/issues/new?${new URLSearchParams(Object.assign({ template, title }, fields))}`;
  // 報告の「対象」欄に入れる要約。名前・事件番号・金額は入れず、計算の形だけを書く
  function reportTarget(r) {
    const s = state;
    const depLabel = Object.fromEntries(DEP_TYPES);
    const lines = [
      `書式：${r.type}${viewingAdd ? '（追加配当表）' : viewing != null ? `（第${viewing + 1}回の表示）` : ''}`,
      `差押債権：${s.fund.kind === 'wage' ? '給料等' : s.fund.kind === 'mixed' ? `預金・売掛金などと給料等（${s.fund.deposits.map((d) => (d.debtKind === 'wage' ? '給料等' : '預金等')).join('／')}）` : '預金・売掛金など'}`,
      `供託金：${s.fund.deposits.length}件（${s.fund.deposits.map((d) => depLabel[depType(d)] || '').join('／')}）`,
      `債権者：${s.claims.length}件（${s.claims.map((c, i) => `${i + 1} ${HT.KIND_LABEL[c.kind] || c.kind}${c.fromPrv ? '・本執行移行' : ''}${c.stayed ? '・執行停止' : ''}${c.transferServedAt ? '・転付命令' : ''}`).join('、')}）`,
    ];
    const diff = Object.keys(HT.DEFAULT_SETTINGS).filter((k) => (s.settings || {})[k] && s.settings[k] !== HT.DEFAULT_SETTINGS[k]);
    if (diff.length) lines.push(`設定（初期値から変更）：${diff.map((k) => `${k}=${s.settings[k]}`).join('、')}`);
    return lines.join('\n');
  }
  // 報告に添える入力（JSON）から、名前・事件番号・供託番号などを消す
  function anonymize(input) {
    const names = new Map();
    const alias = (name, prefix) => {
      const k = `${prefix}:${String(name || '').trim()}`;
      if (!String(name || '').trim()) return '';
      if (!names.has(k)) names.set(k, `${prefix}${[...names.keys()].filter((x) => x.startsWith(prefix + ':')).length + 1}`);
      return names.get(k);
    };
    const one = (x) => {
      if (!x) return x;
      if (x.meta) Object.assign(x.meta, { court: '○○地方裁判所', clerk: '', judge: '', debtor: '債務者', caseNos: '', cases: [], footnote: '' });
      (x.claims || []).forEach((c) => {
        c.creditor = alias(c.creditor, '債権者');
        c.caseNo = ''; c.regNote = ''; c.note = '';
        if (c.group) c.group = alias(c.group, '組');
      });
      (x.fund && x.fund.deposits || []).forEach((d) => { d.thirdParty = alias(d.thirdParty, '第三債務者'); d.caseNo = ''; d.depositNo = ''; d.office = ''; });
      (x.procedureCosts || []).forEach((c) => { c.payee = alias(c.payee, '債権者'); });
      return x;
    };
    const s = one(JSON.parse(JSON.stringify(input)));
    (s.history || []).forEach((h) => { if (h.input) one(h.input); });
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
    const regions = r.regions.length > 1 || state.fund.deposits.some((d) => HT.isWageDeposit(d, state.fund)) ? `
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
    $('#result').innerHTML = `${banner}${exampleBanner(r)}${warn}
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
<div class="report-row noprint">
  <a class="btn small" target="_blank" rel="noopener noreferrer" href="${esc(issueUrl('report.yml', `[報告] ${r.type}の計算`, { target: reportTarget(r) }))}">この計算の誤りを報告</a>
  <button class="btn small" data-act="saveAnon" title="債権者名・事件番号・第三債務者名・供託番号などを消した入力を保存します。報告に添えるときに使います">名前等を消した JSON を保存</button>
  <a class="btn small" target="_blank" rel="noopener noreferrer" href="${esc(issueUrl('proposal.yml', '[提案] '))}">改善を提案</a>
  <span class="hint">GitHub のアカウントが要ります。事件の当事者名など、事件を特定できる情報は書かないでください。</span>
</div>
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
    if (path === 'fund.kind' && el.value === 'mixed') {
      // 「両方」に切り替えたときは、それまでの種類を各供託金の初期値にする
      const prev = state.fund.kind === 'wage' ? 'wage' : 'general';
      state.fund.deposits.forEach((d) => { if (state.fund.kind !== 'mixed') d.debtKind = prev; });
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
      case 'saveAnon': download(`配当計算_報告用_${stamp()}.json`, new Blob([JSON.stringify(anonymize(toInput()), null, 2)], { type: 'application/json' })); return;
      case 'save': download(`配当計算_${stamp()}.json`, new Blob([JSON.stringify(toInput(), null, 2)], { type: 'application/json' })); return;
      case 'load': $('#loadfile').click(); return;
      case 'clear': if (!confirm('入力をすべて消します。よろしいですか。')) return; state = blankState(); tplOpen = null; guide = null; example = null; break;
      case 'openTpl': tplOpen = true; guide = null; renderForm(); window.scrollTo({ top: 0, behavior: 'smooth' }); return;
      case 'closeTpl': tplOpen = false; renderForm(); return;
      case 'closeGuide': guide = null; renderForm(); return;
      case 'applyTpl': if (!applyTemplate()) return; break;
      case 'setCaseCount': {
        const n = Math.min(Math.max(HT.int(document.getElementById('case-count').value) || 1, 1), 30);
        const cases = state.meta.cases || [];
        if (n < cases.length && cases.slice(n).some((c) => caseText(c)) && !confirm(`${n + 1}件目以降の事件番号を消します。よろしいですか。`)) return;
        const deps = state.fund.deposits;
        const filled = (d) => d && (d.amount || d.date || d.net);
        if (n < deps.length && deps.slice(n).some(filled) && !confirm(`供託金${n + 1}以降の入力も消えます。よろしいですか。`)) return;
        state.meta.cases = Array.from({ length: n }, (_, k) => cases[k] || { year: '', no: '' });
        syncCaseNos();
        // リ事件の数だけ供託金の欄を用意し、k番目の供託金にk番目の事件番号を当てる（テンプレートと同じ）
        const last = deps[deps.length - 1];
        state.fund.deposits = Array.from({ length: n }, (_, k) => deps[k] || Object.assign(blankDeposit(), last && last.debtKind ? { debtKind: last.debtKind } : {}));
        state.fund.deposits.forEach((d, k) => { const t = caseText(state.meta.cases[k] || {}); if (!d.caseNo && t) d.caseNo = t; });
        break;
      }
      case 'fixCase': state.meta.cases[i] = { year: '', no: '' }; syncCaseNos(); break;
      case 'loadExample': if (!loadExample(b.dataset.id)) return; break;
      case 'closeExample': example = null; renderResult(); return;
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
        adoptInput(JSON.parse(rd.result));
        example = null; guide = null; tplOpen = false;
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
