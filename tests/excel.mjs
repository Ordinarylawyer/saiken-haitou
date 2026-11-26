// 配当表の Excel 出力のテスト：JSZip で開き直し、主要なセルと書式（A4横・結合）を確かめる
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadHT, root } from './load.mjs';

const ctx = { console, setImmediate, setTimeout, clearTimeout, Buffer, Uint8Array, ArrayBuffer, Promise };
vm.createContext(ctx);
for (const f of ['site/js/engine/haitou.js', 'site/vendor/jszip.min.js', 'site/js/app/table.js', 'site/js/app/excel.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const HT = ctx.HT;
const JSZip = ctx.JSZip;

const result = HT.distribute({
  meta: { date: '2026-12-10', court: '○○地方裁判所第○民事部', clerk: '○○', debtor: '乙山次郎', caseNos: '令和8年（リ）第100号\n令和8年（ル）第200号' },
  fund: { kind: 'general', deposits: [{ id: 'd1', date: '2026-11-01', amount: 1000000, interest: 0 }] },
  procedureCosts: [{ payee: 'X', amount: 6000 }],
  claims: [
    { id: 'X', creditor: 'X', kind: 'GEN', caseNo: '令和8年（ル）第200号', label: '貸金', filedOn: '2026-01-10', cost: 4000, principal: 1236000 },
    { id: 'Y', creditor: 'Y', kind: 'GEN', filedOn: '2026-02-10', principal: 800000 },
    { id: 'Z', creditor: 'Z', kind: 'GEN', filedOn: '2026-03-10', principal: 360000 },
  ],
});

let fail = 0;
try {
  const zip = await HT.buildXlsx(result, JSZip);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const z2 = await JSZip.loadAsync(buf);
  const sheet = await z2.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(sheet, /orientation="landscape"/);
  assert.match(sheet, /paperSize="9"/);
  assert.match(sheet, /<mergeCell ref="A1:B5"\/>/);
  assert.match(sheet, /配　当　表/);
  // 手続費用（7〜10行）の次の X（11〜14行）：配当実施額は E11、元金充当額は F14
  assert.match(sheet, /<c r="E11" s="10"><v>513567<\/v>/);
  assert.match(sheet, /<c r="F14" s="8"><v>509567<\/v>/);
  assert.match(sheet, /<c r="G2" s="9"><v>1000000<\/v>/);
  const html = HT.renderTableHTML(result);
  assert.match(html, /令和8年12月10日/);
  assert.match(html, /513,567/);
  if (process.env.WRITE_XLSX) fs.writeFileSync(process.env.WRITE_XLSX, buf);
  console.log('  ok   Excel 出力');
} catch (e) { fail++; console.log('  NG   Excel 出力'); console.log(e.message); }
console.log(`excel: ${1 - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
