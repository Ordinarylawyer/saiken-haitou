// 配当表を Excel（.xlsx）にする。JSZip で OOXML を直接組み立てる（ひな形ファイルは使わない）
// 書式は画面の配当表と同じ（近藤基「債権配当の実務と書式〔第3版〕」181頁以下（民事法研究会・2021年）の配当表例）。A4 横・1ページ幅
// 1件の債権を4行（費用・利息・損害金・元金）で表す
(function (g) {
  'use strict';
  const HT = (g.HT = g.HT || {});

  const x = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const COL = (c) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[c] || ('A' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[c - 26]);
  const ref = (c, r) => `${COL(c)}${r}`;

  // 罫線：0 なし 1 四方 2 左右上 3 左右 4 左右下 5 左右上＋下は点線
  // スタイル番号（cellXfs の並び）
  const S = {
    plain: 0,
    box: 1, boxC: 2, boxTop: 3, boxR: 4,           // 文字（四方罫線）：左寄せ・中央・上寄せ・右寄せ
    title: 5,                                      // 表題
    numTop: 6, numMid: 7, numBot: 8,               // 数値（縦に4段）
    numBox: 9, numBoxBottom: 10,                   // 数値（四方・下寄せ）
    whoTop: 11, whoBot: 12,                        // 債権者（上段・下段）
    note: 13, head: 14, headStack: 15,
  };
  const XF = [
    ['0', 0, 0, ''],
    ['0', 0, 1, '<alignment vertical="center" wrapText="1"/>'],
    ['0', 0, 1, '<alignment horizontal="center" vertical="center" wrapText="1"/>'],
    ['0', 0, 1, '<alignment vertical="top" wrapText="1"/>'],
    ['0', 0, 1, '<alignment horizontal="right" vertical="center" wrapText="1"/>'],
    ['0', 1, 1, '<alignment horizontal="center" vertical="center"/>'],
    ['164', 0, 2, '<alignment vertical="center"/>'],
    ['164', 0, 3, '<alignment vertical="center"/>'],
    ['164', 0, 4, '<alignment vertical="center"/>'],
    ['164', 0, 1, '<alignment vertical="center"/>'],
    ['164', 0, 1, '<alignment vertical="bottom"/>'],
    ['0', 0, 5, '<alignment vertical="center" wrapText="1"/>'],
    ['0', 0, 4, '<alignment vertical="top" wrapText="1"/>'],
    ['0', 2, 1, '<alignment vertical="top" wrapText="1"/>'],
    ['0', 0, 1, '<alignment horizontal="center" vertical="bottom" wrapText="1"/>'],
    ['0', 2, 1, '<alignment horizontal="left" vertical="center" wrapText="1"/>'],
  ];
  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>
<fonts count="3">
<font><sz val="10.5"/><name val="ＭＳ 明朝"/><family val="1"/><charset val="128"/></font>
<font><sz val="16"/><name val="ＭＳ 明朝"/><family val="1"/><charset val="128"/></font>
<font><sz val="9"/><name val="ＭＳ 明朝"/><family val="1"/><charset val="128"/></font>
</fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="6">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border>
<border><left style="thin"/><right style="thin"/><top style="thin"/><bottom/><diagonal/></border>
<border><left style="thin"/><right style="thin"/><top/><bottom/><diagonal/></border>
<border><left style="thin"/><right style="thin"/><top/><bottom style="thin"/><diagonal/></border>
<border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="hair"/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${XF.length}">
${XF.map(([nf, font, border, al]) => `<xf numFmtId="${nf}" fontId="${font}" fillId="0" borderId="${border}" xfId="0"${nf !== '0' ? ' applyNumberFormat="1"' : ''}${font ? ' applyFont="1"' : ''}${border ? ' applyBorder="1"' : ''}${al ? ' applyAlignment="1"' : ''}>${al}</xf>`).join('\n')}
</cellXfs>
<cellStyles count="1"><cellStyle name="標準" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  // シートを組み立てる小道具
  function Sheet() {
    const cells = new Map(); // "r:c" -> {v, s, n}
    const merges = [];
    const heights = {};
    const put = (r, c, v, s, n) => cells.set(`${r}:${c}`, { r, c, v, s, n });
    const box = (r1, c1, r2, c2, v, s, n) => {
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) put(r, c, r === r1 && c === c1 ? v : null, s, n);
      if (r1 !== r2 || c1 !== c2) merges.push(`${ref(c1, r1)}:${ref(c2, r2)}`);
    };
    const xml = (widths, opt = {}) => {
      const byRow = {};
      for (const cell of cells.values()) (byRow[cell.r] = byRow[cell.r] || []).push(cell);
      const rowsXml = Object.keys(byRow).map(Number).sort((a, b) => a - b).map((r) => {
        const cs = byRow[r].sort((a, b) => a.c - b.c).map((cell) => {
          const a = ref(cell.c, r);
          if (cell.v == null || cell.v === '') return `<c r="${a}" s="${cell.s}"/>`;
          if (cell.n) return `<c r="${a}" s="${cell.s}"><v>${Number(cell.v)}</v></c>`;
          return `<c r="${a}" s="${cell.s}" t="inlineStr"><is><t xml:space="preserve">${x(cell.v)}</t></is></c>`;
        }).join('');
        const h = heights[r];
        return `<row r="${r}"${h ? ` ht="${h}" customHeight="1"` : ''}>${cs}</row>`;
      }).join('');
      const lastRow = Math.max(...[...cells.values()].map((c) => c.r));
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${COL(widths.length - 1)}${lastRow}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="16"/>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rowsXml}</sheetData>
${merges.length ? `<mergeCells count="${merges.length}">${merges.map((mm) => `<mergeCell ref="${mm}"/>`).join('')}</mergeCells>` : ''}
<printOptions horizontalCentered="1"/>
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
${opt.footer ? `<headerFooter><oddFooter>${x(opt.footer)}</oddFooter></headerFooter>` : ''}
</worksheet>`;
    };
    return { put, box, heights, xml };
  }

  // 配当表のシート
  HT.buildSheetXml = function (m) {
    const sh = Sheet();
    const { put, box, heights } = sh;
    box(1, 0, 5, 1, [m.date, m.court, '', `${m.signerTitle}　${m.signer}`].join('\n'), S.boxTop);
    box(1, 2, 2, 4, m.title.split('').join('　'), S.title);
    box(3, 2, 5, 4, m.caseNos.join('\n'), S.boxR);
    [['売得金（円）', m.sale], ['供託金（円）', m.deposit], ['供託利息（円）', m.interest], ['合計（円）', m.fundTotal]].forEach(([l, v], i) => {
      put(1 + i, 5, l, S.box);
      box(1 + i, 6, 1 + i, 7, v, S.numBox, true);
    });
    put(5, 5, m.debtorLabel, S.boxC);
    box(5, 6, 5, 7, m.debtor, S.boxC);
    for (let r = 1; r <= 5; r++) heights[r] = 21;
    // 見出し
    put(6, 0, '順位', S.boxC);
    put(6, 1, '債権者\n―――――――――――\n債権の種類', S.headStack);
    put(6, 2, '費　　用（円）\n利　　息（円）\n損 害 金（円）\n元　　金（円）', S.headStack);
    put(6, 3, '合　計（円）', S.head);
    put(6, 4, '配当実施額（円）', S.head);
    put(6, 5, '費用充当額（円）\n利息充当額（円）\n損害金充当額（円）\n元金充当額（円）', S.headStack);
    put(6, 6, '充当後費用（円）\n充当後利息（円）\n充当後損害金（円）\n充当後元金（円）', S.headStack);
    put(6, 7, '備　　考', S.head);
    heights[6] = 66;
    // 各債権（4行ずつ）
    let r = 7;
    for (const row of m.rows) {
      box(r, 0, r + 3, 0, row.rank, S.boxC);
      box(r, 1, r + 1, 1, row.payee, S.whoTop);
      box(r + 2, 1, r + 3, 1, [row.label, row.caseNo].filter(Boolean).join('\n'), S.whoBot);
      const col4 = (c, arr) => arr.forEach((v, i) => put(r + i, c, v, i === 0 ? S.numTop : i === 3 ? S.numBot : S.numMid, true));
      col4(2, row.claim);
      box(r, 3, r + 3, 3, row.total, S.numBoxBottom, true);
      box(r, 4, r + 3, 4, row.paid, S.numBoxBottom, true);
      col4(5, row.applied);
      col4(6, row.after);
      box(r, 7, r + 3, 7, row.note, S.note);
      for (let k = 0; k < 4; k++) heights[r + k] = 15;
      r += 4;
    }
    put(r, 0, '', S.box); put(r, 1, '合　　　計', S.boxC); put(r, 2, '', S.box);
    put(r, 3, m.claimTotal, S.numBox, true); put(r, 4, m.paidTotal, S.numBox, true);
    put(r, 5, '', S.box); put(r, 6, '', S.box); put(r, 7, '', S.box);
    heights[r] = 20;
    return sh.xml([6, 30, 14, 13, 16, 18, 18, 24]);
  };

  // 配当加入等の状況表のシート（供託ごとに列を立てる）
  HT.buildStatusXml = function (m) {
    const s = m.status;
    const sh = Sheet();
    const { put, box, heights } = sh;
    const starts = [];
    let c0 = 2;
    s.cols.forEach((c) => { starts.push(c0); c0 += c.span; });
    const totalCol = c0;
    const anyDep = s.cols.some((c) => c.deps.length);
    const depRows = anyDep ? HT.STATUS_DEP_ROWS.filter(([, f]) => s.cols.some((c) => c.deps.some((d) => f(d)))) : [];
    box(1, 0, 1, totalCol, '配当加入等の状況表', S.title);
    heights[1] = 26;
    box(2, 0, 2, 1, '', S.box);
    s.cols.forEach((c, i) => box(2, starts[i], 2, starts[i] + c.span - 1, [c.mark, c.what].filter(Boolean).join('\n'), S.boxC));
    box(2, totalCol, 3 + depRows.length, totalCol, '合計（円）', S.boxC);
    heights[2] = s.cols.some((c) => c.what) ? 32 : 18;
    let r = 3;
    for (const [label, fn] of depRows) {
      box(r, 0, r, 1, label, S.headStack);
      s.cols.forEach((c, i) => {
        if (c.deps.length) c.deps.forEach((d, k) => put(r, starts[i] + k, fn(d), S.headStack));
        else box(r, starts[i], r, starts[i] + c.span - 1, '', S.box);
      });
      r++;
    }
    box(r, 0, r, 1, '配当原資（円）', S.headStack);
    s.cols.forEach((c, i) => box(r, starts[i], r, starts[i] + c.span - 1, c.amount, S.numBox, true));
    r++;
    for (const l of s.lines) {
      box(r, 0, r + 1, 0, `${l.payee}\n${l.label}`, S.box);
      put(r, 1, '請求債権', S.boxC); put(r + 1, 1, '配当額', S.boxC);
      l.cells.forEach((c, i) => {
        const a = starts[i], b = starts[i] + s.cols[i].span - 1;
        if (c) { box(r, a, r, b, c.claim, S.numBox, true); box(r + 1, a, r + 1, b, c.paid, S.numBox, true); }
        else { box(r, a, r, b, '×', S.boxC); box(r + 1, a, r + 1, b, '×', S.boxC); }
      });
      put(r, totalCol, '', S.box); put(r + 1, totalCol, l.total, S.numBox, true);
      heights[r] = 18; heights[r + 1] = 18;
      r += 2;
    }
    box(r, 0, r, 1, '剰余（債務者）', S.box);
    s.cols.forEach((c, i) => box(r, starts[i], r, starts[i] + c.span - 1, c.rest, S.numBox, true));
    put(r, totalCol, s.cols.reduce((a, c) => a + c.rest, 0), S.numBox, true);
    put(r + 2, 0, '×は、その部分に配当加入していないことを示す。請求債権は、その部分の配当を受ける前の残額（按分の基礎）である。', S.plain);
    return sh.xml([22, 9, ...Array(totalCol - 2).fill(13), 14]);
  };

  HT.buildXlsx = async function (result, JSZip) {
    const m = HT.tableModel(result);
    const sheets = [{ name: m.title, xml: HT.buildSheetXml(m) }];
    if (m.status) sheets.push({ name: '配当加入等の状況表', xml: HT.buildStatusXml(m) });
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
    zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map((s, i) => `<sheet name="${x(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`);
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
    zip.file('xl/styles.xml', STYLES);
    sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, s.xml));
    return zip;
  };
})(typeof window !== 'undefined' ? window : globalThis);
