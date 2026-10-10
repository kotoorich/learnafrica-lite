/**
 * share.js — real share intents for social platforms.
 *
 * The certificate page previously rendered LinkedIn/Twitter/Facebook icons as
 * `href="#"`, so clicking them did nothing. These builders produce the actual
 * web-intent URLs the platforms expect, with our share text and link.
 */

export function shareText(title, courseName) {
  return `I just completed ${courseName} on LearnAfrica${title ? ` and earned my certificate` : ''}!`;
}

function enc(s) {
  return encodeURIComponent(s);
}

export function linkedInShare(url) {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`;
}

export function twitterShare(url, text) {
  return `https://twitter.com/intent/tweet?url=${enc(url)}&text=${enc(text)}`;
}

export function facebookShare(url) {
  return `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`;
}

export function whatsappShare(url, text) {
  return `https://wa.me/?text=${enc(`${text} ${url}`)}`;
}

export function emailShare(url, text) {
  return `mailto:?subject=${enc('My certificate')}&body=${enc(`${text}\n\n${url}`)}`;
}

/**
 * Trigger the native share sheet when available, otherwise copy the link.
 * Returns 'shared' | 'copied' | 'cancelled' so the caller can toast accurately.
 */
export async function nativeOrCopyShare({ title, text, url }) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'shared';
    } catch (err) {
      // AbortError = the user dismissed the sheet; anything else falls back.
      if (err && err.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'cancelled';
  }
}
