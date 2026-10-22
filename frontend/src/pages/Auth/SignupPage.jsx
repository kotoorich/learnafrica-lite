import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, User, GraduationCap, X, Check, BookOpen, Play, CheckCircle2, ArrowRight, IdCard, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/common/Button'
import { Input, Label } from '@/components/common/Input'
import { PhoneField } from '@/components/common/PhoneField'
import { useAuth } from '@/context/AuthContext'
import { GoogleAuthButton } from '@/components/common/GoogleAuthButton'
import { isValidIntlPhone } from '@/lib/payoutDetails'
import { API_BASE } from '@/lib/api'
import { cn } from '@/lib/utils'
import { InstructorProfileFields } from '@/components/instructor/InstructorProfileFields'
import {
  fetchCountryConfig, fetchRequirements, isValidIdNumber, normalizeIdNumber,
} from '@/lib/countries'

// ── Instructor-specific validators (mirror the backend) ─────────────────────
const isValidGhanaPostGps = (v) =>
  /^[A-Z]{2}-\d{3,5}-\d{4,5}$/.test(String(v || '').replace(/\s+/g, '').toUpperCase())

// Identity documents are country-aware (see lib/countries); Ghana Card is the
// only one with a strict national format. Kept here only as a fallback label.
const ID_TYPE_LABELS = {
  ghana_card: 'Ghana Card', national_id: 'National ID', voter_id: "Voter's ID",
  passport: 'Passport', drivers_licence: "Driver's licence", drivers_license: "Driver's Licence",
  nin: 'National Identification Number', other_gov_id: 'Other government-issued ID',
}

// Universal password rules — applied in real-time on the UI and enforced on the backend.
const PASSWORD_RULES = [
  { id: 'length',    label: 'At least 8 characters',         test: (p) => p.length >= 8 },
  { id: 'uppercase', label: 'One uppercase letter (A-Z)',    test: (p) => /[A-Z]/.test(p) },
  { id: 'lowercase', label: 'One lowercase letter (a-z)',    test: (p) => /[a-z]/.test(p) },
  { id: 'number',    label: 'One number (0-9)',              test: (p) => /[0-9]/.test(p) },
  { id: 'symbol',    label: 'One special character (!@#$%)', test: (p) => /[^A-Za-z0-9]/.test(p) },
]

const isPasswordStrong = (p) => PASSWORD_RULES.every(r => r.test(p))

export function SignupPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    isInstructor: false
  })
  // Step 0 = choose account type; 'student' | 'instructor' selects the form.
  const [roleChoice, setRoleChoice] = useState(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [acceptVerification, setAcceptVerification] = useState(false)
  // Country-aware instructor identity. Kept in a single object so the shared
  // InstructorProfileFields component can own the whole block.
  const [instructor, setInstructor] = useState({
    country: '', id_type: '', id_number: '',
    region: '', district: '', city: '', street_address: '', postal_code: '',
    digital_address: '', phone: '',
  })
  const [idConfirm, setIdConfirm] = useState('')
  const [countryConfig, setCountryConfig] = useState(null)
  const [requirements, setRequirements] = useState(null)
  const [regInfo, setRegInfo] = useState(null)
  const [modal, setModal] = useState(null) // 'terms' | 'privacy' | null
  const { signup, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Deep link: /signup?type=instructor|student preselects the account type.
  useEffect(() => {
    const t = (searchParams.get('type') || '').toLowerCase()
    if (t === 'instructor' || t === 'student') {
      setRoleChoice(t)
      setFormData(prev => ({ ...prev, isInstructor: t === 'instructor' }))
    }
  }, [searchParams])

  // Country reference data — loaded once the instructor form is shown.
  useEffect(() => {
    if (!formData.isInstructor) return
    let alive = true
    fetchCountryConfig().then(c => { if (alive) setCountryConfig(c) }).catch(() => {})
    return () => { alive = false }
  }, [formData.isInstructor])

  // Per-country rules (subdivisions, postal requirement) follow the selection.
  useEffect(() => {
    if (!instructor.country) { setRequirements(null); return }
    let alive = true
    fetchRequirements(instructor.country)
      .then(r => { if (alive) setRequirements(r) })
      .catch(() => { if (alive) setRequirements(null) })
    return () => { alive = false }
  }, [instructor.country])

  const handleInstructorChange = (patch) => {
    setInstructor(prev => ({ ...prev, ...patch }))
    setErrors(er => {
      const next = { ...er }
      Object.keys(patch).forEach(k => { delete next[k] })
      return next
    })
  }

  // Fetch the instructor registration config once the instructor form is shown,
  // so the applicant sees the exact fee before entering details.
  useEffect(() => {
    if (!formData.isInstructor) return
    let alive = true
    fetch(`${API_BASE}/api/instructor-registration`)
      .then(r => r.json())
      .then(d => { if (alive) setRegInfo(d) })
      .catch(() => { if (alive) setRegInfo({ is_free: true, fee: 0, currency: 'GHS' }) })
    return () => { alive = false }
  }, [formData.isInstructor])

  // Sign up with Google. This button is only shown on the student flow — instructor
  // accounts must be created with email so identity details are collected. New
  // accounts are created on the backend (never auto-approved as instructors).
  const handleGoogle = async (credential) => {
    setErrors({})
    setIsLoading(true)
    try {
      await loginWithGoogle(credential, 'student')
      navigate('/dashboard')
    } catch (err) {
      setErrors({ general: err.message || 'Google sign up failed. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  // Live evaluation of each rule
  const ruleStatuses = useMemo(
    () => PASSWORD_RULES.map(r => ({ ...r, passed: r.test(formData.password) })),
    [formData.password]
  )
  const passedCount = ruleStatuses.filter(r => r.passed).length
  const strengthPct = (passedCount / PASSWORD_RULES.length) * 100
  const strengthLabel =
    passedCount <= 1 ? 'Very weak' :
    passedCount === 2 ? 'Weak' :
    passedCount === 3 ? 'Fair' :
    passedCount === 4 ? 'Strong' : 'Very strong'
  const strengthColor =
    passedCount <= 1 ? 'bg-destructive' :
    passedCount === 2 ? 'bg-orange-500' :
    passedCount === 3 ? 'bg-yellow-500' :
    passedCount === 4 ? 'bg-success' : 'bg-success'

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.name) newErrors.name = 'Name is required'
    if (!formData.email) newErrors.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Invalid email address'
    if (formData.phone && !isValidIntlPhone(formData.phone)) {
      newErrors.phone = 'Enter a valid phone number, e.g. 0244123456'
    }
    if (!formData.password) newErrors.password = 'Password is required'
    else if (!isPasswordStrong(formData.password)) {
      newErrors.password = 'Password does not meet all requirements'
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }
    if (!acceptTerms) newErrors.terms = 'You must accept the terms and conditions'
    if (formData.isInstructor) {
      if (!instructor.country) newErrors.country = 'Please select your country.'
      if (!instructor.id_type) newErrors.id_type = 'Please choose an identification type.'
      if (!isValidIdNumber(instructor.country, instructor.id_type, instructor.id_number)) {
        newErrors.id_number = `Enter a valid ${ID_TYPE_LABELS[instructor.id_type] || 'identification'} number`
      } else if (normalizeIdNumber(instructor.country, instructor.id_type, idConfirm) !==
                 normalizeIdNumber(instructor.country, instructor.id_type, instructor.id_number)) {
        newErrors.id_number = 'The two identification numbers do not match.'
      }
      if (instructor.country === 'GH' && !isValidGhanaPostGps(instructor.digital_address)) {
        newErrors.digital_address = 'Enter a valid GhanaPost GPS address (format GA-123-4567)'
      }
      if (!acceptVerification) {
        newErrors.verification = 'You must acknowledge the information-verification statement'
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setIsLoading(true)
    try {
      if (formData.isInstructor) {
        // For instructor: carry the identity + agreement data to onboarding,
        // where the professional profile and payout method are collected.
        const idNumberNorm = normalizeIdNumber(instructor.country, instructor.id_type, instructor.id_number)
        navigate('/signup/instructor-onboarding', {
          state: {
            email:    formData.email,
            name:     formData.name,
            phone:    instructor.phone || formData.phone,
            password: formData.password,
            country:  instructor.country,
            id_type:  instructor.id_type,
            id_number: idNumberNorm,
            // Legacy Ghana field kept in sync so nothing downstream breaks.
            ghana_card_number: instructor.id_type === 'ghana_card' ? idNumberNorm : '',
            ghana_post_gps: instructor.country === 'GH' ? String(instructor.digital_address || '').trim().toUpperCase() : '',
            region: instructor.region, district: instructor.district, city: instructor.city,
            street_address: instructor.street_address, postal_code: instructor.postal_code,
            digital_address: instructor.digital_address,
            accept_terms: true,
            accept_verification: true,
            agreement_version: '2026-01',
          }
        })
        return
      }

      // For students: sign up immediately
      const result = await signup({
        name:     formData.name,
        email:    formData.email,
        phone:    formData.phone,
        password: formData.password,
        role:     'student',
      })
      // If the backend requires email verification, redirect to /verify-email
      if (result && result.needs_verification) {
        navigate('/verify-email', { state: { email: result.email || formData.email } })
        return
      }
      navigate('/dashboard')
    } catch (err) {
      setErrors({ general: err.message || 'Sign up failed. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  // Show the requirements panel when the user focuses the password field or has typed something
  const showRequirements = passwordFocused || formData.password.length > 0

  // ── Step 1: choose how to sign up ──────────────────────────────────────────
  if (!roleChoice) {
    const options = [
      {
        id: 'student',
        icon: BookOpen,
        badge: null,
        title: 'Join as a Student',
        description: 'Enroll in courses, learn at your own pace, and access video lessons, quizzes and verifiable certificates.',
        cta: 'Continue as Student',
        highlights: ['Browse and enroll in courses', 'Learn from expert instructors', 'Earn verifiable certificates'],
      },
      {
        id: 'instructor',
        icon: GraduationCap,
        badge: 'Teach on LearnAfrica',
        title: 'Join as an Instructor',
        description: 'Create, upload and manage your own courses, reach learners across Africa and beyond, and earn from every enrollment.',
        cta: 'Continue as Instructor',
        highlights: ['Create and publish courses', 'Reach learners worldwide', 'Get paid for your teaching'],
      },
    ]
    return (
      <div className="space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Join LearnAfrica</h1>
          <p className="text-muted-foreground">Choose how you want to get started</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 items-stretch">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setFormData(prev => ({ ...prev, isInstructor: opt.id === 'instructor' }))
                setRoleChoice(opt.id)
              }}
              className={cn(
                'group relative text-left rounded-2xl border bg-card p-6 sm:p-7 flex flex-col h-full overflow-hidden',
                'transition-all duration-200 ease-out will-change-transform',
                'hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-xl',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                'active:translate-y-0 active:scale-[0.995]',
                opt.id === 'instructor' ? 'border-primary/30' : 'border-border'
              )}
            >
              {/* Soft top accent that warms up on hover */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/0 via-primary/40 to-primary/0 opacity-60 transition-opacity group-hover:opacity-100"
              />
              {opt.badge && (
                <span className="absolute right-5 top-5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                  {opt.badge}
                </span>
              )}
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 transition-transform duration-200 group-hover:scale-105">
                <opt.icon className="h-7 w-7 text-primary" />
              </div>
              <h2 className="mb-2 text-xl font-bold tracking-tight">{opt.title}</h2>
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">{opt.description}</p>
              <ul className="mb-7 space-y-2.5">
                {opt.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2.5 text-sm text-foreground/80">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
              <span className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-colors group-hover:bg-primary/90">
                {opt.cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    )
  }

  const isInstructorFlow = roleChoice === 'instructor'

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-bold">{isInstructorFlow ? 'Create an instructor account' : 'Create your account'}</h1>
        <p className="text-muted-foreground">
          {isInstructorFlow
            ? 'Start sharing your knowledge with learners across Africa'
            : 'Get started with your learning journey'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {isInstructorFlow ? (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs text-muted-foreground">
              Instructor accounts are created with an email address so we can verify your
              identity before approval. Google sign-up is available to students — you can
              still use Google to sign in once your account exists.
            </p>
          </div>
        ) : (
          <>
            <GoogleAuthButton
              text="signup_with"
              role="student"
              onCredential={handleGoogle}
              helper="Sign up with Google. New accounts join as a student; instructors are reviewed before approval."
            />
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">or sign up with email</span>
              </div>
            </div>
          </>
        )}
        {errors.general && (
          <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{errors.general}</div>
        )}

        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="name" name="name" value={formData.name} onChange={handleChange} placeholder="John Doe" className="pl-10" />
          </div>
          {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" className="pl-10" />
          </div>
          {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">
            Phone Number <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <PhoneField
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            error={errors.phone}
            helperText="Pick your country, then type your number. A number we can call you on — you can change or remove it later."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={handleChange}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              placeholder="Create a strong password"
              className="pl-10 pr-10"
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}

          {/* Live password requirements & strength meter */}
          {showRequirements && (
            <div className="mt-3 p-3 rounded-lg border border-border bg-muted/30 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
              {/* Strength meter */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Password strength</span>
                  <span className={cn(
                    'font-semibold',
                    passedCount <= 1 ? 'text-destructive' :
                    passedCount === 2 ? 'text-orange-500' :
                    passedCount === 3 ? 'text-yellow-600' :
                    'text-success'
                  )}>
                    {formData.password ? strengthLabel : '—'}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full transition-all duration-300', strengthColor)}
                    style={{ width: `${strengthPct}%` }}
                  />
                </div>
              </div>

              {/* Requirements list */}
              <ul className="space-y-1.5">
                {ruleStatuses.map(rule => (
                  <li key={rule.id} className="flex items-center gap-2 text-xs">
                    <span className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-full shrink-0 transition-colors',
                      rule.passed ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
                    )}>
                      {rule.passed
                        ? <Check className="h-2.5 w-2.5" strokeWidth={3} />
                        : <X className="h-2.5 w-2.5" strokeWidth={3} />}
                    </span>
                    <span className={cn(
                      'transition-colors',
                      rule.passed ? 'text-foreground line-through opacity-70' : 'text-muted-foreground'
                    )}>
                      {rule.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="confirmPassword" name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} value={formData.confirmPassword} onChange={handleChange} placeholder="Confirm your password" className="pl-10 pr-10" />
            <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
          {/* Live match indicator */}
          {formData.confirmPassword.length > 0 && !errors.confirmPassword && (
            <div className={cn(
              'flex items-center gap-1.5 text-xs',
              formData.password === formData.confirmPassword ? 'text-success' : 'text-destructive'
            )}>
              {formData.password === formData.confirmPassword
                ? <><Check className="h-3 w-3" /> Passwords match</>
                : <><X className="h-3 w-3" /> Passwords do not match</>
              }
            </div>
          )}
        </div>

        {/* Selected account type — reflects the choice made on the previous step */}
        <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            {isInstructorFlow ? <GraduationCap className="h-4 w-4 text-primary" /> : <BookOpen className="h-4 w-4 text-primary" />}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{isInstructorFlow ? 'Instructor account' : 'Student account'}</p>
            <p className="text-xs text-muted-foreground truncate">
              {isInstructorFlow ? 'Create and manage courses' : 'Enroll in courses and learn'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setRoleChoice(null); setErrors({}) }}
            className="text-xs font-medium text-primary hover:underline shrink-0"
          >
            Change
          </button>
        </div>

        {/* Instructor-only: country-aware identity + verification acknowledgement */}
        {isInstructorFlow && (
          <>
            <div className="p-3 rounded-lg border border-border bg-muted/30 flex items-start gap-2">
              <IdCard className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Tell us where you are and which government-issued ID you hold. This is stored
                securely, shown only to authorised LearnAfrica staff, and never displayed on your
                public profile or course pages.
              </p>
            </div>

            <InstructorProfileFields
              value={instructor}
              onChange={handleInstructorChange}
              config={countryConfig}
              requirements={requirements}
              errors={errors}
              idConfirm={idConfirm}
              onIdConfirmChange={setIdConfirm}
            />

            {/* Registration fee notice */}
            {regInfo && (
              <div className={cn('p-3 rounded-lg border text-sm',
                regInfo.is_free ? 'bg-success/10 border-success/30' : 'bg-primary/10 border-primary/30')}>
                {regInfo.is_free ? (
                  <p className="text-success font-medium">Instructor registration is free.</p>
                ) : (
                  <p className="text-foreground">
                    A one-time instructor registration fee of{' '}
                    <strong>{regInfo.currency || 'GHS'} {Number(regInfo.fee || 0).toFixed(2)}</strong>{' '}
                    applies. You'll pay it after submitting your application, before your account is activated.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="verification"
                checked={acceptVerification}
                onChange={(e) => setAcceptVerification(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-border accent-primary"
              />
              <label htmlFor="verification" className="text-sm text-muted-foreground cursor-pointer">
                I confirm that the information I have provided is accurate and truthful. I understand that
                LearnAfrica may verify this information and that providing false or misleading information may
                result in rejection, suspension, account termination, or referral to the appropriate authorities
                for possible legal action where applicable.
              </label>
            </div>
            {errors.verification && <p className="text-sm text-destructive">{errors.verification}</p>}
          </>
        )}

        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="terms"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border accent-primary"
          />
          <label htmlFor="terms" className="text-sm text-muted-foreground cursor-pointer">
            I agree to the{' '}
            <button type="button" onClick={() => setModal('terms')} className="text-primary hover:underline font-medium">Terms of Service</button>
            {' '}and{' '}
            <button type="button" onClick={() => setModal('privacy')} className="text-primary hover:underline font-medium">Privacy Policy</button>
          </label>
        </div>
        {errors.terms && <p className="text-sm text-destructive">{errors.terms}</p>}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Creating account...' : (formData.isInstructor ? 'Continue to instructor setup' : 'Create account')}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
      </p>

      {/* Terms / Privacy modal */}
      {modal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="bg-card max-w-2xl w-full max-h-[80vh] rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-bold">{modal === 'terms' ? 'Terms of Service' : 'Privacy Policy'}</h2>
              <button onClick={() => setModal(null)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto text-sm text-muted-foreground leading-relaxed space-y-3">
              {modal === 'terms' ? (
                <>
                  <p>Welcome to LearnAfrica. By creating an account, you agree to use the platform respectfully, complete payments where applicable, and protect your account credentials. You are responsible for the accuracy of the information you provide and any activity under your account.</p>
                  <p>Instructors must own the rights to any content they upload. Students agree not to redistribute paid course materials. LearnAfrica reserves the right to suspend accounts that violate these terms.</p>
                  <p>Refunds for paid courses are issued at our discretion within 14 days of purchase, provided less than 25% of the course has been completed.</p>
                </>
              ) : (
                <>
                  <p>We collect the minimum information needed to operate the platform: your name, email, profile details you choose to share (such as an optional phone number), and course progress. We never sell your data to third parties.</p>
                  <p>Payment information is processed by our payment provider — we do not store full card numbers on our servers. Your password is hashed and cannot be recovered, only reset.</p>
                  <p>You can request export or deletion of your data at any time by contacting support. Cookies are used solely for authentication and remembering UI preferences.</p>
                </>
              )}
            </div>
            <div className="p-4 border-t border-border bg-muted/20">
              <Button onClick={() => setModal(null)} className="w-full">Got it</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
