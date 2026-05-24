import { useMemo, Suspense, lazy, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import StatsCard from '@/components/dashboard/StatsCard';
import { Button } from '@/components/common/Button';
import { Card, CardContent } from '@/components/common/Card';
import { StatsCardSkeleton } from '@/components/common/LoadingSkeleton';
import { useAuth } from '@/context/AuthContext';
import {
  Award, Download, ExternalLink, Trophy, BookOpen, Target,
  Flame, Compass, CheckCircle2, Star, Zap, Loader2,
  ArrowRight, ChevronDown, ChevronUp, Book
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api';

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

async function downloadBadgePDF(badge, gradient, userName) {
  const badgeId = await registerBadge(badge);
  const [c1, c2] = gradient;

  // Build a rich A5 badge as SVG, then wrap in minimal HTML for print-to-PDF
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:210mm; height:148mm; background:#fff; font-family:'Inter',sans-serif; }
  .page { width:210mm; height:148mm; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%); }
  .card {
    width:190mm; height:128mm;
    border-radius:16px;
    background:linear-gradient(135deg,${c1} 0%,${c2} 100%);
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    position:relative; overflow:hidden;
    box-shadow:0 25px 50px rgba(0,0,0,0.5);
  }
  .ring1 { position:absolute; width:260px; height:260px; border-radius:50%; border:2px solid rgba(255,255,255,0.15); top:-60px; right:-60px; }
  .ring2 { position:absolute; width:180px; height:180px; border-radius:50%; border:2px solid rgba(255,255,255,0.1); bottom:-40px; left:-40px; }
  .ring3 { position:absolute; width:120px; height:120px; border-radius:50%; background:rgba(255,255,255,0.05); top:50%; left:50%; transform:translate(-50%,-50%); }
  .inner { position:relative; z-index:10; text-align:center; padding:24px; }
  .platform { font-size:9px; font-weight:800; letter-spacing:0.3em; color:rgba(255,255,255,0.6); text-transform:uppercase; margin-bottom:12px; }
  .badge-circle {
    width:90px; height:90px; border-radius:50%;
    background:rgba(255,255,255,0.2);
    border:3px solid rgba(255,255,255,0.4);
    display:flex; align-items:center; justify-content:center;
    margin:0 auto 16px;
  }
  .badge-circle svg { width:44px; height:44px; fill:none; stroke:white; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; }
  .achieved { font-size:9px; font-weight:700; letter-spacing:0.2em; color:rgba(255,255,255,0.7); text-transform:uppercase; margin-bottom:6px; }
  .title { font-size:28px; font-weight:900; color:white; letter-spacing:-0.5px; margin-bottom:4px; }
  .desc { font-size:11px; color:rgba(255,255,255,0.75); margin-bottom:16px; max-width:200px; }
  .divider { width:60px; height:2px; background:rgba(255,255,255,0.3); border-radius:1px; margin:0 auto 14px; }
  .recipient-label { font-size:8px; letter-spacing:0.15em; color:rgba(255,255,255,0.5); text-transform:uppercase; margin-bottom:4px; }
  .recipient { font-size:16px; font-weight:700; color:white; margin-bottom:12px; }
  .footer { font-size:7px; letter-spacing:0.25em; color:rgba(255,255,255,0.4); text-transform:uppercase; }
  .badge-id { font-size:6px; letter-spacing:0.15em; color:rgba(255,255,255,0.3); font-family:monospace; margin-top:3px; }
  @media print {
    html,body { width:210mm!important; height:148mm!important; }
    .page { page-break-after:always; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="card">
    <div class="ring1"></div>
    <div class="ring2"></div>
    <div class="ring3"></div>
    <div class="inner">
      <div class="platform">LearnAfrica Lite</div>
      <div class="badge-circle">
        <svg viewBox="0 0 24 24">${getBadgeSVGPath(badge.iconName)}</svg>
      </div>
      <div class="achieved">Achievement Unlocked</div>
      <div class="title">${badge.title}</div>
      <div class="desc">${badge.description}</div>
      <div class="divider"></div>
      <div class="recipient-label">Awarded to</div>
      <div class="recipient">${userName || 'Learner'}</div>
      <div class="footer">Issued by LearnAfrica · ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
      ${badgeId ? `<div class="badge-id">ID: ${badgeId} · Verify at learnafrica.com/verify</div>` : ''}
    </div>
  </div>
</div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (win) {
    win.onload = () => {
      setTimeout(() => {
        win.print();
        URL.revokeObjectURL(url);
      }, 800);
    };
  } else {
    // Fallback: download HTML file
    const a = document.createElement('a');
    a.href = url; a.download = `${badge.key}_badge.html`; a.click();
    URL.revokeObjectURL(url);
  }
}

function getBadgeSVGPath(iconName) {
  const paths = {
    Target:   '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    Trophy:   '<path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 22V14.5a.5.5 0 00-.5-.5H8"/><path d="M14 22V14.5a.5.5 0 01.5-.5H16"/><path d="M6 4v8a6 6 0 0012 0V4"/><path d="M6 12a6 6 0 0012 0"/>',
    BookOpen: '<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>',
    Flame:    '<path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 3z"/>',
    Compass:  '<circle cx="12" cy="12" r="10"/><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>',
    Award:    '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>',
  };
  return paths[iconName] || paths.Award;
}

// ── BadgeCard component ────────────────────────────────────────────────────
function BadgeCard({ badge, userName }) {
  const [downloading, setDownloading] = useState(false);
  const Icon     = iconMap[badge.iconName] || Award;
  const cl       = colorMap[badge.color] || colorMap.emerald;
  const pct      = Math.min(Math.round((badge.currentProgress / badge.goal) * 100), 100);
  const earned   = badge.earned;

  const handleDownload = async (e) => {
    e.stopPropagation();
    setDownloading(true);
    await downloadBadgePDF(badge, badge.gradient, userName);
    setTimeout(() => setDownloading(false), 1500);
  };

  return (
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
            onClick={handleDownload}
            disabled={downloading}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold transition-all',
              cl.bg, cl.text, cl.border, 'border',
              'hover:opacity-80 active:scale-95 disabled:opacity-50'
            )}>
            {downloading
              ? <><Loader2 className="h-3 w-3 animate-spin" />Preparing…</>
              : <><Download className="h-3 w-3" />Download Badge</>}
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
                    {course.has_certificate && <Link to={`/certificate/${course.id}`} className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-primary hover:underline"><ExternalLink className="h-3 w-3" /> View Certificate</Link>}
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
                  <img src={course.thumbnail || '/placeholder.jpg'} alt={course.title}
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
