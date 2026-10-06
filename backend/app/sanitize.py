"""
sanitize.py — Content sanitisation and upload safety helpers.

Two responsibilities:

  1. ``sanitize_html`` — strip dangerous markup (scripts, event handlers,
     javascript: URLs, embedded objects) from instructor-authored rich text
     before it is stored. This is the server-side half of the stored-XSS
     defence; the frontend sanitises again on render.

  2. File-content validation used by the upload endpoints. Extension checks
     alone are trivial to bypass (rename a .html file to .png), so we also
     verify magic bytes and reject active content (HTML/SVG/JS) where it has
     no business being uploaded.

The HTML sanitiser is dependency-free (no bleach/nh3) so it works with the
pinned requirements and on both SQLite and Postgres deployments.
"""
import re

# ── HTML sanitisation ────────────────────────────────────────────────────────
_ALLOWED_TAGS = {
    'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'code', 'span', 'div',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    'a', 'img', 'sub', 'sup',
}

# Tags whose entire content must be removed (not just the tag itself).
_DROP_CONTENT_TAGS = ('script', 'style', 'iframe', 'object', 'embed',
                      'form', 'noscript', 'svg', 'math', 'template')

# Attributes allowed per tag. Anything not listed is stripped.
_ALLOWED_ATTRS = {
    'a':   {'href', 'title', 'target', 'rel'},
    'img': {'src', 'alt', 'title', 'width', 'height'},
    'td':  {'colspan', 'rowspan'},
    'th':  {'colspan', 'rowspan'},
}
_GLOBAL_ATTRS = {'class'}

_TAG_RE = re.compile(r'<\s*(/?)\s*([a-zA-Z][a-zA-Z0-9]*)((?:[^>"\']|"[^"]*"|\'[^\']*\')*)>')
_ATTR_RE = re.compile(r'([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)')
_EVENT_ATTR_RE = re.compile(r'^on', re.IGNORECASE)
_DANGEROUS_URL_RE = re.compile(r'^\s*(?:javascript|vbscript|data:text/html|data:image/svg)\s*:', re.IGNORECASE)


def _safe_url(value):
    return not _DANGEROUS_URL_RE.match(value or '')


def _sanitize_attrs(tag, raw_attrs):
    allowed = _ALLOWED_ATTRS.get(tag, set()) | _GLOBAL_ATTRS
    out = []
    for name, value in _ATTR_RE.findall(raw_attrs or ''):
        lname = name.lower()
        if _EVENT_ATTR_RE.match(lname):
            continue
        if lname not in allowed:
            continue
        if lname in ('href', 'src'):
            value = value.strip('"\'')
            if not _safe_url(value):
                continue
            out.append(f'{lname}="{value}"')
        else:
            out.append(f'{lname}={value}')
    return (' ' + ' '.join(out)) if out else ''


def sanitize_html(html):
    """
    Return a sanitised copy of ``html`` suitable for rendering to other users.
    Non-string input is coerced to str; None/empty returns ''.
    """
    if not html:
        return ''
    if not isinstance(html, str):
        html = str(html)

    # Remove whole dangerous elements including their inner content first.
    for tag in _DROP_CONTENT_TAGS:
        html = re.sub(
            rf'<\s*{tag}\b[^>]*>.*?<\s*/\s*{tag}\s*>',
            '', html, flags=re.IGNORECASE | re.DOTALL)
        # Unclosed variants (e.g. a stray <script> with no closing tag)
        html = re.sub(rf'<\s*/?\s*{tag}\b[^>]*>', '', html, flags=re.IGNORECASE)

    def _rebuild(match):
        closing, tag, attrs = match.group(1), match.group(2), match.group(3)
        tag = tag.lower()
        if tag not in _ALLOWED_TAGS:
            return ''
        if closing:
            return f'</{tag}>'
        return f'<{tag}{_sanitize_attrs(tag, attrs)}>'

    return _TAG_RE.sub(_rebuild, html)


def contains_html_or_script(data):
    """True when a byte payload looks like active web content (HTML/SVG/XML)."""
    if not data:
        return False
    head = data[:1024].lstrip().lower()
    return (head.startswith(b'<!doctype html') or head.startswith(b'<html') or
            head.startswith(b'<svg') or head.startswith(b'<?xml') or
            b'<script' in data[:4096].lower())


# ── File signature validation ────────────────────────────────────────────────
_MAGIC = {
    'png':  (b'\x89PNG\r\n\x1a\n',),
    'jpg':  (b'\xff\xd8\xff',),
    'jpeg': (b'\xff\xd8\xff',),
    'gif':  (b'GIF87a', b'GIF89a'),
    'webp': (b'RIFF',),          # RIFF....WEBP — checked further below
    'pdf':  (b'%PDF-',),
    'zip':  (b'PK\x03\x04', b'PK\x05\x06', b'PK\x07\x08'),
    'docx': (b'PK\x03\x04',),
    'xlsx': (b'PK\x03\x04',),
    'pptx': (b'PK\x03\x04',),
    'doc':  (b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1',),
    'xls':  (b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1',),
    'ppt':  (b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1',),
    'rar':  (b'Rar!\x1a\x07',),
    '7z':   (b'7z\xbc\xaf\x27\x1c',),
    'gz':   (b'\x1f\x8b',),
    'mp4':  (b'\x00\x00\x00',),  # ftyp box is at offset 4
    'mov':  (b'\x00\x00\x00',),
    'webm': (b'\x1a\x45\xdf\xa3',),
    'mkv':  (b'\x1a\x45\xdf\xa3',),
    'ogg':  (b'OggS',),
    'mp3':  (b'ID3', b'\xff\xfb', b'\xff\xf3', b'\xff\xf2'),
    'wav':  (b'RIFF',),
}


def matches_extension(data, ext):
    """
    Best-effort check that ``data`` actually looks like a ``.ext`` file.
    Returns True when the signature is unknown (e.g. txt/csv) so callers
    are never blocked on formats we cannot fingerprint.
    """
    if not data:
        return False
    ext = (ext or '').lower()
    sigs = _MAGIC.get(ext)
    if not sigs:
        return True
    if ext == 'webp':
        return data[:4] == b'RIFF' and data[8:12] == b'WEBP'
    if ext == 'mp4':
        return data[4:8] == b'ftyp'
    return any(data.startswith(sig) for sig in sigs)
