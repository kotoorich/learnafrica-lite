/**
 * InstructorProfileFields — the country-aware identity + location form.
 *
 * Shared by instructor signup and the "Complete Your Instructor Profile" page
 * so both collect exactly the same fields and enforce the same rules. Field
 * visibility follows the selected country (e.g. postal code only where it is
 * used, GhanaPost GPS only for Ghana). Where we have reliable subdivision data
 * we show a dropdown; otherwise a clearly-labelled free-text box — never an
 * invented list.
 */
import { useEffect, useMemo, useState } from 'react'
import { IdCard, MapPin, Phone, Globe, Building2, AlertTriangle, Check } from 'lucide-react'
import { Input, Label } from '@/components/common/Input'
import { cn } from '@/lib/utils'
import {
  idTypesFor, usesPostalCode, digitalAddressField, normalizeIdNumber,
} from '@/lib/countries'

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'ring-offset-background focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring focus-visible:ring-offset-2'

function FieldError({ children }) {
  if (!children) return null
  return <p className="text-sm text-destructive">{children}</p>
}

function Hint({ children }) {
  if (!children) return null
  return <p className="text-[11px] text-muted-foreground">{children}</p>
}

export function InstructorProfileFields({
  value = {},
  onChange,
  config,
  requirements,
  errors = {},
  /** When true the identity block is read-only (country / ID already frozen). */
  lockIdentity = false,
  /** Show the address block (signup collects it on the completion page). */
  showAddress = true,
  /** Optional controlled "re-enter ID" value so the parent can validate on submit. */
  idConfirm: idConfirmProp,
  onIdConfirmChange,
}) {
  const country = value.country || ''
  const idType = value.id_type || ''
  const [localConfirm, setLocalConfirm] = useState('')
  const idConfirm = idConfirmProp !== undefined ? idConfirmProp : localConfirm
  const setIdConfirm = onIdConfirmChange || setLocalConfirm

  const idTypes = useMemo(() => idTypesFor(config, country), [config, country])
  const postalRequired = usesPostalCode(config, country)
  const digital = digitalAddressField(config, country)
  const subdivisions = (requirements && requirements.subdivisions) || []
  const hasSubdivisions = subdivisions.length > 0

  // Keep the ID type valid for the country. When the country changes, clear the
  // identity fields so a Ghana Card number can never be carried into, say, a
  // passport field.
  useEffect(() => {
    if (!country) return
    if (idType && !idTypes.some((t) => t.value === idType)) {
      onChange({ id_type: idTypes[0]?.value || '', id_number: '' })
    }
  }, [country, idType, idTypes, onChange])

  const idNumber = value.id_number || ''
  const idMismatch = idConfirm.length > 0 &&
    normalizeIdNumber(country, idType, idConfirm) !== normalizeIdNumber(country, idType, idNumber)

  return (
    <div className="space-y-5">
      {/* ── Country ── */}
      <div className="space-y-2">
        <Label htmlFor="country">Country</Label>
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            id="country"
            value={country}
            disabled={lockIdentity}
            onChange={(e) => onChange({ country: e.target.value, id_type: '', id_number: '',
                                         region: '', district: '', city: '', street_address: '',
                                         postal_code: '', digital_address: '' })}
            className={cn(selectClass, 'pl-10', lockIdentity && 'opacity-70 cursor-not-allowed')}
          >
            <option value="">Select your country…</option>
            {(config?.countries || []).map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        {lockIdentity
          ? <Hint>Country is locked after you submit. Contact support if it needs changing.</Hint>
          : <Hint>Pick the country on your identity document.</Hint>}
        <FieldError>{errors.country}</FieldError>
      </div>

      {/* ── Identification ── */}
      {country && (
        <>
          <div className="space-y-2">
            <Label htmlFor="id_type">Identification type</Label>
            <div className="relative">
              <IdCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                id="id_type"
                value={idType}
                disabled={lockIdentity}
                onChange={(e) => onChange({ id_type: e.target.value, id_number: '' })}
                className={cn(selectClass, 'pl-10', lockIdentity && 'opacity-70 cursor-not-allowed')}
              >
                <option value="">Choose a document…</option>
                {idTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <FieldError>{errors.id_type}</FieldError>
          </div>

          {idType && (
            <>
              <div className="space-y-2">
                <Label htmlFor="id_number">Identification number</Label>
                <div className="relative">
                  <IdCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="id_number"
                    value={idNumber}
                    disabled={lockIdentity}
                    onChange={(e) => onChange({ id_number: e.target.value })}
                    onBlur={() => {
                      const n = normalizeIdNumber(country, idType, idNumber)
                      if (n && n !== idNumber) onChange({ id_number: n })
                    }}
                    placeholder={country === 'GH' && idType === 'ghana_card' ? 'GHA-123456789-0' : 'Enter the number on the document'}
                    className={cn('pl-10', lockIdentity && 'opacity-70 cursor-not-allowed')}
                  />
                </div>
                <FieldError>{errors.id_number}</FieldError>
              </div>

              {!lockIdentity && (
                <div className="space-y-2">
                  <Label htmlFor="id_confirm">Re-enter identification number</Label>
                  <div className="relative">
                    <Check className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="id_confirm"
                      value={idConfirm}
                      onChange={(e) => setIdConfirm(e.target.value)}
                      placeholder="Type it again to confirm"
                      className={cn('pl-10', idMismatch && 'border-destructive focus-visible:ring-destructive')}
                    />
                  </div>
                  {idMismatch
                    ? <p className="text-sm text-destructive">The two numbers do not match. Please check and re-enter.</p>
                    : <Hint>Please double-check this number. It is locked after you submit and cannot be edited by you.</Hint>}
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-[11px] text-muted-foreground">
                  Your identity details are stored securely, shown only to authorised LearnAfrica
                  staff, and are never displayed on your public profile or course pages. Entering a
                  number here is not the same as it being independently verified.
                </p>
              </div>
            </>
          )}
        </>
      )}

      {showAddress && country && (
        <>
          {/* ── Location ── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="region">{hasSubdivisions ? 'State / region' : 'Region (optional)'}</Label>
              {hasSubdivisions ? (
                <select
                  id="region"
                  value={value.region || ''}
                  onChange={(e) => onChange({ region: e.target.value })}
                  className={selectClass}
                >
                  <option value="">Select…</option>
                  {subdivisions.map((s) => <option key={s.code} value={s.name}>{s.name}</option>)}
                </select>
              ) : (
                <Input id="region" value={value.region || ''}
                  onChange={(e) => onChange({ region: e.target.value })}
                  placeholder="Type your region" />
              )}
              {!hasSubdivisions && <Hint>We do not have a verified list for this country, so please type it.</Hint>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="district">District (optional)</Label>
              <Input id="district" value={value.district || ''}
                onChange={(e) => onChange({ district: e.target.value })}
                placeholder="Type your district" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City / locality</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="city" value={value.city || ''}
                  onChange={(e) => onChange({ city: e.target.value })}
                  placeholder="Type your city or town" className="pl-10" />
              </div>
              <FieldError>{errors.city}</FieldError>
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal_code">
                Postal code{postalRequired ? '' : ' (optional)'}
              </Label>
              <Input id="postal_code" value={value.postal_code || ''}
                onChange={(e) => onChange({ postal_code: e.target.value.toUpperCase() })}
                placeholder={postalRequired ? 'Required for this country' : 'If your country uses one'} />
              <FieldError>{errors.postal_code}</FieldError>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="street_address">Street address</Label>
            <Input id="street_address" value={value.street_address || ''}
              onChange={(e) => onChange({ street_address: e.target.value })}
              placeholder="House number and street" />
            <FieldError>{errors.street_address}</FieldError>
          </div>

          {digital && (
            <div className="space-y-2">
              <Label htmlFor="digital_address">{digital.label}</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="digital_address" value={value.digital_address || ''}
                  onChange={(e) => onChange({ digital_address: e.target.value.toUpperCase() })}
                  placeholder={digital.placeholder} className="pl-10" />
              </div>
              <Hint>Find yours in the GhanaPost GPS app.</Hint>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="phone" value={value.phone || ''}
                onChange={(e) => onChange({ phone: e.target.value })}
                placeholder="Include your country code, e.g. +233… or +1…" className="pl-10" />
            </div>
            <FieldError>{errors.phone}</FieldError>
          </div>
        </>
      )}
    </div>
  )
}

export default InstructorProfileFields
