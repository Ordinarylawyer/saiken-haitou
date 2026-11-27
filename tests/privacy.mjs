// 入力を外に出さないための約束を確かめる
// - CSP で外部との通信を禁止している
// - 通信・保存の API を使っていない（fetch・XMLHttpRequest・WebSocket・sendBeacon・localStorage・sessionStorage・indexedDB・cookie）
// - 外部の URL からスクリプト・スタイルを読んでいない
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root } from './load.mjs';

let fail = 0;
const t = (name, fn) => { try { fn(); console.log('  ok  ', name); } catch (e) { fail++; console.log('  NG  ', name); console.log(e.message); } };

const html = fs.readFileSync(path.join(root, 'site/index.html'), 'utf8');
t('CSP で通信を禁止', () => {
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /default-src 'self'/);
});
t('外部のスクリプト・スタイルを読まない', () => {
  assert.doesNotMatch(html, /<(script|link)[^>]+(src|href)="https?:/);
});
const jsFiles = ['site/js/engine/haitou.js', 'site/js/app/table.js', 'site/js/app/excel.js', 'site/js/app/print.js', 'site/js/app/examples.js', 'site/js/app/main.js'];
t('通信・保存の API を使わない', () => {
  for (const f of jsFiles) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.doesNotMatch(src, /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie)\b/, f);
  }
});
t('参考資料をリポジトリに入れない', () => {
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gi, /^reference\//m);
  assert.ok(!fs.existsSync(path.join(root, 'reference')));
});
t('公開しない語をリポジトリに書かない', () => {
  // 語の一覧そのものは公開しないため、リポジトリに入れない tests/local/denylist.txt（1行1語、# はコメント）に置く。
  // ファイルがなければこの検査は行わない
  const list = path.join(root, 'tests', 'local', 'denylist.txt');
  if (!fs.existsSync(list)) { console.log('  skip 公開しない語の一覧（tests/local/denylist.txt）がありません'); return; }
  const words = fs.readFileSync(list, 'utf8').split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !x.startsWith('#'));
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    if (['.git', 'node_modules', 'vendor', 'reference', 'local'].includes(e.name)) return [];
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
  for (const f of walk(root)) {
    if (!/\.(js|mjs|md|mmd|html|css|json|py|txt)$|(^|\/)\.gitignore$/.test(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const w of words) assert.ok(!src.includes(w), `${path.relative(root, f)} に公開しない語があります`);
  }
});
console.log(`privacy: ${5 - fail} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
