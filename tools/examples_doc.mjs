// 設例の計算過程の解説（docs/設例の計算過程.md）を作る。
//   node tools/examples_doc.mjs            … 書き出す
//   node tools/examples_doc.mjs --check    … 書き出した内容が最新か、解説の算式が合っているかを確かめる（書き出さない）
// 入力の要点・部分ごとの配分・結果の表は、設例（site/js/app/examples.js）をエンジンで計算して作る。
// 計算の過程の文章は tools/examples_notes.mjs に書く（算式「a × b ÷ c ＝ d」等はここで検算する）。
import fs from 'node:fs';
import path from 'node:path';
import { loadHT, root } from '../tests/load.mjs';
import { NOTES, INTRO } from './examples_notes.mjs';

const HT = loadHT([path.join(root, 'site/js/app/examples.js')]);
const OUT = path.join(root, 'docs/設例の計算過程.md');

const yen = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('ja-JP'));
const wareki = (s) => {
  if (!s) return '';
  const [d, t] = String(s).split('T');
  return HT.wareki(d) + (t ? ` ${t.slice(0, 5)}` : '');
};
const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|');
const RONTEN_SECTIONS = { 1: '第1 手続の分岐と配当加入', 2: '第2 仮差押えを原因とする供託', 3: '第3 配当原資と区画', 4: '第4 順位', 5: '第5 扶養義務等債権', 6: '第6 仮差押えと本執行への移行', 7: '第7 債権額・充当・端数・配当表の記載', 8: '第8 継続的給付と回次の繰越', 9: '第9 特殊な場面' };
// GitHub の見出しのアンカー（記号を除き、空白を - にする）
const slug = (h) => h.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');
const rontenLink = (r) => `[${r}](論点整理.md#${slug(RONTEN_SECTIONS[r.split('-')[0]] || '')})`;

const kindLabel = (c) => {
  if (c.kind === 'SEC') return c.maxAmount ? '根抵当権（物上代位）' : HT.SEC_TYPE_LABEL[c.secType || 'MTG'];
  if (c.kind === 'GPP') return `一般先取特権（${HT.GPP_CLASS_LABEL[c.gppClass || 2]}）`;
  if (c.kind === 'SUP3') return '扶養義務等債権（子の監護費用の先取特権の部分）';
  if (c.kind === 'SUP2') return c.group ? '扶養義務等債権（先取特権の部分以外）' : '扶養義務等債権';
  if (c.kind === 'TAX') return c.taxSeizure ? '租税（滞納処分の差押え）' : '租税（交付要求）';
  return HT.KIND_LABEL[c.kind] || c.kind;
};
const claimTotal = (c) => ['cost', 'interest', 'damages', 'principal'].reduce((s, k) => s + HT.int(c[k]), 0);
const claimFacts = (c, byId) => {
  const f = [];
  if (c.kind === 'SEC' && c.perfectedOn) f.push(`登記 ${wareki(c.perfectedOn)}`);
  if (c.maxAmount) f.push(`極度額 ${yen(c.maxAmount)}`);
  if (c.beyond2y) f.push(`最後の2年分を超える利息・損害金 ${yen(c.beyond2y)}`);
  if (c.legalDue) f.push(`法定納期限等 ${wareki(c.legalDue)}`);
  if (c.demandAt) f.push(`${c.taxSeizure ? '滞納処分の差押え' : '交付要求の受理'} ${wareki(c.demandAt)}`);
  if (c.releaseAmount) f.push(`仮差押解放金 ${yen(c.releaseAmount)}`);
  if (c.fromPrv) f.push(`${byId[c.fromPrv] ? `仮差押え（${byId[c.fromPrv].creditor}の${yen(claimTotal(byId[c.fromPrv]))}円）` : '仮差押え'}から本執行に移行`);
  if (c.transferServedAt) f.push(`転付命令の送達 ${wareki(c.transferServedAt)}`);
  if (c.stayed) f.push('執行停止');
  if (c.depositIds) f.push(`加わる供託金 ${c.depositIds.map((id) => byId._dep[id]).join('・')}`);
  if (c.calcs && c.calcs.length) c.calcs.forEach((k) => f.push(`${k.target === 'damages' ? '損害金' : '利息'}を${wareki(k.from)}から配当期日まで年${k.rate}%で日割計算（元本 ${yen(k.base)}）`));
  if (c.note) f.push(c.note);
  return f.join('、');
};
const depFacts = (d, fund) => {
  const f = [];
  if (HT.isWageDeposit(d, fund)) f.push(`給料等（手取額 ${yen(d.net)}）`);
  else if (fund.kind === 'mixed') f.push('預金・売掛金など');
  if (d.thirdParty) f.push(`第三債務者 ${d.thirdParty}`);
  if (d.capT) f.push(`国税徴収法76条の差押可能額 ${yen(d.capT)}`);
  if (d.preservation) f.push(`仮差押えのみを原因とする供託${d.releaseAmount ? `（仮差押解放金 ${yen(d.releaseAmount)}）` : ''}、還付請求権への最初の差押命令の送達 ${wareki(d.convertedAt)}`);
  if (d.releaseByDebtor) f.push('債務者が供託した仮差押解放金');
  if (d.mixed) f.push('混合供託（還付請求権の帰属の証明前）');
  if (d.residual) f.push(`滞納処分庁からの残余金（${d.residualVia === 'deposit' ? `第三債務者の供託を経た。供託 ${wareki(d.depositedAt)}、` : '第三債務者の供託を経ない。'}執行裁判所が交付を受けた時 ${wareki(d.deliveredAt)}）`);
  if (d.stayed) f.push(`執行停止中の供託（停止が解けた時 ${wareki(d.stayLiftedAt)}）`);
  if (d.at) f.push(`供託の日時 ${wareki(d.at)}`);
  return f.join('、');
};

// 算式の検算：「1,000 × 2 ÷ 3 ＝ 666.66…」「a − b ＝ c」「a ＋ b ＝ c」
function checkFormulas(id, text) {
  const errs = [];
  const num = '\\d[\\d,]*(?:\\.\\d+)?';
  const re = new RegExp(`(${num}(?:\\s*[×÷＋−]\\s*${num})+)\\s*＝\\s*(${num})(…)?`, 'g');
  for (const m of text.matchAll(re)) {
    const expr = m[1].replace(/,/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/＋/g, '+').replace(/−/g, '-');
    // 乗除を先に計算する（掛けてから割る）
    const v = Function(`return (${expr});`)();
    const want = Number(m[2].replace(/,/g, ''));
    const ok = m[3] ? Math.floor(v * 100) / 100 === want && !Number.isInteger(v) : Math.abs(v - want) < 1e-9;
    if (!ok) errs.push(`${id}: ${m[0]}（計算すると ${v}）`);
  }
  return errs;
}

function exampleSection(e, no) {
  const input = JSON.parse(JSON.stringify(e.input));
  const r = HT.distribute(input);
  const i = e.input;
  const fund = Object.assign({ kind: 'general', deposits: [] }, i.fund);
  const byId = Object.fromEntries((i.claims || []).map((c) => [c.id, c]));
  byId._dep = Object.fromEntries((fund.deposits || []).map((d, k) => [d.id, `${k + 1}${d.thirdParty ? `（${d.thirdParty}）` : ''}`]));
  // 同じ債権者・同じ債権の種類の行が複数あるときは (1)(2) を付けて区別する
  const disp = {};
  const keyOf = (c) => `${c.creditor}\u0000${c.label || ''}`;
  (i.claims || []).forEach((c) => { const same = i.claims.filter((x) => keyOf(x) === keyOf(c)); disp[c.id] = same.length > 1 ? `${c.creditor}(${same.indexOf(c) + 1})` : c.creditor; });
  const name = (id) => disp[id] || (byId[id] ? byId[id].creditor : id);
  const L = [];
  L.push(`### ${no} ${e.title}`, '');
  L.push(`${e.desc}`, '');
  if (e.source) L.push(`出典：${e.source}`, '');
  L.push(`関係する論点：${e.ronten.map(rontenLink).join('・')}　設例の番号：\`${e.id}\``, '');

  // 入力の要点
  L.push('**入力の要点**', '');
  const m = i.meta || {};
  const lines = [`- 配当期日：${wareki(m.date)}`, `- 債務者：${m.debtor || '債務者'}${m.debtorLabel ? `（${m.debtorLabel}）` : ''}`];
  if (fund.cutoffAt) lines.push(`- 配当要求の終期：${wareki(fund.cutoffAt)}`);
  if (fund.saleProceeds) lines.push(`- 売得金：${yen(fund.saleProceeds)}（執行官が交付を受けた時 ${wareki(fund.saleAt)}）`);
  (i.procedureCosts || []).forEach((c) => lines.push(`- 手続費用：${yen(c.amount)}（予納者 ${c.payee}）`));
  if (i.agreement && i.agreement.enabled) lines.push(`- 合意：${Object.entries(i.agreement.amounts).map(([k, v]) => `${name(k)} ${yen(v)}`).join('、')}`);
  const st = Object.entries(i.settings || {}).filter(([k, v]) => HT.DEFAULT_SETTINGS[k] !== v || k === 'stayedDeposit');
  if (st.length) lines.push(`- 設定：${st.map(([k, v]) => (k === 'stayedDeposit' ? (v === 'cutoff' ? '執行停止中の供託に配当加入遮断効を認める（初期値）' : '執行停止中の供託に配当加入遮断効を認めない') : `${k}=${v}`)).join('、')}`);
  L.push(...lines, '');
  if ((fund.deposits || []).length) {
    L.push('| 供託金 | 供託日 | 供託金額 | 供託利息 | 内容 |', '| --- | --- | ---: | ---: | --- |');
    fund.deposits.forEach((d, k) => L.push(`| ${k + 1} | ${wareki(d.date)} | ${yen(d.amount)} | ${d.interest != null && d.interest !== '' ? yen(d.interest) : '（計算）'} | ${esc(depFacts(d, fund))} |`));
    L.push('');
  }
  L.push('| 債権者 | 種別 | 債権の種類 | 差押え等の効力発生・申立て | 請求債権 | その他 |', '| --- | --- | --- | --- | ---: | --- |');
  (i.claims || []).forEach((c) => {
    const parts = [['費用', c.cost], ['利息', c.interest], ['損害金', c.damages], ['元金', c.principal]].filter(([, v]) => HT.int(v));
    const amt = parts.length > 1 ? `${yen(claimTotal(c))}（${parts.map(([k, v]) => `${k} ${yen(v)}`).join('、')}）` : yen(claimTotal(c));
    const when = [c.effectiveOn ? wareki(c.effectiveOn) : '', c.filedOn ? `申立て ${wareki(c.filedOn)}` : ''].filter(Boolean).join('、') || '―';
    L.push(`| ${esc(name(c.id))} | ${esc(kindLabel(c))} | ${esc(c.label || '')} | ${when} | ${amt} | ${esc(claimFacts(c, byId))} |`);
  });
  L.push('');

  // 計算の過程
  L.push('**計算の過程**', '');
  L.push(NOTES[e.id].trim(), '');

  // 部分ごとの配分
  if (r.regions.length) {
    L.push('**部分ごとの配分**（按分の基礎は、その部分を配る前の各債権の残額）', '');
    L.push('| 部分 | 範囲 | 配る額 | 配当に加わる債権者（按分の基礎） | 配当額 | 残り |', '| --- | --- | ---: | --- | --- | ---: |');
    r.regions.forEach((g) => {
      const which = g.deposit === 'sale' ? '売得金' : (g.deposits || []).map((x) => `供託金${x.index + 1}${x.part ? `の${x.part}` : ''}`).join('・');
      const range = g.wage && !g.what ? `${yen(g.lower)}〜${yen(g.upper)}` : '全額';
      const calc = [yen(g.gross), g.interest ? `＋ 利息 ${yen(g.interest)}` : '', g.cost ? `− 費用 ${yen(g.cost)}` : ''].filter(Boolean).join(' ');
      const amount = g.interest || g.cost ? `${calc} ＝ ${yen(g.amount)}` : yen(g.amount);
      const members = Object.keys(g.before).map((id) => `${name(id)}（${yen(g.before[id])}）`).join('、');
      const got = Object.keys(g.before).map((id) => `${name(id)} ${yen(g.got[id] || 0)}`).join('、');
      L.push(`| ${esc(which)} | ${range} | ${amount} | ${esc(members)} | ${esc(got)} | ${yen(g.rest)} |`);
    });
    L.push('');
  }

  // 結果
  L.push(`**結果**：${r.type}${r.caption ? r.caption : ''}`, '');
  L.push('| 順位 | 債権者 | 債権の種類 | 債権額 | 配当額 | 充当（費用・利息・損害金・元金） | 備考 |', '| --- | --- | --- | ---: | ---: | --- | --- |');
  r.rows.forEach((x) => {
    const ap = x.applied ? ['cost', 'interest', 'damages', 'principal'].map((k) => yen(x.applied[k] || 0)).join('・') : '';
    const note = [x.note, x.held && !/支払留保/.test(x.note || '') ? `支払留保 ${yen(x.held)}` : '', x.type === 'excluded' ? '除外' : ''].filter(Boolean).join('、');
    const total = x.type === 'debtor' ? '' : yen(x.total);
    L.push(`| ${x.rank == null ? '' : x.rank} | ${esc(x.type === 'claim' || x.type === 'excluded' ? name(x.id) : x.payee)} | ${esc(x.label)} | ${total} | ${x.type === 'excluded' ? '―' : yen(x.paid)} | ${ap} | ${esc(note)} |`);
  });
  L.push(`|  | 合計 |  |  | ${yen(r.rows.filter((x) => x.type !== 'excluded').reduce((s, x) => s + x.paid, 0))} |  |  |`, '');
  if (r.warnings.length) {
    L.push(...r.warnings.map((w) => `> アプリの表示：${w}`), '');
  }
  return { text: L.join('\n'), r };
}

function build() {
  const list = HT.EXAMPLES;
  const errs = [];
  for (const e of list) if (!NOTES[e.id]) errs.push(`${e.id}: 計算の過程の解説がありません`);
  for (const id of Object.keys(NOTES)) if (!list.some((e) => e.id === id)) errs.push(`${id}: 設例がありません（解説だけある）`);
  for (const [id, t] of Object.entries(NOTES)) errs.push(...checkFormulas(id, t));
  errs.push(...checkFormulas('INTRO', INTRO));
  const out = [];
  out.push('<!-- このファイルは tools/examples_doc.mjs で作る。直接編集しない（解説の文章は tools/examples_notes.mjs）。 -->', '');
  out.push('# 設例の計算過程', '');
  out.push(INTRO.trim(), '');
  const groups = [...new Set(list.map((e) => e.group))];
  out.push('**目次**', '');
  let no = 0;
  const numbered = list.map((e) => ({ e, no: ++no }));
  for (const g of groups) {
    out.push(`- [${g}](#${slug(g)})`);
    numbered.filter((x) => x.e.group === g).forEach((x) => out.push(`  - [${x.no} ${x.e.title}](#${slug(`${x.no} ${x.e.title}`)})`));
  }
  out.push('');
  for (const g of groups) {
    out.push(`## ${g}`, '');
    for (const x of numbered.filter((y) => y.e.group === g)) {
      const { text, r } = exampleSection(x.e, x.no);
      // 設例の期待値と一致しているか（していなければ書き出さない）
      const exp = x.e.expect;
      for (const [id, v] of Object.entries(exp.paid)) if (r.paid[id] !== v) errs.push(`${x.e.id}: ${id} の配当額が期待値と違う（${r.paid[id]}／${v}）`);
      if (r.type !== exp.type) errs.push(`${x.e.id}: 書面の種類が期待値と違う`);
      out.push(text, '');
    }
  }
  return { md: out.join('\n').replace(/\n{3,}/g, '\n\n'), errs };
}

const { md, errs } = build();
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== md) { console.error('docs/設例の計算過程.md が最新ではありません。node tools/examples_doc.mjs で作り直してください。'); process.exit(1); }
  console.log('設例の計算過程：最新');
} else {
  fs.writeFileSync(OUT, md);
  console.log(`書き出しました：${path.relative(root, OUT)}（${HT.EXAMPLES.length}件）`);
}
