/**
 * InstructorProfileCompletion — the "Complete Your Instructor Profile" page.
 *
 * Reached by an approved instructor whose country-aware profile is missing the
 * details required for their country. The server refuses instructor features
 * until this is done (see backend security.instructor_required), so this page is
 * the only way forward — and the only way the client can satisfy the gate.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, ShieldCheck, Info } from 'lucide-react'
import { Button } from '@/components/common/Button'
import { useAuth } from '@/context/AuthContext'
import { API_BASE } from '@/lib/api'
import { fetchCountryConfig, fetchRequirements, isValidIdNumber, normalizeIdNumber } from '@/lib/countries'
import { InstructorProfileFields } from '@/components/instructor/InstructorProfileFields'

function Card({ children, className = '' }) {
  return <div className={`rounded-2xl border border-border bg-card p-6 sm:p-7 ${className}`}>{children}</div>
}

export default function InstructorProfileCompletion() {
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()

  const [config, setConfig] = useState(null)
  const [requirements, setRequirements] = useState(null)
  const [profile, setProfile] = useState({})
  const [idConfirm, setIdConfirm] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generalError, setGeneralError] = useState('')
  const formRef = useRef(null)
  const [alreadyComplete, setAlreadyComplete] = useState(false)

  const token = typeof window !== 'undefined' ? sessionStorage.getItem('auth_token') : null

  const authFetch = useCallback((path, options = {}) => {
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    })
  }, [token])

  // Load the caller's current profile + the country reference data.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [cfg, profRes] = await Promise.all([fetchCountryConfig(), authFetch('/api/instructor/profile')])
        const prof = await profRes.json()
        if (cancelled) return
        setConfig(cfg)
        setProfile(prof.profile || {})
        setAlreadyComplete(!!prof.complete)
        if (prof.requirements) setRequirements(prof.requirements)
      } catch {
        if (!cancelled) setGeneralError('We could not load your profile. Please refresh the page.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [authFetch])

  // When the country changes (only possible before it is frozen), reload its rules.
  const country = profile.country || ''
  useEffect(() => {
    if (!country) { setRequirements(null); return }
    let cancelled = false
    fetchRequirements(country).then((r) => { if (!cancelled) setRequirements(r) }).catch(() => {})
    return () => { cancelled = true }
  }, [country])

  const identityFrozen = !!(profile.country && profile.id_number_set)

  const handleChange = useCallback((patch) => {
    setProfile((prev) => ({ ...prev, ...patch }))
    setErrors((prev) => {
      const next = { ...prev }
      Object.keys(patch).forEach((k) => { delete next[k] })
      return next
    })
  }, [])

  const validate = useCallback(() => {
    const errs = {}
    if (!profile.country) errs.country = 'Please select your country.'
    if (!profile.id_type) errs.id_type = 'Please choose an identification type.'
    if (!identityFrozen) {
      if (!isValidIdNumber(profile.country, profile.id_type, profile.id_number)) {
        errs.id_number = 'Enter a valid identification number.'
      } else if (normalizeIdNumber(profile.country, profile.id_type, idConfirm) !==
                 normalizeIdNumber(profile.country, profile.id_type, profile.id_number)) {
        errs.id_number = 'The two identification numbers do not match.'
      }
    }
    if (!profile.city) errs.city = 'City or locality is required.'
    if (!profile.street_address) errs.street_address = 'Street address is required.'
    if (requirements?.postal_required && !profile.postal_code) {
      errs.postal_code = 'Postal code is required for this country.'
    }
    if (profile.phone) {
      const p = String(profile.phone).trim()
      if (!/^\+?\d[\d\s-]{6,}$/.test(p)) errs.phone = 'Enter a valid phone number including country code.'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }, [profile, idConfirm, identityFrozen, requirements])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    setGeneralError('')
    if (!validate()) {
      // Take the user straight to the first field that needs attention.
      requestAnimationFrame(() => {
        const el = formRef.current?.querySelector('[aria-invalid="true"]')
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.focus?.({ preventScroll: true })
        }
      })
      return
    }
    setSaving(true)
    try {
      // Identity is only sent while it is still editable; once frozen the server
      // ignores it anyway.
      const payload = {
        region: profile.region || '', district: profile.district || '',
        city: profile.city || '', street_address: profile.street_address || '',
        postal_code: profile.postal_code || '', digital_address: profile.digital_address || '',
        phone: profile.phone || '',
      }
      if (!identityFrozen) {
        payload.country = profile.country
        payload.id_type = profile.id_type
        payload.id_number = profile.id_number
      }
      const res = await authFetch('/api/instructor/profile', { method: 'PUT', body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) {
        if (data.errors) setErrors(data.errors)
        setGeneralError(data.error || 'Please correct the highlighted fields.')
        return
      }
      if (data.complete) {
        try { await refreshProfile() } catch { /* ignore */ }
        navigate('/instructor', { replace: true })
      } else {
        setGeneralError('Some required details are still missing. Please review the form.')
      }
    } catch {
      setGeneralError('Could not save your profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [validate, profile, identityFrozen, authFetch, refreshProfile, navigate])

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Loading your profile…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <ShieldCheck className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Complete Your Instructor Profile</h1>
        <p className="text-muted-foreground">
          We need a few details about you before you can start teaching on LearnAfrica. This keeps
          the platform trusted for everyone.
        </p>
      </div>

      {alreadyComplete && (
        <Card className="border-success/30 bg-success/10">
          <p className="text-sm text-success">Your profile is already complete. You can continue to your dashboard.</p>
          <Button className="mt-3" onClick={() => navigate('/instructor', { replace: true })}>Go to dashboard</Button>
        </Card>
      )}

      {generalError && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{generalError}</div>
      )}

      <Card>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-5" noValidate>
          <InstructorProfileFields
            value={profile}
            onChange={handleChange}
            config={config}
            requirements={requirements}
            errors={errors}
            lockIdentity={identityFrozen}
            showAddress
            idConfirm={idConfirm}
            onIdConfirmChange={setIdConfirm}
          />

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-[11px] text-muted-foreground">
              {user?.role === 'instructor'
                ? 'These details are required. You can update your address and phone later, but your country and identification number are locked once submitted.'
                : 'As an administrator you can edit these details for any instructor from the admin panel.'}
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>) : 'Complete Profile'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
