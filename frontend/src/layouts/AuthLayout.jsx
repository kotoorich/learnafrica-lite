import { Link, Outlet } from 'react-router-dom'
import { BookOpen } from 'lucide-react'

export function AuthLayout() {
  return (
    <div className="min-h-screen flex">
      {/* Left Side - Form */}
      <div className="flex-1 flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
              <BookOpen className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-bold">
              Learn<span className="text-primary">Africa</span>
            </span>
          </Link>

          <Outlet />
        </div>
      </div>

      {/* Right Side - Green gradient panel. Force WHITE text for legibility on both themes. */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden bg-primary">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-accent/50" />
        <div className="relative z-10 flex flex-col justify-center p-12 text-white">
          <h2 className="text-4xl font-bold mb-4 text-white">
            Start your learning journey today
          </h2>
          <p className="text-lg text-white/80 max-w-md">
            Join thousands of learners across Africa gaining new skills and transforming their careers with our expert-led courses.
          </p>

          <div className="mt-12 grid grid-cols-3 gap-6">
            <div>
              <p className="text-3xl font-bold text-white">50K+</p>
              <p className="text-sm text-white/70">Active Learners</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-white">200+</p>
              <p className="text-sm text-white/70">Expert Courses</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-white">95%</p>
              <p className="text-sm text-white/70">Success Rate</p>
            </div>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent/20" />
        <div className="absolute -top-32 -right-32 h-64 w-64 rounded-full bg-white/5" />
      </div>
    </div>
  )
}
