// Shared payout-detail helpers for instructor payout setup.
// Kept in one place so the profile page and instructor onboarding validate
// and normalise identically.

// Ghana banks and their Paystack/GHIPSS codes (from Paystack's /bank endpoint).
// Codes are what Paystack needs to create a transfer recipient, so we store the
// code rather than trusting a free-text bank name.
export const GH_BANKS = [
  { code: '030100', name: 'Absa Bank Ghana Ltd' },
  { code: '280100', name: 'Access Bank' },
  { code: '080100', name: 'ADB Bank Limited' },
  { code: '300345', name: 'Adehyeman Savings and Loans' },
  { code: '300341', name: 'Affinity Ghana Savings and Loans' },
  { code: '070101', name: 'ARB Apex Bank' },
  { code: '210100', name: 'Bank of Africa Ghana' },
  { code: '300335', name: 'Best Point Savings & Loans' },
  { code: '140100', name: 'CAL Bank Limited' },
  { code: '340100', name: 'Consolidated Bank Ghana Limited' },
  { code: '130100', name: 'Ecobank Ghana Limited' },
  { code: '200100', name: 'FBNBank Ghana Limited' },
  { code: '240100', name: 'Fidelity Bank Ghana Limited' },
  { code: '170100', name: 'First Atlantic Bank Limited' },
  { code: '330100', name: 'First National Bank Ghana Limited' },
  { code: '040100', name: 'GCB Bank Limited' },
  { code: '230100', name: 'Guaranty Trust Bank (Ghana) Limited' },
  { code: '050100', name: 'National Investment Bank Limited' },
  { code: '360100', name: 'OmniBSCI Bank' },
  { code: '180100', name: 'Prudential Bank Limited' },
  { code: '110100', name: 'Republic Bank (GH) Limited' },
  { code: '300361', name: 'Services Integrity Savings and Loans' },
  { code: '240092', name: 'Sinapi ABA Savings And Loans' },
  { code: '090100', name: 'Société Générale Ghana Limited' },
  { code: '190100', name: 'Stanbic Bank Ghana Limited' },
  { code: '020100', name: 'Standard Chartered Bank Ghana Limited' },
  { code: '060100', name: 'United Bank for Africa Ghana Limited' },
  { code: '100100', name: 'Universal Merchant Bank Ghana Limited' },
  { code: '120100', name: 'Zenith Bank Ghana' },
]

export const MOMO_PROVIDERS_GH = [
  { value: 'MTN MoMo',         label: 'MTN MoMo' },
  { value: 'Vodafone Cash',    label: 'Telecel Cash (formerly Vodafone Cash)' },
  { value: 'AirtelTigo Money', label: 'AirtelTigo Money' },
]

// Ghana mobile numbers are 10 digits and start with 0 (e.g. 0244123456).
// Accept the common ways people type them and normalise to 0XXXXXXXXX.
export function normalizeGhPhone(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('233')) d = '0' + d.slice(3)
  else if (d.length === 9 && !d.startsWith('0')) d = '0' + d
  return d.slice(0, 10)
}

export function isValidGhPhone(raw) {
  const d = normalizeGhPhone(raw)
  return /^0\d{9}$/.test(d)
}

export function isValidBankAccount(raw) {
  const d = String(raw || '').replace(/\D/g, '')
  return d.length >= 8 && d.length <= 20
}

// ─────────────────────────────────────────────────────────────────────────────
// Country-code phone handling
//
// A phone number is stored in international form, e.g. "+233244123456". The
// user first tells us their country (which fixes the dial code), then types the
// rest. Everything that is not a digit — letters, spaces, brackets, dashes — is
// removed automatically as they type, so a bad character can never be saved.
// ─────────────────────────────────────────────────────────────────────────────

// A compact list that covers our users: Ghana first (the default), then the
// rest of Africa we serve, then common diaspora countries.
export const COUNTRIES = [
  { code: 'GH', name: 'Ghana',          dial: '+233', flag: '🇬🇭', nsn: 9 },
  { code: 'NG', name: 'Nigeria',        dial: '+234', flag: '🇳🇬', nsn: 10 },
  { code: 'CI', name: "Côte d'Ivoire",  dial: '+225', flag: '🇨🇮', nsn: 10 },
  { code: 'TG', name: 'Togo',           dial: '+228', flag: '🇹🇬', nsn: 8 },
  { code: 'BJ', name: 'Benin',          dial: '+229', flag: '🇧🇯', nsn: 8 },
  { code: 'BF', name: 'Burkina Faso',   dial: '+226', flag: '🇧🇫', nsn: 8 },
  { code: 'SN', name: 'Senegal',        dial: '+221', flag: '🇸🇳', nsn: 9 },
  { code: 'CM', name: 'Cameroon',       dial: '+237', flag: '🇨🇲', nsn: 9 },
  { code: 'KE', name: 'Kenya',          dial: '+254', flag: '🇰🇪', nsn: 9 },
  { code: 'UG', name: 'Uganda',         dial: '+256', flag: '🇺🇬', nsn: 9 },
  { code: 'TZ', name: 'Tanzania',       dial: '+255', flag: '🇹🇿', nsn: 9 },
  { code: 'RW', name: 'Rwanda',         dial: '+250', flag: '🇷🇼', nsn: 9 },
  { code: 'ZA', name: 'South Africa',   dial: '+27',  flag: '🇿🇦', nsn: 9 },
  { code: 'GB', name: 'United Kingdom', dial: '+44',  flag: '🇬🇧', nsn: 10 },
  { code: 'US', name: 'United States',  dial: '+1',   flag: '🇺🇸', nsn: 10 },
  { code: 'CA', name: 'Canada',         dial: '+1',   flag: '🇨🇦', nsn: 10 },
  { code: 'DE', name: 'Germany',        dial: '+49',  flag: '🇩🇪', nsn: 11 },
  { code: 'FR', name: 'France',         dial: '+33',  flag: '🇫🇷', nsn: 9 },
  { code: 'IN', name: 'India',          dial: '+91',  flag: '🇮🇳', nsn: 10 },
  { code: 'CN', name: 'China',          dial: '+86',  flag: '🇨🇳', nsn: 11 },
]

export const DEFAULT_COUNTRY = 'GH'

export function countryByCode(code) {
  return COUNTRIES.find(c => c.code === String(code || '').toUpperCase()) || COUNTRIES[0]
}

// Keep only a leading "+" and digits (max 15 digits — the E.164 limit).
export function sanitizePhoneInput(raw) {
  let s = String(raw || '').trim()
  if (s.startsWith('00')) s = '+' + s.slice(2)   // 00-prefix is an intl prefix
  if (s.startsWith('+')) return '+' + s.slice(1).replace(/\D/g, '').slice(0, 15)
  return s.replace(/\D/g, '').slice(0, 15)
}

// Pretty, grouped display: "+233244123456" → "+233 244 123 456".
export function formatIntlPhone(raw) {
  const s = sanitizePhoneInput(raw)
  if (!s) return ''
  if (s.startsWith('+')) {
    const parts = s.slice(1).match(/.{1,3}/g) || []
    return '+' + parts.join(' ')
  }
  const parts = s.match(/.{1,3}/g) || []
  return parts.join(' ')
}

// Turn whatever the user typed into { country, dial, national, e164, valid }.
// A leading "+" or a local leading "0" is handled; "empty" means nothing typed.
export function parsePhone(raw, defaultCountry = DEFAULT_COUNTRY) {
  const s = sanitizePhoneInput(raw)
  const fallback = countryByCode(defaultCountry)
  if (!s) {
    return { country: fallback.code, dial: fallback.dial, national: '', e164: '', valid: true, empty: true }
  }

  let dial = fallback.dial
  let countryCode = fallback.code
  let national = s

  if (s.startsWith('+')) {
    const d = s.slice(1)
    // Match the longest dial code so "+1" doesn't win over "+233".
    const match = COUNTRIES
      .filter(c => d.startsWith(c.dial.slice(1)))
      .sort((a, b) => b.dial.length - a.dial.length)[0]
    if (match) { dial = match.dial; countryCode = match.code; national = d.slice(dial.length - 1) }
    else { national = d }
  } else if (s.startsWith('0')) {
    national = s.replace(/^0+/, '')
  } else {
    const dd = fallback.dial.slice(1)
    national = (s.startsWith(dd) && s.length > fallback.nsn) ? s.slice(dd.length) : s
  }

  const e164 = national ? dial + national : ''
  const valid = national.length >= 6 && national.length <= 15
  return { country: countryCode, dial, national, e164, valid, empty: false }
}

// Optional-field check: blank passes, otherwise the parsed number must be sane.
export function isValidIntlPhone(raw, defaultCountry = DEFAULT_COUNTRY) {
  const p = parsePhone(raw, defaultCountry)
  return p.empty || p.valid
}

// Grouped local Ghana display: "0244123456" → "024 412 3456".
export function formatGhPhone(raw) {
  const d = normalizeGhPhone(raw)
  if (!d) return ''
  return d.replace(/^(\d{3})(\d{3})(\d{0,4})$/, '$1 $2 $3').trim()
}

// Returns { valid, errors: {field: message} } for the current method + details.
export function validatePayoutDetails(method, details = {}) {
  const errors = {}
  if (method === 'momo') {
    if (!details.provider) errors.provider = 'Select a mobile money provider'
    if (!isValidGhPhone(details.phone)) errors.phone = 'Enter a valid Ghana number, e.g. 0244123456'
    if (!String(details.account_name || '').trim()) errors.account_name = 'Enter the account holder name'
  } else if (method === 'bank') {
    if (!details.bank_code) errors.bank_name = 'Select your bank'
    if (!isValidBankAccount(details.account_number)) errors.account_number = 'Enter a valid account number'
    if (!String(details.account_name || '').trim()) errors.account_name = 'Enter the account holder name'
  } else {
    errors.method = 'Choose a payout method'
  }
  return { valid: Object.keys(errors).length === 0, errors }
}
