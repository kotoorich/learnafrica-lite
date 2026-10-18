/**
 * verify-navigation.mjs — unit checks for safeInternalPath.
 *
 * The login page reads ?returnUrl= from the URL and navigates to it after a
 * successful sign-in. Without a guard that is an open redirect: a link like
 * /login?returnUrl=https://evil.example lets an attacker land the user on their
 * page right after login. safeInternalPath must accept only same-origin,
 * root-relative paths and fall back otherwise.
 *
 * Run:  node scripts/verify-navigation.mjs
 */
import { safeInternalPath } from '../src/lib/navigation.js';

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ` [${extra}]` : ''}`);
  if (!cond) failures++;
};

const FALLBACK = '/dashboard';

// ── Absolute and protocol-relative URLs are rejected ─────────────────────────
check('rejects https URL', safeInternalPath('https://evil.example', FALLBACK) === FALLBACK);
check('rejects http URL', safeInternalPath('http://evil.example', FALLBACK) === FALLBACK);
check('rejects protocol-relative //', safeInternalPath('//evil.example', FALLBACK) === FALLBACK);
check('rejects backslash form', safeInternalPath('\\\\evil.example', FALLBACK) === FALLBACK);
check('rejects javascript: scheme', safeInternalPath('javascript:alert(1)', FALLBACK) === FALLBACK);
check('rejects data: scheme', safeInternalPath('data:text/html,<script>', FALLBACK) === FALLBACK);

// ── Relative (non-rooted) paths are rejected — they can escape via base ──────
check('rejects bare relative path', safeInternalPath('dashboard', FALLBACK) === FALLBACK);

// ── Legitimate internal paths are accepted ───────────────────────────────────
check('accepts /dashboard', safeInternalPath('/dashboard', FALLBACK) === '/dashboard');
check('accepts a nested path', safeInternalPath('/learn/course/c1/lesson/l1', FALLBACK) === '/learn/course/c1/lesson/l1');
check('accepts a path with query', safeInternalPath('/courses?q=python', FALLBACK) === '/courses?q=python');

// ── Leading whitespace/control chars cannot smuggle a scheme ─────────────────
check('rejects tab-prefixed scheme', safeInternalPath('\thttps://evil.example', FALLBACK) === FALLBACK);
check('rejects newline-prefixed scheme', safeInternalPath('\n//evil.example', FALLBACK) === FALLBACK);

// ── Missing input yields the fallback (and a null fallback stays null) ───────
check('empty string yields fallback', safeInternalPath('', FALLBACK) === FALLBACK);
check('undefined yields fallback', safeInternalPath(undefined, FALLBACK) === FALLBACK);
check('null fallback is honoured', safeInternalPath(undefined, null) === null);

console.log();
if (failures) {
  console.log(`${failures} CHECK(S) FAILED`);
  process.exit(1);
}
console.log('ALL NAVIGATION CHECKS PASSED');
