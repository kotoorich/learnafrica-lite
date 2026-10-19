/**
 * verify-pdf.mjs — proves the PDF geometry requirements with the SAME code the
 * app uses (src/lib/pdf.js). Two layers:
 *
 *   1. The statement builder is pure JS, so it runs here in Node and its output
 *      is inspected with pdf-lib: portrait A4, paginates rather than clipping.
 *
 *   2. Certificates and badges are captured from the live DOM, which only
 *      exists in a browser. For those we bundle the real pdf.js with rolldown,
 *      load it in headless Chromium against the app's compiled CSS, and check
 *      the produced PDF is exactly one page and genuinely landscape. This is
 *      the automated guard for "the download matches the preview".
 *
 * Run:  node scripts/verify-pdf.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { build } from 'rolldown';
import puppeteer from 'puppeteer-core';
import { drawStatementPdf, A4_PORTRAIT } from '../src/lib/pdf.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(here, '..');

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ` [${extra}]` : ''}`);
  if (!cond) failures++;
};

const mm = (pt) => pt * 25.4 / 72;
const near = (a, b, tol = 1.0) => Math.abs(a - b) <= tol;

async function loadPdf(bytes) {
  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPages();
  return { count: pages.length, boxes: pages.map((p) => p.getMediaBox()) };
}

// ── 1. Statement: portrait, paginates for many courses ───────────────────────
const baseTx = {
  receipt_id: 'LA-RCPT-AAAA-0001',
  statement_no: 'LA-STMT-AAAA-0001',
  status: 'success',
  created_at: '2026-10-05T14:04:45Z',
  currency: 'GHS',
  amount: 80,
  original_amount: 100,
  discount_applied: 20,
  coupon_code: 'SAVE10',
  payment_method: 'mtn_momo',
  reference: 'PSK-REF-1',
  buyer: { name: 'Ama Mensah', email: 'ama@example.com' },
  line_items: [{ title: 'Python for Data Science', amount: 100 }],
};

let info = await loadPdf((await drawStatementPdf(baseTx)).output('arraybuffer'));
check('statement is portrait (height > width)', info.boxes[0].height > info.boxes[0].width,
  `${mm(info.boxes[0].width).toFixed(1)}x${mm(info.boxes[0].height).toFixed(1)}mm`);
check('statement page is A4 portrait (210x297mm)',
  near(mm(info.boxes[0].width), A4_PORTRAIT.w) && near(mm(info.boxes[0].height), A4_PORTRAIT.h));

const manyCourses = Array.from({ length: 14 }, (_, i) => ({
  title: `Course number ${i + 1} with a deliberately long descriptive title`,
  amount: 25 + i,
}));
info = await loadPdf((await drawStatementPdf({ ...baseTx, line_items: manyCourses })).output('arraybuffer'));
check('a many-course statement paginates rather than clipping', info.count > 1, `${info.count} pages`);
check('every statement page is portrait', info.boxes.every((b) => b.height > b.width));

info = await loadPdf((await drawStatementPdf({ ...baseTx, status: 'pending' })).output('arraybuffer'));
check('a pending statement renders as one portrait page', info.count === 1 && info.boxes[0].height > info.boxes[0].width);

// ── 2. Certificate / badge: captured from the real DOM in a browser ──────────
const distCss = (() => {
  const assets = path.join(frontendDir, 'dist', 'assets');
  if (!existsSync(assets)) return null;
  const css = readdirSync(assets).find((f) => f.endsWith('.css'));
  return css ? path.join(assets, css) : null;
})();

const CHROME = process.env.CHROME_PATH || '/usr/bin/chromium';

if (!distCss) {
  console.log('SKIP - certificate/badge capture checks (run `npm run build` first)');
} else {
  const work = path.join(frontendDir, '.probe');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  await build({
    input: path.join(here, 'capture-entry.js'),
    output: { file: path.join(work, 'capture.bundle.js'), format: 'iife' },
  });

  // A page that loads the app's compiled CSS, renders a certificate-like and a
  // badge-like node at the real design sizes (inside a ScaleToFit-shaped
  // overflow-hidden + transform wrapper), and exposes the bundled capture.
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
<link rel="stylesheet" href="./assets.css"/><style>html,body{margin:0;background:#fff}</style></head>
<body>
<div class="outer" style="width:450px;height:318px;overflow:hidden;position:relative">
  <div class="scaled" id="cert-wrap" style="width:900px;height:636px;transform:scale(0.5);transform-origin:top left">
    <div id="cert" class="text-primary" style="width:900px;height:636px;background:#fff;border:6px double #0f172a;box-sizing:border-box">
      <p style="font-size:44px;font-family:Georgia,serif;color:#0f4d34;padding:40px">Certificate of Completion</p>
      <svg viewBox="0 0 200 200" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
        <defs><radialGradient id="g"><stop offset="0%" stop-color="#fff"/><stop offset="100%" stop-color="#e6f3ea"/></radialGradient>
        <path id="arc" d="M 25 100 A 75 75 0 0 1 175 100"/></defs>
        <polygon points="100,0 106,12 100,24 94,12" fill="#c9a227" stroke="#0f4d34"/>
        <circle cx="100" cy="100" r="88" fill="#0f4d34"/>
        <circle cx="100" cy="100" r="67" fill="url(#g)" stroke="#0f4d34" stroke-width="2"/>
        <text font-family="Georgia,serif" font-size="12" fill="#f7fbf8"><textPath href="#arc" startOffset="50%" text-anchor="middle">LEARNAFRICA LITE</textPath></text>
      </svg>
    </div>
  </div>
</div>
<div class="outer" style="width:350px;height:248px;overflow:hidden;position:relative">
  <div class="scaled" id="badge-wrap" style="width:700px;height:495px;transform:scale(0.5);transform-origin:top left">
    <div id="badge" style="width:700px;height:495px;background:linear-gradient(135deg,#0B3D2E 0%,#10B981 100%)">
      <p style="color:#fcd34d;font-size:40px;font-family:Georgia,serif;padding:40px">Course Champion</p>
    </div>
  </div>
</div>
<script src="./capture.bundle.js"></script>
<script>
window.__run = async (id) => {
  const el = document.getElementById(id);
  const doc = await window.__LA__.drawCapturedDocument({ element: el, orientation: 'landscape', marginMm: 0, scale: 2 });
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const wrap = document.getElementById(id + '-wrap');
  return { pdf: btoa(bin), transformAfter: wrap ? wrap.style.transform : 'n/a' };
};
</script>
</body></html>`;

  writeFileSync(path.join(work, 'index.html'), html);
  writeFileSync(path.join(work, 'assets.css'), readFileSync(distCss));

  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(work, 'index.html')).href, { waitUntil: 'load' });

    for (const [label, id] of [['certificate', 'cert'], ['badge', 'badge']]) {
      const res = await page.evaluate((i) => window.__run(i), id);
      const bytes = Buffer.from(res.pdf, 'base64');
      const gi = await loadPdf(bytes);
      check(`${label} capture is exactly one page`, gi.count === 1, gi.count);
      check(`${label} capture is landscape (297x210mm)`,
        near(mm(gi.boxes[0].width), 297) && near(mm(gi.boxes[0].height), 210),
        `${mm(gi.boxes[0].width).toFixed(1)}x${mm(gi.boxes[0].height).toFixed(1)}mm`);
      check(`${label} capture is genuinely landscape`, gi.boxes[0].width > gi.boxes[0].height);
      check(`${label} capture is non-blank`, bytes.length > 5000, `${bytes.length} bytes`);
      check(`${label} preview transform is restored after capture`, res.transformAfter.includes('scale'), res.transformAfter);
    }
  } finally {
    if (browser) await browser.close();
    rmSync(work, { recursive: true, force: true });
  }
}

console.log();
if (failures) {
  console.log(`${failures} CHECK(S) FAILED`);
  process.exit(1);
}
console.log('ALL PDF CHECKS PASSED');
