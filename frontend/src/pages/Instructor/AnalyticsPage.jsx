import { useState, useEffect } from 'react';
import { DollarSign, Users, Target, Star, TrendingUp, Percent, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import StatsCard from '@/components/dashboard/StatsCard';
import { API_BASE } from '@/lib/api';
import { formatPrice } from '@/lib/money';

const api = async (url) => {
  const token = sessionStorage.getItem('auth_token');
  const res = await fetch(`${API_BASE}${url}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json();
};

export function AnalyticsPage() {
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/instructor/stats')
      .then(d => setStats(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const cr = stats?.completion_rate || 0;
  const completionData = cr > 0 ? [
    { name: 'Completed',   value: cr,                         color: 'hsl(var(--success))' },
    { name: 'In Progress', value: Math.max(0, Math.min(40, 100 - cr - 10)), color: 'hsl(var(--primary))' },
    { name: 'Not Started', value: Math.max(0, 100 - cr - Math.max(0, Math.min(40, 100 - cr - 10))), color: 'hsl(var(--muted))' },
  ] : [{ name: 'No Data', value: 100, color: 'hsl(var(--muted))' }];

  const instructorPct = stats?.instructor_share_pct ?? 50;
  const adminPct      = stats?.admin_share_pct      ?? 50;
  const gross         = stats?.gross_revenue        ?? 0;
  const myEarnings    = stats?.total_earnings       ?? 0;
  const platformCut   = stats ? round2(gross - myEarnings) : 0;

  function round2(n) { return Math.round(n * 100) / 100; }

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Your course performance and earnings</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatsCard title="My Earnings"    value={`${formatPrice(myEarnings, true)}`}          icon={DollarSign} />
        <StatsCard title="Total Students" value={(stats?.total_students || 0).toLocaleString()} icon={Users} />
        <StatsCard title="Completion Rate"value={`${cr}%`}                                    icon={Target} />
        <StatsCard title="Avg Rating"     value={stats?.average_rating ? Number(stats.average_rating).toFixed(1) : '—'} icon={Star} />
      </div>

      {/* Earnings breakdown card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Revenue Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Gross */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-background border border-border">
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Gross Revenue</p>
              <p className="text-2xl font-bold mt-0.5">${gross.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total paid by students for your courses</p>
            </div>
            <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
          </div>

          {/* Split bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <span>Revenue Split</span>
              <span className="flex items-center gap-1 text-muted-foreground/60 normal-case font-normal">
                <Info className="h-3 w-3" /> Set by platform admin
              </span>
            </div>
            <div className="h-4 rounded-full overflow-hidden flex">
              <div
                className="bg-primary transition-all duration-700 ease-out flex items-center justify-center"
                style={{ width: `${instructorPct}%` }}>
                {instructorPct >= 20 && <span className="text-[9px] font-black text-primary-foreground">{instructorPct}%</span>}
              </div>
              <div
                className="bg-muted-foreground/40 transition-all duration-700 ease-out flex items-center justify-center"
                style={{ width: `${adminPct}%` }}>
                {adminPct >= 20 && <span className="text-[9px] font-black text-white">{adminPct}%</span>}
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary inline-block" /> You ({instructorPct}%)</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40 inline-block" /> Platform ({adminPct}%)</span>
            </div>
          </div>

          {/* Your earnings vs platform */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-success/5 border border-success/20 text-center">
              <p className="text-[10px] font-bold uppercase text-success/70 tracking-widest mb-1">Your Earnings</p>
              <p className="text-xl font-bold text-success">${myEarnings.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{instructorPct}% of gross</p>
            </div>
            <div className="p-4 rounded-xl bg-muted/30 border border-border text-center">
              <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest mb-1">Platform Fee</p>
              <p className="text-xl font-bold text-muted-foreground">${platformCut.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{adminPct}% of gross</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Monthly enrollments */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Monthly Enrollments</CardTitle></CardHeader>
          <CardContent>
            {(stats?.monthly_enrollments?.length || 0) > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={stats.monthly_enrollments} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorE" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="enrollments" stroke="hsl(var(--primary))" fill="url(#colorE)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No enrollment data yet</div>
            )}
          </CardContent>
        </Card>

        {/* Completion */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Completion Rate</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <ResponsiveContainer width="60%" height={160}>
                <PieChart>
                  <Pie data={completionData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={2}>
                    {completionData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {completionData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: entry.color }} />
                    <span className="text-muted-foreground">{entry.name}</span>
                    <span className="font-bold ml-auto">{Math.round(entry.value)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Course performance */}
      {(stats?.course_performance?.length || 0) > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Course Performance</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {['Course','Students','Completion','Rating','Gross','Your Cut'].map(h => (
                    <th key={h} className="pb-2 text-xs font-bold text-muted-foreground uppercase tracking-wide pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.course_performance.map((c, idx) => {
                  const courseGross = (c.avg_price || 0) * (c.students || 0);
                  const myCut = round2(courseGross * (instructorPct / 100));
                  return (
                    <tr key={c.id || `course-${idx}`} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 pr-4 font-medium max-w-[180px] truncate">{c.title}</td>
                      <td className="py-2.5 pr-4">{c.students}</td>
                      <td className="py-2.5 pr-4">{c.completion_rate}%</td>
                      <td className="py-2.5 pr-4">{c.rating ? Number(c.rating).toFixed(1) : '—'}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">${courseGross.toFixed(2)}</td>
                      <td className="py-2.5 font-bold text-success">${myCut.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {/* Enrollments timeline (last 12 weeks) */}
      <EnrollmentsTimelineCard />

      {/* Lesson drop-off analyzer */}
      <LessonDropoffCard />

    </div>
  );
}

// ── Enrollments over time — line chart of last 12 weeks ─────────────────────
function EnrollmentsTimelineCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api('/api/instructor/analytics/enrollments-timeline')
      .then(d => setData(d))
      .catch(() => setData({ weeks: [], total_last_30_days: 0 }))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return null;
  const points = (data?.weeks || []).map(w => ({
    label: new Date(w.week).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    count: w.count,
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" /> Enrollments Over Time
        </CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          {data?.total_last_30_days || 0} new students in the last 30 days
        </p>
      </CardHeader>
      <CardContent>
        {points.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={points}>
              <defs>
                <linearGradient id="enrollGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#enrollGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">No enrollment data yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Lesson drop-off — pick a course, see where students give up ──────────
function LessonDropoffCard() {
  const [courses, setCourses] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api('/api/instructor/analytics/per-course')
      .then(d => {
        setCourses(d.courses || []);
        if (d.courses?.[0]?.course_id) setSelectedId(d.courses[0].course_id);
      })
      .catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    api(`/api/instructor/analytics/lesson-dropoff/${selectedId}`)
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const chartData = (data?.lessons || []).map((l, i) => ({
    name: `L${i + 1}`,
    title: l.title,
    reached: l.reached_count,
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Info className="h-4 w-4 text-primary" /> Where Students Drop Off
        </CardTitle>
        {courses.length > 0 && (
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="h-8 rounded-md border border-input bg-background text-xs px-2 max-w-[180px] truncate"
          >
            {courses.map(c => <option key={c.course_id} value={c.course_id}>{c.title}</option>)}
          </select>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-6">Loading...</p>
        ) : !data || chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {courses.length === 0 ? 'Create a course first to see analytics.' : 'No lesson data yet.'}
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.title || ''}
                  formatter={(v) => [`${v} students reached this lesson`, '']}
                />
                <Bar dataKey="reached" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {data.biggest_drop && (
              <div className="mt-3 p-3 rounded-lg bg-warning/10 border border-warning/30 text-xs">
                <p className="font-bold text-warning-foreground">Biggest drop-off:</p>
                <p className="text-muted-foreground mt-0.5">
                  <span className="font-medium">{data.biggest_drop.students_lost}</span> students left
                  between <span className="font-medium">"{data.biggest_drop.from_lesson}"</span> and
                  <span className="font-medium"> "{data.biggest_drop.to_lesson}"</span>.
                  Consider reviewing that transition.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
