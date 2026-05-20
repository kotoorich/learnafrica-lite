import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import ProfileDropdown from './ProfileDropdown';
import NotificationsDropdown from './NotificationsDropdown';
import { Button } from '../common/Button';
import { cn } from '../../lib/utils';
import {
  X, ChevronRight, LayoutDashboard, BookOpen, Home, Shield,
  GraduationCap, BarChart2, BookMarked, ShieldCheck, MessageSquare,
  Info, Menu
} from 'lucide-react';

// Scroll to section by ID or navigate to landing page then scroll
function useScrollTo() {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback((sectionId) => {
    const doScroll = () => {
      const el = document.getElementById(sectionId);
      if (el) {
        const offset = 80; // navbar height
        const top = el.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    };
    if (location.pathname === '/') {
      doScroll();
    } else {
      navigate('/');
      setTimeout(doScroll, 400);
    }
  }, [navigate, location.pathname]);
}

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAuthenticated, user, isLoading } = useAuth();
  const location = useLocation();
  const scrollTo = useScrollTo();

  const isStudent    = isAuthenticated && user?.role === 'student';
  const isInstructor = isAuthenticated && ['instructor','admin','superadmin'].includes(user?.role);
  const isAdmin      = isAuthenticated && ['admin','superadmin'].includes(user?.role);
  const isPublicPage = location.pathname === '/';

  // Nav links per role
  const navLinks = isAdmin ? [
    { href: '/',            label: 'Home',        icon: Home },
    { href: '/admin',       label: 'Admin Panel', icon: Shield },
    { href: '/instructor',  label: 'Instructor',  icon: GraduationCap },
  ] : isInstructor ? [
    { href: '/',                        label: 'Home',        icon: Home },
    { href: '/instructor',              label: 'Dashboard',   icon: LayoutDashboard },
    { href: '/instructor/courses',      label: 'My Courses',  icon: BookMarked },
    { href: '/instructor/analytics',    label: 'Analytics',   icon: BarChart2 },
  ] : isStudent ? [
    { href: '/',            label: 'Home',        icon: Home },
    { href: '/courses',     label: 'Courses',     icon: BookOpen },
    { href: '/dashboard',   label: 'Dashboard',   icon: LayoutDashboard },
  ] : [
    { href: '/',        label: 'Home',    icon: Home },
    { href: '/courses', label: 'Courses', icon: BookOpen },
  ];

  // Scroll buttons — visible to all roles
  const scrollButtons = [
    { id: 'verify-section',   label: 'Verify',   icon: ShieldCheck },
    { id: 'comments-section', label: 'Community',icon: MessageSquare },
    { id: 'about-section',    label: 'About',    icon: Info },
  ];

  // Lock body scroll when mobile menu open
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const y = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${y}px`;
    document.body.style.width = '100%';
    document.body.style.overflowY = 'hidden';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflowY = '';
      window.scrollTo(0, y);
    };
  }, [isMobileMenuOpen]);

  const closeMenu = () => setIsMobileMenuOpen(false);
  const isActive = (href) => href === '/'
    ? location.pathname === '/'
    : location.pathname.startsWith(href);

  if (isLoading) return <div className="h-16 bg-background border-b border-border" />;

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 gap-4">
          {/* Logo */}
          <Link
            to={isAdmin ? '/admin' : isInstructor ? '/instructor' : isStudent ? '/dashboard' : '/'}
            className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-lg shadow-primary/20">
              <BookOpen className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight hidden sm:block">
              Learn<span className="text-primary">Africa</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-6 flex-1 justify-center">
            {navLinks.map(link => (
              <Link key={link.href} to={link.href}
                className={cn('text-sm font-semibold transition-colors hover:text-primary',
                  isActive(link.href) ? 'text-primary' : 'text-muted-foreground')}>
                {link.label}
              </Link>
            ))}
            {/* Scroll buttons — only on landing-accessible pages */}
            {scrollButtons.map(btn => (
              <button key={btn.id}
                onClick={() => scrollTo(btn.id)}
                className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5">
                <btn.icon className="h-3.5 w-3.5" />
                {btn.label}
              </button>
            ))}
          </nav>

          {/* Desktop right */}
          <div className="hidden lg:flex items-center gap-3 shrink-0">
            <ThemeToggle />
            <div className="h-5 w-px bg-border/60" />
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <NotificationsDropdown />
                <ProfileDropdown user={user} />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login"><Button variant="ghost" size="sm">Log in</Button></Link>
                <Link to="/signup"><Button size="sm" className="px-5">Get Started</Button></Link>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
            className="lg:hidden relative z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-input bg-background hover:bg-muted transition-colors shrink-0"
          >
            {isMobileMenuOpen
              ? <X className="h-5 w-5" strokeWidth={2.5} />
              : <Menu className="h-5 w-5" strokeWidth={2.5} />}
          </button>
        </div>
      </header>

      {/* ── Mobile Menu Overlay ── */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-background lg:hidden flex flex-col"
          style={{ top: 0, paddingTop: '4rem' }}
        >
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 pt-6 pb-10 space-y-8 max-w-sm mx-auto">

              {/* Main nav links */}
              <nav className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/60 px-3 mb-3">Navigation</p>
                {navLinks.map(link => {
                  const active = isActive(link.href);
                  return (
                    <Link key={link.href} to={link.href} onClick={closeMenu}
                      className={cn(
                        'flex items-center gap-4 rounded-xl px-4 py-3.5 transition-all',
                        active
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'text-foreground/80 hover:bg-muted border border-transparent'
                      )}>
                      <link.icon className={cn('h-5 w-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="text-sm font-semibold">{link.label}</span>
                      <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground/40" />
                    </Link>
                  );
                })}
              </nav>

              {/* Scroll buttons */}
              {scrollButtons.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/60 px-3">Quick Links</p>
                  {scrollButtons.map(btn => (
                    <button key={btn.id}
                      onClick={() => { scrollTo(btn.id); closeMenu(); }}
                      className="w-full flex items-center gap-4 rounded-xl px-4 py-3.5 text-foreground/80 hover:bg-muted border border-transparent transition-all">
                      <btn.icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-semibold">{btn.label}</span>
                      <ChevronRight className="h-4 w-4 ml-auto text-muted-foreground/40" />
                    </button>
                  ))}
                </div>
              )}

              {/* Auth / Profile section */}
              <div className="space-y-3 pt-4 border-t border-border">
                <div className="flex justify-between items-center">
                  <ThemeToggle />
                </div>
                {isAuthenticated ? (
                  <ProfileDropdown user={user} closeMainMenu={closeMenu} />
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <Link to="/login" onClick={closeMenu}>
                      <Button variant="outline" className="w-full h-12 rounded-xl">Log In</Button>
                    </Link>
                    <Link to="/signup" onClick={closeMenu}>
                      <Button className="w-full h-12 rounded-xl">Sign Up</Button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
