#!/usr/bin/env python3
"""Claude の Docs から書き出した Markdown を docs/ に置く形に整える。

使い方:
  python3 tools/docs_export.py <書き出した.md 又は export 結果の .json> <出力先.md> <Docs のタブ名>

- 先頭に「Docs から書き出したもの。直接編集しない」の注記を付ける
- 2行目の日付・作成者の行（作成者の名前が入る）を削る
- 図の埋め込み（書き出しでは文字に置き換わる）を、docs/figures/ の Mermaid 図に差し替える
- 見出し（##）から目次を作って本文の前に入れ、README の <!-- toc:ファイル名 --> 〜 <!-- /toc --> にも入れる
"""
import base64, json, re, sys, pathlib

src, dst, tab = sys.argv[1], sys.argv[2], sys.argv[3]
raw = pathlib.Path(src).read_text(encoding='utf-8')
if src.endswith('.json'):
    arr = json.loads(raw)
    data = json.loads(arr[-1]['text'] if isinstance(arr, list) else raw)['data']
    md = base64.b64decode(data['bytes_b64']).decode('utf-8')
else:
    md = raw

lines = md.split('\n')
# タイトルの次の「日付 · @名前」の行を削る
if len(lines) > 2 and re.match(r'^\S.* · @\S+\s*$', lines[2]):
    del lines[2:4]
md = '\n'.join(lines)

# 図の差し替え: &#91;embedded content: <キャプション>\] → figures/<キャプションの先頭語>.mmd があれば Mermaid に
figdir = pathlib.Path(__file__).resolve().parent.parent / 'docs' / 'figures'
def fig(m):
    cap = m.group(1).strip()
    for f in sorted(figdir.glob('*.mmd')):
        if f.stem in cap:
            return f'```mermaid\n{f.read_text(encoding="utf-8").strip()}\n```\n\n*{cap}*'
    return f'（図：{cap}）'
md = re.sub(r'&#91;embedded content: (.*?)\\\]', fig, md)

# 目次（GitHub の見出しアンカー）を、本文の最初の見出しの前に入れる。README にも同じ目次を入れる
def slug(t):
    t = re.sub(r'[^\w\- ]', '', t.strip().lower())
    return t.replace(' ', '-')
heads = [h for h in re.findall(r'^## (.+)$', md, flags=re.M)]
toc = '\n'.join(f'- [{h}](#{slug(h)})' for h in heads)
if heads:
    first = md.index('\n## ')
    md = md[:first] + '\n**目次**\n\n' + toc + '\n' + md[first:]
    readme = pathlib.Path(__file__).resolve().parent.parent / 'README.md'
    name = pathlib.Path(dst).name
    r = readme.read_text(encoding='utf-8')
    key = f'<!-- toc:{name} -->'
    if key in r:
        link_toc = '\n'.join(f'- [{h}](docs/{name}#{slug(h)})' for h in heads)
        r = re.sub(re.escape(key) + r'.*?<!-- /toc -->', key + '\n' + link_toc + '\n<!-- /toc -->', r, flags=re.S)
        readme.write_text(r, encoding='utf-8')

head = f'<!-- このファイルは Claude の Docs（債権執行 配当計算アプリ 論点表・エンジン仕様／「{tab}」タブ）から書き出したもの。直接編集しない。 -->\n\n'
pathlib.Path(dst).write_text(head + md.rstrip() + '\n', encoding='utf-8')
print(dst, len((head + md).encode()), 'bytes')
