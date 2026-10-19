/**
 * EngagementCheckinModal — the "are you still there?" prompt shown every
 * 30 real minutes of active time on a course, so time can't accumulate
 * just from a tab being left open unattended overnight. The minimum-time
 * ticker is paused (see useCourseTimeTracking) for as long as this is open.
 */
import { Coffee, Play } from 'lucide-react';

export function EngagementCheckinModal({ show, onContinue }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="max-w-sm w-full rounded-2xl bg-background border border-border shadow-2xl p-6 sm:p-8 text-center space-y-4">
        <div className="h-14 w-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <Coffee className="h-7 w-7 text-primary" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-bold">Still learning?</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You've been on this course for a while. Press continue to keep your time counting.
          </p>
        </div>
        <button
          onClick={onContinue}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
        >
          <Play className="h-4 w-4" /> Continue learning
        </button>
      </div>
    </div>
  );
}
