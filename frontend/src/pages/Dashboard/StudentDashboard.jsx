import { useMemo, Suspense, lazy, useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import StatsCard from '@/components/dashboard/StatsCard';
import { Button } from '@/components/common/Button';
import { Card, CardContent } from '@/components/common/Card';
import { StatsCardSkeleton } from '@/components/common/LoadingSkeleton';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/common/Toast';
import {
  Award, Download, ExternalLink, Trophy, BookOpen, Target,
  Flame, Compass, CheckCircle2, Star, Zap, Loader2,
  ArrowRight, ArrowLeft, ChevronDown, ChevronUp, Book,
  Eye, Pencil, Check, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api';
import { courseThumbnail } from '@/lib/courseThumbnail';

const ProgressCard = lazy(() => import('@/components/dashboard/ProgressCard'));

// ── Badge configuration ────────────────────────────────────────────────────
const badgeConfig = [
  { id:'1', key:'FIRST_STEPS',        title:'First Steps',        description:'Complete your first lesson.',  iconName:'Target',   requirementType:'lessons_completed', goal:1,  color:'orange', gradient:['#f97316','#ea580c'] },
  { id:'2', key:'COURSE_CHAMPION',    title:'Course Champion',    description:'Finish an entire course.',      iconName:'Trophy',   requirementType:'courses_completed', goal:1,  color:'yellow', gradient:['#eab308','#ca8a04'] },
  { id:'3', key:'QUIZ_MASTER',        title:'Quiz Master',        description:'Get 5 perfect quiz scores.',    iconName:'BookOpen', requirementType:'perfect_quizzes',   goal:5,  color:'purple', gradient:['#a855f7','#7c3aed'] },
  { id:'4', key:'CONSISTENT_LEARNER', title:'Consistent Learner', description:'7 day learning streak.',        iconName:'Flame',    requirementType:'streak',            goal:7,  color:'red',    gradient:['#ef4444','#dc2626'] },
  { id:'5', key:'PATHFINDER',         title:'Pathfinder',         description:'Complete your profile.',        iconName:'Compass',  requirementType:'profile_completed', goal:1,  color:'emerald',gradient:['#10b981','#059669'] },
];

const colorMap = {
  orange: { text:'text-orange-500', bg:'bg-orange-500/10', border:'border-orange-500/30', solid:'bg-orange-500' },
  yellow: { text:'text-yellow-500', bg:'bg-yellow-500/10', border:'border-yellow-500/30', solid:'bg-yellow-500' },
  purple: { text:'text-purple-500', bg:'bg-purple-500/10', border:'border-purple-500/30', solid:'bg-purple-500' },
  red:    { text:'text-red-500',    bg:'bg-red-500/10',    border:'border-red-500/30',    solid:'bg-red-500'    },
  emerald:{ text:'text-emerald-500',bg:'bg-emerald-500/10',border:'border-emerald-500/30',solid:'bg-emerald-500'},
};
const iconMap = { Target, Trophy, BookOpen, Flame, Compass, Award };

// ── PDF Badge Generator ────────────────────────────────────────────────────
async function registerBadge(badge) {
  const token = sessionStorage.getItem('auth_token');
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/badges/issue`,  {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ badge_key: badge.key, badge_title: badge.title })
    });
    if (res.ok) {
      const data = await res.json();
      return data.badge_id;
    }
  } catch {}
  return null;
}


// ── Unified badge design ────────────────────────────────────────────────
// Previously the on-screen BadgeCard and the downloaded badge were two
// completely separate things: a small React tile here, and a hand-written
// HTML string with its own gradient/layout built fresh in a popup window
// for downloading. They could never have matched. This component is now
// the single design used for BOTH the preview modal and the actual
// printed/downloaded output, exactly like the certificate fix.
function BadgeDocument({ badge, displayName, badgeId }) {
  const Icon = iconMap[badge.iconName] || Award;
  const [c1, c2] = badge.gradient || ['#0f172a', '#1e293b'];
  return (
    <div
      className="relative overflow-hidden rounded-2xl print:rounded-none print:static print:mx-auto print:my-0 print:w-full print:max-w-none print:h-auto"
      style={{ background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`, aspectRatio: '1.414 / 1' }}
    >
      {/* Same mobile print fix as the certificate: no forced orientation,
          a fixed aspect-ratio box that scales to whatever page it's given. */}
      <style dangerouslySetInnerHTML={{ __html: `@media print { @page { size: auto; margin: 8mm; } html, body { margin:0 !important; padding:0 !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; } }` }} />
      <div className="absolute w-64 h-64 rounded-full border-2 border-white/15 -top-16 -right-16" />
      <div className="absolute w-44 h-44 rounded-full border-2 border-white/10 -bottom-10 -left-10" />
      <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-8 py-6">
        <p className="text-[10px] font-extrabold tracking-[0.3em] text-white/60 uppercase mb-3">LearnAfrica Lite</p>
        <div className="h-20 w-20 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center mb-4">
          <Icon className="h-10 w-10 text-white" strokeWidth={1.5} />
        </div>
        <p className="text-[10px] font-bold tracking-[0.2em] text-white/70 uppercase mb-1.5">Achievement Unlocked</p>
        <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-1.5">{badge.title}</h2>
        <p className="text-xs text-white/75 max-w-xs mb-4">{badge.description}</p>
        <div className="w-14 h-0.5 bg-white/30 rounded-full mb-4" />
        <p className="text-[9px] tracking-[0.15em] text-white/50 uppercase mb-1">Awarded to</p>
        <p className="text-base font-bold text-white mb-3">{displayName}</p>
        <p className="text-[8px] tracking-[0.25em] text-white/40 uppercase">
          Issued by LearnAfrica &bull; {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        {badgeId && (
          <p className="text-[7px] tracking-[0.15em] text-white/30 font-mono mt-1">
            ID: {badgeId} &bull; Verify at learnafrica-lite-weld.vercel.app/#verify-section
          </p>
        )}
      </div>
    </div>
  );
}

// Same edit-name pattern as the certificate, pointed at the badge endpoints
function BadgeEditNameControl({ badgeKey, currentName, remaining, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const { showToast } = useToast();

  const save = async () => {
    const trimmed = value.trim();
    if (trimmed.length < 2) { setErr('Name is too short.'); return; }
    setSaving(true); setErr('');
    try {
      const token = sessionStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/api/badges/${badgeKey}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update name.');
      onUpdated(data.badgeName, data.nameChangesRemaining);
      showToast({ type: 'success', message: 'Badge name updated.' });
      setEditing(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (remaining <= 0 && !editing) {
    return (
      <p className="print:hidden text-xs text-muted-foreground text-center mt-2">
        All 3 name changes used. <a href="mailto:support@learnafrica.com" className="text-primary hover:underline font-medium">Contact support</a> for correction.
      </p>
    );
  }
  if (!editing) {
    return (
      <button onClick={() => { setValue(currentName); setEditing(true); }} className="print:hidden flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mt-2 mx-auto">
        <Pencil className="h-3 w-3" /> Edit name ({remaining} left)
      </button>
    );
  }
  return (
    <div className="print:hidden flex flex-col items-center gap-2 mt-3">
      <div className="flex items-center gap-2">
        <input value={value} onChange={e => setValue(e.target.value)} maxLength={100} autoFocus
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        <button onClick={save} disabled={saving} className="h-9 w-9 flex items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
        <button onClick={() => setEditing(false)} disabled={saving} className="h-9 w-9 flex items-center justify-center rounded-lg border border-input">
          <X className="h-4 w-4" />
        </button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}

// Preview modal: what you see here is exactly what gets printed/downloaded,
// same component, same data, cannot drift apart.
function BadgePreviewModal({ badge, userName, onClose }) {
  const [badgeId, setBadgeId] = useState(null);
  const [nameInfo, setNameInfo] = useState({ badgeName: userName, remaining: 3 });
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await registerBadge(badge);
      if (cancelled) return;
      setBadgeId(id);
      try {
        const token = sessionStorage.getItem('auth_token');
        const res = await fetch(`${API_BASE}/api/badges/${badge.key}`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const d = await res.json();
          if (!cancelled) setNameInfo({ badgeName: d.badgeName || userName, remaining: d.nameChangesRemaining ?? 3 });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [badge, userName]);

  const handleDownload = () => {
    window.print();
    showToast({ type: 'success', message: 'Badge ready, use "Save as PDF" in the print dialog to download.' });
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm print:bg-white print:p-0 print:block">
      <div className="max-w-lg w-full print:max-w-none print:w-full">
        <div className="print:hidden flex items-center justify-between mb-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-white/80 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
        </div>
        <BadgeDocument badge={badge} displayName={nameInfo.badgeName} badgeId={badgeId} />
        <div className="print:hidden mt-4 flex flex-col items-center gap-2">
          <Button onClick={handleDownload} className="w-full sm:w-auto px-8 gap-2">
            <Download className="h-4 w-4" /> Download Badge
          </Button>
          <BadgeEditNameControl
            badgeKey={badge.key}
            currentName={nameInfo.badgeName}
            remaining={nameInfo.remaining}
            onUpdated={(name, remaining) => setNameInfo({ badgeName: name, remaining })}
          />
        </div>
      </div>
    </div>
  );
}

function BadgeCard({ badge, userName }) {
  const [showPreview, setShowPreview] = useState(false);
  const Icon     = iconMap[badge.iconName] || Award;
  const cl       = colorMap[badge.color] || colorMap.emerald;
  const pct      = Math.min(Math.round((badge.currentProgress / badge.goal) * 100), 100);
  const earned   = badge.earned;

  return (
    <>
    <div className={cn(
      'relative flex flex-col items-center p-4 rounded-2xl border transition-all duration-300 group',
      earned
        ? `${cl.bg} ${cl.border} shadow-sm hover:shadow-md`
        : 'bg-muted/20 border-border/40 opacity-60 grayscale'
    )}>
      {/* Icon */}
      <div className={cn(
        'flex h-14 w-14 items-center justify-center rounded-full mb-3 transition-transform duration-300 group-hover:scale-110',
        earned ? `${cl.bg} ${cl.border} border-2` : 'bg-muted border-border border-2'
      )}>
        <Icon className={cn('h-7 w-7', earned ? cl.text : 'text-muted-foreground')} strokeWidth={2} />
      </div>

      {/* Text */}
      <h4 className="font-bold text-xs text-center leading-tight mb-1">{badge.title}</h4>
      <p className="text-[10px] text-muted-foreground text-center leading-snug mb-3 min-h-[2.5rem]">{badge.description}</p>

      {/* Progress / Earned state */}
      {earned ? (
        <div className="w-full space-y-2">
          <div className={cn('w-full h-1.5 rounded-full overflow-hidden', cl.bg)}>
            <div className={cn('h-full rounded-full', cl.solid)} style={{ width: '100%' }} />
          </div>
          <button
            onClick={() => setShowPreview(true)}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold transition-all',
              cl.bg, cl.text, cl.border, 'border',
              'hover:opacity-80 active:scale-95'
            )}>
            <Eye className="h-3 w-3" />View Badge
          </button>
        </div>
      ) : (
        <div className="w-full space-y-1.5">
          <div className="flex justify-between text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
            <span>Progress</span>
            <span>{badge.currentProgress} / {badge.goal}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-border overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-1000 ease-out',
                badge.currentProgress > 0 ? cl.solid : 'bg-transparent'
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className={cn('text-[9px] font-bold text-center', badge.currentProgress > 0 ? cl.text : 'text-muted-foreground')}>
            {pct}% complete
          </p>
        </div>
      )}
    </div>
    {showPreview && (
      <BadgePreviewModal badge={badge} userName={userName} onClose={() => setShowPreview(false)} />
    )}
    </>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
export default function StudentDashboard() {
  const { user, courses, isLoading } = useAuth();
  const stats    = user?.stats || {};
  const userBadges = user?.badges || [];
  const [viewAllActive, setViewAllActive] = useState(false);

  const enrolledCourses    = useMemo(() => courses.filter(c => c.isEnrolled),           [courses]);
  const completedCourses   = useMemo(() => courses.filter(c => c.progress === 100),     [courses]);
  const inProgressCourses  = useMemo(() => enrolledCourses.filter(c => c.progress < 100),[enrolledCourses]);

  // FIX: "View Certificate" used to show based only on the course's
  // has_certificate flag, with zero check for whether the student actually
  // passed a final exam. That meant clicking it could take a student to a
  // certificate page that then errors out, exactly the confusing flow being
  // fixed here. This now asks the same backend endpoint that actually
  // enforces the rule, and only shows the link when it genuinely says yes.
  const [certEligibility, setCertEligibility] = useState({});
  useEffect(() => {
    const toCheck = completedCourses.filter(c => c.has_certificate && !(c.id in certEligibility));
    if (toCheck.length === 0) return;
    const token = sessionStorage.getItem('auth_token');
    toCheck.forEach(course => {
      fetch(`${API_BASE}/api/certificates/${course.id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => setCertEligibility(prev => ({ ...prev, [course.id]: r.ok })))
        .catch(() => setCertEligibility(prev => ({ ...prev, [course.id]: false })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedCourses]);
  const recommendedCourses = useMemo(() => courses.filter(c => !c.isEnrolled).slice(0,3),[courses]);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  const liveBadges = useMemo(() => badgeConfig.map(cfg => {
    const hasKey = userBadges.includes(cfg.key);
    let current = 0;
    switch (cfg.requirementType) {
      case 'lessons_completed': current = stats.lessons_completed || 0; break;
      case 'courses_completed': current = stats.courses_completed || 0; break;
      case 'perfect_quizzes':   current = stats.perfect_quizzes   || 0; break;
      case 'streak':            current = stats.streak            || 0; break;
      case 'profile_completed': current = (user?.bio && user?.avatar) ? 1 : 0; break;
    }
    const earned = hasKey || current >= cfg.goal;
    return { ...cfg, earned, currentProgress: current };
  }).sort((a, b) => b.earned - a.earned), [userBadges, stats, user]);

  const earnedCount = liveBadges.filter(b => b.earned).length;

  if (isLoading) return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[1,2,3,4].map(i => <StatsCardSkeleton key={i} />)}
      </div>
    </div>
  );

  return (
    <div className="w-full max-w-7xl mx-auto space-y-8 pb-10 px-1 sm:px-0">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Welcome back, {user?.name?.split(' ')[0] || 'Learner'}!
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Keep up the momentum on your learning journey.</p>
        </div>
        <Link to="/courses" className="self-start sm:self-auto">
          <Button className="gap-2 whitespace-nowrap">
            <BookOpen className="h-4 w-4" /> Browse Courses
          </Button>
        </Link>
      </div>

      {/* Mobile quick-nav strip */}
      <div className="sm:hidden fixed top-[64px] left-0 right-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-2.5 flex justify-center gap-2 shadow-sm">
        <button onClick={() => scrollToSection('continue-learning')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-xs font-semibold text-foreground hover:bg-primary/10 hover:text-primary transition-colors">
          <Book className="w-3.5 h-3.5" /> Progress
        </button>
        <button onClick={() => scrollToSection('badges-section')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-xs font-semibold text-foreground hover:bg-primary/10 hover:text-primary transition-colors">
          <Trophy className="w-3.5 h-3.5" /> Badges
        </button>
        <button onClick={() => scrollToSection('recommendations')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-xs font-semibold text-foreground hover:bg-primary/10 hover:text-primary transition-colors">
          <Compass className="w-3.5 h-3.5" /> For You
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Suspense fallback={<><StatsCardSkeleton /><StatsCardSkeleton /><StatsCardSkeleton /><StatsCardSkeleton /></>}>
          <StatsCard title="Enrolled"      value={enrolledCourses.length}       icon="BookOpen" />
          <StatsCard title="Completed"     value={completedCourses.length}      icon="Award" />
          <StatsCard title="Perfect Quizzes" value={stats.perfect_quizzes || 0} icon="Trophy" />
          <StatsCard title="Day Streak"    value={`${stats.streak || 0} 🔥`}    icon="Zap"
            trendValue={`${earnedCount}/${badgeConfig.length} badges`} />
        </Suspense>
      </div>

      {/* ── Continue Learning ── */}
      <section id="continue-learning" className="space-y-3 scroll-mt-20">
        <h2 className="text-lg sm:text-xl font-bold">Continue Learning</h2>
        {inProgressCourses.length > 0 ? (
          <>
            <div className="grid gap-3">
              {(viewAllActive ? inProgressCourses : inProgressCourses.slice(0, 3)).map(course => (
                <ProgressCard key={course.id} course={course} />
              ))}
            </div>
            {inProgressCourses.length > 3 && (
              <div className="flex justify-center pt-2">
                <button onClick={() => setViewAllActive(!viewAllActive)}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors">
                  {viewAllActive
                    ? <><ChevronUp className="w-4 h-4" /> Show less</>
                    : <><ChevronDown className="w-4 h-4" /> Show {inProgressCourses.length - 3} more</>}
                </button>
              </div>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="p-6 sm:p-8 text-center">
              <BookOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No courses in progress.</p>
              <Link to="/courses" className="text-primary hover:underline text-sm font-medium">Explore Courses →</Link>
            </CardContent>
          </Card>
        )}
      </section>

      {/* ── Certificates ── */}
      {completedCourses.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" /> My Certificates
            </h2>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">{completedCourses.length} earned</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {completedCourses.map(course => (
              <div key={course.id} className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className="h-1.5 bg-gradient-to-r from-primary via-accent to-primary" />
                <div className="p-4 flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm line-clamp-2 leading-snug">{course.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{course.category}</p>
                    {course.has_certificate && certEligibility[course.id] === true && (
                      <Link to={`/certificate/${course.id}`} className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> View Certificate
                      </Link>
                    )}
                    {course.has_certificate && certEligibility[course.id] === false && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Pass the final exam to unlock your certificate
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Badges ── */}
      <section id="badges-section" className="space-y-3 scroll-mt-20">
        <div className="flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-warning" /> My Badges
          </h2>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
            {earnedCount} / {badgeConfig.length} earned
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {liveBadges.map(badge => (
            <BadgeCard key={badge.id} badge={badge} userName={user?.name} />
          ))}
        </div>
      </section>

      {/* ── Recommended ── */}
      {recommendedCourses.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg sm:text-xl font-bold">Recommended For You</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {recommendedCourses.map(course => (
              <div key={course.id} className="rounded-2xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow group">
                <div className="relative aspect-video overflow-hidden bg-muted">
                  <img src={courseThumbnail(course)} alt={course.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  {course.is_free && (
                    <span className="absolute top-2 left-2 text-[10px] font-bold bg-success text-white px-2 py-0.5 rounded-full">Free</span>
                  )}
                </div>
                <div className="p-4 space-y-2">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">{course.category}</p>
                  <h3 className="font-semibold text-sm line-clamp-2 leading-snug">{course.title}</h3>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-warning text-warning" />
                      {course.rating || '4.8'}
                    </span>
                    <span className="font-bold text-foreground">
                      {course.is_free ? 'Free' : `$${course.price}`}
                    </span>
                  </div>
                  <Link to={`/courses/${course.id}`} className="block mt-1">
                    <Button size="sm" className="w-full text-xs">Learn More</Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
