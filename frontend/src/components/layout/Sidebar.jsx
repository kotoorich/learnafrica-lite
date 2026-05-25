import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { LayoutDashboard, Plus, BarChart2, BookMarked, Settings, BookOpen, X, ChevronLeft } from 'lucide-react';

const sidebarLinks = [
  { href: '/instructor',               label: 'Overview',     Icon: LayoutDashboard },
  { href: '/instructor/courses',       label: 'My Courses',   Icon: BookMarked },
  { href: '/instructor/courses/create',label: 'Create Course',Icon: Plus },
  { href: '/instructor/analytics',     label: 'Analytics',    Icon: BarChart2 },
  { href: '/settings',                 label: 'Settings',     Icon: Settings },
];

export default function Sidebar({ isOpen, onClose }) {
  const location = useLocation();
  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden" onClick={onClose} />}
      <aside className={cn(
        'fixed left-0 top-16 z-40 h-[calc(100vh-4rem)] w-64 border-r border-border bg-card transition-transform duration-300 lg:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex h-full flex-col">
          {/* Mobile close */}
          <div className="flex items-center justify-between p-4 lg:hidden border-b border-border">
            <span className="font-semibold text-sm">Instructor Panel</span>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted">
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 p-4">
            {sidebarLinks.map(({ href, label, Icon }) => {
              const isActive = href === '/instructor'
                ? location.pathname === href
                : location.pathname.startsWith(href);
              return (
                <Link key={href} to={href} onClick={onClose}
                  className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <Icon className="h-5 w-5" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-border p-4">
            <Link to="/courses" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
              <BookOpen className="h-4 w-4" /> Browse Courses
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
