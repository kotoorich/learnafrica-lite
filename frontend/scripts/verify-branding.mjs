/**
 * Branding guard — fails if any user-visible product-name variant other than
 * "LearnAfrica" (one word, capital L, capital A) appears in the shipped source.
 *
 * Internal identifiers that must NOT be renamed (repo dir, package name,
 * database file, storage bucket, deployment hosts) are ignored explicitly, and
 * third-party provider names are never touched.
 *
 *   node scripts/verify-branding.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(here, '..');
const repoRoot = path.resolve(frontendDir, '..');
const roots = [path.join(frontendDir, 'src'), path.join(frontendDir, 'index.html'),
               path.join(repoRoot, 'backend', 'app')];

const EXT = new Set(['.jsx', '.js', '.ts', '.tsx', '.html', '.py', '.json', '.css']);
// Lines that legitimately contain lowercase identifiers, hosts, emails, package
// names, db files or third-party services — not user-visible branding.
const IGNORE = [
  'learnafrica-lite', 'learnafrica.db', 'learnafrica-uploads', 'learnafrica.app',
  'learnafrica.com', '@learnafrica', 'learnafrica-backend', 'learnafrica-backup',
  'learnafrica-statement', 'learnafrica-certificate', 'learnafrica-badge',
  'learnafrica-pre-restore', '__learnafricaSocket', 'package name',
  'learnafrica-lite-weld',
];
// A visible variant is a two-word "Learn Africa" or a "LearnAfrica Lite".
const BAD = [/Learn\s+Africa(?!\w)/, /LearnAfrica\s+Lite/];

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log((ok ? 'PASS' : 'FAIL') + ' - ' + name + (extra ? ` [${extra}]` : ''));
  if (!ok) failures++;
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (EXT.has(path.extname(p))) out.push(p);
  }
  return out;
}

const files = roots.flatMap((r) => {
  try { return statSync(r).isDirectory() ? walk(r) : [r]; } catch { return []; }
});

const hits = [];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (IGNORE.some((ig) => line.includes(ig))) return;
    if (BAD.some((re) => re.test(line))) {
      hits.push(`${path.relative(repoRoot, f)}:${i + 1}: ${line.trim().slice(0, 100)}`);
    }
  });
}

check('no visible "Learn Africa" / "LearnAfrica Lite" variants remain', hits.length === 0,
  hits.length ? `\n  ${hits.join('\n  ')}` : '');

console.log();
if (failures) {
  console.log(`${failures} CHECK(S) FAILED`);
  process.exit(1);
}
console.log('ALL BRANDING CHECKS PASSED');
