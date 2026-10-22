/**
 * Country / identification helpers for international instructor registration.
 *
 * The reference data (countries, per-country ID types, postal + digital-address
 * rules) comes from the backend's maintained datasets so the form and the
 * server validation can never drift apart. Nothing here is hard-coded.
 */
import { API_BASE } from '@/lib/api'

let _configPromise = null

async function api(path) {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** Fetch the country reference data once and cache it for the session. */
export function fetchCountryConfig() {
  if (!_configPromise) {
    _configPromise = api('/api/config/countries').catch((e) => {
      _configPromise = null // allow a retry on the next call
      throw e
    })
  }
  return _configPromise
}

/** What is required for a specific country (subdivisions, postal rule, etc.). */
export function fetchRequirements(country) {
  if (!country) return Promise.resolve(null)
  return api(`/api/instructor/profile/requirements?country=${encodeURIComponent(country)}`)
}

export function idTypesFor(config, country) {
  if (!config) return []
  const byCountry = config.id_types_by_country || {}
  return byCountry[country] || config.generic_id_types || []
}

export function usesPostalCode(config, country) {
  if (!config || !country) return false
  return (config.postal_code_countries || []).includes(country)
}

export function digitalAddressField(config, country) {
  if (!config || !country) return null
  return (config.digital_address_countries || {})[country] || null
}

export function countryName(config, country) {
  const list = (config && config.countries) || []
  const found = list.find((c) => c.code === country)
  return found ? found.name : country
}

/** Ghana Card keeps its strict national format; every other document is free-form. */
export function normalizeIdNumber(country, idType, raw) {
  const s = String(raw || '').trim().toUpperCase()
  if (country === 'GH' && idType === 'ghana_card') {
    const compact = s.replace(/[^A-Z0-9]/g, '')
    if (!compact.startsWith('GHA')) return ''
    const d = compact.slice(3)
    return d.length === 10 && /^\d{10}$/.test(d) ? `GHA-${d.slice(0, 9)}-${d[9]}` : ''
  }
  return s.replace(/[^A-Z0-9\-/ ]+/g, '').replace(/\s{2,}/g, ' ').trim()
}

export function isValidIdNumber(country, idType, raw) {
  const n = normalizeIdNumber(country, idType, raw)
  if (country === 'GH' && idType === 'ghana_card') return !!n
  return n.length >= 4 && n.length <= 40
}
