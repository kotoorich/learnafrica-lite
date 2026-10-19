import { useState, useEffect } from 'react'
import { Phone, Building2, CreditCard, Check, AlertCircle } from 'lucide-react'
import { Input, Label } from '@/components/common/Input'
import { Button } from '@/components/common/Button'
import { cn } from '@/lib/utils'
import {
  GH_BANKS, MOMO_PROVIDERS_GH,
  normalizeGhPhone, validatePayoutDetails,
} from '@/lib/payoutDetails'

/**
 * Reusable payment-method form. Supports two methods:
 *   - 'momo' (Mobile Money): provider (MTN/Vodafone/AirtelTigo), phone, account_name
 *   - 'bank': bank_code + bank_name (from a fixed list), account_number, account_name
 *
 * Props:
 *   value:    { method, details, country }
 *   onChange: (next) => void   // called whenever any field changes
 *   onSave:   async (next) => void   // called when user clicks Save
 *   showSaveButton: boolean
 *
 * The form validates all required fields before allowing Save.
 */
// Payouts are sent through Paystack Ghana, so only Ghanaian accounts are supported.
const COUNTRY = 'GH'

export function PaymentMethodForm({ value, onChange, onSave, showSaveButton = true, requireBefore = null }) {
  const [method, setMethod]   = useState(value?.method   || 'momo')
  const country = COUNTRY
  const [details, setDetails] = useState(value?.details  || {})
  const [saving, setSaving]   = useState(false)
  const [status, setStatus]   = useState(null) // {type, msg}
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (value) {
      setMethod(value.method || 'momo')
      setDetails(value.details || {})
    }
  }, [value])

  const propagate = (newMethod, newCountry, newDetails) => {
    onChange?.({ method: newMethod, country: newCountry, details: newDetails })
  }

  const changeMethod = (m) => {
    setMethod(m); setDetails({}); setStatus(null); setTouched(false); propagate(m, country, {})
  }
  const setField = (k, v) => {
    const nd = { ...details, [k]: v }
    setDetails(nd); propagate(method, country, nd)
  }

  const { valid, errors } = validatePayoutDetails(method, details)
  const errFor = (k) => (touched && errors[k]) ? errors[k] : null

  const handleSave = async () => {
    setTouched(true)
    if (!valid) {
      setStatus({type: 'error', msg: 'Please fix the highlighted fields.'})
      return
    }
    // Normalise the phone before saving so Paystack gets a clean 0XXXXXXXXX.
    const toSave = method === 'momo'
      ? { ...details, phone: normalizeGhPhone(details.phone) }
      : details
    setStatus(null); setSaving(true)
    try {
      await onSave?.({ method, country, details: toSave })
      setStatus({type: 'success', msg: 'Payment method saved successfully.'})
    } catch (e) {
      setStatus({type: 'error', msg: e?.message || 'Failed to save.'})
    } finally {
      setSaving(false)
    }
  }

  const inputError = 'border-destructive focus:ring-destructive'

  return (
    <div className="space-y-4">
      {requireBefore && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm">
          <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <span className="text-foreground">{requireBefore}</span>
        </div>
      )}

      {/* Country */}
      <div className="space-y-2">
        <Label>Country</Label>
        <div className="w-full h-10 flex items-center rounded-lg border border-input bg-muted/40 px-3 text-sm text-foreground">
          Ghana (GHS)
        </div>
        <p className="text-xs text-muted-foreground">Payouts are currently available for Ghana mobile money and bank accounts only.</p>
      </div>

      {/* Method tabs */}
      <div className="flex gap-2 p-1 rounded-lg bg-muted">
        <button
          type="button"
          onClick={() => changeMethod('momo')}
          className={cn(
            'flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
            method === 'momo' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Phone className="h-4 w-4" /> Mobile Money
        </button>
        <button
          type="button"
          onClick={() => changeMethod('bank')}
          className={cn(
            'flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
            method === 'bank' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Building2 className="h-4 w-4" /> Bank Account
        </button>
      </div>

      {/* Fields */}
      {method === 'momo' ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Mobile Money Provider *</Label>
            <select
              value={details.provider || ''}
              onChange={e => setField('provider', e.target.value)}
              className={cn(
                'w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-primary outline-none',
                errFor('provider') && inputError
              )}
            >
              <option value="">— Select provider —</option>
              {MOMO_PROVIDERS_GH.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            {errFor('provider') && <p className="text-xs text-destructive">{errors.provider}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="momo-phone">Mobile Money Number *</Label>
            <Input id="momo-phone" type="tel" placeholder="0241234567"
              className={cn(errFor('phone') && inputError)}
              value={details.phone || ''} onChange={e => setField('phone', e.target.value)} />
            {errFor('phone')
              ? <p className="text-xs text-destructive">{errors.phone}</p>
              : <p className="text-xs text-muted-foreground">The number registered on the MoMo account.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="momo-name">Account Holder Name *</Label>
            <Input id="momo-name" placeholder="As registered on the MoMo account"
              className={cn(errFor('account_name') && inputError)}
              value={details.account_name || ''} onChange={e => setField('account_name', e.target.value)} />
            {errFor('account_name') && <p className="text-xs text-destructive">{errors.account_name}</p>}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Bank *</Label>
            <select
              value={details.bank_code || ''}
              onChange={e => {
                const bank = GH_BANKS.find(b => b.code === e.target.value)
                const nd = { ...details, bank_code: e.target.value, bank_name: bank?.name || '' }
                setDetails(nd); propagate(method, country, nd)
              }}
              className={cn(
                'w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-primary outline-none',
                errFor('bank_name') && inputError
              )}
            >
              <option value="">— Select bank —</option>
              {GH_BANKS.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
            {errFor('bank_name') && <p className="text-xs text-destructive">{errors.bank_name}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank-acct">Account Number *</Label>
            <Input id="bank-acct" placeholder="Bank account number"
              className={cn(errFor('account_number') && inputError)}
              value={details.account_number || ''} onChange={e => setField('account_number', e.target.value)} />
            {errFor('account_number') && <p className="text-xs text-destructive">{errors.account_number}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank-acct-name">Account Holder Name *</Label>
            <Input id="bank-acct-name" placeholder="As shown on the bank account"
              className={cn(errFor('account_name') && inputError)}
              value={details.account_name || ''} onChange={e => setField('account_name', e.target.value)} />
            {errFor('account_name') && <p className="text-xs text-destructive">{errors.account_name}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank-branch">Branch / Swift Code (optional)</Label>
            <Input id="bank-branch" placeholder="Optional"
              value={details.branch || ''} onChange={e => setField('branch', e.target.value)} />
          </div>
        </div>
      )}

      {status && (
        <div className={cn(
          'flex items-center gap-2 p-3 rounded-lg text-sm',
          status.type === 'success' ? 'bg-success/10 text-success border border-success/30'
                                    : 'bg-destructive/10 text-destructive border border-destructive/30'
        )}>
          {status.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {status.msg}
        </div>
      )}

      {showSaveButton && (
        <Button onClick={handleSave} disabled={saving || !valid} className="w-full">
          {saving ? 'Saving…' : 'Save Payment Method'}
        </Button>
      )}

      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <CreditCard className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>This is where your earnings will be sent. You can update it anytime.</span>
      </p>
    </div>
  )
}
