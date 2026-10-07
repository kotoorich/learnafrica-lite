import { useState, useEffect } from 'react';
import { Video, Calendar, Clock, Users, Plus, Trash2, ExternalLink, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api';

/**
 * LiveSessionsSection — shows scheduled live cohort sessions for a course.
 *
 * Props:
 *   courseId: required
 *   mode: 'instructor' | 'student' (default 'student')
 *   isEnrolled: for students — whether they can RSVP
 */
export default function LiveSessionsSection({ courseId, mode = 'student', isEnrolled = false }) {
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const authFetch = async (path, opts = {}) => {
    const token = sessionStorage.getItem('auth_token');
    const res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  };

  const load = async () => {
    setLoading(true); setError('');
    try {
      const d = await authFetch(`/api/courses/${courseId}/live-sessions`);
      setSessions(d.sessions || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { if (courseId) load(); }, [courseId]);

  const rsvp = async (sessionId) => {
    try {
      await authFetch(`/api/live-sessions/${sessionId}/rsvp`, { method: 'POST' });
      load();
    } catch (e) { alert(e.message); }
  };

  const unrsvp = async (sessionId) => {
    try {
      await authFetch(`/api/live-sessions/${sessionId}/rsvp`, { method: 'DELETE' });
      load();
    } catch (e) { alert(e.message); }
  };

  const removeSession = async (sessionId) => {
    if (!confirm('Delete this live session? All RSVPs will be cleared.')) return;
    try {
      await authFetch(`/api/instructor/live-sessions/${sessionId}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (e) { alert(e.message); }
  };

  const now = Date.now();
  const upcoming = sessions.filter(s => {
    const start = new Date(s.scheduled_at).getTime();
    const end = start + (s.duration_minutes || 60) * 60 * 1000;
    return end >= now;
  }).sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  const past = sessions.filter(s => {
    const start = new Date(s.scheduled_at).getTime();
    const end = start + (s.duration_minutes || 60) * 60 * 1000;
    return end < now;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold flex items-center gap-2">
            <Video className="h-4 w-4 text-primary" /> Live Sessions
          </h3>
          {mode === 'instructor' && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Schedule live Q&As or lectures via Zoom, Google Meet, or any video link.
            </p>
          )}
        </div>
        {mode === 'instructor' && (
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Schedule
          </Button>
        )}
      </div>

      {error && (
        <Card className="p-3 bg-destructive/10 border-destructive/30 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" /> {error}
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary/50" /></div>
      ) : sessions.length === 0 ? (
        <Card className="p-6 text-center">
          <Video className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            {mode === 'instructor' ? 'No sessions scheduled yet.' : 'No live sessions scheduled yet. Check back later.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {upcoming.map(s => <SessionCard
            key={s.id}
            session={s}
            mode={mode}
            isEnrolled={isEnrolled}
            onRSVP={() => rsvp(s.id)}
            onUnRSVP={() => unrsvp(s.id)}
            onDelete={() => removeSession(s.id)}
          />)}
          {past.length > 0 && (
            <>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider pt-3">Past sessions</p>
              {past.map(s => <SessionCard
                key={s.id}
                session={s}
                mode={mode}
                isEnrolled={isEnrolled}
                onRSVP={() => rsvp(s.id)}
                onUnRSVP={() => unrsvp(s.id)}
                onDelete={() => removeSession(s.id)}
                isPast
              />)}
            </>
          )}
        </div>
      )}

      {showCreate && (
        <CreateSessionModal
          courseId={courseId}
          onClose={() => setShowCreate(false)}
          onCreated={(sess) => {
            setSessions(prev => [sess, ...prev]);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function SessionCard({ session, mode, isEnrolled, onRSVP, onUnRSVP, onDelete, isPast }) {
  const startTime = new Date(session.scheduled_at);
  const endTime = new Date(startTime.getTime() + (session.duration_minutes || 60) * 60 * 1000);
  const now = new Date();
  const isLive = now >= startTime && now < endTime;
  const isUpcoming = now < startTime;

  const badge = isLive
    ? { text: 'LIVE NOW', color: 'bg-destructive text-destructive-foreground animate-pulse' }
    : isUpcoming
    ? { text: 'Upcoming', color: 'bg-primary/15 text-primary' }
    : { text: 'Past', color: 'bg-muted text-muted-foreground' };

  const dateStr = startTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = startTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <Card className={cn('p-3 transition-all', isPast && 'opacity-70', isLive && 'border-destructive/50 shadow-lg shadow-destructive/10')}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-sm truncate">{session.title}</p>
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider', badge.color)}>
              {badge.text}
            </span>
          </div>
          {session.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{session.description}</p>
          )}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-2 flex-wrap">
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {dateStr}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {timeStr}</span>
            <span>{session.duration_minutes || 60} min</span>
            <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {session.rsvp_count || 0} RSVPed</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {mode === 'student' && !isPast && isEnrolled && (
            <>
              {isLive ? (
                <Button size="sm" asChild className="gap-1.5">
                  <a href={session.meeting_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> Join
                  </a>
                </Button>
              ) : session.i_rsvped ? (
                <Button size="sm" variant="outline" onClick={onUnRSVP} className="gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" /> RSVPed
                </Button>
              ) : (
                <Button size="sm" onClick={onRSVP}>RSVP</Button>
              )}
            </>
          )}
          {mode === 'student' && isPast && session.recording_url && (
            <Button size="sm" variant="outline" asChild className="gap-1.5">
              <a href={session.recording_url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Recording
              </a>
            </Button>
          )}
          {mode === 'instructor' && (
            <>
              <Button size="sm" variant="ghost" asChild>
                <a href={session.meeting_url} target="_blank" rel="noreferrer" title="Open meeting URL">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
              <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function CreateSessionModal({ courseId, onClose, onCreated }) {
  const [title,       setTitle]       = useState('');
  const [description, setDescription] = useState('');
  const [date,        setDate]        = useState('');
  const [time,        setTime]        = useState('');
  const [duration,    setDuration]    = useState(60);
  const [meetingUrl,  setMeetingUrl]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSaving(true);
    try {
      if (!title.trim()) throw new Error('Title is required.');
      if (!date || !time) throw new Error('Date and time are required.');
      if (!meetingUrl.trim()) throw new Error('Meeting URL is required.');
      // Combine date + time into ISO string in user's local timezone
      const scheduled_at = new Date(`${date}T${time}`).toISOString();
      const token = sessionStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/api/instructor/courses/${courseId}/live-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          scheduled_at,
          duration_minutes: parseInt(duration, 10) || 60,
          meeting_url: meetingUrl.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create session');
      onCreated(data.session);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <Card className="w-full max-w-md p-6 my-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" /> Schedule live session
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Week 1 Q&A"
              required maxLength={100}
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Description (optional)</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What will you cover in this session?"
              rows={2} maxLength={500}
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Time</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} required
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">Duration (minutes)</label>
            <select value={duration} onChange={e => setDuration(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">
              Meeting URL (Zoom, Google Meet, etc.)
            </label>
            <input type="url" value={meetingUrl} onChange={e => setMeetingUrl(e.target.value)}
              placeholder="https://zoom.us/j/123456789"
              required
              className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            <p className="text-[10px] text-muted-foreground mt-1">
              Create the meeting in Zoom or Google Meet first, then paste the join link here.
            </p>
          </div>
          {error && (
            <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Schedule'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
