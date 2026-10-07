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
