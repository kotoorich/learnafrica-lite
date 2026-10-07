import { useEffect, useMemo, useRef, useState } from 'react'
import { Phone } from 'lucide-react'
import { Input } from '@/components/common/Input'
import { cn } from '@/lib/utils'
import {
  COUNTRIES, DEFAULT_COUNTRY,
  countryByCode, parsePhone, sanitizePhoneInput,
} from '@/lib/payoutDetails'

/**
 * Country-code phone input.
 *
 * The user picks their country (which fixes the dial code) then types the rest.
 * Non-digit characters are stripped automatically as they type, so a stray
 * letter, space, bracket or dash can never end up saved. The component always
 * emits an international value, e.g. "+233244123456".
 *
 * `onChange` is called with a normal input-like event ({ target: { name, value } })
 * so it drops straight into the existing `handleChange` handlers.
 */
export function PhoneField({
  id,
  name = 'phone',
  value = '',
  onChange,
  disabled = false,
  className,
  selectClassName,
  inputClassName,
  placeholder = '244 123 456',
  error,
  helperText,
}) {
  const parsed = useMemo(() => parsePhone(value, DEFAULT_COUNTRY), [value])
  const [country, setCountry] = useState(parsed.country)
  const [national, setNational] = useState(parsed.national)
  // The country the user last picked themselves. While it is set, typing does
  // not re-derive the country from the value (that would fight the selection
  // for shared dial codes such as +1). It is cleared once the field empties.
  const userCountry = useRef(null)

  // Re-seed from the value only when it changes from the outside (e.g. the
  // profile loads), not on every keystroke — otherwise the caret jumps.
  useEffect(() => {
    const p = parsePhone(value, DEFAULT_COUNTRY)
    setNational(p.national)
    if (!p.national) {
      userCountry.current = null
      setCountry(p.country)
    } else if (userCountry.current) {
      setCountry(userCountry.current)
    } else {
      setCountry(p.country)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const emit = (nextCountry, nextNational) => {
    const dial = countryByCode(nextCountry).dial
    const digits = String(nextNational || '').replace(/\D/g, '')
    const e164 = digits ? dial + digits : ''
    onChange?.({ target: { name, value: e164 } })
  }

  const onNationalChange = (e) => {
    const digits = sanitizePhoneInput(e.target.value).replace(/^\+/, '').replace(/\D/g, '').slice(0, 15)
    setNational(digits)
    emit(country, digits)
  }

  const onCountryChange = (e) => {
    const next = e.target.value
    userCountry.current = next
    setCountry(next)
    emit(next, national)
  }

  const inputError = error && 'border-destructive focus:ring-destructive'

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex gap-2">
        <select
          aria-label="Country code"
          value={country}
          onChange={onCountryChange}
          disabled={disabled}
          className={cn(
            'h-10 shrink-0 rounded-lg border border-input bg-background px-2 text-sm outline-none',
            'focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            selectClassName
          )}
        >
          {COUNTRIES.map(c => (
            <option key={c.code} value={c.code}>{c.flag} {c.dial}</option>
          ))}
        </select>
        <div className="relative flex-1">
          <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={id}
            name={name}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={national}
            onChange={onNationalChange}
            disabled={disabled}
            placeholder={placeholder}
            className={cn('pl-10', inputError, inputClassName)}
          />
        </div>
      </div>
      {error
        ? <p className="text-sm text-destructive">{error}</p>
        : helperText
          ? <p className="text-xs text-muted-foreground">{helperText}</p>
          : null}
    </div>
  )
}
