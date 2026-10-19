/**
 * Safely JSON.stringify any object, defending against:
 * - Circular references (returns undefined for repeat visits)
 * - DOM nodes (Elements, Documents)
 * - Window / self references
 * - React synthetic events (which carry a `nativeEvent` and can contain view=window)
 * - File / Blob / FormData (should be sent separately, never in JSON)
 * - Functions (undefined per JSON spec anyway, but be explicit)
 *
 * Returns the JSON string. If serialization completely fails, throws with a
 * descriptive error including the path where the bad value lives.
 */
export function safeStringify(obj) {
  const seen = new WeakSet();
  const path = [];

  try {
    return JSON.stringify(obj, function (key, value) {
      // Track path for debug info
      if (key && this !== obj) path.push(key);

      // Nulls & primitives — always safe
      if (value === null) return null;
      const t = typeof value;
      if (t === 'string' || t === 'number' || t === 'boolean') return value;
      if (t === 'function' || t === 'symbol' || t === 'undefined') return undefined;

      // Non-plain objects that commonly cause circular refs
      if (t === 'object') {
        // Circular guard
        if (seen.has(value)) return undefined;
        seen.add(value);

        // Skip Window/self
        if (typeof window !== 'undefined' && value === window) return undefined;
        if (typeof self   !== 'undefined' && value === self)   return undefined;

        // Skip DOM nodes
        if (typeof Node !== 'undefined' && value instanceof Node) return undefined;
        if (typeof Element !== 'undefined' && value instanceof Element) return undefined;
        if (typeof Document !== 'undefined' && value instanceof Document) return undefined;

        // Skip Events / SyntheticEvents (React events have nativeEvent + view)
        if (typeof Event !== 'undefined' && value instanceof Event) return undefined;
        if (value && (value.nativeEvent || value._reactName)) return undefined;

        // Skip File / Blob / FormData — these must be sent via multipart, not JSON
        if (typeof File     !== 'undefined' && value instanceof File)     return undefined;
        if (typeof Blob     !== 'undefined' && value instanceof Blob)     return undefined;
        if (typeof FormData !== 'undefined' && value instanceof FormData) return undefined;
      }

      return value;
    });
  } catch (err) {
    const where = path.length ? ` at path "${path.join('.')}"` : '';
    throw new Error(`Failed to serialize request${where}: ${err.message}`);
  }
}
