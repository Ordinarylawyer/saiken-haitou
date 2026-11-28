"""設例の計算過程の PDF 版（docs/設例の計算過程.pdf）を作る。

    python3 tools/examples_pdf.py

docs/設例の計算過程.md（node tools/examples_doc.mjs で作る）を HTML にし、Chrome（Playwright）で A4 の PDF に印刷する。
設例ごとに改頁し、ページ番号付きの目次としおり（ブックマーク）を付ける。
必要なもの：Python の markdown・pypdf・playwright と Chrome（又は Chromium）、日本語フォント（Noto Sans CJK JP など）。
"""
import html
import io
import re
import sys
import unicodedata
from pathlib import Path

import markdown
from playwright.sync_api import sync_playwright
from pypdf import PdfReader, PdfWriter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs' / '設例の計算過程.md'
OUT = ROOT / 'docs' / '設例の計算過程.pdf'
REPO = 'https://github.com/Ordinarylawyer/saiken-haitou/blob/main/docs/'

CSS = """
@page { size: A4; margin: 16mm 14mm 16mm 14mm; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Noto Sans CJK JP", "Noto Sans JP", sans-serif; font-size: 9.5pt; line-height: 1.6; color: #111; }
h1 { font-size: 20pt; margin: 0 0 6mm; color: #004878; }
h2 { font-size: 13pt; color: #004878; border-bottom: 1.5px solid #004878; padding-bottom: 1mm; margin: 0 0 4mm; }
h3 { font-size: 12pt; margin: 0 0 3mm; padding: 1.5mm 3mm; background: #e8f0f6; border-left: 4px solid #004878; }
.example { page-break-before: always; }
p { margin: 1.5mm 0; }
ul, ol { margin: 1mm 0 1mm 0; padding-left: 6mm; }
li { margin: 0.5mm 0; }
table { border-collapse: collapse; width: 100%; margin: 2mm 0 3mm; font-size: 8pt; line-height: 1.4; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th, td { border: 0.5px solid #888; padding: 1mm 1.5mm; vertical-align: top; }
th { background: #f0f3f6; font-weight: 600; }
th { white-space: nowrap; }
td { min-width: 3em; }
code { font-family: "Noto Sans Mono CJK JP", monospace; font-size: 8.5pt; background: #f3f3f3; padding: 0 1mm; }
blockquote { margin: 2mm 0; padding: 1mm 3mm; border-left: 3px solid #c98d17; background: #fbf6ec; color: #333; }
blockquote p { margin: 0; }
a { color: #004878; text-decoration: none; }
.cover { page-break-after: always; }
.cover .lead { font-size: 10pt; }
.toc h2 { margin-top: 0; }
.toc .g { font-weight: 700; margin: 3mm 0 1mm; break-after: avoid; page-break-after: avoid; }
.toc .row { display: flex; align-items: baseline; margin: 0.6mm 0 0.6mm 4mm; }
.toc .row a { color: #111; }
.toc .dots { flex: 1; border-bottom: 1px dotted #999; margin: 0 2mm; transform: translateY(-1mm); }
.toc .pg { min-width: 8mm; text-align: right; }
"""


def load_sections():
    md = SRC.read_text(encoding='utf-8')
    md = re.sub(r'<!--.*?-->\s*', '', md, flags=re.S)
    # Markdown の目次（**目次** から最初の「## 」の前まで）は、ページ番号付きの目次に置き換える
    head, rest = md.split('\n**目次**\n', 1)
    body = rest[rest.index('\n## ') + 1:]
    # 入れ子のリスト（3字下げ）を python-markdown の4字下げにする
    fix = lambda s: re.sub(r'^   (?=- )', '    ', s, flags=re.M)
    # 論点整理などへの相対リンクは GitHub の URL にする
    link = lambda s: re.sub(r'\]\((?!https?:|#)([^)]+)\)', lambda m: f']({REPO}{m.group(1)})', s)
    head = link(fix(head))
    groups = []
    for g in re.split(r'^## ', body, flags=re.M)[1:]:
        title, gbody = g.split('\n', 1)
        exs = []
        for e in re.split(r'^### ', gbody, flags=re.M)[1:]:
            et, ebody = e.split('\n', 1)
            exs.append((et.strip(), link(fix(ebody))))
        groups.append((title.strip(), exs))
    return head, groups


def to_html(s):
    return markdown.markdown(s, extensions=['tables', 'sane_lists'])


def build_html(head, groups, pages):
    h1, intro = head.split('\n', 1)
    out = [f'<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>設例の計算過程</title><style>{CSS}</style></head><body>']
    out.append(f'<section class="cover">{to_html(h1)}<div class="lead">{to_html(intro)}</div></section>')
    out.append('<section class="toc"><h2>目次</h2>')
    n = 0
    for gi, (gt, exs) in enumerate(groups):
        out.append(f'<div class="g">{html.escape(gt)}</div>')
        for et, _ in exs:
            n += 1
            pg = pages.get(n, '')
            out.append(f'<div class="row"><a href="#ex{n}">{html.escape(et)}</a><span class="dots"></span><span class="pg">{pg}</span></div>')
    out.append('</section>')
    n = 0
    for gi, (gt, exs) in enumerate(groups):
        for k, (et, eb) in enumerate(exs):
            n += 1
            # グループの見出しは、そのグループの最初の設例と同じページに置く
            gh = f'<h2 id="g{gi}">{html.escape(gt)}</h2>' if k == 0 else ''
            out.append(f'<section class="example" id="ex{n}">{gh}<h3>{html.escape(et)}</h3>{to_html(eb)}</section>')
    out.append('</body></html>')
    return '\n'.join(out)


FOOTER = '<div style="width:100%;font-size:8pt;color:#666;text-align:center;font-family:\'Noto Sans CJK JP\',sans-serif;"><span class="pageNumber"></span></div>'


def render(page, doc_html):
    page.set_content(doc_html, wait_until='load')
    return page.pdf(format='A4', print_background=True, display_header_footer=True, header_template='<div></div>', footer_template=FOOTER,
                    margin={'top': '16mm', 'bottom': '16mm', 'left': '14mm', 'right': '14mm'}, prefer_css_page_size=True)


def find_pages(pdf_bytes, titles):
    reader = PdfReader(io.BytesIO(pdf_bytes))
    # 抜き出した文字は康熙部首などになることがあるので、NFKC で正規化し、文字・数字だけで比べる
    norm = lambda s: re.sub(r'[^\w]', '', unicodedata.normalize('NFKC', s or ''))
    texts = [norm(p.extract_text()) for p in reader.pages]
    pages, start = {}, 0
    for n, t in enumerate(titles, 1):
        key = norm(t)
        for i in range(start, len(texts)):
            if key in texts[i] and '設例の番号' in texts[i]:  # 目次のページを除く
                pages[n] = i + 1
                start = i
                break
        else:
            sys.exit(f'見出しが PDF に見つかりません：{t}')
    return pages


def main():
    head, groups = load_sections()
    titles = [et for _, exs in groups for et, _ in exs]
    with sync_playwright() as p:
        exe = next((c for c in ['/usr/bin/google-chrome', '/usr/bin/chromium'] if Path(c).exists()), None)
        browser = p.chromium.launch(executable_path=exe, args=['--no-sandbox']) if exe else p.chromium.launch()
        page = browser.new_page()
        # 1回目でページ番号を調べ、2回目で目次に入れる（目次の長さは変わらない）
        first = render(page, build_html(head, groups, {n: '000' for n in range(1, len(titles) + 1)}))
        pages = find_pages(first, titles)
        final = render(page, build_html(head, groups, pages))
        browser.close()
    if find_pages(final, titles) != pages:
        sys.exit('ページ番号がずれました。もう一度実行してください。')
    # しおり（グループ → 設例）と文書情報
    reader = PdfReader(io.BytesIO(final))
    writer = PdfWriter()
    writer.append(reader)
    n = 0
    for gt, exs in groups:
        parent = writer.add_outline_item(gt, pages[n + 1] - 1)
        for et, _ in exs:
            n += 1
            writer.add_outline_item(et, pages[n] - 1, parent=parent)
    writer.add_metadata({'/Title': '設例の計算過程（債権執行 配当計算）'})
    with open(OUT, 'wb') as f:
        writer.write(f)
    print(f'書き出しました：{OUT.relative_to(ROOT)}（{len(reader.pages)}ページ、設例{len(titles)}件）')


if __name__ == '__main__':
    main()
