/**
 * verify-documents.mjs — renders the REAL CertificateDocument and BadgeDocument
 * (not stand-ins) at their true design sizes in headless Chromium, and asserts
 * that the verification block — the QR, the certificate/badge ID and the public
 * verify URL — is actually inside the fixed-size document box and visible.
 *
 * Why this exists: the certificate box is a fixed 900x636 with `overflow:hidden`.
 * The verification block is the LAST child, so if the content above it is even
 * slightly too tall the block is silently clipped away — the ID and URL render
 * but the QR never appears. verify-pdf.mjs cannot catch that because it builds a
 * throwaway DOM; this one measures the shipping components.
 *
 * Run:  npm run build && node scripts/verify-documents.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
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

const assets = path.join(frontendDir, 'dist', 'assets');
if (!existsSync(assets)) {
  console.log('SKIP - document checks (run `npm run build` first)');
  process.exit(0);
}
const distCss = path.join(assets, readdirSync(assets).find((f) => f.endsWith('.css')));

const work = path.join(frontendDir, '.probe-docs');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

writeFileSync(path.join(work, 'entry.jsx'), `
import React from 'react';
import { createRoot } from 'react-dom/client';
import html2canvas from 'html2canvas-pro';
import { CertificateDocument } from '@/pages/Certificate/CertificatePage';
import { BadgeDocument } from '@/pages/Dashboard/StudentDashboard';

// A real signature-shaped PNG drawn at runtime, so image-mode rendering can be
// measured (dimensions + presence) without shipping a binary fixture.
const SIGNATURE_PNG = (() => {
  const c = document.createElement('canvas');
  c.width = 200; c.height = 60;
  const x = c.getContext('2d');
  x.strokeStyle = '#0f172a'; x.lineWidth = 3; x.beginPath();
  x.moveTo(10, 45); x.bezierCurveTo(40, 5, 70, 55, 100, 25);
  x.bezierCurveTo(130, 0, 160, 50, 190, 20); x.stroke();
  return c.toDataURL('image/png');
})();

const certData = {
  certificateId: 'LA-CERT-373C40DC',
  certificateName: 'Ama Mensah',
  userName: 'Ama Mensah',
  courseName: 'Python for Data Science',
  instructorName: 'Kwame Boateng',
  completionDate: '5 October 2026',
  signatory: { name: 'Dr. Test Signatory', role: 'Authorized Signatory', text: 'T. Sign', mode: 'text', image: '', configured: true },
};
// Image-mode variant: the signature is an uploaded image and the cursive text
// must NOT be shown in its place.
const certImageData = {
  ...certData,
  signatory: { name: 'Dr. Test Signatory', role: 'Authorized Signatory', text: 'T. Sign',
               mode: 'image', image: SIGNATURE_PNG, configured: true },
};
const badge = { key: 'FIRST_STEPS', iconName: 'Award', color: 'emerald', title: 'First Steps', earned: true, currentProgress: 1, goal: 1 };

function App() {
  return (
    <>
      <div id="host-cert"><CertificateDocument data={certData} displayName="Ama Mensah" /></div>
      <div id="host-cert-image"><CertificateDocument data={certImageData} displayName="Ama Mensah" id="certificate-content-image" /></div>
      <div id="host-badge"><BadgeDocument badge={badge} displayName="Ama Mensah" badgeId="LA-BADGE-FIRS-AC9FC8" /></div>
    </>
  );
}
createRoot(document.getElementById('root')).render(<App />);

// Rasterise the REAL document exactly as the PDF download does, then report how
// many dark pixels fall inside the QR's box. If the QR were clipped, that count
// would be ~0. This proves the QR is in the download, not just the DOM.
window.__rasterQr = async (sel) => {
  const el = document.querySelector(sel);
  const qr = el.querySelector('a[href*="verify-section"] svg');
  const r = el.getBoundingClientRect();
  const qrRect = qr.getBoundingClientRect();
  const canvas = await html2canvas(el, { backgroundColor: '#ffffff', scale: 1, useCORS: true, logging: false });
  const ctx = canvas.getContext('2d');
  const sx = Math.round(qrRect.left - r.left), sy = Math.round(qrRect.top - r.top);
  const sw = Math.round(qrRect.width), sh = Math.round(qrRect.height);
  const data = ctx.getImageData(sx, sy, sw, sh).data;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 120 && data[i + 1] < 120 && data[i + 2] < 120) dark++;
  }
  return { dark, total: (sw * sh), box: { sx, sy, sw, sh } };
};
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
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(pathToFileURL(path.join(work, 'index.html')).href, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 400));

  const result = await page.evaluate(async () => {
    const out = {};
    const raster = {};
    for (const [name, sel] of [['certificate', '#certificate-content'], ['certificate-image', '#certificate-content-image'], ['badge', '#badge-content']]) {
      raster[name] = await window.__rasterQr(sel);
    }
    for (const [name, sel] of [['certificate', '#certificate-content'], ['certificate-image', '#certificate-content-image'], ['badge', '#badge-content']]) {
      const el = document.querySelector(sel);
      if (!el) { out[name] = { found: false }; continue; }
      const r = el.getBoundingClientRect();
      const qr = el.querySelector('a[href*="verify-section"] svg');
      const qrRect = qr ? qr.getBoundingClientRect() : null;
      // The block that carries the ID + verify URL (the last flex row).
      const block = [...el.querySelectorAll('div')].find((d) => /Verify at|Verify/.test(d.textContent) && d.querySelector('svg')) || null;
      const blockRect = block ? block.getBoundingClientRect() : null;
      out[name] = {
        found: true,
        boxH: Math.round(r.height),
        clippedBy: Math.round(el.scrollHeight - el.clientHeight),
        overflow: getComputedStyle(el).overflow,
        hasVerifyText: /Verify at/.test(el.textContent) && /ID:?\s*LA-/.test(el.textContent),
        // Signatory checks (certificate only): the authorised signatory must be
        // present and the course instructor must NOT appear anywhere.
        hasSignatory: name === 'certificate'
          ? (/Authorized Signatory/.test(el.textContent) && /Dr\. Test Signatory/.test(el.textContent))
          : true,
        hasInstructor: name === 'certificate' ? /Kwame Boateng/.test(el.textContent) : false,
        // Text mode: the handwritten-style line shows the signature TEXT
        // ("T. Sign"), independently of the display name.
        hasSignatureText: name === 'certificate'
          ? (/T\. Sign/.test(el.querySelector('.font-signature')?.textContent || ''))
          : true,
        hasSignatureFont: name === 'certificate'
          ? (() => {
              const s = el.querySelector('.font-signature');
              if (!s) return false;
              const ff = getComputedStyle(s).fontFamily || '';
              return /Dancing Script/.test(ff) && s.getBoundingClientRect().width > 0;
            })()
          : true,
        // Image mode: an <img> signature is shown and the cursive text is gone.
        signatureImage: (name === 'certificate' || name === 'certificate-image')
          ? (() => {
              const img = el.querySelector('[data-cert-signature-image]');
              if (!img) return { present: false };
              const r2 = img.getBoundingClientRect();
              const line = el.querySelector('[data-cert-signature-line]');
              const lineRect = line.getBoundingClientRect();
              const nameEl = el.querySelector('[data-cert-signatory-name]');
              const nameTop = nameEl ? nameEl.getBoundingClientRect().top : null;
              return { present: true, w: Math.round(r2.width), h: Math.round(r2.height),
                       natW: img.naturalWidth, natH: img.naturalHeight,
                       bottom: Math.round(r2.bottom), nameTop: nameTop != null ? Math.round(nameTop) : null,
                       overlapsName: nameTop != null ? r2.bottom > nameTop + 0.5 : false,
                       withinLine: r2.top >= lineRect.top - 0.5 && r2.bottom <= lineRect.bottom + 0.5,
                       insideBox: r2.top >= r.top - 0.5 && r2.bottom <= r.bottom + 0.5 && r2.left >= r.left - 0.5 && r2.right <= r.right + 0.5 };
            })()
          : null,
        // Layout order: the signature (text or image) sits ON the rule, with the
        // printed display name BELOW the rule and the designation below that —
        // matching how the Date Issued column is laid out.
        signatoryOrder: name === 'certificate'
          ? (() => {
              const line = el.querySelector('[data-cert-signature-line]');
              const text = el.querySelector('[data-cert-signature-text]');
              const nameEl = el.querySelector('[data-cert-signatory-name]');
              const roleEl = el.querySelector('[data-cert-signatory-role]');
              if (!line || !text || !nameEl || !roleEl) return { complete: false };
              const lr = line.getBoundingClientRect();
              const tr = text.getBoundingClientRect();
              const nr = nameEl.getBoundingClientRect();
              const rr = roleEl.getBoundingClientRect();
              return {
                complete: true,
                signatureAboveRule: tr.bottom <= lr.bottom + 1,
                nameBelowRule: nr.top >= lr.bottom - 1,
                roleBelowName: rr.top >= nr.bottom - 1,
                nameBelowSignature: nr.top >= tr.bottom - 1,
              };
            })()
          : null,
        showsCursiveTextInImageMode: name === 'certificate-image'
          ? !!el.querySelector('.font-signature')
          : null,
        qr: qrRect ? {
          w: Math.round(qrRect.width),
          fullyInside: qrRect.top >= r.top - 0.5 && qrRect.bottom <= r.bottom + 0.5 && qrRect.left >= r.left - 0.5 && qrRect.right <= r.right + 0.5,
        } : null,
        block: blockRect ? {
          top: Math.round(blockRect.top - r.top),
          bottom: Math.round(blockRect.bottom - r.top),
          fullyInside: blockRect.bottom <= r.bottom + 0.5,
        } : null,
        raster: raster[name],
      };
    }
    return out;
  });

  for (const name of ['certificate', 'certificate-image', 'badge']) {
    const d = result[name];
    check(`${name}: document rendered`, d.found);
    if (!d.found) continue;
    // scrollHeight can exceed the box because of decorative elements that are
    // MEANT to bleed past the edge (the badge's corner rings). The invariant we
    // actually care about is that the verification block and its QR — the last
    // content in the document — are inside the box, never clipped away.
    check(`${name}: verification block is fully inside the document`, !!d.block && d.block.fullyInside,
      d.block ? `block ${d.block.top}-${d.block.bottom} of ${d.boxH} (overflow ${d.clippedBy}px)` : 'no block');
    check(`${name}: QR image is present`, !!d.qr);
    check(`${name}: QR image is fully inside the document`, !!d.qr && d.qr.fullyInside, d.qr ? `${d.qr.w}px` : '');
    check(`${name}: ID + verify URL are rendered`, d.hasVerifyText);
    if (name === 'certificate') {
      check('certificate: authorised signatory name + role are rendered', d.hasSignatory);
      check('certificate: course instructor name is NOT shown', !d.hasInstructor);
      check('certificate: signature uses the cursive font', d.hasSignatureFont);
      check('certificate (text mode): cursive line shows the signature text "T. Sign"', d.hasSignatureText);
      const o = d.signatoryOrder || {};
      check('certificate: signature sits on the rule (above it)', o.complete && o.signatureAboveRule === true, JSON.stringify(o));
      check('certificate: display name is below the rule', o.complete && o.nameBelowRule === true, JSON.stringify(o));
      check('certificate: designation is below the name', o.complete && o.roleBelowName === true, JSON.stringify(o));
      check('certificate: name is below the signature', o.complete && o.nameBelowSignature === true, JSON.stringify(o));
    }
    if (name === 'certificate-image') {
      const img = d.signatureImage || {};
      check('certificate (image mode): the signature image is rendered', img.present === true, JSON.stringify(img));
      check('certificate (image mode): the image keeps its aspect ratio',
        img.present && img.natW > 0 && img.natH > 0 && Math.abs((img.w / img.h) - (img.natW / img.natH)) < 0.15,
        img.present ? `${img.w}x${img.h} from ${img.natW}x${img.natH}` : 'no image');
      check('certificate (image mode): the cursive text is NOT shown in its place',
        d.showsCursiveTextInImageMode === false);
      check('certificate (image mode): the image does not overlap the display name',
        img.present && img.overlapsName === false, `imgBottom=${img.bottom} nameTop=${img.nameTop}`);
      check('certificate (image mode): the image stays inside the document',
        img.present && img.insideBox === true);
      check('certificate (image mode): the image sits on the rule, above the name',
        img.present && img.withinLine === true && img.overlapsName === false,
        `withinLine=${img.withinLine} overlapsName=${img.overlapsName}`);
    }
    // The strongest check: rasterise the real document the way the PDF download
    // does and confirm the QR's dark modules actually appear in that region.
    const r = d.raster || {};
    check(`${name}: QR is present in the rendered download image`,
      typeof r.dark === 'number' && r.dark > r.total * 0.05,
      `${r.dark}/${r.total} dark px in QR box`);
  }
} finally {
  await browser.close();
  rmSync(work, { recursive: true, force: true });
}

console.log();
if (failures) {
  console.log(`${failures} CHECK(S) FAILED`);
  process.exit(1);
}
console.log('ALL DOCUMENT CHECKS PASSED');
