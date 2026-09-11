/**
 * CourseTimeBar — the visible minimum-time indicator, shown wherever a
 * student is inside a course (lessons and quizzes both). Renders nothing
 * at all when the course doesn't have the minimum-time rule turned on,
 * so it never appears for courses where it doesn't apply.
 */
import { Clock, CheckCircle2 } from 'lucide-react';

function formatMinutes(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function CourseTimeBar({ timeSpent, timeRequired, timeEnforce }) {
  if (!timeEnforce || timeRequired <= 0) return null;

  const pct = Math.min(100, Math.round((timeSpent / timeRequired) * 100));
  const met = timeSpent >= timeRequired;

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-3">
        {met
          ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          : <Clock className="h-4 w-4 text-primary shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-foreground">
              {met ? 'Minimum time met' : 'Minimum time for this course'}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {formatMinutes(timeSpent)} / {formatMinutes(timeRequired)}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${met ? 'bg-success' : 'bg-primary'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
