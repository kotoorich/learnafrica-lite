/**
 * pdf.js — real, downloadable PDF documents for certificates, badges and
 * payment statements.
 *
 * Certificates and badges are captured from the SAME on-screen DOM the user
 * previews (via html2canvas-pro), so the downloaded file is pixel-identical to
 * the preview — including the seal, the QR code and the exact typography.
 * html2canvas-pro is used rather than html2canvas because the app's theme is
 * authored in CSS `oklch()` colour, which the original html2canvas cannot parse
 * (it throws "unsupported color function oklch").
 *
 * The captured image is placed on a fixed A4 page, so the geometry the brief
 * asks for is guaranteed by construction:
 *   - landscape for certificates and badges (the page box is 297x210mm), and
 *   - exactly one page (a single image is drawn and no page is ever added).
 *
 * Payment statements are tables, so they are drawn as real vector text with
 * jsPDF instead — crisper, selectable, and able to paginate cleanly. The
 * statement builder and the small drawing helpers are pure JS with no DOM
 * access, so they also run in Node (used by scripts/verify-pdf.mjs).
 */
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { formatMoney } from './money.js';

// ── Page geometry (mm) ───────────────────────────────────────────────────────
export const A4_LANDSCAPE = { w: 297, h: 210 };
export const A4_PORTRAIT = { w: 210, h: 297 };

// ── Brand palette ────────────────────────────────────────────────────────────
const BRAND = {
  deepGreen: [11, 61, 46],      // #0B3D2E
  emerald:   [16, 185, 129],    // #10B981
  gold:      [212, 175, 55],    // #D4AF37
  goldSoft:  [233, 212, 148],   // #E9D494
  ink:       [17, 24, 39],      // #111827
  slate:     [71, 85, 105],     // #475569
  slateLite: [148, 163, 184],   // #94A3B8
  line:      [203, 213, 225],   // #CBD5E1
  white:     [255, 255, 255],
  paper:     [252, 252, 250],
};

const SANS = 'helvetica';

// ── DOM capture (certificate / badge) ────────────────────────────────────────
//
// The on-screen preview and the download must be the SAME thing, so the PDF is
// built from a capture of the very node the user is looking at, rather than
// from a second, hand-drawn copy that could silently drift. html2canvas-pro
// walks the live DOM and inlines the computed styles; a few things still need
// help before it runs:
//
//   * An ancestor applies a CSS transform (the ScaleToFit slide-viewer), which
//     html2canvas bakes into the raster, shrinking it to the preview size. The
//     transform is removed from the ancestors for the capture and restored after.
//   * Real <img> elements must be inlined as data URLs, and web fonts must be
//     loaded, or the capture can come out blank or fall back to a serif face.

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Could not read image data.'));
    fr.readAsDataURL(blob);
  });
}

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

async function inlineImages(root) {
  const images = Array.from(root.querySelectorAll('img'));
  await Promise.all(images.map(async (img) => {
    const src = img.getAttribute('src') || '';
    if (!src || src.startsWith('data:')) return;
    const abs = new URL(src, window.location.href).href;
    // Same-origin images can be read via the canvas; cross-origin ones need a
    // CORS-enabled fetch. Either way the result is inlined so html2canvas never
    // has to re-request (and never taints the canvas).
    try {
      const res = await fetch(abs, { mode: 'cors', credentials: 'omit' });
      const blob = await res.blob();
      img.setAttribute('data-la-orig', src);
      img.setAttribute('src', await blobToDataURL(blob));
    } catch {
      // Leave the original src; html2canvas will try its own best effort.
    }
  }));
}

function restoreImages(root) {
  root.querySelectorAll('img[data-la-orig]').forEach((img) => {
    img.setAttribute('src', img.getAttribute('data-la-orig'));
    img.removeAttribute('data-la-orig');
  });
}

function neutraliseAncestorTransforms(element) {
  const saved = [];
  let node = element.parentElement;
  while (node && node !== document.documentElement) {
    if (node.style.transform) {
      saved.push([node, node.style.transform, node.style.transformOrigin]);
      node.style.transform = 'none';
    }
    node = node.parentElement;
  }
  return saved;
}

function restoreTransforms(saved) {
  for (const [node, transform, origin] of saved) {
    node.style.transform = transform;
    node.style.transformOrigin = origin;
  }
}

/**
 * Render a DOM node to a jsPDF page.
 *
 * The node is drawn onto a fixed page (`format`, `orientation`) and scaled to
 * fit with margins, so the page geometry is guaranteed by construction: the
 * MediaBox is always the requested A4 orientation and the document is always
 * exactly one page (a single image is added, and no page is ever inserted).
 */
export async function drawCapturedDocument({
  element,
  format = 'a4',
  orientation = 'landscape',
  marginMm = 0,
  background = '#ffffff',
  scale = 3,
} = {}) {
  if (!element) throw new Error('Nothing to capture.');
  if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* non-fatal */ } }

  let saved = [];
  try {
    await inlineImages(element);
    await nextFrame();
    // Undo the preview's fit transform so the capture is full-resolution.
    saved = neutraliseAncestorTransforms(element);
    await nextFrame();

    const canvas = await html2canvas(element, {
      backgroundColor: background,
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });

    const doc = new jsPDF({ orientation, unit: 'mm', format });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const availW = pw - marginMm * 2;
    const availH = ph - marginMm * 2;
    const ratio = Math.min(availW / canvas.width, availH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    doc.addImage(canvas.toDataURL('image/jpeg', 0.98), 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h, undefined, 'FAST');
    return doc;
  } finally {
    restoreTransforms(saved);
    restoreImages(element);
  }
}

// ── Payment statement (portrait, paginates if needed) ────────────────────────
const P = A4_PORTRAIT;

function statementHeader(doc, tx, pageNo) {
  doc.setFillColor(...BRAND.deepGreen);
  doc.rect(0, 0, P.w, 30, 'F');
  doc.setTextColor(...BRAND.white);
  doc.setFont(SANS, 'bold');
  doc.setFontSize(15);
  doc.text('LearnAfrica', 15, 15);
  doc.setFont(SANS, 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.goldSoft);
  doc.text('PAYMENT STATEMENT', 15, 21, { charSpace: 1.6 });
  if (pageNo > 1) {
    doc.setFontSize(8);
    doc.text(`Page ${pageNo}`, P.w - 15, 21, { align: 'right' });
  }
}

function labelValue(doc, label, value, x, y, {
  valueColor = BRAND.ink, valueStyle = 'bold', valueSize = 10,
  maxWidth = 80, align = 'left',
} = {}) {
  doc.setFont(SANS, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.slateLite);
  doc.text(label.toUpperCase(), x, y, { charSpace: 1.1, align });
  doc.setFont(SANS, valueStyle);
  doc.setFontSize(valueSize);
  doc.setTextColor(...valueColor);
  // Split to the column's own width, not the page width, so a long value in one
  // column can never run into the other column (that was the overlap bug).
  const lines = doc.splitTextToSize(String(value ?? '—'), maxWidth);
  doc.text(lines[0], x, y + 5.2, { align });
  return y + 5.2;
}

const STATUS_COLOR = {
  success:  [16, 122, 87],
  pending:  [180, 120, 10],
  failed:   [190, 40, 40],
  refunded: [90, 100, 115],
};

/**
 * tx: the shaped transaction from GET /api/transactions/<id>
 */
export async function drawStatementPdf(tx) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let pageNo = 1;
  statementHeader(doc, tx, pageNo);

  let y = 44;
  const cur = tx?.currency || 'GHS';
  const money = (n) => formatMoney(n, cur);

  // Left column: issuer / statement meta. Right column: payment meta + status.
  // Each column is bounded to its own half of the page; the right column is
  // right-aligned so nothing crosses the right margin (the previous code drew
  // the right column at x=195 left-aligned, pushing it to ~225mm on a 210mm page).
  const LEFT_X = 15;
  const RIGHT_X = P.w - 15;                 // 195mm — the right margin
  const COL_W = (P.w - 30 - 12) / 2;        // two columns with a 12mm gutter

  labelValue(doc, 'Statement No', tx?.statement_no || tx?.receipt_id || '—', LEFT_X, y, { maxWidth: COL_W });
  labelValue(doc, 'Receipt No', tx?.receipt_id || '—', LEFT_X, y + 14, { maxWidth: COL_W });
  labelValue(doc, 'Student', tx?.buyer?.name || '—', LEFT_X, y + 28, { maxWidth: COL_W });
  labelValue(doc, 'Account', tx?.buyer?.email || '—', LEFT_X, y + 42, { valueStyle: 'normal', valueSize: 9, maxWidth: COL_W });

  const dateStr = tx?.created_at ? new Date(tx.created_at).toLocaleString('en-GB') : '—';
  labelValue(doc, 'Payment Date', dateStr, RIGHT_X, y, { valueStyle: 'normal', valueSize: 9, align: 'right', maxWidth: COL_W });
  doc.setFont(SANS, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.slateLite);
  doc.text('STATUS', RIGHT_X, y + 14, { charSpace: 1.1, align: 'right' });
  const sc = STATUS_COLOR[String(tx?.status || '').toLowerCase()] || BRAND.slate;
  doc.setFillColor(sc[0], sc[1], sc[2]);
  const statusTxt = String(tx?.status || 'unknown').toUpperCase();
  const sw = doc.getTextWidth(statusTxt) + 8;
  doc.roundedRect(RIGHT_X - sw, y + 16, sw, 7, 1.5, 1.5, 'F');
  doc.setTextColor(...BRAND.white);
  doc.setFontSize(8);
  doc.text(statusTxt, RIGHT_X - sw + 4, y + 20.8);
  labelValue(doc, 'Reference', tx?.reference || '—', RIGHT_X, y + 28, { valueStyle: 'normal', valueSize: 8.5, align: 'right', maxWidth: COL_W });
  labelValue(doc, 'Payment Method', tx?.payment_method || '—', RIGHT_X, y + 42, { valueStyle: 'normal', valueSize: 9, align: 'right', maxWidth: COL_W });

  y += 60;
  doc.setDrawColor(...BRAND.line);
  doc.setLineWidth(0.3);
  doc.line(15, y, P.w - 15, y);
  y += 8;

  // Itemised courses table.
  doc.setFont(SANS, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.slate);
  doc.text('COURSE', 15, y, { charSpace: 1 });
  doc.text('AMOUNT', P.w - 15, y, { align: 'right', charSpace: 1 });
  y += 3;
  doc.setDrawColor(...BRAND.deepGreen);
  doc.setLineWidth(0.5);
  doc.line(15, y, P.w - 15, y);
  y += 7;

  const items = Array.isArray(tx?.line_items) && tx.line_items.length
    ? tx.line_items
    : [{ title: tx?.course_title || 'Course purchase', amount: tx?.original_amount ?? tx?.amount ?? 0 }];

  doc.setFont(SANS, 'normal');
  for (const it of items) {
    if (y > P.h - 70) {
      doc.addPage();
      pageNo += 1;
      statementHeader(doc, tx, pageNo);
      y = 44;
    }
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.ink);
    const titleLines = doc.splitTextToSize(String(it.title || 'Course'), P.w - 70);
    doc.text(titleLines, 15, y);
    doc.setFont(SANS, 'bold');
    doc.text(money(it.amount), P.w - 15, y, { align: 'right' });
    y += titleLines.length * 5.5 + 4;
  }

  // Totals.
  y += 2;
  doc.setDrawColor(...BRAND.line);
  doc.setLineWidth(0.3);
  doc.line(15, y, P.w - 15, y);
  y += 7;
  const totalsRow = (label, value, { bold = false, color = BRAND.ink } = {}) => {
    doc.setFont(SANS, bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 11 : 9.5);
    doc.setTextColor(...color);
    doc.text(label, P.w - 90, y);
    doc.text(value, P.w - 15, y, { align: 'right' });
    y += bold ? 8 : 6;
  };

  const original = Number(tx?.original_amount ?? tx?.amount ?? 0);
  const discount = Number(tx?.discount_applied || 0);
  totalsRow('Subtotal', money(original));
  if (discount > 0) {
    const suffix = tx?.coupon_code ? ` (${tx.coupon_code})` : '';
    totalsRow(`Discount${suffix}`, `- ${money(discount)}`, { color: [16, 122, 87] });
  }
  doc.setDrawColor(...BRAND.line);
  doc.line(P.w - 90, y - 3, P.w - 15, y - 3);
  totalsRow('Total Paid', money(tx?.amount), { bold: true, color: BRAND.deepGreen });

  y += 6;
  // Confirmation message — reflects the true status only.
  const status = String(tx?.status || '').toLowerCase();
  const msg = status === 'success'
    ? 'Payment confirmed. Thank you — this transaction is complete and the course(s) above are on your account.'
    : status === 'pending'
      ? 'This payment is still pending and has not been confirmed as successful. No course access is granted until it succeeds.'
      : status === 'failed'
        ? 'This payment did not complete. You were not charged for a successful purchase.'
        : status === 'refunded'
          ? 'This payment was refunded.'
          : 'This payment has an unrecognised status. Please contact support.';
  doc.setFillColor(...BRAND.paper);
  doc.setDrawColor(...BRAND.line);
  doc.roundedRect(15, y, P.w - 30, 20, 2, 2, 'FD');
  doc.setFont(SANS, 'italic');
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.slate);
  doc.text(doc.splitTextToSize(msg, P.w - 40), 19, y + 7);

  // Footer.
  doc.setFont(SANS, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.slateLite);
  doc.text('This is a computer-generated payment statement from LearnAfrica.', 15, P.h - 12);
  doc.text(tx?.receipt_id ? `Receipt ${tx.receipt_id}` : '', P.w - 15, P.h - 12, { align: 'right' });

  return doc;
}

// ── Output helpers (browser) ─────────────────────────────────────────────────
export function downloadPdf(doc, filename) {
  doc.save(filename);
}

/** Print a jsPDF document via a hidden iframe, so the real PDF is what prints. */
export function printPdf(doc) {
  const url = doc.output('bloburl');
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch {
      window.open(url, '_blank');
    }
  };
  document.body.appendChild(iframe);
  setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* ignore */ } }, 60000);
}
