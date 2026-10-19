// Client-side HTML sanitiser (defence in depth).
//
// Lesson text is authored by instructors and rendered with
// dangerouslySetInnerHTML. The backend sanitises on write, but we sanitise
// again here so that pre-existing/legacy rows — or any future path that skips
// the server — cannot execute script in a student's browser.

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'HR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'STRIKE', 'DEL',
  'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'CODE', 'SPAN', 'DIV',
  'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD',
  'A', 'IMG', 'SUB', 'SUP',
]);

const DROP_CONTENT_TAGS = [
  'script', 'style', 'iframe', 'object', 'embed', 'form',
  'noscript', 'svg', 'math', 'template',
];

const ALLOWED_ATTRS = {
  A: new Set(['href', 'title', 'target', 'rel']),
  IMG: new Set(['src', 'alt', 'title', 'width', 'height']),
  TD: new Set(['colspan', 'rowspan']),
  TH: new Set(['colspan', 'rowspan']),
};
const GLOBAL_ATTRS = new Set(['class']);

const DANGEROUS_URL = /^\s*(?:javascript|vbscript|data:text\/html|data:image\/svg)\s*:/i;

export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  // In non-browser environments (SSR/tests) fall back to stripping the most
  // dangerous constructs with a regex rather than returning raw HTML.
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html
      .replace(/<\s*(script|style|iframe|object|embed|svg)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript:/gi, '');
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const tag of DROP_CONTENT_TAGS) {
    doc.querySelectorAll(tag).forEach((el) => el.remove());
  }

  doc.body.querySelectorAll('*').forEach((el) => {
    if (!ALLOWED_TAGS.has(el.tagName)) {
      // Keep the text of unknown inline tags, drop the tag itself.
      el.replaceWith(...el.childNodes);
      return;
    }
    const allowed = ALLOWED_ATTRS[el.tagName] || new Set();
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || (!allowed.has(name) && !GLOBAL_ATTRS.has(name))) {
        el.removeAttribute(attr.name);
        continue;
      }
      if ((name === 'href' || name === 'src') && DANGEROUS_URL.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
    if (el.tagName === 'A') {
      el.setAttribute('rel', 'noopener noreferrer');
    }
  });

  return doc.body.innerHTML;
}
