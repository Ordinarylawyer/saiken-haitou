// テスト用: site/js の素のスクリプト（名前空間 HT）を Node の vm に読み込む
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENGINE_FILES = ['haitou.js'].map((f) => path.join(root, 'site/js/engine', f));

export function loadHT(extra = [], globals = {}) {
  const ctx = vm.createContext(Object.assign({ console }, globals));
  for (const f of [...ENGINE_FILES, ...extra]) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
  return ctx.HT;
}
