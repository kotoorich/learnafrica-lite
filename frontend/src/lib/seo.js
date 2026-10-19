// Lightweight document-head helpers for SEO.
//
// The app is a client-rendered Vite SPA, so we set the title, meta description,
// canonical link, Open Graph tags and JSON-LD structured data imperatively when
// each public page mounts. Search engines that execute JavaScript (and the
// crawlers that read the server-rendered index.html) then see accurate metadata.

const SITE_NAME = 'LearnAfrica';

function upsertMeta(attr, key, content) {
  if (content == null) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function upsertJsonLd(id, data) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

/**
 * Set page metadata.
 * @param {object} o
 * @param {string} o.title        Page title (site name is appended).
 * @param {string} [o.description]
 * @param {string} [o.path]       Route path, used for the canonical URL.
 * @param {string} [o.image]      Absolute or relative OG image.
 * @param {string} [o.type]       OG type, e.g. 'website' or 'article'.
 * @param {object} [o.jsonLd]     Structured data object.
 */
export function setSeo({ title, description, path, image, type = 'website', jsonLd } = {}) {
  const origin = window.location.origin;
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Learn skills that matter`;
  document.title = fullTitle;
  if (description) upsertMeta('name', 'description', description);
  upsertMeta('property', 'og:title', fullTitle);
  if (description) upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:type', type);
  if (path) {
    const url = `${origin}${path}`;
    upsertMeta('property', 'og:url', url);
    upsertLink('canonical', url);
  }
  if (image) {
    const img = image.startsWith('http') ? image : `${origin}${image}`;
    upsertMeta('property', 'og:image', img);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:image', img);
  }
  if (jsonLd) upsertJsonLd('page-jsonld', jsonLd);
}
