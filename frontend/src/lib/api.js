/**
 * api.js — Central API utility
 *
 * ALL fetch calls must use this so they go to the correct backend URL.
 * In production: VITE_API_URL = https://learnafrica-backend.onrender.com
 * In development: empty string (Vite proxy sends /api/* to localhost:5000)
 */

export const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Make an authenticated API call.
 * Automatically adds the JWT token and correct base URL.
 *
 * @param {string} endpoint  - e.g. '/api/courses'
 * @param {object} options   - standard fetch options
 * @returns {Promise<Response>}
 */
export async function apiFetch(endpoint, options = {}) {
  const token = sessionStorage.getItem('auth_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  return fetch(`${API_BASE}${endpoint}`, { ...options, headers });
}

/**
 * Make an unauthenticated API call (public routes).
 */
export async function publicFetch(endpoint, options = {}) {
  return fetch(`${API_BASE}${endpoint}`, options);
}


/**
 * Safely parse a fetch Response as JSON.
 * Returns parsed data on success.
 * Throws a clean Error with a friendly message if the response
 * is HTML, empty, or not JSON.
 */
export async function safeJson(res) {
  const text = await res.text();
  if (!text) {
    if (!res.ok) throw new Error(`Server error (HTTP ${res.status})`);
    return {};
  }
  try {
    const data = JSON.parse(text);
    if (!res.ok) throw new Error(data.error || data.detail || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    if (e instanceof SyntaxError) {
      // Response was HTML or other non-JSON
      throw new Error(`Server error (HTTP ${res.status}). Please try again.`);
    }
    throw e;
  }
}


/**
 * Extract an error message from a failed Response.
 * Safely handles JSON, HTML, or empty responses.
 */
export async function parseErr(res, fallback = 'Request failed') {
  try {
    const text = await res.text();
    if (!text) return `${fallback} (HTTP ${res.status})`;
    try {
      const data = JSON.parse(text);
      return data.error || data.detail || fallback;
    } catch {
      // Response is HTML or other non-JSON
      return `${fallback} (HTTP ${res.status})`;
    }
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}
