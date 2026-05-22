import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Camera, Book, Clock, Trophy, Flame, Globe, MapPin,
  CheckCircle2, Mail, Users, BarChart2, DollarSign,
  BookOpen, Star, ShieldCheck, TrendingUp, UserCheck, GraduationCap
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/common/Card';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api';

// ── fetch helper ──────────────────────────────────────────────────────────────
const authedFetch = (url) => {
  const token = sessionStorage.getItem('auth_token');
  return fetch(`${API_BASE}${url}`, { headers: { Authorization: `Bearer ${token}` } });
};

// ── Role-aware stat tiles ─────────────────────────────────────────────────────
function useRoleStats(role) {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!role) return;
    setLoading(true);

    const urls = [];
    if (role === 'student') urls.push('/api/auth/verify');
    if (['instructor'].includes(role)) urls.push('/api/instructor/stats');
    if (['admin', 'superadmin'].includes(role)) {
      urls.push('/api/admin/stats');
      urls.push('/api/instructor/stats'); // admins may also be instructors
    }

    Promise.all(urls.map(u => authedFetch(u).then(r => r.ok ? r.json() : {})))
      .then(results => {
        const merged = Object.assign({}, ...results.map(r => {
          // verify returns { user: { stats: {...} } }; flatten it
          if (r.user?.stats) return r.user.stats;
          return r;
        }));
        setStats(merged);
      })
      .catch(() => setStats({}))
      .finally(() => setLoading(false));
  }, [role]);

  return { stats, loading };
}

function StatTile({ icon: Icon, value, label, theme }) {
  return (
    <div className="flex items-center gap-3 md:gap-4 p-4 md:p-5 rounded-2xl bg-card border border-border shadow-sm">
      <div className={cn('p-2.5 md:p-3 rounded-xl shrink-0', theme)}>
        <Icon className="w-4 h-4 md:w-5 md:h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-lg md:text-xl font-bold tracking-tight text-foreground truncate">{value}</p>
        <p className="text-[9px] md:text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight truncate">{label}</p>
      </div>
    </div>
  );
}

function StudentStats({ stats }) {
  const tiles = [
    { icon: Book,    value: stats?.courses_completed || 0,   label: 'Courses Completed', theme: 'text-primary bg-primary/10' },
    { icon: BookOpen,value: stats?.lessons_completed || 0,   label: 'Lessons Done',      theme: 'text-foreground bg-muted' },
    { icon: Trophy,  value: stats?.perfect_quizzes   || 0,   label: 'Perfect Quizzes',   theme: 'text-warning bg-warning/10' },
    { icon: Flame,   value: `${stats?.streak || 0}d`,         label: 'Day Streak',        theme: 'text-orange-500 bg-orange-500/10' },
  ];
  return tiles.map((t, i) => <StatTile key={i} {...t} />);
}

function InstructorStats({ stats }) {
  const avgRating = stats?.average_rating ? Number(stats.average_rating).toFixed(1) : '—';
  const earnings  = stats?.total_earnings  ? `$${Number(stats.total_earnings).toFixed(0)}` : '$0';
  const tiles = [
    { icon: Users,     value: stats?.total_students  || 0,  label: 'Total Students',  theme: 'text-primary bg-primary/10' },
    { icon: Book,      value: stats?.total_courses   || 0,  label: 'Courses Created', theme: 'text-foreground bg-muted' },
    { icon: Star,      value: avgRating,                    label: 'Avg Rating',      theme: 'text-warning bg-warning/10' },
    { icon: DollarSign,value: earnings,                     label: 'Your Earnings',   theme: 'text-emerald-500 bg-emerald-500/10' },
  ];
  return tiles.map((t, i) => <StatTile key={i} {...t} />);
}

function AdminStats({ stats }) {
  const gross    = stats?.gross_revenue     ? `$${Number(stats.gross_revenue).toFixed(0)}`     : '$0';
  const platform = stats?.platform_earnings ? `$${Number(stats.platform_earnings).toFixed(0)}` : '$0';
  const tiles = [
    { icon: Users,      value: stats?.total_users        || 0, label: 'Total Users',        theme: 'text-primary bg-primary/10' },
    { icon: GraduationCap, value: stats?.total_students  || 0, label: 'Students',           theme: 'text-foreground bg-muted' },
    { icon: Book,       value: stats?.total_courses       || 0, label: 'Total Courses',     theme: 'text-accent bg-accent/10' },
    { icon: DollarSign, value: platform,                        label: 'Platform Revenue',  theme: 'text-emerald-500 bg-emerald-500/10' },
  ];
  return tiles.map((t, i) => <StatTile key={i} {...t} />);
}

function SuperAdminStats({ stats }) {
  // superadmin sees admin stats + instructor stats if they have courses
  const hasCourses    = (stats?.total_courses || 0) > 0 && stats?.total_students !== undefined;
  const enrollments   = stats?.total_enrollments ? stats.total_enrollments.toLocaleString() : '0';
  const platform      = stats?.platform_earnings ? `$${Number(stats.platform_earnings).toFixed(0)}` : '$0';
  const pending       = stats?.pending_instructors || 0;
  const tiles = [
    { icon: Users,      value: stats?.total_users     || 0, label: 'Total Users',         theme: 'text-primary bg-primary/10' },
    { icon: TrendingUp, value: enrollments,                  label: 'Enrollments',         theme: 'text-foreground bg-muted' },
    { icon: ShieldCheck,value: pending,                      label: 'Pending Approvals',   theme: pending > 0 ? 'text-warning bg-warning/10' : 'text-muted-foreground bg-muted' },
    { icon: DollarSign, value: platform,                     label: 'Platform Revenue',    theme: 'text-emerald-500 bg-emerald-500/10' },
  ];
  return tiles.map((t, i) => <StatTile key={i} {...t} />);
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const fileInputRef = useRef(null);
  const role = user?.role || 'student';

  const { stats, loading: statsLoading } = useRoleStats(role);

  const [isEditing,    setIsEditing]    = useState(false);
  const [isSaving,     setIsSaving]     = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [formData,     setFormData]     = useState({
    name: '', email: '', bio: '', location: '', website: '',
  });

  useEffect(() => {
    if (user) {
      setFormData({
        name:     user.name     || '',
        email:    user.email    || '',
        bio:      user.bio      || user.profile?.bio      || '',
        location: user.location || user.profile?.location || '',
        website:  user.website  || user.profile?.website  || '',
      });
    }
  }, [user]);

  const handleChange   = useCallback(e => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value })), []);
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPreviewImage(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      await updateUser({ name: formData.name, bio: formData.bio, location: formData.location, website: formData.website, avatar: previewImage || user?.avatar });
      setIsEditing(false);
    } catch (err) { console.error('Profile save failed:', err); }
    finally { setIsSaving(false); }
  };

  // Role label display
  const roleLabel = {
    student:    'Student',
    instructor: 'Instructor',
    admin:      'Admin',
    superadmin: 'Super Admin',
  }[role] || 'Member';

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-10 space-y-6 md:space-y-8 animate-in fade-in duration-500">

      {/* ── Stats bar ── */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-muted/40 animate-pulse" />
          ))
        ) : (
          <>
            {role === 'student'                             && <StudentStats    stats={stats} />}
            {role === 'instructor'                          && <InstructorStats stats={stats} />}
            {role === 'admin'                               && <AdminStats      stats={stats} />}
            {role === 'superadmin'                          && <SuperAdminStats stats={stats} />}
          </>
        )}
      </section>

      <div className="flex flex-col lg:flex-row gap-6 items-stretch">

        {/* ── Identity card ── */}
        <aside className="w-full lg:w-1/3 flex">
          <Card className="w-full bg-card border-border flex flex-col shadow-sm overflow-hidden">
            <div className="h-2 bg-primary" />
            <CardContent className="p-8 flex flex-col items-center justify-center flex-grow text-center">
              <div className="relative mb-6">
                <div
                  onClick={() => isEditing && fileInputRef.current?.click()}
                  className={cn(
                    'w-32 h-32 md:w-40 md:h-40 rounded-full p-1 bg-gradient-to-br from-primary to-accent transition-all duration-300',
                    isEditing && 'cursor-pointer ring-4 ring-primary/20 scale-105'
                  )}>
                  <div className="w-full h-full rounded-full bg-background flex items-center justify-center overflow-hidden">
                    {previewImage || user?.avatar ? (
                      <img src={previewImage || user.avatar} alt="User" loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-5xl font-bold text-primary">{user?.name?.charAt(0) || 'U'}</span>
                    )}
                  </div>
                </div>
                {isEditing && (
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-1 right-1 p-2.5 bg-primary text-primary-foreground rounded-full shadow-lg border-2 border-background hover:scale-110 transition-transform">
                    <Camera className="w-4 h-4" />
                  </button>
                )}
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl font-bold text-foreground break-words">{user?.name || 'User'}</h2>
                <p className="text-xs font-bold text-primary uppercase tracking-widest px-5 py-2 bg-primary/10 rounded-full inline-block border border-primary/20">
                  {roleLabel}
                </p>
                {user?.instructor_title && role !== 'student' && (
                  <p className="text-sm text-muted-foreground">{user.instructor_title}</p>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* ── Profile form ── */}
        <main className="flex-1 flex">
          <Card className="w-full bg-card border-border flex flex-col shadow-sm">
            <CardHeader className="py-5 px-6 md:px-8 border-b border-border flex flex-row items-center justify-between bg-primary/[0.01]">
              <CardTitle className="text-xs md:text-sm font-bold uppercase tracking-widest text-primary">Personal Details</CardTitle>
              {!isEditing && (
                <button type="button" onClick={() => setIsEditing(true)}
                  className="bg-primary text-primary-foreground text-[10px] md:text-[11px] font-bold uppercase tracking-widest px-4 md:px-6 h-9 md:h-10 rounded-lg shadow-md shadow-primary/20">
                  Edit Profile
                </button>
              )}
            </CardHeader>
            <CardContent className="p-6 md:p-8 flex-grow">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-5 md:gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Full Name</label>
                    <Input name="name" value={formData.name} onChange={handleChange} disabled={!isEditing}
                      className={cn('h-11 transition-all duration-300 rounded-xl',
                        !isEditing ? 'bg-muted/40 border-transparent text-muted-foreground' : 'bg-background border-primary/40')} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                      <Input value={formData.email} readOnly disabled
                        className="h-11 pl-10 bg-muted/60 border-transparent text-muted-foreground/70 cursor-not-allowed rounded-xl" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Bio</label>
                  <textarea name="bio" value={formData.bio} onChange={handleChange} disabled={!isEditing} rows={4}
                    placeholder="Briefly describe your background…"
                    className={cn('w-full px-4 py-3 rounded-xl border transition-all outline-none text-sm leading-relaxed',
                      isEditing ? 'bg-background border-primary/40 focus:ring-2 focus:ring-primary/20 focus:border-primary'
                                : 'bg-muted/40 border-transparent text-muted-foreground resize-none')} />
                </div>

                <div className="grid md:grid-cols-2 gap-5 md:gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Location</label>
                    <div className="relative group">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                      <input name="location" value={formData.location} onChange={handleChange} disabled={!isEditing}
                        placeholder="e.g., Tarkwa, Ghana"
                        className={cn('w-full h-11 pl-10 pr-4 rounded-xl border text-sm transition-all outline-none',
                          isEditing ? 'bg-background border-primary/40 focus:ring-2 focus:ring-primary/20' : 'bg-muted/40 border-transparent text-muted-foreground')} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Portfolio / Website</label>
                    <div className="relative group">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
                      <input name="website" value={formData.website} onChange={handleChange} disabled={!isEditing}
                        placeholder="https://github.com/username"
                        className={cn('w-full h-11 pl-10 pr-4 rounded-xl border text-sm transition-all outline-none',
                          isEditing ? 'bg-background border-primary/40 focus:ring-2 focus:ring-primary/20' : 'bg-muted/40 border-transparent text-muted-foreground')} />
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <div className="flex flex-col sm:flex-row items-center gap-3 md:gap-4 pt-6 border-t border-border animate-in slide-in-from-bottom-2">
                    <Button type="submit" isLoading={isSaving}
                      className="w-full sm:flex-1 bg-primary text-primary-foreground h-11 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-primary/20">
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Save Changes
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setIsEditing(false)}
                      className="w-full sm:flex-1 h-11 rounded-xl text-xs font-bold uppercase tracking-widest">
                      Discard
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
