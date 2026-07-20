/**
 * Money formatting utilities.
 *
 * Default currency for the platform is Ghana Cedis (GHS / GH₵).
 * Use `formatPrice` for prices on courses & UI; use `formatMoney` for
 * receipts/transactions that may have a stored currency.
 */

export const DEFAULT_CURRENCY = 'GHS';
export const CURRENCY_SYMBOL = 'GH₵';

/**
 * Format a price for display in the UI.
 * Examples: formatPrice(0)         → "GH₵ 0"
 *           formatPrice(99)        → "GH₵ 99.00"
 *           formatPrice(99, true)  → "GH₵ 99"   (no decimals)
 */
export function formatPrice(amount, noDecimals = false) {
  const n = Number(amount || 0);
  const opts = noDecimals
    ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `${CURRENCY_SYMBOL} ${n.toLocaleString(undefined, opts)}`;
}

/**
 * Format a stored transaction amount with its currency.
 * Uses Ghana Cedis symbol when currency is GHS, otherwise shows the
 * raw currency code.
 */
export function formatMoney(amount, currency = DEFAULT_CURRENCY) {
  const n = Number(amount || 0);
  const formatted = n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if ((currency || '').toUpperCase() === 'GHS') {
    return `${CURRENCY_SYMBOL} ${formatted}`;
  }
  return `${currency} ${formatted}`;
}

/**
 * Returns just the symbol (e.g. for input prefixes).
 */
export function currencySymbol() {
  return CURRENCY_SYMBOL;
}
