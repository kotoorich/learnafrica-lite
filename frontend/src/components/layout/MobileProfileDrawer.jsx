import { Link } from 'react-router-dom';
import { X, LayoutDashboard, Settings, LogOut, Shield, User, ChevronRight, ArrowLeft, BookMarked } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MobileProfileDrawer({ isOpen, onClose, user, isLoading,
  isInstructor, isAdmin, handleLogout, imgError, isDesktopPopover = false }) {
  if (!isOpen || isDesktopPopover) return null;

  return (
    <div className="fixed inset-0 z-[200] h-[100dvh] bg-background flex flex-col md:hidden animate-in slide-in-from-right duration-300">
      <div className="flex h-14 items-center justify-between border-b border-border/60 px-5">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/80">Account</span>
        </div>
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/40 text-muted-foreground">
          <X className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4">
          <Link to="/profile" onClick={onClose}
            className="flex items-center gap-4 rounded-2xl bg-muted/20 p-3 border border-border/50 hover:bg-muted/40 transition-all">
            <div className="h-12 w-12 overflow-hidden rounded-xl bg-background shrink-0 border border-border">
              {!imgError && user?.avatar
                ? <img src={user.avatar} className="h-full w-full object-cover" alt="" />
                : <div className="h-full w-full flex items-center justify-center bg-primary/5 text-primary"><User className="h-6 w-6" /></div>}
            </div>
            <div className="flex-1 min-w-0">
              {isLoading
                ? <div className="space-y-2"><div className="h-3 w-20 rounded bg-muted animate-pulse" /><div className="h-2 w-28 rounded bg-muted animate-pulse" /></div>
                : <>
                    <p className="font-bold text-[13px] truncate">{user?.name || 'User'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                    {user?.instructor_status === 'pending' && (
                      <span className="text-[9px] font-bold text-warning uppercase">Pending Approval</span>
                    )}
                  </>}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
          </Link>
        </div>

        <div className="px-4 space-y-1">
          <MenuLink to={isInstructor ? '/instructor' : '/dashboard'}
            icon={<LayoutDashboard className="h-4 w-4" />}
            label={isInstructor ? 'Instructor Dashboard' : 'My Dashboard'} onClick={onClose} />
          {isInstructor && <MenuLink to="/instructor/courses" icon={<BookMarked className="h-4 w-4" />} label="My Courses" onClick={onClose} />}
          {isAdmin && <MenuLink to="/admin" icon={<Shield className="h-4 w-4" />} label="Admin Panel" onClick={onClose} variant="primary" />}
          <MenuLink to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" onClick={onClose} />
        </div>
      </div>

      <div className="p-4 pb-8 border-t border-border/60 bg-card/20">
        <button onClick={handleLogout}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-500/5 text-red-500 text-[11px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white border border-red-500/10 transition-all">
          <LogOut className="h-3.5 w-3.5" strokeWidth={3} /> Logout
        </button>
      </div>
    </div>
  );
}

function MenuLink({ to, icon, label, onClick, variant = 'default' }) {
  return (
    <Link to={to} onClick={onClick}
      className={cn('flex items-center gap-4 rounded-xl px-4 py-3 text-[13px] font-semibold transition-all group border-l-2',
        variant === 'primary' ? 'bg-primary/5 text-primary border-primary' :
        'text-foreground/80 border-transparent hover:bg-muted hover:border-primary/50 hover:text-primary')}>
      <span className={cn('transition-colors', variant === 'primary' ? 'text-primary' : 'text-muted-foreground group-hover:text-primary')}>{icon}</span>
      {label}
    </Link>
  );
}
