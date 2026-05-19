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
