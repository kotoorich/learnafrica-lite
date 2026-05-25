import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, User, GraduationCap, X } from 'lucide-react'
import { Button } from '@/components/common/Button'
import { Input, Label } from '@/components/common/Input'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

export function SignupPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    isInstructor: false
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [modal, setModal] = useState(null) // 'terms' | 'privacy' | null
  const { signup } = useAuth()
  const navigate = useNavigate()

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const validate = () => {
    const newErrors = {}
    if (!formData.name) newErrors.name = 'Name is required'
    if (!formData.email) newErrors.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Invalid email address'
    if (!formData.password) newErrors.password = 'Password is required'
    else if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters'
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
        navigate('/signup/instructor-onboarding', { state: { ...formData } })
      } else {
        // For student: call signup API directly
        const userData = {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: 'student'
        }
        await signup(userData)
        navigate('/courses')
      }
    } catch (err) {
      setErrors({ submit: err.message || 'Signup failed. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Create an account</h1>
        <p className="text-muted-foreground">Start your learning journey today</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="name" name="name" type="text" value={formData.name} onChange={handleChange} placeholder="John Doe" className="pl-10" />
          </div>
          {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="name@example.com" className="pl-10" />
          </div>
          {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="password" name="password" type={showPassword ? 'text' : 'password'} value={formData.password} onChange={handleChange} placeholder="Create a password" className="pl-10 pr-10" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
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
        </div>

        {/* Instructor Toggle */}
        <div onClick={() => setFormData(p => ({ ...p, isInstructor: !p.isInstructor }))} className={cn("flex items-center gap-3 p-3 rounded-lg border border-border cursor-pointer transition-all", formData.isInstructor ? "bg-primary/5 border-primary/50" : "hover:bg-muted/50")}>
          <div className={cn("p-2 rounded-md", formData.isInstructor ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold leading-none">I want to teach</p>
            <p className="text-[11px] text-muted-foreground mt-1">Create courses and manage students</p>
          </div>
          <div className={cn("h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors", formData.isInstructor ? "border-primary bg-primary" : "border-muted-foreground/30")}>
            {formData.isInstructor && <div className="h-2 w-2 rounded-full bg-white" />}
          </div>
        </div>

        <div className="flex items-center gap-2 justify-start">
          <input type="checkbox" id="terms" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-primary" />
          <label htmlFor="terms" className="text-sm text-muted-foreground mt-[5px] text-center">
            I agree to the{" "}
            <button type="button" onClick={() => setModal('terms')} className="text-primary hover:underline font-medium">Terms of Service</button>
            {" "}and{" "}
            <button type="button" onClick={() => setModal('privacy')} className="text-primary hover:underline font-medium">Privacy Policy</button>
          </label>
        </div>
        {errors.terms && <p className="text-sm text-destructive">{errors.terms}</p>}
        {errors.submit && <div className="p-3 rounded bg-destructive/10 text-destructive text-sm text-center">{errors.submit}</div>}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Creating account...' : formData.isInstructor ? 'Continue to Profile' : 'Create account'}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account? <Link to="/login" className="text-primary hover:underline font-medium">Sign in</Link>
      </p>

      {/* ── Terms / Privacy Modal ── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold">
                {modal === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
              </h2>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto px-6 py-5 text-sm text-muted-foreground space-y-4 leading-relaxed">
              {modal === 'terms' ? (
                <>
                  <p className="text-xs text-muted-foreground/60 uppercase tracking-widest font-bold">Last updated: January 2025</p>
                  <p>Welcome to LearnAfrica Lite. By creating an account and using our platform, you agree to be bound by these Terms of Service. Please read them carefully.</p>

                  <h3 className="font-bold text-foreground text-base">1. Acceptance of Terms</h3>
                  <p>By accessing or using LearnAfrica Lite ("the Platform"), you agree to these Terms. If you do not agree, please do not use the Platform.</p>

                  <h3 className="font-bold text-foreground text-base">2. User Accounts</h3>
                  <p>You are responsible for maintaining the confidentiality of your account credentials. You agree to provide accurate, current, and complete information during registration. You must be at least 13 years old to create an account.</p>

                  <h3 className="font-bold text-foreground text-base">3. Student Responsibilities</h3>
                  <p>Students may enroll in courses for personal, non-commercial use. You agree not to share course content, circumvent payment requirements, or use the platform for any unlawful purpose.</p>

                  <h3 className="font-bold text-foreground text-base">4. Instructor Responsibilities</h3>
                  <p>Instructors are responsible for the accuracy and quality of content they publish. By submitting a course, you grant LearnAfrica Lite a license to host and deliver your content to enrolled students. You must not publish content that is plagiarised, harmful, or violates any third-party rights.</p>

                  <h3 className="font-bold text-foreground text-base">5. Payments & Refunds</h3>
                  <p>Course purchases are processed through our secure payment system. Refunds may be requested within 7 days of purchase if you have not completed more than 20% of the course. Instructors receive 70% of the course revenue.</p>

                  <h3 className="font-bold text-foreground text-base">6. Intellectual Property</h3>
                  <p>All platform content, branding, and technology are the property of LearnAfrica Lite. Course content remains the intellectual property of the respective instructors.</p>

                  <h3 className="font-bold text-foreground text-base">7. Prohibited Conduct</h3>
                  <p>You agree not to: upload malicious code, harass other users, impersonate any person, attempt to gain unauthorised access to the platform, or scrape or reproduce content without permission.</p>

                  <h3 className="font-bold text-foreground text-base">8. Termination</h3>
                  <p>We reserve the right to suspend or terminate accounts that violate these Terms, with or without notice.</p>

                  <h3 className="font-bold text-foreground text-base">9. Limitation of Liability</h3>
                  <p>LearnAfrica Lite is provided "as is". We are not liable for any indirect, incidental, or consequential damages arising from your use of the platform.</p>

                  <h3 className="font-bold text-foreground text-base">10. Changes to Terms</h3>
                  <p>We may update these Terms from time to time. Continued use of the platform after changes constitutes acceptance of the new Terms.</p>

                  <h3 className="font-bold text-foreground text-base">11. Contact</h3>
                  <p>For questions about these Terms, please contact us at support@learnafrica.com.</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground/60 uppercase tracking-widest font-bold">Last updated: January 2025</p>
                  <p>Your privacy matters to us. This Privacy Policy explains what information we collect, how we use it, and your rights regarding your data.</p>

                  <h3 className="font-bold text-foreground text-base">1. Information We Collect</h3>
                  <p><strong className="text-foreground">Account data:</strong> Name, email address, and password (stored as a secure hash). Optionally: profile photo, bio, location, and website.</p>
                  <p><strong className="text-foreground">Usage data:</strong> Courses enrolled, lessons completed, quiz scores, learning streaks, and certificates earned.</p>
                  <p><strong className="text-foreground">Payment data:</strong> For paid courses, we collect card details solely to process your transaction. We do not store full card numbers.</p>
                  <p><strong className="text-foreground">Content data:</strong> Discussion posts, course reviews, and homepage comments you choose to publish.</p>

                  <h3 className="font-bold text-foreground text-base">2. How We Use Your Information</h3>
                  <p>We use your information to: provide and improve the platform, personalise your learning experience, process payments, send notifications you have opted into, and generate certificates and badges.</p>

                  <h3 className="font-bold text-foreground text-base">3. Data Sharing</h3>
                  <p>We do not sell your personal data. Your name and progress may be visible to your enrolled course instructors. Leaderboard entries (name, score) are visible to other logged-in users.</p>

                  <h3 className="font-bold text-foreground text-base">4. Data Storage & Security</h3>
                  <p>Your data is stored in a secured database. Passwords are hashed using industry-standard algorithms. We use HTTPS to encrypt data in transit.</p>

                  <h3 className="font-bold text-foreground text-base">5. Cookies & Sessions</h3>
                  <p>We use session tokens stored in your browser's sessionStorage to keep you logged in. These are cleared when you close the browser tab. We do not use third-party tracking cookies.</p>

                  <h3 className="font-bold text-foreground text-base">6. Your Rights</h3>
                  <p>You have the right to: access your personal data, correct inaccurate data, delete your account and all associated data, and opt out of non-essential communications.</p>
                  <p>To exercise these rights, visit your Account Settings or contact support@learnafrica.com.</p>

                  <h3 className="font-bold text-foreground text-base">7. Data Retention</h3>
                  <p>We retain your data for as long as your account is active. Deleting your account permanently removes all personal data within 30 days.</p>

                  <h3 className="font-bold text-foreground text-base">8. Children's Privacy</h3>
                  <p>LearnAfrica Lite is not directed at children under 13. We do not knowingly collect data from children under 13.</p>

                  <h3 className="font-bold text-foreground text-base">9. Changes to This Policy</h3>
                  <p>We may update this Privacy Policy periodically. We will notify you of significant changes via email or a platform notification.</p>

                  <h3 className="font-bold text-foreground text-base">10. Contact</h3>
                  <p>If you have any questions about this Privacy Policy, contact us at privacy@learnafrica.com.</p>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border flex justify-end">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}