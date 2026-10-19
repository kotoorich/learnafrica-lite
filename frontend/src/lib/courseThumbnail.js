// Client-side fallback thumbnail generator — matches the server-side one.
// Used as a defensive fallback in case a course dict somehow arrives without a
// thumbnail (stale cache, older data). Always returns a data-URI SVG so it
// renders instantly with no network call.

const PALETTES = {
  code:     ['#0f172a', '#3b82f6'],
  data:     ['#134e4a', '#10b981'],
  ai:       ['#312e81', '#a855f7'],
  design:   ['#831843', '#f472b6'],
  business: ['#0c4a6e', '#0ea5e9'],
  finance:  ['#14532d', '#facc15'],
  marketing:['#78350f', '#f97316'],
  photo:    ['#1e1b4b', '#ec4899'],
  music:    ['#4c1d95', '#c084fc'],
  language: ['#7c2d12', '#fb923c'],
  health:   ['#064e3b', '#34d399'],
  fitness:  ['#7f1d1d', '#fb7185'],
  cooking:  ['#78350f', '#fbbf24'],
  default:  ['#1e293b', '#8b5cf6'],
};

const CATEGORY_THEME = {
  'web development': 'code', 'programming': 'code', 'coding': 'code',
  'data science': 'data', 'analytics': 'data',
  'machine learning': 'ai', 'ai': 'ai', 'artificial intelligence': 'ai',
  'design': 'design', 'ui/ux': 'design', 'ux': 'design', 'graphic design': 'design',
  'business': 'business', 'entrepreneurship': 'business',
  'finance': 'finance', 'accounting': 'finance',
  'marketing': 'marketing', 'seo': 'marketing',
  'photography': 'photo',
  'music': 'music',
  'language': 'language', 'languages': 'language',
  'health': 'health', 'wellness': 'health',
  'fitness': 'fitness',
  'cooking': 'cooking', 'food': 'cooking',
};

// Simple deterministic hash for seeding
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const xmlEscape = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export function generateThumbnail(course = {}) {
  const title = (course.title || 'Course').trim();
  const category = (course.category || '').toLowerCase().trim();
  const theme = CATEGORY_THEME[category] || 'default';
  const [colorFrom, colorTo] = PALETTES[theme];

  const seed = hash(course.id || title || 'course');
  const rotation = seed % 360;

  const words = title.split(/\s+/).filter(Boolean);
  const monogram = (words.slice(0, 2).map(w => w[0] || '').join('') || title.slice(0, 2)).toUpperCase().slice(0, 2) || 'LA';
  const displayTitle = title.length <= 32 ? title : title.slice(0, 29) + '...';

  let dots = '';
  for (let i = 0; i < 12; i++) {
    const h = hash(`${course.id || title}-${i}`);
    const cx = 40 + (h % 720);
    const cy = 40 + (Math.floor(h / 1000) % 520);
    const r = 4 + (Math.floor(h / 100000) % 20);
    const opacity = (0.05 + (Math.floor(h / 10000000) % 15) / 100).toFixed(2);
    dots += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" opacity="${opacity}"/>`;
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">` +
    `<defs>` +
      `<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate(${rotation} 0.5 0.5)">` +
        `<stop offset="0%" stop-color="${colorFrom}"/>` +
        `<stop offset="100%" stop-color="${colorTo}"/>` +
      `</linearGradient>` +
      `<radialGradient id="glow" cx="50%" cy="35%" r="60%">` +
        `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.25"/>` +
        `<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>` +
      `</radialGradient>` +
    `</defs>` +
    `<rect width="800" height="600" fill="url(#bg)"/>` +
    `<rect width="800" height="600" fill="url(#glow)"/>` +
    dots +
    `<circle cx="400" cy="240" r="110" fill="#ffffff" opacity="0.12"/>` +
    `<circle cx="400" cy="240" r="90" fill="#ffffff" opacity="0.18"/>` +
    `<text x="400" y="278" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, sans-serif" font-size="120" font-weight="900" fill="#ffffff">${xmlEscape(monogram)}</text>` +
    `<text x="400" y="420" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, sans-serif" font-size="34" font-weight="700" fill="#ffffff" opacity="0.95">${xmlEscape(displayTitle)}</text>` +
    `<rect x="330" y="460" width="140" height="34" rx="17" fill="#ffffff" opacity="0.2"/>` +
    `<text x="400" y="483" text-anchor="middle" font-family="ui-sans-serif, system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" letter-spacing="2" fill="#ffffff">${xmlEscape((course.category || 'COURSE').toUpperCase().slice(0, 15))}</text>` +
    `</svg>`;

  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

// Given a course object, return the best thumbnail URL. If the course has a
// real thumbnail (URL or data URI), use it. Otherwise generate one.
export function courseThumbnail(course) {
  if (!course) return generateThumbnail({});
  const thumb = (course.thumbnail || '').trim();
  const placeholders = ['', '/placeholder.jpg', 'placeholder.jpg', '/images/placeholder.jpg', 'null', 'undefined', 'none'];
  if (thumb && !placeholders.includes(thumb.toLowerCase())) return thumb;
  return generateThumbnail(course);
}
