// 計算エンジンのテスト（設計書の設例をそのまま期待値にする）
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadHT, root } from './load.mjs';

const HT = loadHT();
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ', name); }
  catch (e) { fail++; console.log('  NG  ', name); console.log(e.message); }
}
const paidBy = (r) => Object.fromEntries(r.rows.filter((x) => x.type === 'claim').map((x) => [x.id, x.paid]));
const surplus = (r) => (r.rows.find((x) => x.type === 'debtor') || { paid: 0 }).paid;

console.log('engine');

t('区画の計算（民執法152条）', () => {
  assert.deepEqual({ ...HT.wageCaps(300000) }, { Q: 75000, H: 150000 });
  assert.deepEqual({ ...HT.wageCaps(200000) }, { Q: 50000, H: 100000 });
  assert.deepEqual({ ...HT.wageCaps(600000) }, { Q: 270000, H: 300000 });
  assert.deepEqual({ ...HT.wageCaps(800000) }, { Q: 470000, H: 470000 });
});

t('国税徴収法76条（令和8年4月以降）', () => {
  // 給料30万円・所得税等なし・単身：4号107,000、5号=(300,000-107,000)*0.2=38,600→39,000
  assert.equal(HT.taxSeizable({ gross: 300000, dependents: 0, payDate: '2026-05-25' }), 154000);
  // 改正前の額
  assert.equal(HT.taxSeizable({ gross: 300000, dependents: 0, payDate: '2026-03-25' }), 160000);
});

t('供託利息（受入月・払渡月を除く）', () => {
  // 100万円を1月に供託、同年12月に払渡し：2〜11月の10か月 × 0.024% / 12
  assert.equal(HT.depositInterest(1000000, '2026-01-10', '2026-12-05'), 200);
  assert.equal(HT.depositInterest(1000000, '2026-01-10', '2026-02-05'), 0);
});

t('扶養義務等債権の分解（先取特権の部分とそれ以外）', () => {
  const s = HT.splitSupport([{ due: '2026-04-30', amount: 100000, children: 1 }, { due: '2026-05-31', amount: 100000, children: 1 }], '2025-01-10', true);
  assert.deepEqual({ ...s }, { lien: 160000, other: 40000 });
  const pre = HT.splitSupport([{ due: '2026-03-31', amount: 60000, children: 1 }], '2025-01-10', true);
  assert.deepEqual({ ...pre }, { lien: 0, other: 60000 });
  const no = HT.splitSupport([{ due: '2026-05-31', amount: 60000, children: 1 }], '2025-01-10', false);
  assert.deepEqual({ ...no }, { lien: 0, other: 60000 });
});

t('設例1：一般債権のみ', () => {
  const r = HT.distribute({
    meta: { date: '2026-12-10' },
    fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-11-01', amount: 1000000, interest: 0 }] },
    procedureCosts: [{ payee: 'X', amount: 6000 }],
    claims: [
      { id: 'X', creditor: 'X', kind: 'GEN', filedOn: '2026-01-10', principal: 1240000 },
      { id: 'Y', creditor: 'Y', kind: 'GEN', filedOn: '2026-02-10', principal: 800000 },
      { id: 'Z', creditor: 'Z', kind: 'GEN', filedOn: '2026-03-10', principal: 360000 },
    ],
  });
  assert.deepEqual(paidBy(r), { X: 513567, Y: 331333, Z: 149100 });
  assert.equal(r.type, '配当表');
  assert.equal(r.rows[0].label, '手続費用');
  assert.equal(r.warnings.length, 0, r.warnings.join('\n'));
});

const wageCase = (net, w3, w2, x = 500000) => ({
  meta: { date: '2026-12-10' },
  fund: { kind: 'wage', deposits: [{ id: 'd1', date: '2026-11-30', amount: HT.wageCaps(net).H, interest: 0, net }] },
  claims: [
    ...(w3 ? [{ id: 'W3', creditor: 'W', kind: 'SUP3', group: 'W', filedOn: '2026-01-05', principal: w3 }] : []),
    ...(w2 ? [{ id: 'W2', creditor: 'W', kind: 'SUP2', group: 'W', filedOn: '2026-01-05', principal: w2 }] : []),
    { id: 'X', creditor: 'X', kind: 'GEN', filedOn: '2026-02-01', principal: x },
  ],
});

t('設例2-1：先取特権あり', () => {
  const r = HT.distribute(wageCase(300000, 120000, 0));
  assert.deepEqual(paidBy(r), { W3: 120000, X: 30000 });
});

t('設例2-2：先取特権なし', () => {
  const r = HT.distribute(wageCase(300000, 0, 120000));
  assert.deepEqual(paidBy(r), { W2: 81193, X: 68807 });
});

t('設例2-3：先取特権の部分とそれ以外が並ぶ', () => {
  const r = HT.distribute(wageCase(400000, 160000, 40000));
  assert.deepEqual(paidBy(r), { W3: 160000, W2: 2963, X: 37037 });
});

t('設例2-4：手取66万円超（区画Bなし）', () => {
  const r = HT.distribute(wageCase(800000, 160000, 40000));
  assert.deepEqual(paidBy(r), { W3: 160000, W2: 22963, X: 287037 });
});

t('設例2-5：非競合部分を先に配る', () => {
  // 手取20万円、扶養15万円、一般15万円 → 扶養7万円、一般3万円
  const r = HT.distribute(wageCase(200000, 0, 150000, 150000));
  assert.deepEqual(paidBy(r), { W2: 70000, X: 30000 });
});

t('設例2-6：競合しない（弁済金交付）', () => {
  // 手取20万円、扶養4万円、一般10万円 → 供託9万円、扶養4万円・一般5万円
  const c = wageCase(200000, 0, 40000, 100000);
  c.fund.deposits[0].amount = 90000;
  const r = HT.distribute(c);
  assert.deepEqual(paidBy(r), { W2: 40000, X: 50000 });
  assert.equal(r.type, '弁済金交付計算書'); // 競合が生じないので弁済金交付
});

const secCase = (legalDue, xServed) => ({
  meta: { date: '2026-12-10' },
  fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-11-01', amount: 2000000, interest: 0 }] },
  claims: [
    { id: 'M', creditor: 'M', kind: 'SEC', secType: 'MTG', perfectedOn: '2024-05-01', effectiveOn: '2026-03-01', filedOn: '2026-02-20', principal: 1500000 },
    { id: 'T', creditor: 'T', kind: 'TAX', legalDue, demandAt: '2026-04-01', filedOn: '2026-04-01', principal: 800000 },
    { id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: xServed, filedOn: '2026-01-10', principal: 1000000 },
  ],
});

t('設例3-1：抵当権＞租税＞一般', () => {
  assert.deepEqual(paidBy(HT.distribute(secCase('2025-03-31', '2025-06-01'))), { M: 1500000, T: 500000, X: 0 });
});

t('設例3-2：租税＞抵当権＞一般', () => {
  assert.deepEqual(paidBy(HT.distribute(secCase('2024-03-31', '2025-06-01'))), { T: 800000, M: 1200000, X: 0 });
});

t('吸収方式（D-7）：登記前に差し押さえた一般債権者には優先しない', () => {
  const r = HT.distribute({
    meta: { date: '2026-12-10' },
    fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-11-01', amount: 1000000, interest: 0 }] },
    claims: [
      { id: 'M', creditor: 'M', kind: 'SEC', secType: 'MTG', perfectedOn: '2024-05-01', effectiveOn: '2026-03-01', filedOn: '2026-02-20', principal: 600000 },
      { id: 'A', creditor: 'A', kind: 'GEN', effectiveOn: '2024-04-01', filedOn: '2024-03-20', principal: 400000 },
      { id: 'B', creditor: 'B', kind: 'GEN', effectiveOn: '2025-06-01', filedOn: '2025-05-20', principal: 1000000 },
    ],
  });
  assert.deepEqual(paidBy(r), { A: 200000, M: 600000, B: 200000 });
});

t('国税徴収法26条（D-5）：優劣が循環する場合', () => {
  // T1 国税：法定納期限等が登記前（M に優先）、交付要求は遅い
  // T2 地方税：法定納期限等が登記後（M に劣後）、交付要求は早い（T1 に優先）
  const r = HT.distribute({
    meta: { date: '2026-12-10' },
    fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-11-01', amount: 1000000, interest: 0 }] },
    claims: [
      { id: 'M', creditor: 'M', kind: 'SEC', secType: 'MTG', perfectedOn: '2024-05-01', filedOn: '2026-01-01', principal: 500000 },
      { id: 'T1', creditor: '国', kind: 'TAX', legalDue: '2024-03-31', demandAt: '2026-06-01T10:00', principal: 300000 },
      { id: 'T2', creditor: '市', kind: 'TAX', legalDue: '2025-01-31', demandAt: '2026-05-01T10:00', principal: 400000 },
    ],
  });
  assert.deepEqual(paidBy(r), { T2: 400000, T1: 100000, M: 500000 });
  assert.equal(r.warnings.length, 0, r.warnings.join('\n'));
});

t('設例4：仮差押えは供託、終期後の配当要求は除外', () => {
  const r = HT.distribute({
    meta: { date: '2026-12-10' },
    fund: { kind: 'general', cutoffAt: '2026-11-01T10:00', deposits: [{ id: 'd1', date: '2026-11-01', amount: 600000, interest: 0 }] },
    claims: [
      { id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: '2026-05-01', filedOn: '2026-04-20', principal: 400000 },
      { id: 'P', creditor: 'P', kind: 'PRV', effectiveOn: '2026-06-01', filedOn: '2026-05-20', principal: 800000 },
      { id: 'Y', creditor: 'Y', kind: 'GEN', effectiveOn: '2026-11-02', filedOn: '2026-11-02', principal: 300000 },
    ],
  });
  assert.deepEqual(paidBy(r), { X: 200000, P: 400000 });
  assert.equal(r.rows.find((x) => x.id === 'P').held, 400000);
  assert.ok(r.rows.find((x) => x.id === 'Y' && x.type === 'excluded'));
});

t('設例5：一般先取特権の順位（雇用関係＞子の監護の費用）', () => {
  const r = HT.distribute({
    meta: { date: '2026-12-10' },
    fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-11-01', amount: 500000, interest: 0 }] },
    claims: [
      { id: 'E', creditor: 'E', kind: 'GPP', gppClass: 2, filedOn: '2026-03-01', principal: 300000 },
      { id: 'W3', creditor: 'W', kind: 'SUP3', group: 'W', filedOn: '2026-01-05', principal: 160000 },
      { id: 'W2', creditor: 'W', kind: 'SUP2', group: 'W', filedOn: '2026-01-05', principal: 40000 },
      { id: 'X', creditor: 'X', kind: 'GEN', filedOn: '2026-02-01', principal: 500000 },
    ],
  });
  assert.deepEqual(paidBy(r), { E: 300000, W3: 160000, W2: 2963, X: 37037 });
});

t('区画T（D-6）：滞納処分の差押えは国税徴収法76条の範囲まで、交付要求のみは区画Aまで', () => {
  const base = (taxSeizure) => ({
    meta: { date: '2026-12-10' },
    fund: { kind: 'wage', deposits: [{ id: 'd1', date: '2026-11-30', amount: 154000, interest: 0, net: 300000, capT: 154000 }] },
    claims: [
      { id: 'T', creditor: '市', kind: 'TAX', taxSeizure, demandAt: '2026-06-01', principal: 200000 },
      { id: 'W3', creditor: 'W', kind: 'SUP3', filedOn: '2026-01-05', principal: 120000 },
      { id: 'X', creditor: 'X', kind: 'GEN', filedOn: '2026-02-01', principal: 500000 },
    ],
  });
  // 滞納処分あり：150,000〜154,000 は租税のみ(4,000)、区画B(75,000)は租税が先（残196,000→75,000）、区画Aも租税が先（残121,000→75,000）
  assert.deepEqual(paidBy(HT.distribute(base(true))), { T: 154000, W3: 0, X: 0 });
  // 交付要求のみ：区画Bは先取特権の部分が取り、区画Aは租税が先
  const r = HT.distribute(base(false));
  assert.deepEqual(paidBy(r), { T: 75000, W3: 75000, X: 0 });
  assert.equal(surplus(r), 4000);
});

t('D-14：先取特権のない部分への配当で先取特権の被担保債権額が減る（法定充当）', () => {
  const r = HT.distribute(wageCase(300000, 160000, 40000));
  // 区画B 75,000 → 先取特権の部分、区画A：その残85,000 > 75,000 → 先取特権の部分
  assert.deepEqual(paidBy(r), { W3: 150000, W2: 0, X: 0 });
  assert.equal(r.next.W3.lienLeft, 10000);
  assert.equal(r.next.W2.otherLeft, 40000);
  // 不変説：1/4を超える部分の 75,000 はそれ以外の部分（40,000）から充て、残り 35,000 を先取特権の部分へ。
  // 1/4までの部分では先取特権の部分の残 125,000 が優先して 75,000 を取る。次回の先取特権の部分は 50,000
  const c = wageCase(300000, 160000, 40000);
  c.settings = { supportApplication: 'fixed' };
  const f = HT.distribute(c);
  assert.deepEqual(paidBy(f), { W3: 110000, W2: 40000, X: 0 });
  assert.equal(f.next.W3.principal, 50000);
  assert.equal(f.next.W2.principal, 0);
});

t('手続費用・供託利息と区画の割付け', () => {
  const c = wageCase(300000, 120000, 0);
  c.procedureCosts = [{ payee: 'W', amount: 3000 }];
  c.fund.deposits[0].interest = 100;
  const r = HT.distribute(c);
  const total = r.rows.reduce((s, x) => s + (x.type === 'excluded' ? 0 : x.paid), 0);
  assert.equal(total, 150100);
  assert.equal(r.warnings.length, 0, r.warnings.join('\n'));
});


// 近藤基「債権配当の実務と書式〔第3版〕」181～221頁（民事法研究会・2021年）の配当表例・弁済金交付計算書例を基に、計算の結果が変わらないよう金額・日付はそのままにし、名前を符号に置き換えたもの
t('書籍 参考例XV-1（配当表例1）：同順位の按分と充当', () => {
  const r = HT.distribute({
    meta: { date: '2026-11-19' },
    fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-01-01', amount: 376211, interest: 87 }] },
    procedureCosts: [{ payee: 'A', amount: 1871 }],
    claims: [
      { id: 'A', creditor: 'A', kind: 'GEN', filedOn: '2025-01-01', cost: 6660, interest: 0, damages: 10977, principal: 340000 },
      { id: 'B', creditor: 'B', kind: 'GEN', filedOn: '2025-02-01', cost: 3000, interest: 12785, damages: 58772, principal: 250000 },
      { id: 'C', creditor: 'C', kind: 'GEN', filedOn: '2025-03-01', cost: 0, interest: 0, damages: 0, principal: 455000 },
    ],
  });
  assert.deepEqual(paidBy(r), { A: 117754, B: 106862, C: 149811 });
  const a = r.rows.find((x) => x.id === 'A');
  assert.deepEqual({ ...a.applied }, { cost: 6660, interest: 0, damages: 10977, principal: 100117 });
  assert.equal(a.after.principal, 239883);
  assert.equal(r.rows.find((x) => x.id === 'B').after.principal, 217695);
  assert.equal(r.rows.find((x) => x.id === 'C').after.principal, 305189);
  assert.equal(r.fund.total, 376298);
});

t('書籍 参考例XV-3（弁済金交付計算書例1）：債権者1人', () => {
  const r = HT.distribute({
    meta: { date: '2026-11-19' },
    fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-01-01', amount: 508453, interest: 295 }] },
    procedureCosts: [{ payee: 'A', amount: 628 }],
    claims: [{ id: 'A', creditor: 'A', kind: 'GEN', cost: 7980, interest: 9857, damages: 103551, principal: 2000000 }],
  });
  assert.equal(r.type, '弁済金交付計算書');
  assert.deepEqual(paidBy(r), { A: 508120 });
  assert.equal(r.rows.find((x) => x.id === 'A').after.principal, 1613268);
});

t('書籍 参考例XV-5（弁済金交付計算書例3）：剰余金を債務者へ', () => {
  const r = HT.distribute({
    meta: { date: '2026-10-10', debtor: 'S' },
    fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-01-01', amount: 950000, interest: 326 }] },
    procedureCosts: [{ payee: 'A', amount: 628 }],
    claims: [{ id: 'A', creditor: 'A', kind: 'GEN', damages: 55038, principal: 725000 }],
  });
  assert.equal(r.type, '弁済金交付計算書');
  assert.deepEqual(paidBy(r), { A: 780038 });
  const d = r.rows.find((x) => x.type === 'debtor');
  assert.equal(d.paid, 169660);
  assert.equal(d.rank, 3);
});

t('書籍 参考例XV-2（配当表例2）：根抵当権は極度額まで、先順位が取り切る', () => {
  const r = HT.distribute({
    meta: { date: '2026-10-10' },
    fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-01-01', amount: 6400000, interest: 1920 }] },
    procedureCosts: [{ payee: 'A', amount: 1871 }],
    claims: [
      { id: 'A', creditor: 'A', kind: 'SEC', secType: 'MTG', perfectedOn: '2020-08-31', maxAmount: 600000000, damages: 560574605, principal: 5479038390 },
      { id: 'B', creditor: 'B', kind: 'SEC', secType: 'MTG', perfectedOn: '2020-10-14', damages: 632474144, principal: 2789636127 },
    ],
  });
  assert.deepEqual(paidBy(r), { A: 6400049, B: 0 });
  assert.equal(r.rows.find((x) => x.id === 'A').rank, 2);
  assert.equal(r.rows.find((x) => x.id === 'B').rank, 3);
});

t('書籍 参考例XVI-1：供託ごとに配当加入が異なる（仮差押えが途中から加入）', () => {
  const dep = (date, amount, interest) => ({ id: date, date, amount, interest });
  const r = HT.distribute({
    meta: { date: '2026-04-20' },
    fund: { kind: 'general', deposits: [dep('2025-11-25', 62341, 24), dep('2025-12-10', 358927, 105),
      dep('2025-12-25', 63481, 18), dep('2026-01-25', 62469, 12), dep('2026-02-25', 63734, 6), dep('2026-03-10', 189746, 0)] },
    procedureCosts: [{ payee: 'A', amount: 1850 }],
    claims: [
      { id: 'A', creditor: 'A', kind: 'GEN', effectiveOn: '2025-01-01', filedOn: '2025-01-01', principal: 239883 },
      { id: 'B', creditor: 'B', kind: 'GEN', effectiveOn: '2025-02-01', filedOn: '2025-02-01', principal: 217695 },
      { id: 'C', creditor: 'C', kind: 'GEN', effectiveOn: '2025-03-01', filedOn: '2025-03-01', principal: 305189 },
      { id: 'D', creditor: 'D', kind: 'GEN', effectiveOn: '2025-12-15T10:00', filedOn: '2025-12-01', principal: 250000, note: '債務名義提出' },
    ],
  });
  assert.deepEqual(paidBy(r), { A: 200989, B: 182399, C: 255707, D: 159918 });
  assert.equal(r.regions.length, 2); // ア部分（2回の供託）とイ部分（4回の供託）
  assert.deepEqual({ ...r.regions[0].got }, { A: 131944, B: 119739, C: 167864 });
  assert.deepEqual({ ...r.regions[1].got }, { A: 69045, B: 62660, C: 87843, D: 159918 });
  assert.equal(r.type, '配当表');
  assert.equal(r.rows.find((x) => x.id === 'D').rank, 2); // 同順位なら加入状況が違っても順位は付ける
});

t('書籍 参考例XVI-3：根抵当権者が途中から加入し、先順位として取り切る', () => {
  const dep = (date, interest) => ({ id: date, date, amount: 300000, interest });
  const r = HT.distribute({
    meta: { date: '2026-10-10' },
    fund: { kind: 'general', deposits: [dep('2026-03-31', 180), dep('2026-04-28', 150), dep('2026-05-31', 120), dep('2026-06-29', 90), dep('2026-07-31', 60), dep('2026-08-31', 30)] },
    procedureCosts: [{ payee: 'A', amount: 1770 }],
    claims: [
      { id: 'E', creditor: 'A', kind: 'SEC', secType: 'MTG', perfectedOn: '2020-08-03', maxAmount: 50000000, effectiveOn: '2026-03-01', principal: 47890000 },
      { id: 'S', creditor: 'B', kind: 'GEN', effectiveOn: '2026-03-15', cost: 7660, interest: 533468, damages: 4535896, principal: 35477864 },
      { id: 'T', creditor: 'C', kind: 'SEC', secType: 'MTG', perfectedOn: '2020-07-21', maxAmount: 150000000, effectiveOn: '2026-06-10', damages: 630501392, principal: 1798578921 },
    ],
  });
  assert.deepEqual(paidBy(r), { E: 898680, S: 0, T: 900180 });
});

t('手続費用は最初に配る部分（超過部分）から償還する', () => {
  const r = HT.distribute({ meta: { date: '2026-12-10' },
    fund: { kind: 'wage', deposits: [{ id: 'd', date: '2026-11-30', amount: 100000, interest: 0, net: 200000 }] },
    procedureCosts: [{ payee: 'W', amount: 1500 }],
    claims: [{ id: 'W', creditor: 'W', kind: 'SUP2', filedOn: '2026-01-01', principal: 60000 }, { id: 'X', creditor: 'X', kind: 'GEN', filedOn: '2026-02-01', principal: 300000 }] });
  assert.deepEqual(paidBy(r), { W: 50346, X: 48154 });
});

t('最後の2年分を超える利息・損害金は一般債権と同順位（民法375条）', () => {
  const r = HT.distribute({ meta: { date: '2026-12-10' },
    fund: { kind: 'general', deposits: [{ id: 'd', date: '2026-11-01', amount: 2000000, interest: 0 }] },
    claims: [
      { id: 'M', creditor: 'M', kind: 'SEC', secType: 'MTG', perfectedOn: '2020-01-10', effectiveOn: '2026-03-01', filedOn: '2026-02-20', damages: 1000000, principal: 1000000, beyond2y: 600000 },
      { id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: '2026-04-01', filedOn: '2026-03-20', principal: 1000000 },
    ] });
  assert.deepEqual(paidBy(r), { M: 1625000, X: 375000 });
  assert.match(r.rows.find((x) => x.id === 'M').note, /2年分/);
  assert.equal(r.rows.filter((x) => x.type === 'claim').length, 2);
});

const xv1 = (agreement) => ({
  meta: { date: '2026-11-19' }, agreement,
  fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-01-01', amount: 376211, interest: 87 }] },
  procedureCosts: [{ payee: 'A', amount: 1871 }],
  claims: [
    { id: 'A', creditor: 'A', kind: 'GEN', filedOn: '2025-01-01', cost: 6660, damages: 10977, principal: 340000 },
    { id: 'B', creditor: 'B', kind: 'GEN', filedOn: '2025-02-01', cost: 3000, interest: 12785, damages: 58772, principal: 250000 },
    { id: 'C', creditor: 'C', kind: 'GEN', filedOn: '2025-03-01', principal: 455000 },
  ],
});
t('合意配当：全債権者の合意どおりに配る', () => {
  const r = HT.distribute(xv1({ enabled: true, amounts: { A: 100000, B: 100000, C: 174427 } }));
  assert.equal(r.agreed, true);
  assert.deepEqual(paidBy(r), { A: 100000, B: 100000, C: 174427 });
  assert.equal(r.type, '配当表');
  assert.equal(r.warnings.length, 0, r.warnings.join('\n'));
});
t('合意配当：請求債権額を超える合意は採らない', () => {
  const r = HT.distribute(xv1({ enabled: true, amounts: { A: 400000, B: 0, C: 0 } }));
  assert.equal(r.agreed, false);
  assert.deepEqual(paidBy(r), { A: 117754, B: 106862, C: 149811 });
  assert.ok(r.warnings.some((w) => /合意配当にできません/.test(w)));
});
t('混合供託：還付請求権の帰属の証明前は参考計算として警告', () => {
  const c = xv1();
  c.fund.deposits[0].mixed = true;
  const r = HT.distribute(c);
  assert.equal(r.provisional, true);
  assert.ok(r.warnings.some((w) => /混合供託/.test(w)));
  c.fund.deposits[0].mixedResolved = true;
  assert.equal(HT.distribute(c).provisional, false);
});

// 参考例XVI-4：第三債務者が4社、抵当権の物上代位と租税の交付要求が絡む。
// 和暦の年が伏せられているので、書籍の結果（どの債権者が優先したか）と矛盾しない年を補っている。
export const XVI4 = {
  meta: { date: '2026-10-10', debtor: 'S', debtorLabel: '債務者兼所有者' },
  fund: { kind: 'general', deposits: [
    { id: 'shirakaba', date: '2026-04-30', amount: 2563080, interest: 882, thirdParty: '甲' },
    { id: 'sumire', date: '2026-05-31', amount: 1828482, interest: 630, thirdParty: '乙' },
    { id: 'seseragi', date: '2026-06-30', amount: 1508400, interest: 525, thirdParty: '丙' },
    { id: 'soyokaze', date: '2026-07-31', amount: 591300, interest: 190, thirdParty: '丁' },
  ] },
  procedureCosts: [{ payee: 'A', amount: 3020 }],
  claims: [
    { id: 'A1', creditor: 'A', kind: 'SEC', secType: 'MTG', perfectedOn: '2020-06-15', depositIds: ['shirakaba', 'seseragi'], filedOn: '2025-01-01', interest: 260685797, principal: 1900000000, label: '抵当権・物上代位' },
    { id: 'K', creditor: 'B', kind: 'SEC', secType: 'MTG', perfectedOn: '2021-01-10', depositIds: ['shirakaba', 'seseragi'], filedOn: '2025-02-01', damages: 46621413, principal: 55599121, label: '抵当権・物上代位' },
    { id: 'A2', creditor: 'A', kind: 'SEC', secType: 'MTG', perfectedOn: '2020-06-15', depositIds: ['sumire'], filedOn: '2025-03-01', interest: 260685797, principal: 1900000000, label: '抵当権・物上代位' },
    { id: 'AD', creditor: 'C', kind: 'SEC', secType: 'MTG', perfectedOn: '2021-02-06', depositIds: ['soyokaze'], filedOn: '2025-04-01', principal: 481292410, label: '抵当権・物上代位' },
    { id: 'B1', creditor: '○○県', kind: 'TAX', legalDue: '2020-05-25', demandAt: '2025-06-01T10:00', depositIds: ['seseragi'], damages: 10623748, principal: 34988100, label: '交付要求' },
    { id: 'T', creditor: '○○県', kind: 'TAX', legalDue: '2020-09-10', demandAt: '2025-06-01T11:00', depositIds: ['seseragi'], damages: 88844216, principal: 59523300, label: '交付要求' },
    { id: 'B2', creditor: '○○県', kind: 'TAX', legalDue: '2020-06-23', demandAt: '2025-06-02T10:00', depositIds: ['soyokaze'], damages: 10623748, principal: 34988100, label: '交付要求' },
  ],
};
t('書籍 参考例XVI-4：第三債務者が多数、抵当権と租税の優劣', () => {
  const r = HT.distribute(XVI4);
  assert.deepEqual(paidBy(r), { A1: 2560942, K: 0, A2: 1829112, AD: 0, B1: 1508925, T: 0, B2: 591490 });
  assert.equal(r.fund.total, 6493489);
  assert.equal(r.regions.length, 4);
  assert.equal(r.regions[2].before.A1, 2158124855); // 第三債務者丙の部分では、中央の部分の配当を差し引いた残り
  const b1 = r.rows.find((x) => x.id === 'B1');
  assert.deepEqual({ ...b1.applied }, { cost: 0, interest: 0, damages: 1508925, principal: 0 }); // 本税（損害金欄）から充当
  assert.equal(r.type, '配当表');
  assert.ok(r.rows.every((x) => x.rank == null)); // 加入状況・順位が部分ごとに違うので順位欄は空け、差押えの順に並べる
  assert.equal(r.rows.filter((x) => x.type === 'claim').map((x) => x.id).join(','), 'A1,K,A2,AD,B1,T,B2');
  assert.ok(r.rows.every((x) => x.rank == null)); // 加入状況・順位が部分ごとに違うので順位欄は空ける
});


t('利息・損害金の日割計算（年365日・うるう年）', () => {
  assert.equal(HT.calcInterest(1000000, '3', '2026-01-01', '2026-12-31').amount, 30000);
  assert.equal(HT.calcInterest(1000000, '3', '2026-01-01', '2026-12-31').days, 365);
  assert.equal(HT.calcInterest(1000000, '3', '2028-01-01', '2028-12-31', '365').amount, 30082); // うるう年も365日で割る
  assert.equal(HT.calcInterest(1000000, '3', '2028-01-01', '2028-12-31', 'actual').amount, 30000);
  assert.equal(HT.calcInterest(1000000, '3', '2027-12-01', '2028-01-31', 'actual').amount, 5088); // 年をまたぐ
  assert.equal(HT.calcInterest(500000, '14.6', '2026-03-01', '2026-03-31').amount, 6200);
  assert.equal(HT.calcInterest(500000, '14.6', '2026-04-01', '2026-03-31').amount, 0);
});

t('損害金の自動計算は配当期日まで、確定額に加える', () => {
  const r = HT.distribute({
    meta: { date: '2026-06-30' },
    fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-06-01', amount: 2000000, interest: 0 }] },
    claims: [{ id: 'X', creditor: 'X', kind: 'GEN', damages: 10000, principal: 1000000,
      calcs: [{ target: 'damages', base: 1000000, rate: '3', from: '2026-06-01' }] }],
  });
  const x = r.rows.find((y) => y.id === 'X');
  assert.equal(x.damages, 12465); // 10,000 + 1,000,000×3%×30/365（2,465）
  assert.equal(x.paid, 1012465);
  assert.equal(r.type, '弁済金交付計算書');
});

const ROUND1 = {
  meta: { date: '2026-12-10' },
  fund: { kind: 'wage', cutoffAt: '2026-11-30T10:00', deposits: [{ id: 'd1', date: '2026-11-30', amount: 100000, interest: 0, net: 200000, thirdParty: '丁商事' }] },
  procedureCosts: [{ payee: '甲野花子', amount: 1500 }],
  claims: [
    { id: 'S3', creditor: '甲野花子', kind: 'SUP3', group: 'g', filedOn: '2026-05-01', effectiveOn: '2026-05-10T00:00', principal: 80000 },
    { id: 'S2', creditor: '甲野花子', kind: 'SUP2', group: 'g', filedOn: '2026-05-01', effectiveOn: '2026-05-10T00:00', cost: 4000, principal: 20000 },
    { id: 'G', creditor: '丙川', kind: 'GEN', filedOn: '2026-07-01', effectiveOn: '2026-07-10T00:00', cost: 5000, damages: 12000, principal: 300000,
      calcs: [{ target: 'damages', base: 300000, rate: '3', from: '2026-11-01' }] },
  ],
};
t('回次の繰越：充当後の残額を次回の請求債権にする', () => {
  const r = HT.distribute(ROUND1);
  assert.equal(JSON.stringify(r.paid), JSON.stringify({ S3: 80000, S2: 1298, G: 17202 }));
  const { input, dropped, zeroed } = HT.carryForward(ROUND1, r);
  assert.equal(dropped.length, 0);
  assert.equal(zeroed.join(','), '甲野花子');            // 先取特権の部分は0円（それ以外への配当分も先取特権の部分から減る。D-14）。新しい期を加えるため行は残す
  const ids = input.claims.map((c) => c.id).join(',');
  assert.equal(ids, 'S3,S2,G');
  assert.equal(input.claims[0].principal, '0');
  const s2 = input.claims[1], g = input.claims[2];
  assert.equal(`${s2.cost}/${s2.principal}`, '2702/20000'); // 費用から充当
  assert.equal(`${g.cost}/${g.damages}/${g.principal}`, '0/784/300000'); // 損害金は配当期日までの計算額を含めて充当
  assert.equal(g.calcs[0].from, '2026-12-11');          // 次回は配当期日の翌日から計算
  assert.equal(input.meta.date, '');
  assert.equal(input.fund.deposits.length, 1);
  assert.equal(input.fund.deposits[0].thirdParty, '丁商事');
  assert.equal(input.history.length, 1);
  assert.equal(input.history[0].fund, 100000);
  // 1つのファイルに各回の入力を丸ごと残し、過去の配当表を再現できる
  assert.equal(JSON.stringify(HT.distribute(input.history[0].input).paid), JSON.stringify(r.paid));
  assert.equal(input.history[0].input.history, undefined);
  // 次回をそのまま計算できる
  input.meta.date = '2027-01-10';
  Object.assign(input.fund.deposits[0], { id: 'd2', date: '2026-12-31', amount: 100000, interest: 0, net: 200000 });
  const r2 = HT.distribute(input);
  assert.equal(r2.rows.find((y) => y.id === 'G').damages, 784 + 764); // 300,000×3%×31/365（12月11日〜1月10日）
  assert.equal(r2.fund.total, 100000);
});

t('回次の繰越：仮差押えの留保分も請求債権から差し引く', () => {
  const inp = {
    meta: { date: '2026-12-10' },
    fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-11-01', amount: 600000, interest: 0 }] },
    claims: [
      { id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: '2026-05-01', principal: 400000 },
      { id: 'P', creditor: 'P', kind: 'PRV', effectiveOn: '2026-06-01', principal: 800000 },
    ],
  };
  const { input } = HT.carryForward(inp, HT.distribute(inp));
  assert.equal(input.claims.map((c) => `${c.id}:${c.principal}`).join(','), 'X:200000,P:400000');
});

t('回次の繰越：完済した本差押えは、統合していた仮差押えとともに外す', () => {
  const inp = {
    meta: { date: '2026-12-10' },
    fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-05-20', amount: 400000, interest: 0 }] },
    claims: [
      { id: 'P', creditor: 'C', kind: 'PRV', effectiveOn: '2026-05-01', principal: 300000 },
      { id: 'C', creditor: 'C', kind: 'GEN', fromPrv: 'P', effectiveOn: '2026-06-01', principal: 300000 },
      { id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: '2026-06-15', principal: 500000 }, // 供託の後なので今回は加入しない
    ],
  };
  const r = HT.distribute(inp);
  assert.equal(JSON.stringify(r.paid), JSON.stringify({ C: 300000, X: 0 }));
  const { input, dropped } = HT.carryForward(inp, r);
  assert.equal(dropped.join(','), 'C');
  assert.equal(input.claims.map((c) => `${c.id}:${c.principal}`).join(','), 'X:500000');
});

t('仮差押えから本執行への移行：仮差押えの額の範囲は仮差押えの時から加入', () => {
  const r = HT.distribute({
    meta: { date: '2026-12-10' },
    fund: { kind: 'general', cutoffAt: '2026-06-15T10:00', deposits: [{ id: 'd1', date: '2026-06-15', at: '2026-06-15T10:00', amount: 600000, interest: 0 }] },
    claims: [
      { id: 'P', creditor: 'C', kind: 'PRV', caseNo: '令和8年（ヨ）第5号', effectiveOn: '2026-05-01T10:00', filedOn: '2026-04-25', principal: 400000 },
      { id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: '2026-06-01T10:00', filedOn: '2026-05-25', principal: 500000 },
      { id: 'C', creditor: 'C', kind: 'GEN', fromPrv: 'P', effectiveOn: '2026-07-01T10:00', filedOn: '2026-06-25', damages: 50000, principal: 400000 },
    ],
  });
  assert.equal(JSON.stringify(paidBy(r)), JSON.stringify({ C: 266667, X: 333333 }));
  const c = r.rows.find((y) => y.id === 'C');
  assert.equal(c.held, 0);                                 // 本執行に移ったので留保しない
  assert.equal(c.total, 400000);                           // 終期後の本差押えで増えた50,000円は除く
  assert.ok(/仮差押えから本執行に移行/.test(c.note));
  assert.ok(!r.rows.some((y) => y.id === 'P'));            // 仮差押えの行は出さない
  assert.equal(r.rows.filter((y) => y.type === 'claim').map((y) => y.id).join(','), 'C,X'); // 仮差押えの申立ての順
});

t('仮差押えから本執行への移行：超える部分は本差押えの時から加入', () => {
  const r = HT.distribute({
    meta: { date: '2026-12-10' },
    fund: { kind: 'general', cutoffAt: '2026-07-15T10:00', deposits: [
      { id: 'd1', date: '2026-06-15', at: '2026-06-15T10:00', amount: 300000, interest: 0 },
      { id: 'd2', date: '2026-07-15', at: '2026-07-15T10:00', amount: 300000, interest: 0 },
    ] },
    claims: [
      { id: 'P', creditor: 'C', kind: 'PRV', effectiveOn: '2026-05-01T10:00', filedOn: '2026-04-25', principal: 400000 },
      { id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: '2026-06-01T10:00', filedOn: '2026-05-25', principal: 500000 },
      { id: 'C', creditor: 'C', kind: 'GEN', fromPrv: 'P', effectiveOn: '2026-07-01T10:00', filedOn: '2026-06-25', damages: 50000, principal: 400000 },
    ],
  });
  assert.equal(JSON.stringify(paidBy(r)), JSON.stringify({ C: 279487, X: 320513 }));
  assert.equal(r.regions.length, 2);
  assert.equal(r.regions[1].got.C, 146154);               // 2回目の供託では、残り266,667円と超える部分50,000円の合計で按分
  assert.equal(r.rows.find((y) => y.id === 'C').total, 450000);
  assert.equal(r.warnings.length, 0, r.warnings.join('\n'));
});


t('仮差押えから本執行への移行：本差押えが小さいときは2欄に分け、仮差押えの残部は支払留保', () => {
  const inp = {
    meta: { date: '2026-12-10' },
    fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-11-01', amount: 600000, interest: 0 }] },
    claims: [
      { id: 'P', creditor: 'C', kind: 'PRV', caseNo: '令和8年（ヨ）第5号', effectiveOn: '2026-05-01', filedOn: '2026-04-25', principal: 800000 },
      { id: 'C', creditor: 'C', kind: 'GEN', fromPrv: 'P', effectiveOn: '2026-07-01', filedOn: '2026-06-25', principal: 300000 },
      { id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: '2026-06-01', filedOn: '2026-05-25', principal: 400000 },
    ],
  };
  const r = HT.distribute(inp);
  assert.equal(JSON.stringify(paidBy(r)), JSON.stringify({ P: 250000, C: 150000, X: 200000 }));
  const p = r.rows.find((y) => y.id === 'P');
  assert.equal(p.total, 500000);
  assert.equal(p.held, 250000);
  assert.ok(/本執行に移行しなかった残部/.test(p.note));
  // 次回：本差押えは紐付けを外して仮差押えの時から加入、仮差押えは残部（800,000−300,000−250,000）
  const { input } = HT.carryForward(inp, r);
  const c = input.claims.find((y) => y.id === 'C'), pp = input.claims.find((y) => y.id === 'P');
  assert.equal(`${c.principal}/${c.fromPrv}/${c.effectiveOn}`, '150000//2026-05-01');
  assert.ok(/仮差押えから本執行に移行/.test(c.note));
  assert.equal(pp.principal, '250000');
});


const PRES = {
  meta: { date: '2026-12-10' },
  fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-05-10', amount: 1000000, interest: 0, preservation: true, convertedAt: '2026-07-01T10:00', releaseAmount: 600000 }] },
  claims: [
    { id: 'P', creditor: 'P', kind: 'PRV', effectiveOn: '2026-05-01T10:00', filedOn: '2026-04-25', principal: 600000 },
    { id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: '2026-07-01T10:00', filedOn: '2026-06-20', principal: 900000 },
    { id: 'Y', creditor: 'Y', kind: 'GEN', effectiveOn: '2026-07-05T10:00', filedOn: '2026-07-01', principal: 500000 },
  ],
};
t('仮差押えのみを原因とする供託：解放金の部分は最初の差押えの送達時、超える部分（弁済供託）は競合時が終期', () => {
  const r = HT.distribute(PRES);
  // 解放金の部分600,000：P・Xで按分（Yは送達時より後）。超える部分400,000：XとYの差押えが競合した時（Yの送達時）が終期で、X残540,000・Y 500,000で按分
  assert.equal(JSON.stringify(paidBy(r)), JSON.stringify({ P: 240000, X: 567692, Y: 192308 }));
  assert.equal(r.rows.find((y) => y.id === 'P').held, 240000);
  assert.equal(r.regions.length, 2);
  assert.equal(r.regions[1].what, '弁済供託に当たる部分（仮差押解放金の額を超える部分）');
  assert.equal(r.regions[1].members.join(','), 'X,Y');
  assert.equal(r.regions[0].members.join(','), 'P,X');
  assert.equal(r.fund.deposit, 1000000);
});

t('仮差押えのみを原因とする供託：超える部分に差押えが1件だけなら配当の対象外（取立て）', () => {
  const inp = JSON.parse(JSON.stringify(PRES));
  inp.claims = inp.claims.filter((c) => c.id !== 'Y');
  const r = HT.distribute(inp);
  assert.equal(JSON.stringify(paidBy(r)), JSON.stringify({ P: 240000, X: 360000 }));
  assert.equal(r.fund.deposit, 600000);
  assert.ok(r.warnings.some((w) => /400,000円.*配当の対象外.*差押債権者の取立て/.test(w)));
});

t('仮差押えのみを原因とする供託：本執行に移った債権者と、送達・競合の時より後の差押え', () => {
  const inp = JSON.parse(JSON.stringify(PRES));
  inp.fund.deposits[0].convertedAt = '2026-06-25T10:00';
  inp.claims.push({ id: 'C', creditor: 'P', kind: 'GEN', fromPrv: 'P', effectiveOn: '2026-06-25T10:00', filedOn: '2026-06-15', principal: 600000 });
  const r = HT.distribute(inp);
  // 解放金の部分：本執行したC（仮差押えの時から加入）だけ。超える部分：CとXが競合した時（Xの送達時）が終期。Cは解放金の部分で満額なのでXが取る。Yは除外
  assert.equal(JSON.stringify(paidBy(r)), JSON.stringify({ C: 600000, X: 400000 }));
  assert.equal(r.rows.find((y) => y.id === 'C').held, 0);
  assert.ok(r.rows.find((y) => y.id === 'Y' && y.type === 'excluded'));
});

t('仮差押えのみを原因とする供託（給料等）：1/4を超える部分と解放金の額を超える部分は弁済供託、解放金は古い供託から', () => {
  const r = HT.distribute({
    meta: { date: '2026-12-10' },
    fund: { kind: 'wage', deposits: [
      { id: 'd1', date: '2026-05-25', amount: 50000, interest: 0, net: 200000, preservation: true, convertedAt: '2026-08-01T10:00', releaseAmount: 120000 },
      { id: 'd2', date: '2026-06-25', amount: 80000, interest: 0, net: 200000, preservation: true, convertedAt: '2026-08-01T10:00', releaseAmount: 120000 },
      { id: 'd3', date: '2026-07-25', amount: 50000, interest: 0, net: 200000, preservation: true, convertedAt: '2026-08-01T10:00', releaseAmount: 120000 },
    ] },
    claims: [
      { id: 'P', creditor: 'P', kind: 'PRV', effectiveOn: '2026-05-01T10:00', principal: 120000 },
      { id: 'S', creditor: 'S', kind: 'SUP2', effectiveOn: '2026-08-01T10:00', principal: 300000 },
      { id: 'G', creditor: 'G', kind: 'GEN', effectiveOn: '2026-08-10T10:00', principal: 200000 },
    ],
  });
  const parts = r.regions.map((g) => `${g.amount}:${g.members.join('+')}`).join(' ');
  // 解放金：d1 50,000、d2のうち50,000（1/4まで）、d3のうち20,000。弁済供託：d2の30,000（1/4超）、d3の30,000（解放金超）。競合はGの送達時
  assert.equal(parts, '100000:P+S 30000:S+G 20000:P+S 30000:S+G'); // 加入の状況が同じd1・d2の解放金の部分は1つにまとめる
  assert.equal(r.fund.deposit, 180000);
  assert.equal(r.paid.P + r.paid.S + r.paid.G, 180000);
  assert.ok(r.regions.filter((g) => g.members.includes('P')).every((g) => !g.what.startsWith('弁済供託')));
});


const MULTI = (amount) => ({
  meta: { date: '2026-12-10' },
  fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-05-10', amount, interest: 0, preservation: true, convertedAt: '2026-07-01T10:00' }] },
  claims: [
    { id: 'P1', creditor: 'P1', kind: 'PRV', effectiveOn: '2026-04-01T10:00', filedOn: '2026-03-25', principal: 600000, releaseAmount: 600000 },
    { id: 'P2', creditor: 'P2', kind: 'PRV', effectiveOn: '2026-04-15T10:00', filedOn: '2026-04-10', principal: 400000, releaseAmount: 300000 },
    { id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: '2026-07-01T10:00', filedOn: '2026-06-20', principal: 200000 },
  ],
});
t('複数の仮差押えが競合したままの供託（合算方式）：解放金の合計までを全員で按分', () => {
  // 供託100万 ≧ 解放金の合計90万：解放金の部分90万をP1 60万・P2 30万（解放金の額が上限）・X 20万で按分。超える10万は競合がないので対象外
  const r = HT.distribute(MULTI(1000000));
  assert.equal(JSON.stringify(paidBy(r)), JSON.stringify({ P1: 490909, P2: 245455, X: 163636 }));
  assert.equal(r.fund.deposit, 900000);
  const p2 = r.rows.find((y) => y.id === 'P2');
  assert.equal(p2.total, 300000);
  assert.ok(/解放金の額（300,000円）を超える100,000円/.test(p2.note));
  assert.ok(r.warnings.some((w) => /100,000円.*配当の対象外/.test(w)));
  // 供託70万 ＜ 解放金の合計：全額が解放金の部分
  const r2 = HT.distribute(MULTI(700000));
  assert.equal(JSON.stringify(paidBy(r2)), JSON.stringify({ P1: 381818, P2: 190909, X: 127273 }));
  assert.equal(r2.regions.length, 1);
});


const BASE6 = { meta: { date: '2026-12-10' }, fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-11-01', amount: 600000, interest: 0 }] },
  claims: [ { id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: '2026-05-01', principal: 400000 },
            { id: 'P', creditor: 'P', kind: 'PRV', effectiveOn: '2026-06-01', principal: 800000 },
            { id: 'Y', creditor: 'Y', kind: 'GEN', effectiveOn: '2026-06-10', principal: 400000 } ] };
t('供託金の配当（民執法92条）：留保分の支払・配当不能・債権額の減少・債権者間の異議（相対的解決）', () => {
  const r = HT.distribute(BASE6);
  assert.equal(JSON.stringify(r.paid), JSON.stringify({ X: 150000, P: 300000, Y: 150000 }));
  const pay = HT.additionalDistribution(BASE6, r, { P: { outcome: 'pay' } }).result;
  assert.equal(JSON.stringify(pay.paid), JSON.stringify({ P: 300000 }));
  // 仮差押債権者が本案で敗訴：全債権者のために変更（92条2項）。X・Yが300,000ずつになる
  const v = HT.additionalDistribution(BASE6, r, { P: { outcome: 'void' } }).result;
  assert.equal(JSON.stringify(v.paid), JSON.stringify({ X: 150000, Y: 150000 }));
  assert.equal(v.fund.total, 300000);
  const red = HT.additionalDistribution(BASE6, r, { P: { outcome: 'reduce', amount: 200000 } }).result;
  assert.equal(JSON.stringify(red.paid), JSON.stringify({ X: 90000, P: 120000, Y: 90000 }));
  // Xが提起した配当異議訴訟でPの債権が否定された：Xの増加分だけをXへ、残りはP（Yには及ばない）
  const rel = HT.additionalDistribution(BASE6, r, { P: { outcome: 'relative', amount: 0, plaintiff: 'X' } }).result;
  assert.equal(JSON.stringify(rel.paid), JSON.stringify({ X: 150000, P: 150000 }));
  const xRow = rel.rows.find((y) => y.id === 'X');
  assert.equal(xRow.total, 250000);                       // 元の配当150,000を充当した後の残り
  assert.equal(xRow.after.principal, 100000);
});

t('債務者が供託した仮差押解放金：同じ債権の本執行だけなら配当にならず、他の差押えで競合した時が終期', () => {
  const inp = {
    meta: { date: '2026-12-10' },
    fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-05-10', amount: 500000, interest: 0, releaseByDebtor: true }] },
    claims: [
      { id: 'P', creditor: 'C', kind: 'PRV', effectiveOn: '2026-04-01T10:00', principal: 500000 },
      { id: 'C', creditor: 'C', kind: 'GEN', fromPrv: 'P', effectiveOn: '2026-07-01T10:00', principal: 500000 },
    ],
  };
  const r = HT.distribute(inp);
  assert.equal(r.fund.deposit, 0);
  assert.ok(r.warnings.some((w) => /競合がないため配当にならず/.test(w)));
  // 本執行が仮差押えにない遅延損害金を含み、競合として扱う
  inp.fund.deposits[0].treatAsCompeting = true;
  inp.claims[1].damages = 20000;
  assert.equal(JSON.stringify(HT.distribute(inp).paid), JSON.stringify({ C: 500000 }));
  // 他の債権者Xが取戻請求権を差し押さえた（7月10日）。その時が終期で、後のYは加わらない
  delete inp.fund.deposits[0].treatAsCompeting;
  inp.claims.push({ id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: '2026-07-10T10:00', principal: 500000 });
  inp.claims.push({ id: 'Y', creditor: 'Y', kind: 'GEN', effectiveOn: '2026-07-20T10:00', principal: 500000 });
  const r3 = HT.distribute(inp);
  assert.equal(JSON.stringify(r3.paid), JSON.stringify({ C: 254902, X: 245098 })); // C 520,000・X 500,000で按分
  assert.ok(r3.rows.find((y) => y.id === 'Y' && y.type === 'excluded'));
});

t('滞納処分庁からの残余金：供託を経たときは供託の時、経ないときは交付を受けた時が終期', () => {
  const inp = (via) => ({
    meta: { date: '2026-12-10' },
    fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-10-01', amount: 300000, residual: true, residualVia: via, depositedAt: '2026-08-01T10:00', deliveredAt: '2026-10-01T10:00' }] },
    claims: [
      { id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: '2026-07-01T10:00', principal: 300000 },
      { id: 'Y', creditor: 'Y', kind: 'GEN', effectiveOn: '2026-09-01T10:00', principal: 300000 },
    ],
  });
  assert.equal(JSON.stringify(HT.distribute(inp('deposit')).paid), JSON.stringify({ X: 300000 }));
  assert.equal(JSON.stringify(HT.distribute(inp('cash')).paid), JSON.stringify({ X: 150000, Y: 150000 }));
  assert.equal(HT.distribute(inp('cash')).fund.interest, 0);
});

t('売得金：執行官が売得金の交付を受けた時までの差押え等が加入', () => {
  const r = HT.distribute({
    meta: { date: '2026-12-10' },
    fund: { kind: 'general', saleProceeds: 400000, saleAt: '2026-09-01T10:00', deposits: [] },
    claims: [
      { id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: '2026-07-01T10:00', principal: 300000 },
      { id: 'Y', creditor: 'Y', kind: 'GEN', effectiveOn: '2026-09-02T10:00', principal: 300000 },
    ],
  });
  assert.equal(JSON.stringify(r.paid), JSON.stringify({ X: 300000, Y: 0 }));
});

t('執行停止中の供託：設定で遮断効を否定すると、停止が解けた時までの差押え等も加入', () => {
  const inp = (mode) => ({
    meta: { date: '2026-12-10' }, settings: { stayedDeposit: mode },
    fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-08-01', amount: 600000, interest: 0, stayed: true, stayLiftedAt: '2026-10-01T10:00' }] },
    claims: [
      { id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: '2026-07-01T10:00', principal: 600000, stayed: true },
      { id: 'Y', creditor: 'Y', kind: 'GEN', effectiveOn: '2026-09-01T10:00', principal: 600000 },
    ],
  });
  const a = HT.distribute(inp('cutoff'));
  assert.equal(JSON.stringify(a.paid), JSON.stringify({ X: 600000, Y: 0 }));
  assert.equal(a.rows.find((y) => y.id === 'X').held, 600000);   // 執行を停止された差押債権者の分は留保
  assert.equal(JSON.stringify(HT.distribute(inp('nocutoff')).paid), JSON.stringify({ X: 300000, Y: 300000 }));
});

t('転付命令：送達の時までに他の差押え等がなければ配当に至らず、あれば効力を生じない', () => {
  const inp = (yAt) => ({
    meta: { date: '2026-12-10' },
    fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-11-01', amount: 600000, interest: 0 }] },
    claims: [
      { id: 'T', creditor: 'T', kind: 'GEN', effectiveOn: '2026-07-01T10:00', transferServedAt: '2026-07-01T10:00', principal: 600000 },
      { id: 'Y', creditor: 'Y', kind: 'GEN', effectiveOn: yAt, principal: 600000 },
    ],
  });
  const a = HT.distribute(inp('2026-07-05T10:00'));
  assert.ok(a.transferEffective);
  assert.ok(a.warnings.some((w) => /転付命令は効力を生じ.*配当に至りません/.test(w)));
  const b = HT.distribute(inp('2026-06-20T10:00'));
  assert.ok(!b.transferEffective);
  assert.ok(/転付命令は効力を生じない/.test(b.rows.find((y) => y.id === 'T').note));
  assert.equal(JSON.stringify(b.paid), JSON.stringify({ T: 300000, Y: 300000 }));
});

t('一般先取特権の種類を「子の監護の費用」とした入力は、扶養義務等債権（子の監護費用の先取特権）として扱う', () => {
  const inp = (y) => ({
    meta: { date: '2026-12-10' },
    fund: { kind: 'wage', deposits: [{ id: 'd1', date: '2026-11-01', amount: 150000, interest: 0, wage: { gross: 400000, incomeTax: 0, residentTax: 0, socialInsurance: 0 } }] },
    claims: [
      { id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: '2026-07-01T10:00', principal: 600000 },
      Object.assign({ id: 'Y', creditor: 'Y', effectiveOn: '2026-08-01T10:00', principal: 600000 }, y),
    ],
  });
  const a = HT.distribute(inp({ kind: 'GPP', gppClass: 3 }));
  const b = HT.distribute(inp({ kind: 'SUP3' }));
  assert.equal(JSON.stringify(a.paid), JSON.stringify(b.paid));
  assert.ok(a.warnings.some((w) => /子の監護の費用の先取特権は、種別/.test(w)));
});

t('預金等と給料等の両方：供託金ごとに差押えの範囲を分ける', () => {
  const claims = [
    { id: 'X', creditor: 'X', kind: 'GEN', effectiveOn: '2026-05-01T10:00', principal: 1000000 },
    { id: 'W', creditor: 'W', kind: 'SUP2', effectiveOn: '2026-05-01T10:00', principal: 300000 },
  ];
  const r = HT.distribute({
    meta: { date: '2026-12-10' },
    fund: { kind: 'mixed', deposits: [
      { id: 'd1', debtKind: 'general', date: '2026-06-01', amount: 200000, interest: 0 },
      { id: 'd2', debtKind: 'wage', date: '2026-07-01', amount: 100000, interest: 0, net: 200000 },
    ] },
    claims,
  });
  // 預金：全額を按分（X 153,846、W 46,154）。給料：1/4〜1/2の5万円はWだけ、1/4の5万円を残債権で按分（X 40,293、W 9,707）
  assert.equal(JSON.stringify(r.paid), JSON.stringify({ X: 194139, W: 105861 }));
  // 預金だけ・給料だけなら、従来の kind と同じ結果
  const only = (kind, debtKind, extra) => ({ meta: { date: '2026-12-10' }, fund: { kind, deposits: [Object.assign({ id: 'd', debtKind, date: '2026-06-01', amount: 100000, interest: 0 }, extra)] }, claims });
  assert.equal(JSON.stringify(HT.distribute(only('mixed', 'general')).paid), JSON.stringify(HT.distribute(only('general')).paid));
  assert.equal(JSON.stringify(HT.distribute(only('mixed', 'wage', { net: 200000 })).paid), JSON.stringify(HT.distribute(only('wage', undefined, { net: 200000 })).paid));
});

// 画面の「設例から選ぶ」の設例（site/js/app/examples.js）が、期待値どおりに計算されること
{
  const EX = loadHT([path.join(root, 'site/js/app/examples.js')]);
  for (const ex of EX.EXAMPLES) {
    t(`設例一覧 ${ex.id}：${ex.title}`, () => {
      const r = EX.distribute(JSON.parse(JSON.stringify(ex.input)));
      const e = JSON.parse(JSON.stringify(ex.expect)); // vm の中で作られたオブジェクトをこちらの形にする
      assert.equal(r.type, e.type);
      assert.deepEqual(paidBy(r), e.paid);
      assert.deepEqual(Object.fromEntries(r.rows.filter((x) => x.held).map((x) => [x.id, x.held])), e.held || {});
      assert.equal(surplus(r), e.surplus || 0);
    });
  }
  t('設例一覧：id が重ならず、論点・説明がある', () => {
    const ids = EX.EXAMPLES.map((x) => x.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const x of EX.EXAMPLES) assert.ok(x.title && x.desc && x.group && x.ronten.length, x.id);
  });
}

console.log(`engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
