/**
 * verify-statement.mjs — two checks for the payment statement:
 *
 *  A. PDF geometry. Bundles the REAL src/lib/pdf.js, spies on jsPDF's text
 *     calls while drawStatementPdf() runs with a worst-case transaction, and
 *     asserts every piece of text stays inside the A4 portrait margins
 *     (15mm .. 195mm on a 210mm page). The bug this guards against: the right
 *     column used to be drawn at x=195 LEFT-aligned, so Payment Date, the
 *     STATUS pill, Reference and Payment Method ran off the paper (~225mm) and
 *     overlapped/cut off in both preview and download.
 *
 *  B. Mobile layout. Renders the REAL ReceiptStatementPage in headless Chromium
 *     at 320px and 360px wide and asserts the Print / Download PDF / Delete
 *     button row does not overflow its container (it used to be a single
 *     non-wrapping row wider than a phone screen).
 *
 * Run:  npm run build && node scripts/verify-statement.mjs
 */
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'rolldown';
import puppeteer from 'puppeteer-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(here, '..');
const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium';

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ` [${extra}]` : ''}`);
  if (!cond) failures++;
};

const work = path.join(frontendDir, '.probe-statement');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const TX = {
  statement_no: 'LA-STMT-2026-000123',
  receipt_id: 'LA-RCPT-2026-000123',
  buyer: { name: 'Kwabena Nkrumah-Agyeman Mensah', email: 'kwabena.nkrumah.agyeman.mensah@example-verylongdomain.com' },
  created_at: '2026-10-05T14:04:45.000Z',
  reference: 'PSK-REF-8F2A1C4E9B7D6A3F5E2B1C4D',
  payment_method: 'mtn_mobile_money',
  provider: 'paystack',
  status: 'success',
  currency: 'GHS',
  original_amount: 12345.67,
  amount: 12345.67,
  discount_applied: 0,
  line_items: [{ title: 'Python for Data Science — Complete Certification Track (Beginner to Advanced)', amount: 12345.67 }],
};

// ── A. PDF geometry ──────────────────────────────────────────────────────────
{
  // html2canvas needs a DOM; the statement path never touches it, so stub it out
  // to let pdf.js import cleanly under Node.
  writeFileSync(path.join(work, 'html2canvas-stub.js'),
    'export default function html2canvas(){ throw new Error("html2canvas is not available in Node"); }\n');
  // jsPDF binds text/setFont/setFontSize onto each instance in its constructor,
  // so a prototype spy is shadowed. Wrap the constructor instead and re-point the
  // three methods after super() has bound them.
  writeFileSync(path.join(work, 'jspdf-spy.mjs'), `
    import { jsPDF as Base } from '${path.join(frontendDir, 'node_modules', 'jspdf', 'dist', 'jspdf.es.min.js').replace(/\\/g, '/')}';
    export const records = [];
    export const A4_PORTRAIT = { w: 210, h: 297 };
    export class jsPDF extends Base {
      constructor(...args) {
        super(...args);
        const t = this.text.bind(this), sf = this.setFont.bind(this), ss = this.setFontSize.bind(this);
        let size = 10, style = 'normal';
        this.setFontSize = (s) => { size = s; return ss(s); };
        this.setFont = (f, st) => { if (st) style = st; return sf(f, st); };
        this.text = (txt, x, y, opts) => {
          for (const line of (Array.isArray(txt) ? txt : [txt])) {
            const w = this.getTextWidth(String(line)) + (opts?.charSpace ? opts.charSpace * String(line).length : 0);
            const align = opts?.align || 'left';
            const start = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
            records.push({ text: String(line), start, end: start + w, align, size });
          }
          return t(txt, x, y, opts);
        };
      }
    }
  `);
  const spyPath = path.join(work, 'jspdf-spy.mjs');
  writeFileSync(path.join(work, 'pdf-entry.js'), `
    export { drawStatementPdf, A4_PORTRAIT } from '@/lib/pdf';
    export { records } from '${spyPath.replace(/\\/g, '/')}';
  `);
  const outFile = path.join(work, 'pdf-bundle.mjs');
  await build({
    input: path.join(work, 'pdf-entry.js'),
    output: { file: outFile, format: 'esm', codeSplitting: false },
    resolve: {
      alias: {
        '@': path.join(frontendDir, 'src'),
        'html2canvas-pro': path.join(work, 'html2canvas-stub.js'),
        jspdf: spyPath,
      },
    },
  });

  const { drawStatementPdf, A4_PORTRAIT, records } = await import(pathToFileURL(outFile).href);
  try {
    const doc = await drawStatementPdf(TX);
    const pw = A4_PORTRAIT.w;                 // 210
    const LEFT = 15, RIGHT = pw - 15;         // 15 .. 195
    const bad = records.filter((r) => r.end > RIGHT + 0.6 || r.start < LEFT - 0.6);
    check('statement PDF: text stays inside the page margins', records.length > 0 && bad.length === 0,
      bad.length ? bad.map((b) => `"${b.text.slice(0, 22)}" ${b.start.toFixed(1)}..${b.end.toFixed(1)}mm`).join('; ')
                 : `${records.length} text runs, all within ${LEFT}-${RIGHT}mm`);
    check('statement PDF: page is one A4 portrait page', doc.internal.getNumberOfPages() === 1, `${doc.internal.getNumberOfPages()} page`);
    const rightCol = records.filter((r) => r.align === 'right');
    check('statement PDF: right column is right-aligned at the margin',
      rightCol.length > 0 && rightCol.every((r) => Math.abs(r.end - RIGHT) < 0.6), `${rightCol.length} right-aligned runs`);
  } catch (e) {
    check('statement PDF: drawStatementPdf runs', false, e.message);
  }
}

// ── B. Mobile layout of the real page ────────────────────────────────────────
{
  const assets = path.join(frontendDir, 'dist', 'assets');
  if (!existsSync(assets)) {
    console.log('SKIP - statement mobile check (run `npm run build` first)');
  } else {
    const distCss = path.join(assets, readdirSync(assets).find((f) => f.endsWith('.css')));
    writeFileSync(path.join(work, 'entry.jsx'), `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { MemoryRouter, Routes, Route } from 'react-router-dom';
      import { ToastProvider } from '@/components/common/Toast';
      import ReceiptStatementPage from '@/pages/Receipts/ReceiptStatementPage';
      const tx = ${JSON.stringify(TX)};
      window.fetch = async () => ({ ok: true, json: async () => ({ transaction: tx }) });
      createRoot(document.getElementById('root')).render(
        <MemoryRouter initialEntries={['/receipts/${TX.receipt_id}']}>
          <ToastProvider>
            <Routes><Route path="/receipts/:tid" element={<ReceiptStatementPage />} /></Routes>
          </ToastProvider>
        </MemoryRouter>
      );
    `);
    await build({
      input: path.join(work, 'entry.jsx'),
      output: { file: path.join(work, 'bundle.js'), format: 'iife' },
      resolve: { alias: { '@': path.join(frontendDir, 'src') } },
      transform: { define: { 'import.meta.env': '({})', 'process.env.NODE_ENV': '"production"' } },
    });
    writeFileSync(path.join(work, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"/>
<link rel="stylesheet" href="./assets.css"/><style>html,body{margin:0;background:#fff}</style></head>
<body><div id="root"></div><script src="./bundle.js"></script></body></html>`);
    writeFileSync(path.join(work, 'assets.css'), readFileSync(distCss));

    const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
    try {
      for (const width of [320, 360]) {
        const page = await browser.newPage();
        await page.setViewport({ width, height: 800, deviceScaleFactor: 2 });
        page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
        await page.goto(pathToFileURL(path.join(work, 'index.html')).href, { waitUntil: 'networkidle0' });
        await new Promise((r) => setTimeout(r, 400));
        const res = await page.evaluate(() => {
          const label = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(t));
          const btns = ['Print', 'Download PDF', 'Delete'].map(label).filter(Boolean);
          if (btns.length < 3) return { ok: false, reason: 'buttons not found' };
          const group = btns[0].parentElement;
          const gr = group.getBoundingClientRect();
          const overflowRight = btns.filter((b) => b.getBoundingClientRect().right > gr.right + 0.5).length;
          const overflowLeft = btns.filter((b) => b.getBoundingClientRect().left < gr.left - 0.5).length;
          const docOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
          return { ok: true, groupWidth: gr.width, overflowRight, overflowLeft, docOverflow, vw: window.innerWidth };
        });
        if (!res.ok) { check(`statement page @${width}px: buttons render`, false, res.reason); continue; }
        check(`statement page @${width}px: buttons do not overflow their row`,
          res.overflowRight === 0 && res.overflowLeft === 0 && !res.docOverflow,
          `row ${res.groupWidth.toFixed(0)}px, right+${res.overflowRight} left+${res.overflowLeft}, docOverflow=${res.docOverflow}`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
}

rmSync(work, { recursive: true, force: true });

console.log(failures === 0 ? '\nALL STATEMENT CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
