/**
 * pdf.js — real, downloadable PDF documents for certificates, badges and
 * payment statements.
 *
 * Why vector drawing instead of screenshotting the on-screen HTML: the app's
 * design tokens are CSS `oklch()` colours, which canvas rasterisers cannot
 * parse, and a screenshot's page geometry depends on the browser. Drawing the
 * document directly with jsPDF gives us three guarantees the brief asks for:
 *   1. the file is genuinely landscape (the page MediaBox is 297x210mm),
 *   2. it is exactly one page (we never draw past the page box), and
 *   3. text is real, selectable and crisp at any zoom.
 *
 * Everything here is pure JS with no DOM access, so the same functions run in
 * the browser (via the Download/Print buttons) and in Node (via the PDF
 * geometry test), which is how the tests verify the real output.
 */
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { formatMoney } from './money.js';

// ── Page geometry (mm) ───────────────────────────────────────────────────────
export const A4_LANDSCAPE = { w: 297, h: 210 };
export const A4_PORTRAIT = { w: 210, h: 297 };
const L = A4_LANDSCAPE;

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

// ── Small helpers ────────────────────────────────────────────────────────────
const SANS = 'helvetica';
const SERIF = 'times';

/** Shrink a string until it fits maxWidth in at most maxLines, then wrap. */
function fitText(doc, text, maxWidth, startSize, minSize, { style = 'normal', font = SANS, maxLines = 1 } = {}) {
  let size = startSize;
  while (size > minSize) {
    doc.setFont(font, style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(text ?? ''), maxWidth);
    if (lines.length <= maxLines) return { lines, size };
    size -= 1;
  }
  doc.setFont(font, style);
  doc.setFontSize(minSize);
  return { lines: doc.splitTextToSize(String(text ?? ''), maxWidth), size: minSize };
}

function drawCenteredLines(doc, lines, size, y, lineH, color, font = SANS, style = 'normal') {
  doc.setFont(font, style);
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);
  lines.forEach((ln, i) => doc.text(ln, L.w / 2, y + i * lineH, { align: 'center' }));
  return y + (lines.length - 1) * lineH;
}

function tracked(doc, text, x, y, { align = 'left' } = {}) {
  doc.text(text, x, y, { align });
}

async function qrDataUrl(value, size = 320) {
  try {
    return await QRCode.toDataURL(value, { margin: 1, width: size, color: { dark: '#0B3D2E', light: '#FFFFFF' } });
  } catch {
    return null;
  }
}

/** Draw a gold-ringed medal with a star, the shared "achievement" motif. */
function drawMedal(doc, cx, cy, r) {
  doc.setFillColor(...BRAND.gold);
  doc.circle(cx, cy, r, 'F');
  doc.setFillColor(...BRAND.deepGreen);
  doc.circle(cx, cy, r - 1.6, 'F');
  doc.setDrawColor(...BRAND.goldSoft);
  doc.setLineWidth(0.5);
  doc.circle(cx, cy, r - 3.2, 'S');
  // Five-point star, filled gold.
  const spikes = 5, outer = r - 6, inner = outer * 0.45;
  const pts = [];
  for (let i = 0; i < spikes * 2; i++) {
    const rad = (Math.PI / spikes) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? outer : inner;
    pts.push([cx + Math.cos(rad) * rr, cy + Math.sin(rad) * rr]);
  }
  doc.setFillColor(...BRAND.gold);
  const lines = [];
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    lines.push([x1, y1, x2, y2]);
  }
  doc.lines(lines.map(([x1, y1, x2, y2]) => [x2 - x1, y2 - y1]), pts[0][0], pts[0][1], [1, 1], 'F', true);
}

/** A circular official seal with small arc text, used on the certificate. */
function drawSeal(doc, cx, cy, r) {
  doc.setDrawColor(...BRAND.deepGreen);
  doc.setLineWidth(0.8);
  doc.circle(cx, cy, r, 'S');
  doc.setLineWidth(0.3);
  doc.circle(cx, cy, r - 2.2, 'S');
  doc.setFillColor(...BRAND.deepGreen);
  doc.circle(cx, cy, r - 4.4, 'F');
  doc.setTextColor(...BRAND.goldSoft);
  doc.setFont(SERIF, 'bold');
  doc.setFontSize(8.5);
  doc.text('CERTIFIED', cx, cy - 1.4, { align: 'center' });
  doc.setFont(SANS, 'normal');
  doc.setFontSize(5.2);
  doc.text('LEARNAFRICA', cx, cy + 3.2, { align: 'center' });
  doc.setFontSize(4.2);
  doc.text('VERIFIED', cx, cy + 6.2, { align: 'center' });
}

function frame(doc, margin, accent) {
  doc.setFillColor(...BRAND.paper);
  doc.rect(0, 0, L.w, L.h, 'F');
  doc.setDrawColor(...accent);
  doc.setLineWidth(1.4);
  doc.rect(margin, margin, L.w - margin * 2, L.h - margin * 2, 'S');
  doc.setDrawColor(...BRAND.line);
  doc.setLineWidth(0.3);
  doc.rect(margin + 2, margin + 2, L.w - (margin + 2) * 2, L.h - (margin + 2) * 2, 'S');
}

// ── Certificate ──────────────────────────────────────────────────────────────
/**
 * data: { courseName, instructorName, completionDate, certificateId, verifyUrl }
 * displayName: the name to print on the certificate.
 */
export async function drawCertificatePdf({ data, displayName }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  frame(doc, 10, BRAND.deepGreen);

  const innerW = L.w - 2 * 34;
  let y = 26;

  doc.setFont(SANS, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.emerald);
  doc.text('LEARNAFRICA LITE', L.w / 2, y, { align: 'center', charSpace: 2.2 });

  y += 11;
  const title = fitText(doc, 'CERTIFICATE OF COMPLETION', innerW, 30, 20, { font: SERIF, style: 'bold' });
  y = drawCenteredLines(doc, title.lines, title.size, y, 11, BRAND.ink, SERIF, 'bold') + 4;

  doc.setDrawColor(...BRAND.gold);
  doc.setLineWidth(0.7);
  doc.line(L.w / 2 - 30, y, L.w / 2 + 30, y);
  y += 8;

  doc.setFont(SERIF, 'italic');
  doc.setFontSize(12);
  doc.setTextColor(...BRAND.slate);
  doc.text('Awarded in recognition of outstanding course completion', L.w / 2, y, { align: 'center' });

  y += 12;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.slate);
  doc.text('This certifies that', L.w / 2, y, { align: 'center' });

  // Name — shrinks to fit, up to two lines, never clipped.
  y += 11;
  const name = fitText(doc, displayName || 'Authorized Learner', innerW, 30, 15, { font: SERIF, style: 'bold', maxLines: 2 });
  y = drawCenteredLines(doc, name.lines, name.size, y, 11, BRAND.ink, SERIF, 'bold');
  doc.setDrawColor(...BRAND.ink);
  doc.setLineWidth(0.6);
  doc.line(L.w / 2 - Math.min(innerW, 120) / 2, y + 2.5, L.w / 2 + Math.min(innerW, 120) / 2, y + 2.5);

  y += 10;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.slate);
  doc.text('has successfully completed all course requirements for', L.w / 2, y, { align: 'center' });

  y += 10;
  const course = fitText(doc, data?.courseName || 'Course', innerW, 22, 12, { font: SERIF, style: 'bold', maxLines: 2 });
  y = drawCenteredLines(doc, course.lines, course.size, y, 9, BRAND.deepGreen, SERIF, 'bold');

  // Signatures + seal row.
  const rowY = 158;
  doc.setDrawColor(...BRAND.line);
  doc.setLineWidth(0.4);
  doc.line(34, rowY, 110, rowY);
  doc.line(187, rowY, 263, rowY);
  doc.setFont(SERIF, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.ink);
  doc.text(String(data?.instructorName || 'Course Instructor').slice(0, 40), 72, rowY - 2, { align: 'center' });
  doc.text(String(data?.completionDate || ''), 225, rowY - 2, { align: 'center' });
  doc.setFont(SANS, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.slateLite);
  doc.text('COURSE INSTRUCTOR', 72, rowY + 5, { align: 'center', charSpace: 1.2 });
  doc.text('DATE ISSUED', 225, rowY + 5, { align: 'center', charSpace: 1.2 });

  drawSeal(doc, L.w / 2, rowY - 1, 15);

  // Footer: certificate id + verification QR.
  const footY = 190;
  doc.setDrawColor(...BRAND.line);
  doc.setLineWidth(0.3);
  doc.line(34, footY - 6, 263, footY - 6);
  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.slate);
  doc.text(`CERTIFICATE ID: ${data?.certificateId || '—'}`, 34, footY);
  doc.setFont(SANS, 'normal');
  doc.text(`Verify at ${data?.verifyHost || ''}`, 34, footY + 4);

  if (data?.certificateId && data?.verifyUrl) {
    const qr = await qrDataUrl(data.verifyUrl);
    if (qr) doc.addImage(qr, 'PNG', 250, footY - 12, 18, 18);
  }

  return doc;
}

// ── Achievement badge ────────────────────────────────────────────────────────
/**
 * badge: { title, description }
 * displayName: awarded-to name.  badgeId: issued id (optional).
 */
export async function drawBadgePdf({ badge, displayName, badgeId, verifyUrl, verifyHost, issuedDate }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const m = 9;

  doc.setFillColor(...BRAND.deepGreen);
  doc.rect(0, 0, L.w, L.h, 'F');
  // Gold inner frame.
  doc.setDrawColor(...BRAND.gold);
  doc.setLineWidth(0.9);
  doc.rect(m, m, L.w - m * 2, L.h - m * 2, 'S');
  doc.setDrawColor(...BRAND.emerald);
  doc.setLineWidth(0.35);
  doc.rect(m + 1.8, m + 1.8, L.w - (m + 1.8) * 2, L.h - (m + 1.8) * 2, 'S');

  const cx = L.w / 2;
  let y = 26;
  doc.setFont(SANS, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...BRAND.gold);
  doc.text('LEARNAFRICA LITE', cx, y, { align: 'center', charSpace: 2.4 });

  drawMedal(doc, cx, 46, 13);

  y = 66;
  doc.setFont(SANS, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.goldSoft);
  doc.text('ACHIEVEMENT UNLOCKED', cx, y, { align: 'center', charSpace: 1.8 });

  y += 11;
  const title = fitText(doc, badge?.title || 'Achievement', L.w - 60, 26, 14, { font: SERIF, style: 'bold', maxLines: 2 });
  y = drawCenteredLines(doc, title.lines, title.size, y, 10, BRAND.white, SERIF, 'bold');

  y += 9;
  const desc = fitText(doc, badge?.description || '', L.w - 90, 10.5, 8, { maxLines: 2 });
  y = drawCenteredLines(doc, desc.lines, desc.size, y, 5, BRAND.goldSoft);

  y += 6;
  doc.setDrawColor(...BRAND.gold);
  doc.setLineWidth(0.6);
  doc.line(cx - 18, y, cx + 18, y);

  y += 8;
  doc.setFont(SANS, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.goldSoft);
  doc.text('AWARDED TO', cx, y, { align: 'center', charSpace: 1.6 });

  y += 9;
  const nm = fitText(doc, displayName || 'Authorized Learner', L.w - 70, 20, 12, { font: SERIF, style: 'bold', maxLines: 1 });
  y = drawCenteredLines(doc, nm.lines, nm.size, y, 9, BRAND.white, SERIF, 'bold');

  // Footer band.
  const fy = 188;
  doc.setFont(SANS, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.goldSoft);
  const dateStr = issuedDate || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.text(`Issued by LearnAfrica  •  ${dateStr}`, cx, fy, { align: 'center' });
  if (badgeId) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...BRAND.slateLite);
    doc.text(`ID: ${badgeId}  •  Verify at ${verifyHost || ''}`, cx, fy + 4.5, { align: 'center' });
  }

  if (badgeId && verifyUrl) {
    const qr = await qrDataUrl(verifyUrl, 300);
    if (qr) doc.addImage(qr, 'PNG', L.w - 30, fy - 14, 16, 16);
  }

  return doc;
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

function labelValue(doc, label, value, x, y, { valueColor = BRAND.ink, valueFont = SANS, valueStyle = 'bold', valueSize = 10 } = {}) {
  doc.setFont(SANS, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.slateLite);
  doc.text(label.toUpperCase(), x, y, { charSpace: 1.1 });
  doc.setFont(valueFont, valueStyle);
  doc.setFontSize(valueSize);
  doc.setTextColor(...valueColor);
  const lines = doc.splitTextToSize(String(value ?? '—'), P.w - 30);
  doc.text(lines[0], x, y + 5.2);
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

  // Issuer / statement meta (right column), student (left column).
  labelValue(doc, 'Statement No', tx?.statement_no || tx?.receipt_id || '—', 15, y);
  labelValue(doc, 'Receipt No', tx?.receipt_id || '—', 15, y + 14);
  labelValue(doc, 'Student', tx?.buyer?.name || '—', 15, y + 28);
  labelValue(doc, 'Account', tx?.buyer?.email || '—', 15, y + 42, { valueStyle: 'normal', valueSize: 9 });

  const rx = P.w - 15;
  const dateStr = tx?.created_at ? new Date(tx.created_at).toLocaleString('en-GB') : '—';
  labelValue(doc, 'Payment Date', dateStr, rx, y, { valueStyle: 'normal', valueSize: 9 });
  doc.setFont(SANS, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.slateLite);
  doc.text('STATUS', rx, y + 14, { charSpace: 1.1 });
  const sc = STATUS_COLOR[String(tx?.status || '').toLowerCase()] || BRAND.slate;
  doc.setFillColor(sc[0], sc[1], sc[2]);
  const statusTxt = String(tx?.status || 'unknown').toUpperCase();
  const sw = doc.getTextWidth(statusTxt) + 8;
  doc.roundedRect(rx, y + 16, sw, 7, 1.5, 1.5, 'F');
  doc.setTextColor(...BRAND.white);
  doc.setFontSize(8);
  doc.text(statusTxt, rx + 4, y + 20.8);
  labelValue(doc, 'Reference', tx?.reference || '—', rx, y + 28, { valueStyle: 'normal', valueSize: 8.5 });
  labelValue(doc, 'Payment Method', tx?.payment_method || '—', rx, y + 42, { valueStyle: 'normal', valueSize: 9 });

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
