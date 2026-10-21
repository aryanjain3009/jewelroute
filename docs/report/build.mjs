#!/usr/bin/env node
/**
 * Builds the JewelRoute FE ↔ BE integration report: report.html → PDF.
 *
 *   PW_DIR=/path/with/node_modules/playwright \
 *   MERMAID_JS=/path/to/node_modules/mermaid/dist/mermaid.min.js \
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
 *   OUT=/mnt/user-data/outputs/JewelRoute-FE-BE-Integration-Report.pdf \
 *   node docs/report/build.mjs
 *
 * Steps: load the HTML in headless Chromium, render every <script type="text/plain" class="mmd">
 * with Mermaid into an inline SVG, print a first PDF, find the page of every heading with
 * `pdftotext` (poppler), write those numbers into the table of contents, print the final PDF.
 * Requires: playwright (Chromium), mermaid@11, poppler-utils (pdftotext).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(process.env.PW_DIR ? path.join(process.env.PW_DIR, 'package.json') : import.meta.url);
const { chromium } = req('playwright');
const MERMAID_JS = process.env.MERMAID_JS ?? createRequire(import.meta.url).resolve('mermaid/dist/mermaid.min.js');
const OUT = process.env.OUT ?? path.join(here, 'JewelRoute-FE-BE-Integration-Report.pdf');
const HTML = path.join(here, 'report.html');
const TITLE = 'JewelRoute · Frontend ↔ Backend Integration Report';
const DATE = '21 Oct 2026';

if (!existsSync(MERMAID_JS)) throw new Error(`Mermaid bundle not found at ${MERMAID_JS} (set MERMAID_JS)`);

const font = "font-family: Inter, system-ui, sans-serif; font-size: 7.4pt; color: #74767c;";
const headerTemplate = `<div style="${font} width:100%; padding: 0 16mm; display:flex; justify-content:space-between;">
  <span>${TITLE}</span><span>${DATE}</span></div>`;
const footerTemplate = `<div style="${font} width:100%; padding: 0 16mm; display:flex; justify-content:space-between;">
  <span>Source: jewelroute working tree (7e34424)</span>
  <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;

const pdfOpts = { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate, footerTemplate };

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
  await page.goto(pathToFileURL(HTML).href, { waitUntil: 'load' });
  await page.addScriptTag({ path: MERMAID_JS });
  await page.evaluate(() => document.fonts.ready);

  // 1. Mermaid → inline SVG (grayscale "base" theme, Inter).
  const rendered = await page.evaluate(async () => {
    const m = window.mermaid;
    m.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      fontFamily: 'Inter, system-ui, sans-serif',
      themeVariables: {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '14px',
        primaryColor: '#ffffff',
        primaryBorderColor: '#3b3c40',
        primaryTextColor: '#17181a',
        secondaryColor: '#f4f3f0',
        tertiaryColor: '#faf9f7',
        lineColor: '#55575c',
        clusterBkg: '#faf9f7',
        clusterBorder: '#c9c7c2',
        edgeLabelBackground: '#ffffff',
        noteBkgColor: '#f4f3f0',
        noteBorderColor: '#c9c7c2',
        actorBkg: '#ffffff',
        actorBorder: '#3b3c40',
        signalColor: '#3b3c40',
        labelBoxBkgColor: '#f4f3f0',
        activationBkgColor: '#f4f3f0',
      },
      flowchart: { htmlLabels: true, curve: 'basis', padding: 6, nodeSpacing: 26, rankSpacing: 26, diagramPadding: 4, useMaxWidth: true },
      stateDiagram: { useMaxWidth: true },
      sequence: { useMaxWidth: true, mirrorActors: false, width: 118, actorMargin: 28, wrap: false, messageFontSize: 12, actorFontSize: 12.5, noteFontSize: 11.5, boxMargin: 4, messageMargin: 12 },
      er: { useMaxWidth: true },
    });
    const out = [];
    for (const s of [...document.querySelectorAll('script.mmd')]) {
      const id = s.dataset.id;
      try {
        const { svg } = await m.render(`${id}-svg`, s.textContent.trim());
        const wrap = document.createElement('div');
        wrap.className = 'svgwrap';
        wrap.innerHTML = svg;
        s.replaceWith(wrap);
        out.push({ id, ok: true });
      } catch (e) {
        out.push({ id, ok: false, error: String(e?.message ?? e) });
      }
    }
    // Readable on paper: cap very tall diagrams to one page body.
    for (const svg of document.querySelectorAll('.svgwrap svg')) {
      svg.removeAttribute('height');
      svg.style.maxWidth = '100%';
      svg.style.height = 'auto';
    }
    return out;
  });
  const failed = rendered.filter((r) => !r.ok);
  if (failed.length) throw new Error(`Mermaid failed: ${JSON.stringify(failed, null, 2)}`);
  console.log(`diagrams rendered: ${rendered.map((r) => r.id).join(', ')}`);

  // 2. Fit tall diagrams: limit height per figure (portrait body ≈ 240 mm, landscape ≈ 160 mm).
  await page.evaluate(() => {
    const mm = 96 / 25.4;
    for (const f of document.querySelectorAll('figure')) {
      const wide = !!f.closest('.wide');
      const svg = f.querySelector('svg');
      if (!svg) continue;
      const maxH = (Number(f.dataset.maxh) || (wide ? 150 : 205)) * mm;
      const maxW = (wide ? 265 : 178) * mm;
      const vb = svg.viewBox.baseVal;
      const w = vb && vb.width ? vb.width : svg.getBBox().width;
      const h = vb && vb.height ? vb.height : svg.getBBox().height;
      const scale = Math.min(1.15, maxW / w, maxH / h);
      svg.style.width = `${Math.round(w * scale)}px`;
      svg.style.height = `${Math.round(h * scale)}px`;
      svg.style.maxWidth = '100%';
      svg.style.maxHeight = 'none';
      f.dataset.scale = scale.toFixed(2);
      f.dataset.nat = `${Math.round(w)}x${Math.round(h)}`;
    }
  });
  console.log('diagram scale (natural px → print scale):');
  for (const r of await page.evaluate(() => [...document.querySelectorAll('figure')].map((f) => `${f.querySelector('.svgwrap svg')?.id ?? '?'} ${f.dataset.nat} ×${f.dataset.scale}`))) console.log('  ' + r);

  // 3. Build the TOC skeleton from headings with data-toc.
  await page.evaluate(() => {
    const list = document.getElementById('toc-list');
    let n = 0;
    for (const h of document.querySelectorAll('h3[data-toc]')) {
      if (h.querySelector('.num')) continue;
      const s = document.createElement('span');
      s.className = 'num';
      s.textContent = h.dataset.toc;
      h.prepend(s);
    }
    for (const h of document.querySelectorAll('h2[data-toc], h3[data-toc]')) {
      const id = h.id || `h-${(h.dataset.toc || String(++n)).replace(/\./g, '-')}`;
      h.id = id;
      const text = [...h.childNodes].filter((c) => !(c.nodeType === 1 && c.classList.contains('num'))).map((c) => c.textContent).join('').trim();
      const li = document.createElement('li');
      li.className = h.tagName === 'H2' ? 'l1' : 'l2';
      li.innerHTML = `<a href="#${id}"><span class="tn">${h.dataset.toc}</span>${text}</a><span class="dots"></span><span class="pg" data-for="${id}">00</span>`;
      list.appendChild(li);
    }
  });

  const headings = await page.evaluate(() =>
    [...document.querySelectorAll('h2[data-toc], h3[data-toc]')].map((h) => ({
      id: h.id,
      num: h.dataset.toc,
      text: [...h.childNodes].filter((c) => !(c.nodeType === 1 && c.classList.contains('num'))).map((c) => c.textContent).join('').trim(),
    })),
  );

  // 4. First pass → locate headings.
  const tmp = mkdtempSync(path.join(tmpdir(), 'jr-report-'));
  const first = path.join(tmp, 'pass1.pdf');
  await page.pdf({ ...pdfOpts, path: first });
  const pages = execFileSync('pdftotext', ['-layout', first, '-'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8').split('\f');
  const norm = (s) => s.replace(/[‐-―]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
  const tocEnd = pages.findIndex((p, i) => i > 1 && /1\s+Summary/.test(p) && !/Contents/.test(p));
  const start = tocEnd > 0 ? tocEnd : 2;
  const found = {};
  for (const h of headings) {
    const needle = norm(`${h.num} ${h.text}`).slice(0, 34);
    const needle2 = norm(h.text).slice(0, 30);
    let pg = -1;
    for (let i = start; i < pages.length && pg < 0; i++) {
      const lines = pages[i].split('\n').map(norm);
      if (lines.some((l) => l.includes(needle) || (l.startsWith(norm(h.num)) && l.includes(needle2)))) pg = i + 1;
    }
    found[h.id] = pg;
  }
  const missing = headings.filter((h) => found[h.id] < 0);
  if (missing.length) console.warn(`headings not located: ${missing.map((m) => m.num).join(', ')}`);

  await page.evaluate((map) => {
    for (const el of document.querySelectorAll('.pg[data-for]')) {
      const v = map[el.dataset.for];
      el.textContent = v > 0 ? String(v) : '';
    }
  }, found);

  // 5. Final PDF.
  await page.pdf({ ...pdfOpts, path: OUT });
  writeFileSync(path.join(tmp, 'toc.json'), JSON.stringify(found, null, 2));
  await browser.close();
  const info = execFileSync('pdfinfo', [OUT]).toString();
  console.log(`wrote ${OUT}\n${info.split('\n').filter((l) => /Pages|Page size/.test(l)).join('\n')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
