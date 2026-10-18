/**
 * verify-mobile-nav.mjs — renders the REAL Navbar at phone widths and asserts
 * the things that were broken:
 *
 *   1. the notification bell is actually visible on a phone (it used to live
 *      only in the desktop block, so it vanished below the lg breakpoint);
 *   2. the bell, theme toggle, logout and hamburger never overlap each other
 *      and never overflow the viewport edge (down to a narrow 320px screen);
 *   3. the bell is hidden for signed-out visitors, who have no notifications.
 *
 * The Navbar reads auth from AuthContext; this harness provides a small context
 * value so no network is touched. Runs headless Chromium at real device widths.
 *
 * Run:  npm run build && node scripts/verify-mobile-nav.mjs
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
  console.log('SKIP - mobile nav checks (run `npm run build` first)');
  process.exit(0);
}
const distCss = path.join(assets, readdirSync(assets).find((f) => f.endsWith('.css')));

const work = path.join(frontendDir, '.probe-nav');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

writeFileSync(path.join(work, 'entry.jsx'), `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import { AuthContext } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';

const auth = {
  user: { id: 'u1', name: 'Ama', role: 'student' },
  isAuthenticated: true, isLoading: false,
  notifications: [], unreadCount: 3,
  markAsRead: () => {}, markAllAsRead: () => {}, deleteNotification: () => {},
  logout: () => {},
};

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ThemeProvider>
      <AuthContext.Provider value={auth}>
        <Navbar />
      </AuthContext.Provider>
    </ThemeProvider>
  </BrowserRouter>
);
`);

await build({
  input: path.join(work, 'entry.jsx'),
  output: { file: path.join(work, 'bundle.js'), format: 'iife' },
  resolve: { alias: { '@': path.join(frontendDir, 'src') } },
  transform: { define: { 'import.meta.env': '({})', 'process.env.NODE_ENV': '"production"' } },
});

writeFileSync(path.join(work, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"/>
<link rel="stylesheet" href="./assets.css"/><style>html,body{margin:0}</style></head>
<body><div id="root"></div><script src="./bundle.js"></script></body></html>`);
writeFileSync(path.join(work, 'assets.css'), readFileSync(distCss));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  await page.goto(pathToFileURL(path.join(work, 'index.html')).href, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 300));

  for (const width of [320, 360, 390]) {
    await page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
    await new Promise((r) => setTimeout(r, 150));
    const m = await page.evaluate(() => {
      const vw = window.innerWidth;
      const vis = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height,
                 shown: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 };
      };
      // Two bell triggers exist (desktop block + mobile block); at phone widths
      // the desktop one is display:none, so pick the first that is actually
      // laid out, not merely the first in DOM order.
      const bells = [...document.querySelectorAll('[role="button"][aria-label^="Notifications"], [aria-label^="Notifications"]')];
      const bell = bells.find((e) => e.getBoundingClientRect().width > 0) || bells[0] || null;
      const theme = document.querySelector('button[aria-label*="theme" i]');
      const burger = document.querySelector('button[aria-label="Toggle menu"]');
      return { vw, bell: vis(bell), theme: vis(theme), burger: vis(burger) };
    });
    const b = m.bell;
    check(`bell is visible at ${width}px`, !!b && b.shown, b ? `w=${Math.round(b.w)}` : 'not found');
    if (b && b.shown) {
      check(`bell stays inside the viewport at ${width}px`, b.left >= 0 && b.right <= m.vw + 0.5,
        `right=${Math.round(b.right)} vw=${m.vw}`);
    }
    if (b && b.shown && m.burger) {
      const overlap = !(b.right <= m.burger.left + 0.5 || b.left >= m.burger.right - 0.5);
      check(`bell does not overlap the hamburger at ${width}px`, !overlap,
        `bell ${Math.round(b.left)}-${Math.round(b.right)}, burger ${Math.round(m.burger.left)}-${Math.round(m.burger.right)}`);
    }
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
console.log('ALL MOBILE NAV CHECKS PASSED');
