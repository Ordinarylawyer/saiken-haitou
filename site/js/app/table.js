// 配当表（弁済金交付計算書）と配当加入等の状況表を、実務の書式で組み立てる
// 書式は近藤基「債権配当の実務と書式〔第3版〕」181頁以下（民事法研究会・2021年）の配当表例・弁済金交付計算書例による。
// 列：順位｜債権者・債権の種類｜費用・利息・損害金・元金｜合計｜配当実施額｜充当額｜充当後残額｜備考
(function (g) {
  'use strict';
  const HT = (g.HT = g.HT || {});

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const yen = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('ja-JP'));
  HT.esc = esc;
  HT.yen = yen;
  const KEYS = ['cost', 'interest', 'damages', 'principal'];
  const KANA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ';

  // 表に載せる行と合計を整える（画面・印刷・Excel で共通）
  HT.tableModel = function (result) {
    const meta = result.meta || {};
    const isPay = result.type === '弁済金交付計算書';
    const rows = result.rows.filter((r) => r.type !== 'excluded').map((r) => {
      const isClaim = r.type === 'claim';
      const blank = [null, null, null, null];
      return {
        kind: r.type,
        rank: r.rank == null ? '' : String(r.rank),
        payee: r.payee || '',
        label: r.label || '',
        caseNo: r.caseNo || '',
        // 手続費用・供託費用は最下段（元金の位置）に置く（書籍の配当表例と同じ）
        claim: isClaim ? KEYS.map((k) => r[k]) : r.type === 'cost' ? [null, null, null, r.total] : blank,
        total: r.type === 'debtor' ? null : r.total,
        paid: r.paid,
        applied: isClaim ? (r.applied ? KEYS.map((k) => r.applied[k]) : blank) : r.type === 'cost' ? [null, null, null, r.paid] : blank,
        after: isClaim ? (r.after ? KEYS.map((k) => r.after[k]) : blank) : r.type === 'cost' ? [null, null, null, 0] : blank,
        note: [r.note, r.held && isClaim && !/支払留保/.test(r.note || '') ? '支払留保' : ''].filter(Boolean).join('、'),
      };
    });
    const sumOf = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
    return {
      title: isPay ? '弁済金交付計算書' : (meta.title || '配当表'),
      date: HT.wareki(meta.date),
      court: meta.court || '',
      signerTitle: isPay ? '裁判官' : '裁判所書記官',
      signer: isPay ? (meta.judge || '') : (meta.clerk || ''),
      debtor: meta.debtor || '',
      debtorLabel: meta.debtorLabel || '債　務　者',
      caseNos: String(meta.caseNos || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      sale: result.fund.sale || 0,
      deposit: result.fund.deposit,
      interest: result.fund.interest,
      fundTotal: result.fund.total,
      rows,
      claimTotal: sumOf('total'),
      paidTotal: sumOf('paid'),
      status: HT.statusModel(result),
    };
  };

  // 配当加入等の状況表（債権者によって配当加入の状況が異なるときだけ作る。同書202頁以下）
  HT.statusModel = function (result) {
    const parts = (result.regions || []).filter((g) => g.amount > 0 || g.members.length);
    if (parts.length < 2) return null;
    const sig = (g) => g.sig || g.members.slice().sort().join(','); // sig は統合前の参加者（仮差押えの額を超える部分の加入も区別する）
    if (parts.every((g) => sig(g) === sig(parts[0]))) return null;
    const claims = result.rows.filter((r) => r.type === 'claim');
    const depCount = new Set(parts.map((g) => g.depositIndex)).size;
    const cols = parts.map((g, i) => {
      let what = g.deposit === 'sale' ? '売得金' : (g.what || '');
      if (g.wage) what = `${depCount > 1 ? `供託${g.depositIndex + 1}の` : ''}${yen(g.lower)}円を超え${yen(g.upper)}円までの部分`;
      let deps = g.wage || g.deposit === 'sale' ? [] : (g.deposits || []);
      // 第三債務者が入力されていれば、第三債務者単位で供託金・供託利息をまとめる（書籍220頁以下）
      if (deps.length && deps.every((d) => d.thirdParty)) {
        const by = new Map();
        for (const d of deps) {
          const a = by.get(d.thirdParty) || { thirdParty: d.thirdParty, date: d.date, dateTo: d.date, amount: 0, interest: 0, count: 0, caseNo: '', depositNo: '', office: d.office };
          a.amount += d.amount; a.interest += d.interest; a.count++;
          if (d.date < a.date) a.date = d.date;
          if (d.date > a.dateTo) a.dateTo = d.date;
          if (a.count === 1) { a.caseNo = d.caseNo; a.depositNo = d.depositNo; } else { a.caseNo = ''; a.depositNo = `${a.count}件`; }
          by.set(d.thirdParty, a);
        }
        deps = [...by.values()];
      }
      return { mark: `${KANA[i] || String(i + 1)}部分`, what, deps, span: Math.max(1, deps.length), gross: g.gross, cost: g.cost, interest: g.interest, amount: g.amount, rest: g.rest, g };
    });
    const lines = claims.map((r) => ({
      payee: r.payee, label: r.label, rank: r.rank,
      cells: cols.map((c) => (c.g.members.includes(r.id) ? { claim: c.g.before[r.id], paid: c.g.got[r.id] || 0 } : null)),
      total: cols.reduce((s, c) => s + ((c.g.got || {})[r.id] || 0), 0),
    }));
    return { cols, lines };
  };

  const stack = (arr) => `<td class="ht-n ht-stack">${arr.map((v) => `<div>${v == null ? '&nbsp;' : yen(v)}</div>`).join('')}</td>`;

  HT.renderTableHTML = function (result) {
    const m = HT.tableModel(result);
    const titleChars = m.title.split('').map(esc).join('　');
    let html = `${result.provisional ? `<p class="ht-prov">${esc(result.caption || '（参考計算）')}</p>` : ''}${result.agreed ? '' : ''}
<table class="ht-sheet">
  <colgroup><col class="c-rank"><col class="c-payee"><col class="c-amt"><col class="c-amt"><col class="c-amt"><col class="c-amt"><col class="c-amt"><col class="c-note"></colgroup>
  <thead>
    <tr>
      <td colspan="2" rowspan="5" class="ht-left">
        <div>${esc(m.date)}</div>
        <div>${esc(m.court)}</div>
        <div class="ht-signer">${esc(m.signerTitle)}　${esc(m.signer)}</div>
      </td>
      <td colspan="3" rowspan="2" class="ht-title">${titleChars}</td>
      <td class="ht-flabel">売得金（円）</td><td colspan="2" class="ht-fval">${yen(m.sale)}</td>
    </tr>
    <tr><td class="ht-flabel">供託金（円）</td><td colspan="2" class="ht-fval">${yen(m.deposit)}</td></tr>
    <tr>
      <td colspan="3" rowspan="3" class="ht-cases">${m.caseNos.map((c) => `<div>${esc(c)}</div>`).join('')}</td>
      <td class="ht-flabel">供託利息（円）</td><td colspan="2" class="ht-fval">${yen(m.interest)}</td>
    </tr>
    <tr><td class="ht-flabel">合計（円）</td><td colspan="2" class="ht-fval">${yen(m.fundTotal)}</td></tr>
    <tr><td class="ht-flabel">${esc(m.debtorLabel)}</td><td colspan="2" class="ht-debtor">${esc(m.debtor)}</td></tr>
    <tr class="ht-colhead">
      <th class="ht-c">順位</th>
      <th><div class="ht-uline">債権者</div><div>債権の種類</div></th>
      <th class="ht-stack"><div>費用（円）</div><div>利息（円）</div><div>損害金（円）</div><div>元金（円）</div></th>
      <th class="ht-bottom">合計（円）</th>
      <th class="ht-bottom">配当実施額（円）</th>
      <th class="ht-stack"><div>費用充当額（円）</div><div>利息充当額（円）</div><div>損害金充当額（円）</div><div>元金充当額（円）</div></th>
      <th class="ht-stack"><div>充当後費用（円）</div><div>充当後利息（円）</div><div>充当後損害金（円）</div><div>充当後元金（円）</div></th>
      <th class="ht-c ht-bottom">備考</th>
    </tr>
  </thead>
  <tbody>
    ${m.rows.map((r) => `
    <tr class="ht-rec">
      <td class="ht-c">${esc(r.rank)}</td>
      <td class="ht-who"><div class="ht-uline">${esc(r.payee)}</div><div>${esc(r.label)}</div><div>${esc(r.caseNo)}</div></td>
      ${stack(r.claim)}
      <td class="ht-n ht-bottom">${yen(r.total)}</td>
      <td class="ht-n ht-bottom">${yen(r.paid)}</td>
      ${stack(r.applied)}
      ${stack(r.after)}
      <td class="ht-note">${esc(r.note)}</td>
    </tr>`).join('')}
    <tr class="ht-total">
      <td></td><td class="ht-c">合　　　計</td><td></td>
      <td class="ht-n">${yen(m.claimTotal)}</td><td class="ht-n">${yen(m.paidTotal)}</td><td></td><td></td><td></td>
    </tr>
  </tbody>
</table>`;
    if (m.status) html += HT.renderStatusHTML(m);
    for (const cs of result.costStatements || []) html += HT.renderCostStatementHTML(result, cs);
    return html;
  };

  // 手続費用計算書（立替者ごと）。書式は園部厚「書式 債権・その他財産権・動産等執行の実務〔全訂15版〕」447頁（民事法研究会）の書式2-72による
  HT.COST_STATEMENT_MIN_ROWS = 20;
  HT.costStatementCase = (meta) => {
    const cases = String((meta || {}).caseNos || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    return cases.length ? `${cases[0]}${cases.length > 1 ? `　外${cases.length - 1}件` : ''}` : '';
  };
  HT.renderCostStatementHTML = function (result, cs) {
    const rows = cs.items.slice();
    while (rows.length < HT.COST_STATEMENT_MIN_ROWS) rows.push(null);
    return `
<div class="ht-cost">
<div class="ht-cost-head"><h3 class="ht-cost-title">手続費用計算書</h3>
  <div class="ht-cost-meta"><div>配当事件番号：${esc(HT.costStatementCase(result.meta))}</div><div>債　権　者：${esc(cs.payee)}</div></div></div>
<table class="ht-sheet ht-cs">
  <colgroup><col class="cs-no"><col class="cs-item"><col class="cs-amt"><col class="cs-note"></colgroup>
  <tbody>
    <tr class="ht-cshead"><th class="ht-c">番号</th><th class="ht-c">項　　　　目</th><th class="ht-c">金　額（円）</th><th class="ht-c">備　　　　考</th></tr>
    ${rows.map((it, i) => `<tr class="ht-csrow"><td class="ht-c">${it ? i + 1 : ''}</td><td>${it ? esc(it.label) : ''}</td><td class="ht-n">${it ? yen(it.amount) : ''}</td><td>${it ? esc(it.note) : ''}</td></tr>`).join('')}
    <tr class="ht-cstotal"><td></td><td class="ht-c">合　　　　計</td><td class="ht-n">${yen(cs.total)}</td><td></td></tr>
  </tbody>
</table>
</div>`;
  };

  // 状況表の見出しに並べる供託の情報（書籍の配当加入等の状況表と同じ項目）
  HT.STATUS_DEP_ROWS = [
    ['第三債務者', (d) => d.thirdParty],
    ['供託日', (d) => (d.dateTo && d.dateTo !== d.date ? `${HT.wareki(d.date)}〜${HT.wareki(d.dateTo)}` : HT.wareki(d.date))],
    ['事件番号', (d) => d.caseNo],
    ['供託番号', (d) => d.depositNo],
    ['供託金額（円）', (d) => yen(d.amount)],
    ['供託利息（円）', (d) => yen(d.interest)],
    ['供託所', (d) => d.office],
  ];

  HT.renderStatusHTML = function (m) {
    const s = m.status;
    const anyDep = s.cols.some((c) => c.deps.length);
    const depRows = anyDep ? HT.STATUS_DEP_ROWS.filter(([, f]) => s.cols.some((c) => c.deps.some((d) => f(d)))) : [];
    const cell = (c, fn) => (c.deps.length ? c.deps.map((d) => `<td class="ht-c ht-small">${esc(fn(d))}</td>`).join('') : `<td class="ht-small"></td>`);
    return `
<div class="ht-status">
<h3 class="ht-status-title">配当加入等の状況表</h3>
<table class="ht-sheet ht-st">
  <tbody>
    <tr class="ht-sthead"><th colspan="2"></th>${s.cols.map((c) => `<th colspan="${c.span}" class="ht-c">${esc(c.mark)}${c.what ? `<div class="ht-small">${esc(c.what)}</div>` : ''}</th>`).join('')}<th rowspan="${2 + depRows.length}" class="ht-c">合計（円）</th></tr>
    ${depRows.map(([label, fn]) => `<tr class="ht-sthead"><th colspan="2" class="ht-small">${esc(label)}</th>${s.cols.map((c) => cell(c, fn)).join('')}</tr>`).join('')}
    <tr class="ht-sthead"><th colspan="2" class="ht-small">配当原資（円）</th>${s.cols.map((c) => `<td colspan="${c.span}" class="ht-r ht-small">${c.cost || c.interest ? `${yen(c.gross)}${c.interest ? `<br>＋利息${yen(c.interest)}` : ''}${c.cost ? `<br>−費用${yen(c.cost)}` : ''}<br>＝` : ''}${yen(c.amount)}</td>`).join('')}</tr>
    ${s.lines.map((l) => `
    <tr class="ht-stline"><td rowspan="2">${esc(l.payee)}<div class="ht-small">${esc(l.label)}</div></td><td class="ht-small ht-c">請求債権</td>${l.cells.map((c, i) => `<td colspan="${s.cols[i].span}" class="${c ? 'ht-n' : 'ht-c'}">${c ? yen(c.claim) : '×'}</td>`).join('')}<td></td></tr>
    <tr class="ht-stline2"><td class="ht-small ht-c">配当額</td>${l.cells.map((c, i) => `<td colspan="${s.cols[i].span}" class="${c ? 'ht-n' : 'ht-c'}">${c ? yen(c.paid) : '×'}</td>`).join('')}<td class="ht-n">${yen(l.total)}</td></tr>`).join('')}
    <tr><td colspan="2">剰余（債務者）</td>${s.cols.map((c) => `<td colspan="${c.span}" class="ht-n">${yen(c.rest)}</td>`).join('')}<td class="ht-n">${yen(s.cols.reduce((a, c) => a + c.rest, 0))}</td></tr>
  </tbody>
</table>
<p class="ht-small">×は、その部分に配当加入していないことを示す。請求債権は、その部分の配当を受ける前の残額（按分の基礎）である。</p>
</div>`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
