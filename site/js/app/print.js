// 印刷用のページ組み
// ブラウザのヘッダ・フッタ（URL・日時等）を出さないため、@page の余白を0にし、ページの区切りをここで決める。
// 行の高さを印刷と同じ体裁（.pp）で測って A4 横に詰め、ページ番号（開始番号を指定できる）と、
// 2ページ目以降の列の見出しを付けるかどうかを選べるようにする。
(function (g) {
  'use strict';
  const HT = (g.HT = g.HT || {});

  // 用紙と余白（mm）。CSS の .pp-page と合わせる
  const PAGE_H = 210, MARGIN = 12, FOOT = 8, SLACK = 3;

  HT.buildPrintPages = function (target, html, opts) {
    const o = Object.assign({ pageNo: true, start: 1, heading: true }, opts || {});
    const doc = target.ownerDocument;
    const meas = doc.createElement('div');
    meas.className = 'pp pp-measure';
    meas.innerHTML = html + '<div class="pp-mm"></div>';
    doc.body.appendChild(meas);
    try {
      const mm = meas.querySelector('.pp-mm').getBoundingClientRect().height / 100; // 100mm の高さから 1mm の px を出す
      const avail = (PAGE_H - MARGIN * 2 - FOOT - SLACK) * mm;
      const h = (el) => el.getBoundingClientRect().height;
      const outer = (el) => { const cs = g.getComputedStyle(el); return h(el) + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom); };

      // 区切りの単位（一緒に置く行のまとまり）を組み立てる
      const sections = [];
      const prov = meas.querySelector(':scope > .ht-prov');
      const main = meas.querySelector(':scope > table.ht-sheet');
      if (main) {
        const rows = [...main.rows];
        const top = rows.filter((r) => !r.classList.contains('ht-colhead') && r.parentElement.tagName === 'THEAD');
        const head = rows.filter((r) => r.classList.contains('ht-colhead'));
        const body = rows.filter((r) => r.parentElement.tagName === 'TBODY');
        const units = [];
        body.forEach((r) => { // 合計の行だけが次のページに送られないよう、最後の債権者の行と一緒に置く
          if (r.classList.contains('ht-total') && units.length) units[units.length - 1].push(r); else units.push([r]);
        });
        sections.push({ table: main, lead: prov ? [prov] : [], top, head, units, tail: [] });
      }
      const st = meas.querySelector(':scope > .ht-status');
      if (st) {
        const tbl = st.querySelector('table');
        const rows = [...tbl.rows];
        const head = rows.filter((r) => r.classList.contains('ht-sthead'));
        const units = [];
        rows.filter((r) => !r.classList.contains('ht-sthead')).forEach((r) => {
          if (r.classList.contains('ht-stline2') && units.length) units[units.length - 1].push(r); else units.push([r]);
        });
        sections.push({ table: tbl, lead: [st.querySelector('h3')].filter(Boolean), top: [], head, units, tail: [...st.querySelectorAll(':scope > p')], newPage: true });
      }

      // ページに割り付ける
      const pages = [];
      let cur = null;
      const newPage = () => { cur = { blocks: [], used: 0 }; pages.push(cur); };
      const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
      sections.forEach((sec) => {
        if (!cur || sec.newPage) newPage();
        const headH = sum(sec.head, h);
        let blk = { sec, lead: sec.lead, rows: [...sec.top, ...sec.head], tail: [] };
        cur.blocks.push(blk);
        cur.used += sum(sec.lead, outer) + sum(sec.top, h) + headH;
        sec.units.forEach((u) => {
          const uh = sum(u, h);
          const hasBody = blk.rows.length > sec.top.length + sec.head.length;
          if (cur.used + uh > avail && hasBody) {
            newPage();
            blk = { sec, lead: [], rows: o.heading ? [...sec.head] : [], tail: [] };
            cur.blocks.push(blk);
            cur.used = o.heading ? headH : 0;
          }
          blk.rows.push(...u);
          cur.used += uh;
        });
        sec.tail.forEach((t) => {
          const th = outer(t);
          if (cur.used + th > avail) { newPage(); blk = { sec, lead: [], rows: [], tail: [] }; cur.blocks.push(blk); cur.used = 0; }
          blk.tail.push(t);
          cur.used += th;
        });
      });

      // 組み上げる
      const colgroup = (t) => { const c = t.querySelector('colgroup'); return c ? c.outerHTML : ''; };
      const start = Math.max(1, Math.floor(Number(o.start) || 1));
      target.innerHTML = pages.map((p, i) => `<section class="pp-page"><div class="pp-body">${p.blocks.map((b) => `${b.lead.map((e) => e.outerHTML).join('')}${b.rows.length ? `<table class="${b.sec.table.className}">${colgroup(b.sec.table)}<tbody>${b.rows.map((r) => r.outerHTML).join('')}</tbody></table>` : ''}${b.tail.map((e) => e.outerHTML).join('')}`).join('')}</div>${o.pageNo ? `<div class="pp-no">- ${start + i} -</div>` : ''}</section>`).join('');
      return pages.length;
    } finally {
      meas.remove();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
