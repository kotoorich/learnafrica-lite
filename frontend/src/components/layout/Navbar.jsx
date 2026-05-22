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
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-white shadow-sm shadow-primary/20">
              <BookOpen className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-foreground">
              Learn<span className="text-primary">Africa</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6 flex-1 justify-center">
            {navLinks.map(link => (
              <Link key={link.href} to={link.href}
                className={cn('text-sm font-semibold transition-colors hover:text-primary',
                  isActive(link.href) ? 'text-primary' : 'text-muted-foreground')}>
                {link.label}
              </Link>
            ))}
            {/* Scroll buttons — only on landing-accessible pages */}
            {/* {scrollButtons.map(btn => (
              <button key={btn.id}
                onClick={() => scrollTo(btn.id)}
                className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5">
                {btn.label}
              </button>
            ))} */}
          </nav>

          {/* Desktop right */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
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
            className="md:hidden relative z-[110] flex h-11 w-11 items-center justify-center rounded-md border border-input bg-background/50 backdrop-blur-sm text-foreground active:scale-90 transition-transform"
          >
            {isMobileMenuOpen
              ? <X className="h-6 w-6 animate-in zoom-in-50 duration-200" strokeWidth={2.5} />
              : <Menu className="h-6 w-6" strokeWidth={2} />}
          </button>
        </div>
      </header>

      {/* ── Mobile Menu Overlay ── */}

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-30 md:hidden bg-background animate-in fade-in duration-200"
          style={{ top: 0, paddingTop: '4rem' }}
        >
          <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">

            <div className="flex-1 overflow-y-auto bg-background">
              <div className="mx-auto max-w-md px-5 py-8 space-y-8">
                
                <nav className="space-y-3">
                  {navLinks.map((link) => {
                    const isActive = location.pathname === link.href;
                    const Icon = link.label.toLowerCase().includes('dashboard') ? LayoutDashboard : BookOpen;

                    return (
                      <Link
                        key={link.href}
                        to={link.href}
                        onClick={closeMenu}
                        className={cn(
                          "group flex h-14 items-center justify-between rounded-xl px-4 transition-all",
                          isActive ? "bg-primary/10 text-primary border border-primary/30" : "bg-card border border-border text-foreground/90"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex w-8 shrink-0 justify-start">
                            <Icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} strokeWidth={2.5} />
                          </div>
                          <span className="text-sm font-medium group-hover:text-primary transition-colors">{link.label}</span>
                        </div>
                        <ChevronRight className={cn("h-4 w-4 transition-transform group-hover:translate-x-1", isActive ? "text-primary" : "text-muted-foreground")} strokeWidth={3} />
                      </Link>
                    )
                  })}
                </nav>

                {/* {scrollButtons.length > 0 && (
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
                )} */}

                <div className="space-y-3 border-t border-border pt-8">
                  <ThemeToggle />
                  {isAuthenticated ? (
                    <div className="space-y-3">
                      <NotificationsDropdown closeMainMenu={closeMenu} />
                      <ProfileDropdown user={user} hideChevron={false} closeMainMenu={closeMenu} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <Link to="/login" onClick={closeMenu}><Button variant="outline" className="h-12 w-full rounded-xl">Log In</Button></Link>
                      <Link to="/signup" onClick={closeMenu}><Button className="h-12 w-full rounded-xl">Sign Up</Button></Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
