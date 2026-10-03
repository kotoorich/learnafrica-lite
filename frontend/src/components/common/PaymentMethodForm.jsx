import { useState, useEffect } from 'react'
import { Phone, Building2, CreditCard, Check, AlertCircle } from 'lucide-react'
import { Input, Label } from '@/components/common/Input'
import { Button } from '@/components/common/Button'
import { cn } from '@/lib/utils'

/**
 * Reusable payment-method form. Supports two methods:
 *   - 'momo' (Mobile Money): provider (MTN/Vodafone/AirtelTigo), phone, account_name
 *   - 'bank': bank_name, account_number, account_name
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
const MOMO_PROVIDERS_GH = [
  { value: 'MTN MoMo',         label: 'MTN MoMo' },
  { value: 'Vodafone Cash',    label: 'Telecel Cash (formerly Vodafone Cash)' },
  { value: 'AirtelTigo Money', label: 'AirtelTigo Money' },
]
const COUNTRY = 'GH'

export function PaymentMethodForm({ value, onChange, onSave, showSaveButton = true, requireBefore = null }) {
  const [method, setMethod]   = useState(value?.method   || 'momo')
  const country = COUNTRY
  const [details, setDetails] = useState(value?.details  || {})
  const [saving, setSaving]   = useState(false)
  const [status, setStatus]   = useState(null) // {type, msg}

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
    setMethod(m); setDetails({}); propagate(m, country, {})
  }
  const setField = (k, v) => {
    const nd = { ...details, [k]: v }
    setDetails(nd); propagate(method, country, nd)
  }

  const isValid = () => {
    if (method === 'momo') {
      return !!(details.provider && details.phone && details.account_name &&
                String(details.phone).replace(/\D/g, '').length >= 9)
    }
    return !!(details.bank_name && details.account_number && details.account_name &&
              String(details.account_number).replace(/\D/g, '').length >= 6)
  }

  const handleSave = async () => {
    if (!isValid()) {
      setStatus({type: 'error', msg: 'Please fill in all required fields correctly.'})
      return
    }
    setStatus(null); setSaving(true)
    try {
      await onSave?.({ method, country, details })
      setStatus({type: 'success', msg: 'Payment method saved successfully.'})
    } catch (e) {
      setStatus({type: 'error', msg: e?.message || 'Failed to save.'})
    } finally {
      setSaving(false)
    }
  }


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
              className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm focus:ring-2 focus:ring-primary outline-none"
            >
              <option value="">— Select provider —</option>
              {MOMO_PROVIDERS_GH.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="momo-phone">Mobile Money Number *</Label>
            <Input id="momo-phone" type="tel" placeholder="0241234567"
              value={details.phone || ''} onChange={e => setField('phone', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="momo-name">Account Holder Name *</Label>
            <Input id="momo-name" placeholder="As registered on the MoMo account"
              value={details.account_name || ''} onChange={e => setField('account_name', e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="bank-name">Bank Name *</Label>
            <Input id="bank-name" placeholder="e.g. GCB Bank, Ecobank, Access Bank"
              value={details.bank_name || ''} onChange={e => setField('bank_name', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank-acct">Account Number *</Label>
            <Input id="bank-acct" placeholder="Bank account number"
              value={details.account_number || ''} onChange={e => setField('account_number', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bank-acct-name">Account Holder Name *</Label>
            <Input id="bank-acct-name" placeholder="As shown on the bank account"
              value={details.account_name || ''} onChange={e => setField('account_name', e.target.value)} />
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
        <Button onClick={handleSave} disabled={saving || !isValid()} className="w-full">
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
