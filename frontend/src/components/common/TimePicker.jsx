import { ChevronUp, ChevronDown, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Watch-style time picker.
 * - Value: total seconds (number)
 * - onChange: receives new total seconds
 * - Two segments: hours (0-23) and minutes (0-59), step 1
 *
 * Usage:
 *   <TimePicker value={seconds} onChange={setSeconds} />
 *   <TimePicker value={seconds} onChange={setSeconds} disabled />
 */
export function TimePicker({ value = 0, onChange, disabled = false, className }) {
  const total = Math.max(0, Number(value) || 0)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)

  const setHours = (h) => {
    const newH = Math.max(0, Math.min(23, h))
    onChange?.(newH * 3600 + minutes * 60)
  }
  const setMinutes = (m) => {
    const newM = Math.max(0, Math.min(59, m))
    onChange?.(hours * 3600 + newM * 60)
  }

  const pad = (n) => String(n).padStart(2, '0')

  const Wheel = ({ value: v, onUp, onDown, label, max }) => (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={onUp}
        disabled={disabled || v >= max}
        className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label={`Increase ${label}`}
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <div className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-lg bg-muted/50 border border-border my-1">
        <span className="text-2xl sm:text-3xl font-bold tabular-nums tracking-tight">{pad(v)}</span>
      </div>
      <button
        type="button"
        onClick={onDown}
        disabled={disabled || v <= 0}
        className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        aria-label={`Decrease ${label}`}
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mt-1">{label}</span>
    </div>
  )

  return (
    <div className={cn(
      'inline-flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-border bg-background',
      disabled && 'opacity-50',
      className
    )}>
      <Clock className="h-5 w-5 text-primary shrink-0" />
      <Wheel value={hours} max={23} label="Hours" onUp={() => setHours(hours + 1)} onDown={() => setHours(hours - 1)} />
      <span className="text-3xl font-bold text-muted-foreground -mt-3">:</span>
      <Wheel value={minutes} max={59} label="Minutes" onUp={() => setMinutes(minutes + 1)} onDown={() => setMinutes(minutes - 1)} />
    </div>
  )
}

/** Format seconds as 'Xh Ym' or 'Y min' or '0 min'. */
export function formatDuration(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  if (s === 0) return '0 min'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m} min`
}

/** Format seconds as MM:SS (for countdown displays). */
export function formatMMSS(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

/** Format seconds as H:MM:SS or MM:SS depending on length. */
export function formatHMS(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h) return `${h}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`
}
