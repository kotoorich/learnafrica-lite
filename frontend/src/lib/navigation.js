// Navigation safety helpers.
//
// A redirect target that arrives from the URL (e.g. ?returnUrl=...) must never
// be followed off-site. Only same-origin, root-relative paths are allowed, so a
// crafted link cannot bounce a just-logged-in user to an attacker's page.

export function safeInternalPath(raw, fallback = '/dashboard') {
  if (!raw || typeof raw !== 'string') return fallback;
  // Strip control characters and whitespace everywhere first: leading tabs or
  // newlines are a classic way to smuggle a scheme or a protocol-relative URL
  // past a naive check.
  const cleaned = Array.from(raw)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 0x20 && code !== 0x7f;
    })
    .join('');
  // Reject absolute URLs and protocol-relative/backslash forms.
  if (/^[a-z][a-z0-9+.-]*:/i.test(cleaned) || cleaned.startsWith('//') || cleaned.startsWith('\\')) {
    return fallback;
  }
  // Must be a rooted, same-origin path.
  if (!cleaned.startsWith('/')) return fallback;
  return cleaned;
}
