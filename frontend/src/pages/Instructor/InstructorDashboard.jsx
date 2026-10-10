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
import { formatPrice } from '@/lib/money';
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
// Human-readable destination for a saved payout method.
export function payoutDestinationLabel(method, details) {
  if (!method || !details) return '';
  if (method === 'momo') {
    const p = details.provider || 'Mobile Money';
    const n = details.phone || '';
    return n ? `${p} ${n}` : p;
  }
  if (method === 'bank') {
    const b = details.bank_name || 'Bank';
    const n = details.account_number || '';
    return n ? `${b} · ${n}` : b;
  }
  return '';
}

function EarningsCard({ stats, onChanged }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [summary, setSummary]   = useState(null);
  const [busy,    setBusy]      = useState(false);
  const [msg,     setMsg]       = useState(null);
  const [payoutMethod, setPayoutMethod] = useState(null);
  const grossRevenue   = stats?.gross_revenue   || 0;
  const myEarnings     = stats?.total_earnings  || 0;
  const platformShare  = stats?.platform_share  || 0;
  const instructorPct  = stats?.instructor_share_pct || 50;
  const platformPct    = stats?.platform_share_pct   || 50;

  const loadSummary = () => {
    api('/api/instructor/payouts/summary')
      .then(setSummary)
      .catch(() => {});
  };
  useEffect(() => { loadSummary(); }, []);
  useEffect(() => {
    api('/api/users/me/payment-method')
      .then(d => setPayoutMethod(d?.configured ? d : null))
      .catch(() => {});
  }, []);

  const available = summary?.available ?? 0;
  const requested = summary?.requested ?? 0;
  const paidOut   = summary?.total_paid ?? 0;
  const hasOpen   = (summary?.requests || []).some(r => r.status === 'requested');
  // Admins own the platform and keep 100% of their own course revenue
  // directly, so payouts never apply to them. The backend enforces this too.
  const isAdmin   = !!summary?.is_admin;

  const requestPayout = async () => {
    const dest = payoutDestinationLabel(payoutMethod?.method, payoutMethod?.details);
    const lines = [
      `Request payment of ${formatPrice(available)}?`,
      dest ? `\nWe will send it to: ${dest}` : '',
      '\nMoney will arrive within 24 hours.',
    ].filter(Boolean).join('\n');
    if (!window.confirm(lines)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await api('/api/instructor/payouts/request', { method: 'POST' });
      setMsg({ type: 'success', text: r.message || 'Request received.' });
      loadSummary();
      onChanged?.();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Could not request payment.' });
    } finally { setBusy(false); }
  };

  const statusStyles = {
    requested: 'bg-warning/10 text-warning border-warning/30',
    sent:      'bg-success/10 text-success border-success/30',
    rejected:  'bg-destructive/10 text-destructive border-destructive/30',
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-success/10 flex items-center justify-center">
            <DollarSign className="h-6 w-6 text-success" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">My Earnings</p>
            <p className="text-2xl font-bold">{formatPrice(myEarnings)}</p>
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

      {/* Payout state */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted/40 p-2.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Available</p>
          <p className="text-sm font-bold mt-0.5 tabular-nums">{formatPrice(available)}</p>
        </div>
        <div className="rounded-xl bg-muted/40 p-2.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Requested</p>
          <p className="text-sm font-bold mt-0.5 tabular-nums">{formatPrice(requested)}</p>
        </div>
        <div className="rounded-xl bg-muted/40 p-2.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Paid out</p>
          <p className="text-sm font-bold mt-0.5 tabular-nums">{formatPrice(paidOut)}</p>
        </div>
      </div>

      {msg && (
        <div className={cn('p-2.5 rounded-lg text-xs flex items-center gap-2',
          msg.type === 'success' ? 'bg-success/10 text-success border border-success/30'
                                 : 'bg-destructive/10 text-destructive border border-destructive/30')}>
          {msg.type === 'success' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
          <span>{msg.text}</span>
        </div>
      )}

      {isAdmin ? (
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex items-start gap-2">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            You are an admin. Revenue from your own courses is received directly,
            so payout requests do not apply to your account.
          </p>
        </div>
      ) : (
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          onClick={requestPayout}
          disabled={busy || hasOpen || available < 1}
          className={cn(
            'h-10 px-5 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2',
            (busy || hasOpen || available < 1)
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-success text-success-foreground hover:bg-success/90'
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
          {hasOpen ? 'Payment in progress' : 'Request payment'}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-muted-foreground">
            We send payouts to your saved method within 24 hours.
          </p>
          {payoutDestinationLabel(payoutMethod?.method, payoutMethod?.details) ? (
            <p className="text-[11px] text-foreground mt-0.5 truncate">
              Send to: <span className="font-semibold">{payoutDestinationLabel(payoutMethod?.method, payoutMethod?.details)}</span>
            </p>
          ) : (
            <p className="text-[11px] text-warning mt-0.5">
              No payout method saved yet — add one on your Profile.
            </p>
          )}
        </div>
      </div>
      )}

      {/* Request history */}
      {(summary?.requests || []).length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Payment requests</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {summary.requests.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <span className="font-bold tabular-nums">{formatPrice(r.amount)}</span>
                  <span className="text-muted-foreground ml-2">
                    {String(r.requested_at || '').slice(0, 10)}
                  </span>
                </div>
                <span className={cn('px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase',
                  statusStyles[r.status] || 'bg-muted text-muted-foreground border-border')}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showBreakdown && (
        <div className="border-t border-border pt-3 space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Gross Revenue (all sales)</span>
            <span className="font-semibold text-foreground">{formatPrice(grossRevenue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-success font-medium">Your share ({instructorPct}%)</span>
            <span className="font-bold text-success">{formatPrice(myEarnings)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Platform share ({platformPct}%)</span>
            <span className="font-medium">{formatPrice(platformShare)}</span>
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
  const [error, setError]           = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    api('/api/instructor-guide')
      .then(d => {
        const list = d.steps || [];
        setSteps(list);
        if (list.length) setExpandedId(list[0].id);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
    </div>
  );
  // Show a friendly card when there are no steps yet
  if (!steps.length) {
    return (
      <Card className="overflow-hidden border-border shadow-sm">
        <CardHeader className="border-b border-border bg-gradient-to-r from-primary/5 to-transparent pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="h-5 w-5 text-primary" />
            Instructor Quick-Start Guide
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {error
              ? 'Could not load the guide right now. Please try again later.'
              : 'No guide has been published yet. Check back soon!'}
          </p>
        </CardContent>
      </Card>
    );
  }

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
  const [paymentConfigured, setPaymentConfigured] = useState(true); // assume true until proven otherwise
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
    // Check payment-method configuration
    api('/api/users/me/payment-method')
      .then(d => setPaymentConfigured(!!d?.configured))
      .catch(() => { /* silent */ });
  }, []);

  const refreshStats = () => {
    api('/api/instructor/stats').then(setStats).catch(() => {});
  };

  // Pending/rejected screens are now handled by InstructorLayout at the route level.
  // This component only renders for approved instructors and admins.

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
      {/* Banner: payment method not yet configured */}
      {!paymentConfigured && user?.role === 'instructor' && (
        <div className="p-4 rounded-xl border-2 border-warning/40 bg-warning/10 flex flex-col sm:flex-row sm:items-center gap-3">
          <Info className="h-5 w-5 text-warning shrink-0" />
          <div className="flex-1">
            <p className="font-bold text-sm">Complete your payout setup</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add your mobile money or bank details on your profile so we can send your earnings.
            </p>
          </div>
          <a href="/profile"
            className="px-4 py-2 rounded-lg bg-warning text-warning-foreground text-xs font-bold hover:bg-warning/90 transition-colors text-center whitespace-nowrap">
            Add payout method
          </a>
        </div>
      )}

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
      {loading ? null : <EarningsCard stats={stats} onChanged={refreshStats} />}

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
