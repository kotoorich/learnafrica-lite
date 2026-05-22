import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LayoutDashboard, GraduationCap, Settings, LogOut, ChevronDown, User, Shield, BookMarked, BarChart2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import MobileProfileDrawer from './MobileProfileDrawer';

export default function ProfileDropdown({ hideChevron = false, closeMainMenu }) {
  const [isOpen, setIsOpen]       = useState(false);
  const [imgError, setImgError]   = useState(false);
  const dropdownRef               = useRef(null);
  const { user, logout, isLoading } = useAuth();
  const navigate                  = useNavigate();

  const isInstructor = ['instructor','admin','superadmin'].includes(user?.role);
  const isAdmin      = ['admin','superadmin'].includes(user?.role);

  const close = useCallback(() => {
    setIsOpen(false);
    if (closeMainMenu) closeMainMenu();
  }, [closeMainMenu]);

  const handleLogout = useCallback(async () => {
    close();
    await logout();
    navigate('/');
  }, [close, logout, navigate]);

  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const homeLink    = isInstructor ? '/instructor' : '/dashboard';
  const settingsLink = '/settings';

  return (
    <div className="relative" ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)}
        className="group flex px-3 md:px-0 md:h-9 h-14 cursor-pointer items-center md:justify-center rounded-lg bg-card md:bg-transparent border md:border-none border-input hover:bg-muted">
        <div className="ml-3 md:ml-0 flex md:w-full shrink-0 justify-start md:justify-center">
          <div className="relative inline-flex h-7 w-7 items-center justify-center rounded-full overflow-hidden">
            {!imgError && user?.avatar
              ? <img src={user.avatar} onError={() => setImgError(true)} className="h-full w-full object-cover" alt="" />
              : <User className="h-5 w-5" />}
          </div>
        </div>
        <span className="ml-3 md:hidden text-sm font-semibold">Profile</span>
        {!hideChevron && <ChevronDown className={cn('ml-auto md:ml-0 h-4 w-4 transition-transform', isOpen && 'rotate-180')} />}
      </div>

      {/* Desktop dropdown */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-64 rounded-2xl border border-border bg-background shadow-2xl z-[200] hidden md:flex flex-col overflow-hidden animate-in slide-in-from-top-2 duration-200">
          {/* User info */}
          <Link to="/profile" onClick={close}
            className="flex items-center gap-3 p-4 hover:bg-muted/50 border-b border-border transition-colors">
            <div className="h-10 w-10 rounded-xl overflow-hidden bg-muted border border-border shrink-0">
              {!imgError && user?.avatar
                ? <img src={user.avatar} className="h-full w-full object-cover" alt="" />
                : <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary"><User className="h-5 w-5" /></div>}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              <span className={cn('text-[9px] font-bold uppercase',
                isAdmin ? 'text-destructive' : isInstructor ? 'text-primary' : 'text-muted-foreground')}>
                {user?.role}
              </span>
            </div>
          </Link>

          {/* Links */}
          <div className="p-2 space-y-0.5">
            <DropLink to={homeLink} icon={<LayoutDashboard className="h-4 w-4" />}
              label={isInstructor ? 'Instructor Dashboard' : 'My Dashboard'} onClick={close} />
            {isInstructor && (
              <DropLink to="/instructor/courses" icon={<BookMarked className="h-4 w-4" />} label="My Courses" onClick={close} />
            )}
            {isAdmin && (
              <DropLink to="/admin" icon={<Shield className="h-4 w-4" />} label="Admin Panel" onClick={close} variant="accent" />
            )}
            <DropLink to={settingsLink} icon={<Settings className="h-4 w-4" />} label="Settings" onClick={close} />
          </div>

          <div className="p-2 border-t border-border">
            <button onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        </div>
      )}

      {/* Mobile drawer */}
      <MobileProfileDrawer isOpen={isOpen} onClose={close} user={user} isLoading={isLoading}
        isInstructor={isInstructor} isAdmin={isAdmin}
        handleLogout={handleLogout} imgError={imgError}
        isDesktopPopover={false} />
    </div>
  );
}

function DropLink({ to, icon, label, onClick, variant = 'default' }) {
  return (
    <Link to={to} onClick={onClick}
      className={cn('flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        variant === 'accent' ? 'text-primary hover:bg-primary/10' : 'text-foreground/80 hover:bg-muted')}>
      <span className="text-muted-foreground">{icon}</span>{label}
    </Link>
  );
}
