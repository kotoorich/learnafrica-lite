import { useState } from 'react';
import { X, ArrowLeft, CheckCheck, Bell, Calendar, Clock, ArrowRight, Trash2, BookOpen, Trophy, Settings, UserPlus, MessageSquare, ShieldCheck, Info} from "lucide-react";
import { cn } from '@/lib/utils';
import * as LucideIcons from "lucide-react";


// Icons and Colors maps for the detail view
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

export default function MobileNotificationsDrawer({ 
  isOpen, 
  onClose, 
  notifications, 
  unreadCount, 
  markAllAsRead, 
  markAsRead, 
  NotificationIcon, // The helper component passed as a prop
  isLoading,
  onDelete,
  isDesktopPopover = false // New flow prop for md and lg screens
}) {
  const [isMarkingLoading, setIsMarkingLoading] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);

  if (!isOpen) return null;

  const handleMarkAll = async () => {
    if (unreadCount === 0 || isMarkingLoading) return;
    setIsMarkingLoading(true);
    try {
      await markAllAsRead();
    } catch (error) {
      console.error("Backend sync failed:", error);
    } finally {
      setIsMarkingLoading(false);
    }
  };

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    setSelectedNotification(notification);
  };

  const handleDelete = async (id) => {
    try {
      await onDelete?.(id);
      setSelectedNotification(null);
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const hasLink = selectedNotification?.link || selectedNotification?.activityId;

  return (
    <div className={cn(
      "z-[200] bg-background animate-in duration-300 ease-in-out border border-border/40",
      // New Flow: Desktop Popover vs Mobile Slide-in
      isDesktopPopover 
        ? "absolute top-full right-0 mt-2 w-[400px] h-[600px] rounded-3xl shadow-2xl slide-in-from-top-2 overflow-hidden hidden md:flex flex-col" 
        : "fixed inset-0 h-[100dvh] slide-in-from-right md:hidden flex flex-col"
    )}>
      <div className="flex h-full flex-col overflow-hidden">
        
        {/* --- DYNAMIC HEADER --- */}
        <div className="flex h-16 items-center justify-between border-b border-border bg-background px-5 shrink-0">
          <div className="flex items-center gap-3">
             <button 
                onClick={selectedNotification ? () => setSelectedNotification(null) : onClose} 
                className="p-1 -ml-1 text-muted-foreground active:scale-90 transition-transform"
             >
                <ArrowLeft className="h-5 w-5" />
             </button>
             <span className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/80">
               {selectedNotification ? "Detail" : "Notifications"}
             </span>
          </div>
          
          {selectedNotification ? (
            <button 
              onClick={() => handleDelete(selectedNotification.id)}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-500/10 text-red-500 active:scale-95 transition-all"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <button 
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/20 text-muted-foreground active:scale-95"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* --- DYNAMIC CONTENT AREA --- */}
        <div className="flex-1 overflow-y-auto bg-background custom-scrollbar">
          {!selectedNotification ? (
            <div className="px-5 py-6 animate-in fade-in duration-300">
              <div className="space-y-2">
                {isLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-3">
                     <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                     <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Syncing...</p>
                  </div>
                ) : notifications.length > 0 ? (
                  <>
                    <div className="mb-4 px-1 flex justify-between items-end">
                        <p className="text-[9px] font-black text-primary uppercase tracking-widest">Feed</p>
                        {unreadCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-[8px] font-black text-primary uppercase tracking-tighter">
                            {unreadCount} New
                          </span>
                        )}
                    </div>

                    {notifications.map((notification) => (
                    <button
                      key={`${isDesktopPopover ? 'desktop' : 'mobile'}-${notification.id}`}
                      onClick={() => handleNotificationClick(notification)}
                      className={cn(
                        "w-full p-4 flex items-start gap-4 rounded-2xl mb-2 text-left transition-all border",
                        !notification.read 
                          ? 'bg-primary/[0.02] border-primary/20 shadow-sm shadow-primary/5' 
                          : 'bg-card border-border/40'
                      )}
                    >
                      {/* Using the Helper Component while maintaining your specific scale and padding classes */}
                      <div className={cn(
                        "shrink-0 transition-transform",
                        !notification.read && "scale-105"
                      )}>
                        <NotificationIcon type={notification.type} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn(
                            "font-bold text-[13px] leading-tight", 
                            !notification.read ? 'text-foreground' : 'text-muted-foreground'
                          )}>
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <div className="h-2 w-2 rounded-full bg-primary mt-1 animate-pulse" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground/60 mt-1 line-clamp-2 leading-snug font-medium">
                          {notification.message}
                        </p>
                      </div>
                    </button>
                  ))}
                  </>
                ) : (
                  <div className="py-24 text-center flex flex-col items-center">
                    <Bell className="h-10 w-10 text-muted-foreground/10 mb-4" />
                    <p className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-widest">Workspace Clear</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="px-6 py-10 animate-in slide-in-from-bottom-2 duration-500">
              <div className="flex flex-col items-center text-center mb-10">
                <div className={cn(
                  "p-6 rounded-[28px] mb-6 inline-flex items-center justify-center",
                  notificationColors[selectedNotification.type]
                )}>
                  {notificationIcons[selectedNotification.type]}
                </div>
                <h2 className="text-xl font-black text-foreground tracking-tight leading-tight">
                  {selectedNotification.title}
                </h2>
                <div className="mt-3 flex items-center gap-2 justify-center">
                   <span className="h-1.5 w-1.5 rounded-full bg-primary/40" />
                   <span className="text-[8px] font-black text-muted-foreground/60 uppercase tracking-widest">
                     {selectedNotification.type}
                   </span>
                </div>
              </div>

              <div className="relative p-6 rounded-3xl bg-muted/5 border border-border/40 overflow-hidden">
                <div className={cn("absolute -top-10 -right-10 h-32 w-32 blur-[60px] opacity-10", notificationColors[selectedNotification.type])} />
                <p className="text-sm text-foreground/90 leading-relaxed font-medium text-center relative z-10">
                  {selectedNotification.message}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-8">
                <div className="p-4 rounded-2xl bg-card border border-border/40 flex flex-col items-center text-center">
                  <Calendar className="h-4 w-4 text-primary/60 mb-2" />
                  <p className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-widest">Date</p>
                  <p className="text-xs font-bold text-foreground">{selectedNotification.date || "Today"}</p>
                </div>
                <div className="p-4 rounded-2xl bg-card border border-border/40 flex flex-col items-center text-center">
                  <Clock className="h-4 w-4 text-primary/60 mb-2" />
                  <p className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-widest">Timestamp</p>
                  <p className="text-xs font-bold text-foreground">{selectedNotification.time}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- CLEANED ACTION FOOTER --- */}
        <div className={cn(
          "p-5 border-t border-border bg-card/40 backdrop-blur-md",
          !isDesktopPopover && "pb-10" // Extra padding only for mobile fullscreen
        )}>
          {!selectedNotification ? (
            <button
              disabled={unreadCount === 0 || isMarkingLoading}
              onClick={handleMarkAll}
              className={cn(
                "flex h-12 w-full items-center justify-center gap-2 rounded-xl font-black transition-all active:scale-[0.98] disabled:opacity-20",
                unreadCount > 0 
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/10" 
                  : "bg-muted text-muted-foreground border border-border/50"
              )}
            >
              {isMarkingLoading ? (
                <div className="h-4 w-4 border-2 border-current border-t-transparent animate-spin rounded-full" />
              ) : (
                <>
                  <CheckCheck className="h-4 w-4" strokeWidth={3} />
                  <span className="text-[10px] uppercase tracking-widest">Mark All Read</span>
                </>
              )}
            </button>
          ) : (
            <button 
              disabled={!hasLink}
              className={cn(
                "group w-full h-12 rounded-xl flex items-center justify-center gap-3 px-6 font-black transition-all active:scale-[0.98]",
                hasLink 
                  ? "bg-foreground text-background shadow-sm border border-foreground/10" 
                  : "bg-muted/40 text-muted-foreground/30 cursor-not-allowed border border-border/20"
              )}
            >
              <span className="text-[10px] uppercase tracking-widest">
                {hasLink ? "Open Activity" : "No Action"}
              </span>
              <ArrowRight className={cn("h-3.5 w-3.5 transition-transform", hasLink && "group-hover:translate-x-1")} strokeWidth={3} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}