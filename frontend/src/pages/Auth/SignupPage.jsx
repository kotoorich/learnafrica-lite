import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, User, GraduationCap, X, Check, BookOpen, Play, CheckCircle2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/common/Button'
import { Input, Label } from '@/components/common/Input'
import { PhoneField } from '@/components/common/PhoneField'
import { useAuth } from '@/context/AuthContext'
import { GoogleAuthButton } from '@/components/common/GoogleAuthButton'
import { isValidIntlPhone } from '@/lib/payoutDetails'
import { cn } from '@/lib/utils'

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
  const [modal, setModal] = useState(null) // 'terms' | 'privacy' | null
  const { signup, loginWithGoogle } = useAuth()
  const navigate = useNavigate()

  // Sign up with Google after the account type has been chosen. New users are
  // created on the backend (never auto-approved as instructors); existing users
  // are simply signed in.
  const handleGoogle = async (credential) => {
    setErrors({})
    setIsLoading(true)
    try {
      const u = await loginWithGoogle(credential, formData.isInstructor ? 'instructor' : 'student')
      if (formData.isInstructor) {
        navigate('/signup/instructor-onboarding', { state: { viaGoogle: true } })
      } else {
        navigate('/dashboard')
      }
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
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setIsLoading(true)
    try {
      if (formData.isInstructor) {
        // For instructor: go to onboarding with basic data (password included)
        navigate('/signup/instructor-onboarding', {
          state: {
            email:    formData.email,
            name:     formData.name,
            phone:    formData.phone,
            password: formData.password,
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
        title: 'Sign up as a Student',
        description: 'Enroll in courses, learn at your own pace, and access video lessons, quizzes and verifiable certificates.',
        cta: 'Continue as Student',
        highlights: ['Browse and enroll in courses', 'Learn from expert instructors', 'Earn verifiable certificates'],
      },
      {
        id: 'instructor',
        icon: GraduationCap,
        title: 'Sign up as an Instructor',
        description: 'Create, upload and manage your own courses, reach learners across Africa, and earn from every enrollment.',
        cta: 'Continue as Instructor',
        highlights: ['Create and publish courses', 'Reach thousands of learners', 'Get paid for your teaching'],
      },
    ]
    return (
      <div className="space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">Join LearnAfrica</h1>
          <p className="text-muted-foreground">Choose how you want to get started</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setFormData(prev => ({ ...prev, isInstructor: opt.id === 'instructor' }))
                setRoleChoice(opt.id)
              }}
              className="group text-left rounded-2xl border border-border bg-card p-6 flex flex-col h-full transition-all duration-200 hover:border-primary/50 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/40 active:scale-[0.99]"
            >
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 transition-colors group-hover:bg-primary/20">
                <opt.icon className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-lg font-bold mb-1.5">{opt.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{opt.description}</p>
              <ul className="space-y-2 mb-6">
                {opt.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
              <span className="mt-auto inline-flex items-center justify-center gap-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90">
                {opt.cta} <ArrowRight className="h-4 w-4" />
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
        <GoogleAuthButton text="signup_with" role={formData.isInstructor ? 'instructor' : 'student'} onCredential={handleGoogle} />
        <div className="relative">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or sign up with email</span>
          </div>
        </div>
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
