/**
 * adminApi.js — authenticated JSON helper for admin-only components.
 *
 * Adds the JWT and API base, returns parsed JSON, and throws a clean Error with
 * the server's message on failure (so callers can show it directly).
 */
import { API_BASE } from '@/lib/api';

export async function API(endpoint, options = {}) {
  const token = sessionStorage.getItem('auth_token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  if (!res.ok) {
    let errMsg = 'Request failed';
    try { const d = await res.json(); errMsg = d.error || errMsg; } catch { /* non-JSON */ }
    throw new Error(errMsg);
  }
  return res.json();
}

export default API;
