/**
 * verify-pdf.mjs — generates the certificate, badge and payment-statement
 * PDFs with the SAME code the app uses (src/lib/pdf.js) and inspects the
 * resulting bytes with pdf-lib. This is how we prove the brief's hard
 * requirements instead of eyeballing a preview:
 *
 *   - the certificate is a genuine landscape PDF (MediaBox wider than tall);
 *   - the certificate is exactly ONE page, even with a very long name;
 *   - the badge is one page and landscape;
 *   - the statement is portrait and paginates (never clips) with many courses.
 *
 * Run:  node scripts/verify-pdf.mjs
 */
import { PDFDocument } from 'pdf-lib';
import {
  drawCertificatePdf,
  drawBadgePdf,
  drawStatementPdf,
  A4_LANDSCAPE,
  A4_PORTRAIT,
} from '../src/lib/pdf.js';

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ` [${extra}]` : ''}`);
  if (!cond) failures++;
};

const load = async (doc) => PDFDocument.load(doc.output('arraybuffer'));

async function pageInfo(doc) {
  const pdf = await load(doc);
  const pages = pdf.getPages();
  const boxes = pages.map((p) => p.getMediaBox());
  return { count: pages.length, boxes };
}

const mmTol = 1.0;
const near = (a, b, tol = mmTol) => Math.abs(a - b) <= tol;
// PDF user units are points (1/72"), 1mm = 72/25.4 pt.
const mm = (pt) => pt * 25.4 / 72;

// ── Certificate: landscape, one page, long name safe ────────────────────────
const certData = {
  courseName: 'Python for Data Science',
  instructorName: 'Dr. Kwame Boateng',
  completionDate: '5 October 2026',
  certificateId: 'LA-CERT-9F3A2B71',
  verifyUrl: 'https://learnafrica.example/#verify-section',
  verifyHost: 'learnafrica.example',
};

let doc = await drawCertificatePdf({ data: certData, displayName: 'Ama Mensah' });
let info = await pageInfo(doc);
check('certificate is exactly one page', info.count === 1, info.count);
check('certificate page is A4 landscape (297x210mm)',
  near(mm(info.boxes[0].width), A4_LANDSCAPE.w) && near(mm(info.boxes[0].height), A4_LANDSCAPE.h),
  `${mm(info.boxes[0].width).toFixed(1)}x${mm(info.boxes[0].height).toFixed(1)}mm`);
check('certificate is genuinely landscape (width > height)', info.boxes[0].width > info.boxes[0].height);

const longName = 'Nana Akosua Adwoa Abrefa-Mensah Osei-Bonsu Boateng Agyeman-Rawlings';
doc = await drawCertificatePdf({ data: certData, displayName: longName });
info = await pageInfo(doc);
check('certificate with a very long name is still one page', info.count === 1, info.count);
check('long-name certificate is still landscape', info.boxes[0].width > info.boxes[0].height);

doc = await drawCertificatePdf({
  data: { ...certData, courseName: 'Advanced Full-Stack Web Development with React, Node.js, PostgreSQL and Cloud Deployment' },
  displayName: 'Kofi Owusu',
});
info = await pageInfo(doc);
check('certificate with a very long course title is still one page', info.count === 1, info.count);

// ── Badge: landscape, one page ───────────────────────────────────────────────
doc = await drawBadgePdf({
  badge: { title: 'Course Champion', description: 'Finish an entire course.' },
  displayName: 'Ama Mensah',
  badgeId: 'LA-BDG-1A2B3C4D',
  verifyUrl: 'https://learnafrica.example/#verify-section',
  verifyHost: 'learnafrica.example',
});
info = await pageInfo(doc);
check('badge is exactly one page', info.count === 1, info.count);
check('badge page is landscape', info.boxes[0].width > info.boxes[0].height,
  `${mm(info.boxes[0].width).toFixed(1)}x${mm(info.boxes[0].height).toFixed(1)}mm`);

doc = await drawBadgePdf({
  badge: { title: 'Consistent Learner', description: 'Maintain a 30-day learning streak without missing a day.' },
  displayName: 'Nana Akosua Adwoa Abrefa-Mensah Osei-Bonsu',
  badgeId: 'LA-BDG-1A2B3C4D',
});
info = await pageInfo(doc);
check('badge with a long name is still one page', info.count === 1, info.count);

// ── Statement: portrait, paginates for many courses ──────────────────────────
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

doc = await drawStatementPdf(baseTx);
info = await pageInfo(doc);
check('statement is portrait (height > width)', info.boxes[0].height > info.boxes[0].width,
  `${mm(info.boxes[0].width).toFixed(1)}x${mm(info.boxes[0].height).toFixed(1)}mm`);
check('statement page is A4 portrait (210x297mm)',
  near(mm(info.boxes[0].width), A4_PORTRAIT.w) && near(mm(info.boxes[0].height), A4_PORTRAIT.h));

const manyCourses = Array.from({ length: 14 }, (_, i) => ({
  title: `Course number ${i + 1} with a deliberately long descriptive title`,
  amount: 25 + i,
}));
doc = await drawStatementPdf({ ...baseTx, line_items: manyCourses, amount: manyCourses.reduce((s, c) => s + c.amount, 0) });
info = await pageInfo(doc);
check('a many-course statement paginates rather than clipping', info.count > 1, `${info.count} pages`);
check('every statement page is portrait', info.boxes.every((b) => b.height > b.width));

// Pending status must be rendered (not as success) — geometry still valid.
doc = await drawStatementPdf({ ...baseTx, status: 'pending' });
info = await pageInfo(doc);
check('a pending statement renders as one portrait page', info.count === 1 && info.boxes[0].height > info.boxes[0].width);

console.log();
if (failures) {
  console.log(`${failures} CHECK(S) FAILED`);
  process.exit(1);
}
console.log('ALL PDF GEOMETRY CHECKS PASSED');
