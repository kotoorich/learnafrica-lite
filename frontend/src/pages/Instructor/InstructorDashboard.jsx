import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card';
import { cn } from '@/lib/utils';
import {
  BookOpen, Users, DollarSign, Star, TrendingUp, Award,
  ChevronDown, ChevronUp, Play, CheckCircle2, Loader2,
  BookMarked, Target, GraduationCap, Info
} from 'lucide-react';
import StatsCard from '@/components/dashboard/StatsCard';
import { API_BASE } from '@/lib/api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';

const api = async (endpoint, opts = {}) => {
  const token = sessionStorage.getItem('auth_token');
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};

// ── Earnings Card ─────────────────────────────────────────────────────────────
function EarningsCard({ stats }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const grossRevenue   = stats?.gross_revenue   || 0;
  const myEarnings     = stats?.total_earnings  || 0;
  const platformShare  = stats?.platform_share  || 0;
  const instructorPct  = stats?.instructor_share_pct || 50;
  const platformPct    = stats?.platform_share_pct   || 50;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-success/10 flex items-center justify-center">
            <DollarSign className="h-6 w-6 text-success" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">My Earnings</p>
            <p className="text-2xl font-bold">${myEarnings.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
          </div>
        </div>
        <button
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <Info className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Breakdown</span>
          {showBreakdown ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {showBreakdown && (
        <div className="border-t border-border pt-3 space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Gross Revenue (all sales)</span>
            <span className="font-semibold text-foreground">${grossRevenue.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-success font-medium">Your share ({instructorPct}%)</span>
            <span className="font-bold text-success">${myEarnings.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Platform share ({platformPct}%)</span>
            <span className="font-medium">${platformShare.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</span>
          </div>
          {/* visual bar */}
          <div className="flex rounded-full overflow-hidden h-2 mt-1">
            <div className="bg-success transition-all" style={{width:`${instructorPct}%`}} />
            <div className="bg-muted transition-all" style={{width:`${platformPct}%`}} />
          </div>
          <p className="text-[10px] text-muted-foreground">Revenue split set by platform admin.</p>
        </div>
      )}
    </div>
  );
}

// ── Guide Video Player ────────────────────────────────────────────────────────
function GuideVideoPlayer({ url, title }) {
  // Detect YouTube
  const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

  const getEmbedUrl = (raw) => {
    try {
      if (raw.includes('youtube.com/watch')) {
        const id = new URL(raw).searchParams.get('v');
        return id ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1` : raw;
      }
      if (raw.includes('youtu.be/')) {
        const id = raw.split('/').pop().split('?')[0];
        return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
      }
    } catch {}
    return raw;
  };

  return (
    <div className="rounded-xl overflow-hidden border border-border bg-slate-950 shadow-md">
      {isYouTube ? (
        <div className="relative" style={{paddingBottom: '56.25%'}}>
          <iframe
            src={getEmbedUrl(url)}
            title={title}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      ) : (
        // Local file or direct video URL
        <video
          src={url}
          controls
          controlsList="nodownload"
          preload="metadata"
          className="w-full max-h-[360px] bg-slate-950"
          style={{display:'block'}}
        >
          <p className="p-4 text-sm text-muted-foreground">
            Your browser does not support this video format.
            <a href={url} target="_blank" rel="noreferrer" className="text-primary ml-1 underline">
              Open video
            </a>
          </p>
        </video>
      )}
    </div>
  );
}

// ── Guide Section ─────────────────────────────────────────────────────────────
function InstructorGuide() {
  const [steps, setSteps]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    api('/api/instructor-guide')
      .then(d => {
        const list = d.steps || [];
        setSteps(list);
        if (list.length) setExpandedId(list[0].id); // open first by default
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
    </div>
  );
  if (!steps.length) return null;

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <CardHeader className="border-b border-border bg-gradient-to-r from-primary/5 to-transparent pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="h-5 w-5 text-primary" />
          Instructor Quick-Start Guide
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Follow these steps to publish your first course. Click any step to expand it.
        </p>
      </CardHeader>

      <CardContent className="p-0 divide-y divide-border">
        {steps.map((step, index) => {
          const isOpen = expandedId === step.id;
          const hasVideo = !!step.video_url;

          return (
            <div key={step.id} className={cn(isOpen && 'bg-primary/[0.015]')}>
              {/* ── Header row ── */}
              <button
                type="button"
                onClick={() => setExpandedId(isOpen ? null : step.id)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-muted/40 transition-colors group"
              >
                {/* Number circle */}
                <div className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold border-2 transition-all duration-200',
                  isOpen
                    ? 'bg-primary border-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'bg-background border-border text-muted-foreground group-hover:border-primary/50'
                )}>
                  {index + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'font-semibold text-sm transition-colors',
                    isOpen ? 'text-primary' : 'text-foreground'
                  )}>
                    {step.title}
                  </p>
                  {!isOpen && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5 max-w-md">
                      {step.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {hasVideo && !isOpen && (
                    <span className="hidden sm:flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      <Play className="h-2.5 w-2.5 fill-primary" /> Video
                    </span>
                  )}
                  {isOpen
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>

              {/* ── Expanded body ── */}
              {isOpen && (
                <div className="px-5 pb-6 space-y-5 animate-in slide-in-from-top-1 duration-200">
                  <p className="text-sm text-foreground/80 leading-relaxed">{step.description}</p>

                  {hasVideo ? (
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <Play className="h-3 w-3" /> Tutorial Video
                      </p>
                      <GuideVideoPlayer url={step.video_url} title={step.title} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/20 border border-dashed border-border/60">
                      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Play className="h-4 w-4 text-muted-foreground/40" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">No video for this step yet</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">The admin will upload a tutorial video soon.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export function InstructorDashboard() {
  const { user } = useAuth();
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  const getInitials = n => n ? n.split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2) : '??';

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const data = await api('/api/instructor/stats');
        setStats(data);
      } catch {
        setStats({ total_courses:0, total_students:0, total_earnings:0, average_rating:0,
          gross_revenue:0, platform_share:0, instructor_share_pct:50, platform_share_pct:50,
          monthly_enrollments:[], course_performance:[], recent_students:[] });
      }
      setLoading(false);
    };
    fetchStats();
  }, []);

  if (user?.instructor_status === 'pending') return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 px-4">
      <div className="h-20 w-20 rounded-full bg-warning/10 flex items-center justify-center">
        <BookOpen className="h-10 w-10 text-warning" />
      </div>
      <h2 className="text-2xl font-bold">Application Pending</h2>
      <p className="text-muted-foreground max-w-sm">
        Your instructor application is being reviewed. You will be notified once approved.
      </p>
    </div>
  );

  if (user?.instructor_status === 'rejected') return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4 px-4">
      <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
        <BookOpen className="h-10 w-10 text-destructive" />
      </div>
      <h2 className="text-2xl font-bold">Application Rejected</h2>
      <p className="text-muted-foreground max-w-sm">
        Your instructor application was not approved. Contact support for more information.
      </p>
    </div>
  );

  const totalPages = Math.ceil((stats?.recent_students?.length || 0) / ITEMS_PER_PAGE);
  const paginatedStudents = (stats?.recent_students || []).slice(
    (currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE
  );

  const chartData = (stats?.monthly_enrollments || []).map(m => ({
    month: m.month?.slice(5) || m.month,
    enrollments: m.count
  }));

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">
          Welcome, {user?.name?.split(' ')[0] || 'Instructor'}!
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Here's how your courses are performing.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatsCard title="Total Courses"   value={stats?.total_courses  || 0} icon={BookOpen} />
        <StatsCard title="Total Students"  value={(stats?.total_students|| 0).toLocaleString()} icon={Users} />
        <StatsCard title="Avg Rating"      value={stats?.average_rating || '—'} icon={Star} />
        <StatsCard title="Completion Rate" value={`${stats?.completion_rate || 0}%`} icon={Award} />
      </div>

      {/* Earnings card — full width, shows breakdown */}
      {loading ? null : <EarningsCard stats={stats} />}

      {/* Monthly enrollments chart */}
      {chartData.length > 0 && (
        <Card className="border-border/50 shadow-sm overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Monthly Enrollments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{top:5,right:5,bottom:5,left:-20}}>
                  <defs>
                    <linearGradient id="enrollGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{fontSize:11}} stroke="hsl(var(--border))" />
                  <YAxis tick={{fontSize:11}} stroke="hsl(var(--border))" />
                  <Tooltip contentStyle={{background:'hsl(var(--background))',border:'1px solid hsl(var(--border))',borderRadius:'8px',fontSize:12}} />
                  <Area type="monotone" dataKey="enrollments" stroke="hsl(var(--primary))" fill="url(#enrollGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Course performance */}
      {(stats?.course_performance || []).length > 0 && (
        <Card className="border-border/50 shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Course Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20">
                  <th className="text-left p-3 font-medium text-muted-foreground">Course</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Students</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Completion</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Rating</th>
                </tr>
              </thead>
              <tbody>
                {stats.course_performance.map((c, i) => (
                  <tr key={c.id || i} className="border-b border-border/40 hover:bg-muted/20">
                    <td className="p-3 font-medium max-w-[180px] truncate">{c.title}</td>
                    <td className="p-3 text-center">{c.students}</td>
                    <td className="p-3 text-center">{c.completion_rate}%</td>
                    <td className="p-3 text-center flex items-center justify-center gap-1">
                      <Star className="h-3 w-3 fill-warning text-warning" />
                      {c.rating || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Recent students */}
      {(stats?.recent_students || []).length > 0 && (
        <Card className="border-border/50 shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border pb-3">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Recent Students
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {paginatedStudents.map((s, i) => (
              <div key={s.id || i} className="flex items-center gap-4 px-4 py-3 border-b border-border/40 last:border-0 hover:bg-muted/20">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                  {getInitials(s.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.course}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-primary">{s.progress}%</p>
                  <p className="text-[10px] text-muted-foreground">progress</p>
                </div>
              </div>
            ))}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-3 border-t border-border">
                <button onClick={() => setCurrentPage(p => Math.max(1,p-1))} disabled={currentPage===1}
                  className="px-3 py-1 rounded text-xs border border-border disabled:opacity-40 hover:bg-muted transition-colors">←</button>
                <span className="text-xs text-muted-foreground">{currentPage} / {totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages,p+1))} disabled={currentPage===totalPages}
                  className="px-3 py-1 rounded text-xs border border-border disabled:opacity-40 hover:bg-muted transition-colors">→</button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Instructor Guide ── */}
      <InstructorGuide />
    </div>
  );
}
