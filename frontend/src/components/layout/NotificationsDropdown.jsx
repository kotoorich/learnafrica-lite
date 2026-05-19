// src/components/layout/NotificationsDropdown.jsx
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import MobileNotificationsDrawer from './MobileNotificationsDrawer';
import { useAuth } from '@/context/AuthContext';
import { Bell, ChevronDown, BookOpen, Trophy, Clock, Settings, UserPlus, MessageSquare, ShieldCheck, Info } from 'lucide-react';

const notificationIcons = {
  course: <BookOpen className="w-5 h-5" />,
  achievement: <Trophy className="w-5 h-5" />,
  reminder: <Clock className="w-5 h-5" />,
  system: <Settings className="w-5 h-5" />,
  enrollment: <UserPlus className="w-5 h-5" />,
  community: <MessageSquare className="w-5 h-5" />,
  security: <ShieldCheck className="w-5 h-5" />,
  info: <Info className="w-5 h-5" />,
};

const notificationColors = {
  course: 'bg-primary/10 text-primary',
  achievement: 'bg-yellow-500/10 text-yellow-600',
  reminder: 'bg-orange-500/10 text-orange-600',
  system: 'bg-slate-500/10 text-slate-600',
  enrollment: 'bg-green-500/10 text-green-600',
  community: 'bg-blue-500/10 text-blue-600',
  security: 'bg-red-500/10 text-red-600',
  info: 'bg-cyan-500/10 text-cyan-600',
};

const NotificationIconHelper = ({ type }) => {
  const icon = notificationIcons[type] || notificationIcons.info;
  const colorClass = notificationColors[type] || notificationColors.info;
  return <div className={cn("p-2 rounded-full shrink-0", colorClass)}>{icon}</div>;
};

export default function NotificationsDropdown({ hideChevron = false, closeMainMenu }) {
  const [isOpen, setIsOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useAuth();
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCloseEverything = () => {
    setIsOpen(false);
    if (closeMainMenu) closeMainMenu();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)} className="group flex md:h-9 h-14 cursor-pointer items-center md:justify-center bg-card md:bg-transparent rounded-lg border md:border-none border-input px-3 md:px-1 hover:bg-muted">
        <div className="relative flex md:w-full shrink-0 justify-start md:justify-center">
          <Bell className="w-[18px] h-[18px]" />
          {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">{unreadCount}</span>}
        </div>
        <span className="ml-4 md:hidden text-sm font-semibold">Notifications</span>
        {!hideChevron && <ChevronDown className={cn("ml-auto md:ml-0 h-4 w-4 transition-transform", isOpen && "rotate-180")} />}
      </div>

      <MobileNotificationsDrawer isOpen={isOpen} onClose={handleCloseEverything} notifications={notifications} unreadCount={unreadCount} markAllAsRead={markAllAsRead} markAsRead={markAsRead} onDelete={deleteNotification} NotificationIcon={NotificationIconHelper} isLoading={false} isDesktopPopover={true} />
      <MobileNotificationsDrawer isOpen={isOpen} onClose={handleCloseEverything} notifications={notifications} unreadCount={unreadCount} markAllAsRead={markAllAsRead} markAsRead={markAsRead} onDelete={deleteNotification} NotificationIcon={NotificationIconHelper} isLoading={false} isDesktopPopover={false} />
    </div>
  );
}