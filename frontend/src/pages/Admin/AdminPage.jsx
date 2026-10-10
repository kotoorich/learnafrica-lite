import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { cn } from '../../lib/utils';
import { API_BASE } from '@/lib/api';
import { formatPrice } from '@/lib/money';
import CouponsManager from '@/components/common/CouponsManager';
import EmergencyPasswordResetModal from '@/components/common/EmergencyPasswordResetModal';
import PasswordResetRequestsCard from '@/components/common/PasswordResetRequestsCard';
import EmailSendersCard from '@/components/common/EmailSendersCard';
import { mergeFooterConfig, SOCIAL_NAMES, AUDIENCES } from '@/lib/footerConfig';
import {
  Users, BookOpen, TrendingUp, Shield, CheckCircle2, XCircle, Loader2, Bell,
  Clock, AlertTriangle, UserCheck, UserX, BarChart2, Send, Eye, Trash2,
  GraduationCap, Edit2, X, Search, RefreshCw, Award, BookMarked,
  DollarSign, Video, Plus, ChevronDown, ChevronUp, Save,
  Receipt, Settings, Copy, ScanLine, Wallet, Banknote, CreditCard,
  Phone, Mail, MapPin, Globe, FileText, History, ShieldAlert
} from 'lucide-react';

const API = async (endpoint, options = {}) => {
  const token = sessionStorage.getItem('auth_token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  if (!res.ok) {
    let errMsg = 'Request failed';
    try { const d = await res.json(); errMsg = d.error || errMsg; } catch {}
    throw new Error(errMsg);
  }
  return res.json();
};

const StatCard = ({ title, value, icon: Icon, color = 'primary', sub }) => (
  <Card className="p-6 hover:shadow-md transition-shadow">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-3xl font-bold mt-1">{value ?? '—'}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
      <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl',
        color === 'primary' ? 'bg-primary/10 text-primary' :
        color === 'warning' ? 'bg-warning/10 text-warning' :
        color === 'success' ? 'bg-success/10 text-success' :
        'bg-destructive/10 text-destructive')}>
        <Icon className="h-6 w-6" />
      </div>
    </div>
  </Card>
);

const STATUS_BADGE = ({ status, isActive }) => {
  if (status) return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
      status === 'published' ? 'bg-success/10 text-success' :
      status === 'suspended' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground')}>
      {status}
    </span>
  );
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
      isActive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
      {isActive ? 'Active' : 'Suspended'}
    </span>
  );
};

const ROLE_BADGE = ({ role }) => (
  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
    role === 'superadmin' || role === 'admin' ? 'bg-destructive/10 text-destructive' :
    role === 'instructor' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
    {role}
  </span>
);

const TABS = ['Overview', 'Students', 'Instructors', 'Courses', 'Applications', 'Broadcast', 'Blog', 'Earnings', 'Payouts', 'Receipts', 'Coupons', 'Credentials', 'Settings', 'Forgot Password Requests', 'Footer', 'Guide', 'Audit Log'];

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('Overview');
  const [stats, setStats] = useState(null);
  const [applications, setApplications] = useState([]);
  const [users, setUsers] = useState([]);
  const [students, setStudents] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [appFilter, setAppFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [broadcast, setBroadcast] = useState({ title: '', message: '', role: '', type: 'system' });
  const [broadcastStatus, setBroadcastStatus] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [emergencyTarget, setEmergencyTarget] = useState(null);
  const [globalStatus, setGlobalStatus] = useState(null);
  const [earnings, setEarnings]         = useState(null);
  const [splitForm, setSplitForm]       = useState({ instructor_share: 50 });
  const [guideSteps, setGuideSteps]     = useState([]);
  const [guideForm, setGuideForm]       = useState({ title: '', description: '', video_url: '' });
  const [editingStep, setEditingStep]   = useState(null);
  const [guideStatus, setGuideStatus]   = useState(null);
  const [uploadingVideo, setUploadingVideo] = useState('');
  const [savingSplit, setSavingSplit]   = useState(false);

  const showStatus = (type, msg) => {
    setGlobalStatus({ type, msg });
    setTimeout(() => setGlobalStatus(null), 4000);
  };

  const load = useCallback(async (section) => {
    setLoading(true);
    try {
      if (section === 'Overview')    { const d = await API('/api/admin/stats'); setStats(d); }
      else if (section === 'Students')    { const d = await API('/api/admin/students'); setStudents(d.students); }
      else if (section === 'Instructors') { const d = await API('/api/admin/instructors'); setInstructors(d.instructors); }
      else if (section === 'Courses')     { const d = await API('/api/admin/courses'); setCourses(d.courses); }
      else if (section === 'Applications'){ const d = await API(`/api/admin/instructor-applications?status=${appFilter}`); setApplications(d.applications); }
      else if (section === 'Earnings') {
        const [earnData, splitData] = await Promise.all([
          API('/api/admin/earnings'),
          API('/api/admin/revenue-split'),
        ]);
        setEarnings(earnData);
        setSplitForm({ instructor_share: splitData.instructor_share });
      }
      else if (section === 'Guide') {
        const d = await API('/api/admin/instructor-guide');
        setGuideSteps(d.steps || []);
      }
    } catch (e) { showStatus('error', e.message); }
    setLoading(false);
  }, [appFilter]);

  useEffect(() => { load(tab); }, [tab]);
  useEffect(() => { if (tab === 'Applications') load('Applications'); }, [appFilter]);
  useEffect(() => { if (tab === 'Guide') load('Guide'); }, [tab === 'Guide']);

  // ── CRUD helpers ──────────────────────────────────────────────────────────
  const reviewApp = async (uid, action, note = '') => {
    setActionLoading(uid + action);
    try {
      await API(`/api/admin/instructor-applications/${uid}/review`, { method: 'PUT', body: JSON.stringify({ action, note }) });
      showStatus('success', `Application ${action === 'approve' ? 'approved' : 'rejected'}!`);
      await load('Applications');
      // Refresh stats
      const d = await API('/api/admin/stats'); setStats(d);
    } catch (e) { showStatus('error', e.message); }
    setActionLoading('');
  };

  const changeRole = async (uid, role) => {
    setActionLoading(uid + 'role');
    try {
      await API(`/api/admin/users/${uid}/role`, { method: 'PUT', body: JSON.stringify({ role }) });
      showStatus('success', 'Role updated');
      await load(tab);
    } catch (e) { showStatus('error', e.message); }
    setActionLoading('');
  };

  const toggleSuspend = async (uid) => {
    setActionLoading(uid + 'suspend');
    try {
      const res = await API(`/api/admin/users/${uid}/suspend`, { method: 'PUT' });
      showStatus('success', res.message === 'suspended' ? 'User suspended' : 'User reactivated');
      await load(tab);
    } catch (e) { showStatus('error', e.message); }
    setActionLoading('');
  };

  const deleteUser = async (uid, role) => {
    if (role === 'superadmin') { showStatus('error', 'Cannot delete the super admin account.'); return; }
    if (!window.confirm('Permanently delete this user? This cannot be undone.')) return;
    setActionLoading(uid + 'delete');
    try {
      await API(`/api/admin/users/${uid}`, { method: 'DELETE' });
      showStatus('success', 'User deleted permanently.');
      await load(tab);
    } catch (e) { showStatus('error', e.message); }
    setActionLoading('');
  };

  const setCourseStatus = async (cid, status) => {
    setActionLoading(cid + status);
    try {
      await API(`/api/admin/courses/${cid}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
      showStatus('success', `Course ${status}`);
      await load('Courses');
    } catch (e) { showStatus('error', e.message); }
    setActionLoading('');
  };

  const deleteCourse = async (cid) => {
    if (!window.confirm('Delete this course permanently? All enrollments and progress will be lost.')) return;
    setActionLoading(cid + 'delete');
    try {
      await API(`/api/instructor/courses/${cid}`, { method: 'DELETE' });
      showStatus('success', 'Course deleted.');
      await load('Courses');
    } catch (e) { showStatus('error', e.message); }
    setActionLoading('');
  };

  const sendBroadcast = async () => {
    if (!broadcast.title || !broadcast.message) { showStatus('error', 'Title and message required.'); return; }
    setActionLoading('broadcast');
    try {
      const res = await API('/api/admin/broadcast', { method: 'POST', body: JSON.stringify(broadcast) });
      setBroadcastStatus({ type: 'success', msg: res.message });
      setBroadcast({ title: '', message: '', role: '', type: 'system' });
    } catch (e) { setBroadcastStatus({ type: 'error', msg: e.message }); }
    setActionLoading('');
  };

  const viewUserDetail = async (uid) => {
    try {
      const d = await API(`/api/admin/users/${uid}`);
      setSelectedUser(d.user);
    } catch (e) { showStatus('error', e.message); }
  };

  const saveUserEdit = async () => {
    if (!editUser) return;
    setActionLoading('editUser');
    try {
      await API(`/api/admin/users/${editUser.id}`, { method: 'PUT', body: JSON.stringify(editUser) });
      showStatus('success', 'User updated.');
      setEditUser(null);
      await load(tab);
    } catch (e) { showStatus('error', e.message); }
    setActionLoading('');
  };

  const saveSplit = async () => {
    setSavingSplit(true);
    try {
      const res = await API('/api/admin/revenue-split', {
        method: 'PUT',
        body: JSON.stringify({ instructor_share: parseFloat(splitForm.instructor_share) }),
      });
      showStatus('success', `Split updated: Instructor ${res.instructor_share}% / Platform ${res.admin_share}%`);
      // Reload earnings data
      const earnData = await API('/api/admin/earnings');
      setEarnings(earnData);
      setSplitForm({ instructor_share: res.instructor_share });
    } catch (e) { showStatus('error', e.message); }
    setSavingSplit(false);
  };

  const filterList = (list, keys) => {
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(item => keys.some(k => (item[k] || '').toLowerCase().includes(q)));
  };

  // ── Reusable user table row ───────────────────────────────────────────────
  const UserRow = ({ u, showEnrolled, showCourses, showStats }) => (
    <tr className="border-b border-border/40 hover:bg-muted/20 transition-colors">
      <td className="p-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0">
            {(u.name || 'U')[0].toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-sm">{u.name}</p>
            <p className="text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      </td>
      {showEnrolled && <td className="p-3 text-center text-sm">{u.enrolled_count ?? '—'}</td>}
      {showCourses  && <td className="p-3 text-center text-sm">{u.course_count ?? '—'}</td>}
      {showStats && (
        <>
          <td className="p-3 text-center text-sm">{u.lessons_completed ?? 0}</td>
          <td className="p-3 text-center text-sm">{u.courses_completed ?? 0}</td>
          <td className="p-3 text-center text-sm">{u.streak ?? 0}</td>
        </>
      )}
      <td className="p-3"><STATUS_BADGE isActive={u.is_active} /></td>
      <td className="p-3 text-xs text-muted-foreground">{u.created_at?.slice(0,10)}</td>
      <td className="p-3">
        <div className="flex items-center gap-1">
          <button onClick={() => viewUserDetail(u.id)} title="View"
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors">
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setEditUser({...u})} title="Edit"
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => toggleSuspend(u.id)} title={u.is_active ? 'Suspend' : 'Activate'}
            disabled={actionLoading === u.id + 'suspend'}
            className={cn('p-1.5 rounded transition-colors', u.is_active ? 'hover:bg-destructive/10 text-muted-foreground hover:text-destructive' : 'hover:bg-success/10 text-muted-foreground hover:text-success')}>
            {actionLoading === u.id + 'suspend' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : u.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
          </button>
          {u.role !== 'superadmin' && u.id !== user?.id && (
            <button onClick={() => deleteUser(u.id, u.role)} title="Delete permanently"
              disabled={actionLoading === u.id + 'delete'}
              className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
              {actionLoading === u.id + 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />Admin Panel
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Welcome, {user?.name}. Full platform management.</p>
        </div>
        <div className="flex items-center gap-2">
          {stats?.pending_instructors > 0 && (
            <button onClick={() => setTab('Applications')}
              className="flex items-center gap-2 px-4 py-2 bg-warning/10 text-warning rounded-xl border border-warning/20 text-sm font-medium hover:bg-warning/20 transition-colors">
              <AlertTriangle className="h-4 w-4" />
              {stats.pending_instructors} pending
            </button>
          )}
          <button onClick={() => load(tab)} className="p-2 rounded-lg border border-border hover:bg-muted transition-colors" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Global status */}
      {globalStatus && (
        <div className={cn('flex items-center gap-3 p-4 rounded-xl border text-sm font-medium',
          globalStatus.type === 'success' ? 'bg-success/5 text-success border-success/20' : 'bg-destructive/5 text-destructive border-destructive/20')}>
          {globalStatus.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {globalStatus.msg}
          <button onClick={() => setGlobalStatus(null)} className="ml-auto opacity-60 hover:opacity-100 text-lg leading-none">×</button>
        </div>
      )}

      {/* Tabs */}
      <div className="relative">
      <div aria-hidden="true" className="pointer-events-none absolute right-0 top-0 bottom-4 w-10 bg-gradient-to-l from-background to-transparent md:hidden z-10" />
      <div className="flex gap-2 border-b border-border pb-4 pr-8 md:pr-2 overflow-x-auto scrollbar-thin -mx-2 px-2 [&::-webkit-scrollbar]:h-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5',
              tab === t ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            {t === 'Overview' && <BarChart2 className="h-3.5 w-3.5" />}
            {t === 'Students' && <Users className="h-3.5 w-3.5" />}
            {t === 'Instructors' && <GraduationCap className="h-3.5 w-3.5" />}
            {t === 'Courses' && <BookOpen className="h-3.5 w-3.5" />}
            {t === 'Applications' && <UserCheck className="h-3.5 w-3.5" />}
            {t === 'Broadcast' && <Bell className="h-3.5 w-3.5" />}
            {t === 'Credentials' && <Award className="h-3.5 w-3.5" />}
            {t}
            {t === 'Applications' && stats?.pending_instructors > 0 && (
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold">
                {stats.pending_instructors}
              </span>
            )}
          </button>
        ))}
      </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary/50" /></div>
      ) : (
        <>
          {/* ── OVERVIEW ── */}
          {tab === 'Overview' && stats && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="Total Users"    value={stats.total_users}    icon={Users}      color="primary" />
                <StatCard title="Students"       value={stats.total_students} icon={Users}      color="success" />
                <StatCard title="Instructors"    value={stats.total_instructors} icon={GraduationCap} color="warning" />
                <StatCard title="Total Courses"  value={stats.total_courses}  icon={BookOpen}   color="primary" />
                <StatCard title="Enrollments"    value={stats.total_enrollments} icon={BarChart2} color="success" sub="all time" />
                <StatCard title="Pending Apps"   value={stats.pending_instructors} icon={Clock}  color={stats.pending_instructors > 0 ? 'warning' : 'primary'} />
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="border-b border-border pb-3">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Recent Users</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <tbody>
                        {(stats.recent_users || []).map(u => (
                          <tr key={u.id} className="border-b border-border/40 hover:bg-muted/20">
                            <td className="p-3 font-medium">{u.name}</td>
                            <td className="p-3"><ROLE_BADGE role={u.role} /></td>
                            <td className="p-3 text-xs text-muted-foreground">{u.created_at?.slice(0,10)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="border-b border-border pb-3">
                    <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Recent Courses</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <tbody>
                        {(stats.recent_courses || []).map(c => (
                          <tr key={c.id} className="border-b border-border/40 hover:bg-muted/20">
                            <td className="p-3 font-medium max-w-[150px] truncate">{c.title}</td>
                            <td className="p-3 text-xs text-muted-foreground">{c.instructor_name}</td>
                            <td className="p-3 text-right text-xs">{c.enrollments} students</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ── STUDENTS ── */}
          {tab === 'Students' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search students…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
                </div>
                <p className="text-sm text-muted-foreground">{filterList(students, ['name','email']).length} students</p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border -mx-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border">
                    <tr>
                      <th className="p-3 text-left font-medium text-muted-foreground">Student</th>
                      <th className="p-3 text-center font-medium text-muted-foreground">Enrolled</th>
                      <th className="p-3 text-center font-medium text-muted-foreground">Lessons</th>
                      <th className="p-3 text-center font-medium text-muted-foreground">Completed</th>
                      <th className="p-3 text-center font-medium text-muted-foreground">Streak</th>
                      <th className="p-3 font-medium text-muted-foreground">Status</th>
                      <th className="p-3 font-medium text-muted-foreground">Joined</th>
                      <th className="p-3 font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterList(students, ['name','email']).map(u => (
                      <UserRow key={u.id} u={u} showEnrolled showStats />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── INSTRUCTORS ── */}
          {tab === 'Instructors' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search instructors…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
                </div>
                <p className="text-sm text-muted-foreground">{filterList(instructors, ['name','email']).length} instructors</p>
              </div>
              <div className="space-y-4">
                {filterList(instructors, ['name','email']).map(inst => (
                  <Card key={inst.id} className="overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center font-bold text-primary text-lg shrink-0">
                            {(inst.name || 'I')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold">{inst.name}</p>
                            <p className="text-sm text-muted-foreground">{inst.email}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border',
                                inst.instructor_status === 'approved' ? 'bg-success/10 text-success border-success/20' :
                                inst.instructor_status === 'pending' ? 'bg-warning/10 text-warning border-warning/20' :
                                'bg-destructive/10 text-destructive border-destructive/20')}>
                                {inst.instructor_status}
                              </span>
                              {inst.location && <span className="text-xs text-muted-foreground">📍 {inst.location}</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground shrink-0">
                          <span className="flex items-center gap-1"><BookMarked className="h-4 w-4" />{inst.course_count} courses</span>
                          <span className="flex items-center gap-1"><Users className="h-4 w-4" />{inst.total_students} students</span>
                          <STATUS_BADGE isActive={inst.is_active} />
                        </div>
                      </div>

                      {inst.courses?.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-border/50">
                          <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Courses</p>
                          <div className="flex flex-wrap gap-2">
                            {inst.courses.map(c => (
                              <button key={c.id} type="button"
                                onClick={() => navigate(`/instructor/preview/${c.id}`)}
                                title="Preview this course as a student"
                                className="text-xs bg-muted px-2 py-1 rounded-lg border border-border flex items-center gap-1.5 hover:bg-primary/10 hover:border-primary/30 transition-colors">
                                {c.title}
                                <span className="text-muted-foreground">· {c.enrollments} students</span>
                                <Eye className="h-3 w-3 text-muted-foreground" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 mt-4">
                        <button onClick={() => viewUserDetail(inst.id)} title="View details"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:bg-muted hover:text-primary transition-colors">
                          <Eye className="h-3.5 w-3.5" />View
                        </button>
                        <button onClick={() => toggleSuspend(inst.id)}
                          disabled={actionLoading === inst.id + 'suspend'}
                          className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                            inst.is_active ? 'border-destructive/30 text-destructive hover:bg-destructive/10' : 'border-success/30 text-success hover:bg-success/10')}>
                          {inst.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                          {inst.is_active ? 'Suspend' : 'Activate'}
                        </button>
                        {inst.id !== user?.id && (
                          <button onClick={() => deleteUser(inst.id, inst.role)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />Delete
                          </button>
                        )}
                        {user?.role === 'superadmin' && (
                          <button onClick={() => setEmergencyTarget(inst)} title="Emergency password reset (superadmin only)"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-destructive text-destructive hover:bg-destructive hover:text-white transition-colors">
                            <ShieldAlert className="h-3.5 w-3.5" />Emergency Password Reset
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* ── COURSES ── */}
          {tab === 'Courses' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search courses…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
                </div>
                <p className="text-sm text-muted-foreground">{filterList(courses, ['title','category','instructor_name']).length} courses</p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border -mx-0">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border">
                    <tr>
                      <th className="p-3 text-left font-medium text-muted-foreground">Course</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Instructor</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Category</th>
                      <th className="p-3 text-center font-medium text-muted-foreground">Price</th>
                      <th className="p-3 text-center font-medium text-muted-foreground">Students</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">Status</th>
                      <th className="p-3 text-right font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterList(courses, ['title','category','instructor_name']).map(c => (
                      <tr key={c.id} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="p-3 font-medium max-w-[200px]"><p className="truncate">{c.title}</p></td>
                        <td className="p-3 text-muted-foreground">{c.instructor_name}</td>
                        <td className="p-3 text-muted-foreground">{c.category}</td>
                        <td className="p-3 text-center">{c.is_free ? <span className="text-success font-medium">Free</span> : `${formatPrice(c.price)}`}</td>
                        <td className="p-3 text-center">{c.student_count || c.enrollments}</td>
                        <td className="p-3"><STATUS_BADGE status={c.status || 'published'} /></td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => navigate(`/instructor/preview/${c.id}`)}
                              title="Preview this course as a student"
                              className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border text-muted-foreground hover:bg-muted hover:text-primary transition-colors">
                              <Eye className="h-3.5 w-3.5" />Preview
                            </button>
                            {c.status !== 'suspended'
                              ? <button onClick={() => setCourseStatus(c.id, 'suspended')}
                                  disabled={actionLoading === c.id + 'suspended'}
                                  className="px-2 py-1 text-xs rounded border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors">
                                  Suspend
                                </button>
                              : <button onClick={() => setCourseStatus(c.id, 'published')}
                                  disabled={actionLoading === c.id + 'published'}
                                  className="px-2 py-1 text-xs rounded border border-success/30 text-success hover:bg-success/10 transition-colors">
                                  Restore
                                </button>}
                            <button onClick={() => deleteCourse(c.id)}
                              disabled={actionLoading === c.id + 'delete'}
                              className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                              {actionLoading === c.id + 'delete' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── APPLICATIONS ── */}
          {tab === 'Applications' && (
            <div className="space-y-5">
              <div className="flex gap-2">
                {['pending','approved','rejected'].map(s => (
                  <button key={s} onClick={() => setAppFilter(s)}
                    className={cn('px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all',
                      appFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70')}>
                    {s}
                  </button>
                ))}
              </div>
              {applications.length === 0
                ? <div className="text-center py-16 text-muted-foreground">No {appFilter} applications.</div>
                : applications.map(app => (
                  <Card key={app.id} className="p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                            {(app.name || 'U')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold">{app.name}</p>
                            <p className="text-sm text-muted-foreground">{app.email}</p>
                          </div>
                        </div>
                        {app.bio && <p className="text-sm text-muted-foreground">{app.bio}</p>}
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {app.location && <span>📍 {app.location}</span>}
                          {app.website && <a href={app.website} target="_blank" rel="noreferrer" className="text-primary hover:underline">🔗 Website</a>}
                          <span>Applied: {app.applied_at?.slice(0,10)}</span>
                        </div>
                        {app.admin_note && <p className="text-xs italic text-muted-foreground border-l-2 border-border pl-2">{app.admin_note}</p>}
                      </div>
                      {appFilter === 'pending' ? (
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" disabled={actionLoading === app.user_id + 'approve'} onClick={() => reviewApp(app.user_id, 'approve')}
                            className="bg-success text-white hover:bg-success/90">
                            {actionLoading === app.user_id + 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" />Approve</>}
                          </Button>
                          <Button size="sm" variant="outline" disabled={actionLoading === app.user_id + 'reject'} onClick={() => reviewApp(app.user_id, 'reject', 'Application did not meet requirements.')}
                            className="text-destructive border-destructive/30 hover:bg-destructive hover:text-white">
                            {actionLoading === app.user_id + 'reject' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="h-4 w-4 mr-1" />Reject</>}
                          </Button>
                        </div>
                      ) : (
                        <span className={cn('px-3 py-1 rounded-full text-xs font-bold',
                          appFilter === 'approved' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
                          {appFilter}
                        </span>
                      )}
                    </div>
                  </Card>
                ))}
            </div>
          )}

          {/* ── BROADCAST ── */}
          {tab === 'Earnings' && (
            <div className="space-y-6">
              {/* Revenue Split Control */}
              <Card className="p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-primary" /> Revenue Split
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Set how revenue is split between instructors and the platform. Changes affect all future earnings calculations.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">
                      Instructor Share: <span className="text-primary font-bold">{splitForm.instructor_share}%</span>
                      &nbsp;&nbsp;|&nbsp;&nbsp;
                      Platform Share: <span className="text-success font-bold">{100 - parseFloat(splitForm.instructor_share || 0)}%</span>
                    </label>
                    <input type="range" min="0" max="100" step="1"
                      value={splitForm.instructor_share}
                      onChange={e => setSplitForm({ instructor_share: parseFloat(e.target.value) })}
                      className="w-full accent-primary cursor-pointer" />
                    <div className="flex rounded-full overflow-hidden h-3">
                      <div className="bg-primary transition-all" style={{width:`${splitForm.instructor_share}%`}} />
                      <div className="bg-success transition-all" style={{width:`${100 - parseFloat(splitForm.instructor_share||0)}%`}} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0% instructor</span>
                      <span>100% instructor</span>
                    </div>
                  </div>
                  <Button onClick={async () => {
                    setActionLoading('split');
                    try {
                      const res = await API('/api/admin/revenue-split', {
                        method: 'PUT',
                        body: JSON.stringify({ instructor_share: parseFloat(splitForm.instructor_share) }),
                      });
                      showStatus('success', `Split updated: Instructor ${res.instructor_share}% / Platform ${res.admin_share}%`);
                      const earnData = await API('/api/admin/earnings');
                      setEarnings(earnData);
                    } catch(e) { showStatus('error', e.message); }
                    setActionLoading('');
                  }} disabled={actionLoading === 'split'} className="w-full">
                    {actionLoading === 'split' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Revenue Split
                  </Button>
                </div>
              </Card>

              {/* Earnings breakdown per instructor */}
              {earnings && (
                <Card className="overflow-hidden">
                  <div className="p-5 border-b border-border bg-muted/20">
                    <h2 className="font-bold text-base">Platform Earnings Overview</h2>
                    <div className="grid grid-cols-3 gap-4 mt-4">
                      <div className="text-center p-3 bg-background rounded-xl border border-border">
                        <p className="text-2xl font-bold">{formatPrice(earnings.total_gross || 0)}</p>
                        <p className="text-xs text-muted-foreground mt-1">Gross Revenue</p>
                      </div>
                      <div className="text-center p-3 bg-primary/5 rounded-xl border border-primary/20">
                        <p className="text-2xl font-bold text-primary">{formatPrice(earnings.instructors_total || 0)}</p>
                        <p className="text-xs text-muted-foreground mt-1">To Instructors ({earnings.instructor_share_pct}%)</p>
                      </div>
                      <div className="text-center p-3 bg-success/5 rounded-xl border border-success/20">
                        <p className="text-2xl font-bold text-success">{formatPrice(earnings.platform_total || 0)}</p>
                        <p className="text-xs text-muted-foreground mt-1">Platform ({earnings.admin_share_pct}%)</p>
                      </div>
                    </div>
                  </div>
                  {(earnings.instructors||[]).length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/20 border-b border-border">
                          <tr>
                            <th className="text-left p-3 font-medium text-muted-foreground">Instructor</th>
                            <th className="text-center p-3 font-medium text-muted-foreground">Courses</th>
                            <th className="text-right p-3 font-medium text-muted-foreground">Gross</th>
                            <th className="text-right p-3 font-medium text-muted-foreground">Their Share</th>
                            <th className="text-right p-3 font-medium text-muted-foreground">Platform Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {earnings.instructors.map((inst, i) => (
                            <tr key={inst.id||i} className="border-b border-border/40 hover:bg-muted/20">
                              <td className="p-3">
                                <p className="font-medium">{inst.name}</p>
                                <p className="text-xs text-muted-foreground">{inst.email}</p>
                              </td>
                              <td className="p-3 text-center">{inst.course_count}</td>
                              <td className="p-3 text-right font-medium">{formatPrice(inst.gross_revenue)}</td>
                              <td className="p-3 text-right font-bold text-primary">{formatPrice(inst.instructor_earnings)}</td>
                              <td className="p-3 text-right text-success">{formatPrice(inst.platform_earnings)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-muted-foreground text-sm">No paid course sales yet.</div>
                  )}
                </Card>
              )}
              {!earnings && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary/50" /></div>}
            </div>
          )}

          {tab === 'Blog' && <AdminBlogTab />}

          {tab === 'Payouts' && <AdminPayoutsTab />}
          {tab === 'Receipts' && <AdminReceiptsTab />}

          {tab === 'Audit Log' && <AdminAuditLogTab />}

          {tab === 'Coupons' && <CouponsManager role="admin" />}

          {tab === 'Credentials' && <AdminCredentialsTab isSuperadmin={user && user.role === 'superadmin'} />}

          {tab === 'Forgot Password Requests' && (
            <div className="max-w-3xl"><PasswordResetRequestsCard /></div>
          )}
          {tab === 'Settings' && <AdminSettingsTab />}

          {tab === 'Footer' && <AdminFooterTab />}

          {tab === 'Guide' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-primary" /> Instructor Guide Management
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Edit the steps and add tutorial video URLs that instructors see on their dashboard.
                </p>
                {/* Reseed default guide */}
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {guideSteps.length === 0 ? (
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          setActionLoading('reseed');
                          const r = await API('/api/admin/instructor-guide/reseed', { method: 'POST', body: JSON.stringify({}) });
                          setGuideStatus({type:'success', msg:`Seeded ${r.step_count} default steps. Reloading...`});
                          const d = await API('/api/admin/instructor-guide');
                          setGuideSteps(d.steps || []);
                        } catch(e) { setGuideStatus({type:'error', msg:e.message}); }
                        setActionLoading('');
                      }}
                      disabled={actionLoading === 'reseed'}
                    >
                      {actionLoading === 'reseed' ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Seeding...</> : <>+ Load Default 10-Step Guide</>}
                    </Button>
                  ) : (
                    <button
                      onClick={async () => {
                        if (!window.confirm(`This will DELETE all ${guideSteps.length} existing steps and replace them with the default 10-step guide. Continue?`)) return;
                        try {
                          setActionLoading('reseed');
                          const r = await API('/api/admin/instructor-guide/reseed', { method: 'POST', body: JSON.stringify({force: true}) });
                          setGuideStatus({type:'success', msg:`Reseeded with ${r.step_count} default steps`});
                          const d = await API('/api/admin/instructor-guide');
                          setGuideSteps(d.steps || []);
                        } catch(e) { setGuideStatus({type:'error', msg:e.message}); }
                        setActionLoading('');
                      }}
                      disabled={actionLoading === 'reseed'}
                      className="text-xs text-destructive hover:underline"
                    >
                      {actionLoading === 'reseed' ? 'Resetting...' : 'Reset to default 10-step guide (deletes all current steps)'}
                    </button>
                  )}
                </div>
              </div>

              {guideStatus && (
                <div className={cn('flex items-center gap-3 p-3 rounded-xl border text-sm font-medium',
                  guideStatus.type === 'success' ? 'bg-success/5 text-success border-success/20' : 'bg-destructive/5 text-destructive border-destructive/20')}>
                  {guideStatus.msg}
                  <button onClick={() => setGuideStatus(null)} className="ml-auto opacity-60 hover:opacity-100">×</button>
                </div>
              )}

              {/* Existing steps */}
              <div className="space-y-4">
                {guideSteps.map((step, index) => (
                  <Card key={step.id} className="overflow-hidden">
                    {editingStep?.id === step.id ? (
                      <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-sm">Editing Step {index + 1}</h3>
                          <button onClick={() => setEditingStep(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Title</label>
                            <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                              value={editingStep.title}
                              onChange={e => setEditingStep(p => ({...p, title: e.target.value}))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Description</label>
                            <textarea className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none resize-none min-h-[80px] focus:ring-2 focus:ring-primary"
                              value={editingStep.description}
                              onChange={e => setEditingStep(p => ({...p, description: e.target.value}))} />
                          </div>
                          <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Video URL (YouTube or direct link)</label>
                            <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                              value={editingStep.video_url || ''}
                              placeholder="https://youtube.com/watch?v=... or paste video URL"
                              onChange={e => setEditingStep(p => ({...p, video_url: e.target.value}))} />
                          </div>
                          {editingStep.video_url && (
                            <div className="flex items-center justify-between p-2 rounded-lg bg-success/5 border border-success/20">
                              <span className="text-xs text-success font-medium flex items-center gap-1.5">
                                <Video className="h-3.5 w-3.5" /> Video URL set
                              </span>
                              <button
                                type="button"
                                onClick={() => setEditingStep(p => ({...p, video_url: ''}))}
                                className="flex items-center gap-1 text-xs text-destructive hover:underline shrink-0"
                              >
                                <X className="h-3 w-3" /> Clear
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button variant="outline" onClick={() => setEditingStep(null)} className="flex-1">Cancel</Button>
                          <Button onClick={async () => {
                            setActionLoading('saveStep');
                            try {
                              await API(`/api/admin/instructor-guide/${step.id}`, {
                                method: 'PUT',
                                body: JSON.stringify(editingStep)
                              });
                              setGuideStatus({type:'success', msg:'Step saved!'});
                              setEditingStep(null);
                              const d = await API('/api/admin/instructor-guide');
                              setGuideSteps(d.steps || []);
                            } catch(e) { setGuideStatus({type:'error', msg:e.message}); }
                            setActionLoading('');
                          }} disabled={actionLoading==='saveStep'} className="flex-1">
                            {actionLoading==='saveStep' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save Step
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-5">
                        <div className="flex items-start gap-4">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                            {index + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm">{step.title}</p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{step.description}</p>
                            {step.video_url && (
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-primary flex items-center gap-1">
                                  <Video className="h-3 w-3" /> Video attached
                                </span>
                                <button
                                  type="button"
                                  title="Remove video"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!window.confirm('Remove the video from this step?')) return;
                                    try {
                                      await API(`/api/admin/instructor-guide/${step.id}`, {
                                        method: 'PUT',
                                        body: JSON.stringify({ video_url: null }),
                                      });
                                      setGuideSteps(prev => prev.map(s => s.id === step.id ? {...s, video_url: null} : s));
                                      setGuideStatus({type:'success', msg:'Video removed.'});
                                    } catch(e) { setGuideStatus({type:'error', msg:e.message}); }
                                  }}
                                  className="text-xs text-destructive hover:underline flex items-center gap-1"
                                >
                                  <X className="h-3 w-3" /> Remove video
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => setEditingStep({...step})}
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors">
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button onClick={async () => {
                              if (!window.confirm('Delete this guide step?')) return;
                              try {
                                await API(`/api/admin/instructor-guide/${step.id}`, { method: 'DELETE' });
                                setGuideSteps(prev => prev.filter(s => s.id !== step.id));
                                setGuideStatus({type:'success', msg:'Step deleted.'});
                              } catch(e) { setGuideStatus({type:'error', msg:e.message}); }
                            }} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>

              {/* Add new step */}
              <Card className="p-5 border-dashed space-y-4">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Plus className="h-4 w-4 text-primary" /> Add New Step
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Title</label>
                    <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                      value={guideForm.title} placeholder="e.g. Set Up Your Profile"
                      onChange={e => setGuideForm(p => ({...p, title: e.target.value}))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Description</label>
                    <textarea className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none resize-none min-h-[80px] focus:ring-2 focus:ring-primary"
                      value={guideForm.description} placeholder="What should the instructor do in this step?"
                      onChange={e => setGuideForm(p => ({...p, description: e.target.value}))} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Video URL (optional)</label>
                    <input className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                      value={guideForm.video_url} placeholder="https://youtube.com/watch?v=..."
                      onChange={e => setGuideForm(p => ({...p, video_url: e.target.value}))} />
                  </div>
                </div>
                <Button onClick={async () => {
                  if (!guideForm.title || !guideForm.description) {
                    setGuideStatus({type:'error', msg:'Title and description are required.'});
                    return;
                  }
                  setActionLoading('addStep');
                  try {
                    await API('/api/admin/instructor-guide', {
                      method: 'POST',
                      body: JSON.stringify(guideForm)
                    });
                    setGuideForm({ title: '', description: '', video_url: '' });
                    setGuideStatus({type:'success', msg:'Step added!'});
                    const d = await API('/api/admin/instructor-guide');
                    setGuideSteps(d.steps || []);
                  } catch(e) { setGuideStatus({type:'error', msg:e.message}); }
                  setActionLoading('');
                }} disabled={actionLoading==='addStep'} className="w-full">
                  {actionLoading==='addStep' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Add Step
                </Button>
              </Card>
            </div>
          )}

          {tab === 'Broadcast' && (
            <div className="max-w-2xl space-y-6">
              <Card className="p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2"><Bell className="h-5 w-5 text-primary" />Send Notification</h2>
                  <p className="text-sm text-muted-foreground mt-1">Broadcast a message to all users or a specific role.</p>
                </div>
                {broadcastStatus && (
                  <div className={cn('p-3 rounded-xl text-sm font-medium flex items-center gap-2 border',
                    broadcastStatus.type === 'success' ? 'bg-success/10 text-success border-success/20' : 'bg-destructive/10 text-destructive border-destructive/20')}>
                    {broadcastStatus.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {broadcastStatus.msg}
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium block mb-1">Title</label>
                    <Input value={broadcast.title} placeholder="Notification title"
                      onChange={e => setBroadcast(p => ({...p, title: e.target.value}))} />
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Message</label>
                    <textarea value={broadcast.message} placeholder="Your message…"
                      onChange={e => setBroadcast(p => ({...p, message: e.target.value}))}
                      className="w-full min-h-[100px] rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-primary outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-1">Audience</label>
                      <select value={broadcast.role} onChange={e => setBroadcast(p => ({...p, role: e.target.value}))}
                        className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm">
                        <option value="">All Users</option>
                        <option value="student">Students only</option>
                        <option value="instructor">Instructors only</option>
                        <option value="admin">Admins only</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium block mb-1">Type</label>
                      <select value={broadcast.type} onChange={e => setBroadcast(p => ({...p, type: e.target.value}))}
                        className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm">
                        <option value="system">System</option>
                        <option value="info">Info</option>
                        <option value="achievement">Achievement</option>
                        <option value="reminder">Reminder</option>
                      </select>
                    </div>
                  </div>
                  <Button onClick={sendBroadcast} disabled={actionLoading === 'broadcast'} className="w-full">
                    {actionLoading === 'broadcast' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Send Notification
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {/* ── User Detail Modal ── */}
      {selectedUser && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 pt-24 bg-background/80 backdrop-blur-sm">
          <Card className="w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">
                {selectedUser.role === 'instructor' ? 'Instructor Details' : 'Student Details'}
              </h2>
              <button onClick={() => setSelectedUser(null)} className="p-1 rounded hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              {/* Identity + contact */}
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold overflow-hidden shrink-0">
                  {selectedUser.avatar
                    ? <img src={selectedUser.avatar} alt="" className="h-full w-full object-cover" />
                    : (selectedUser.name || 'U')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-lg truncate">{selectedUser.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <ROLE_BADGE role={selectedUser.role} />
                    <STATUS_BADGE isActive={selectedUser.is_active} />
                    {selectedUser.role === 'instructor' && selectedUser.instructor_status && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {selectedUser.instructor_status}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Contact block — what the admin needs to reach the user */}
              <div className="rounded-xl border border-border divide-y divide-border/60">
                <div className="flex items-center gap-3 p-3">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground w-20 shrink-0">Email</span>
                  <a href={`mailto:${selectedUser.email}`} className="text-sm font-medium text-primary hover:underline truncate">
                    {selectedUser.email || '—'}
                  </a>
                </div>
                <div className="flex items-center gap-3 p-3">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground w-20 shrink-0">Call line</span>
                  {selectedUser.phone ? (
                    <a href={`tel:${selectedUser.phone}`} className="text-sm font-medium text-primary hover:underline">
                      {selectedUser.phone}
                    </a>
                  ) : <span className="text-sm text-muted-foreground">Not provided</span>}
                </div>
                {(selectedUser.location || selectedUser.website) && (
                  <div className="flex items-center gap-3 p-3">
                    {selectedUser.location
                      ? <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <Globe className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <span className="text-xs text-muted-foreground w-20 shrink-0">
                      {selectedUser.location ? 'Location' : 'Website'}
                    </span>
                    <span className="text-sm truncate">{selectedUser.location || selectedUser.website}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 p-3">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground w-20 shrink-0">Joined</span>
                  <span className="text-sm">{(selectedUser.created_at || '').slice(0, 10) || '—'}</span>
                </div>
              </div>

              {selectedUser.bio && (
                <div>
                  <p className="text-sm font-semibold mb-1">Bio</p>
                  <p className="text-sm text-muted-foreground">{selectedUser.bio}</p>
                </div>
              )}

              {/* Stats — differ for student vs instructor */}
              {selectedUser.role === 'instructor' ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-muted/30 rounded-xl">
                    <p className="text-xl font-bold">{selectedUser.courses_taught?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Courses</p>
                  </div>
                  <div className="text-center p-3 bg-muted/30 rounded-xl">
                    <p className="text-xl font-bold">{selectedUser.total_students ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Students</p>
                  </div>
                  <div className="text-center p-3 bg-muted/30 rounded-xl">
                    <p className="text-xl font-bold text-primary">{formatPrice(selectedUser.total_earned || 0)}</p>
                    <p className="text-xs text-muted-foreground">Earned</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-muted/30 rounded-xl">
                    <p className="text-xl font-bold">{selectedUser.stats?.lessons_completed || 0}</p>
                    <p className="text-xs text-muted-foreground">Lessons</p>
                  </div>
                  <div className="text-center p-3 bg-muted/30 rounded-xl">
                    <p className="text-xl font-bold">{selectedUser.stats?.courses_completed || 0}</p>
                    <p className="text-xs text-muted-foreground">Courses</p>
                  </div>
                  <div className="text-center p-3 bg-muted/30 rounded-xl">
                    <p className="text-xl font-bold">{selectedUser.badges?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Badges</p>
                  </div>
                </div>
              )}

              {/* Instructor: courses taught */}
              {selectedUser.role === 'instructor' && selectedUser.courses_taught?.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">Courses Taught</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedUser.courses_taught.map(c => (
                      <div key={c.id} className="flex items-center justify-between p-2 bg-muted/20 rounded-lg text-sm">
                        <span className="font-medium truncate">{c.title}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">
                          {c.enrollments ?? 0} students{c.price ? ` · ${formatPrice(c.price)}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Student: enrolled courses */}
              {selectedUser.enrollments?.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">Enrolled Courses</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedUser.enrollments.map(e => (
                      <div key={e.course_id} className="flex items-center justify-between p-2 bg-muted/20 rounded-lg text-sm">
                        <span className="font-medium truncate">{e.course_title}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">{e.progress}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Student: quiz activity */}
              {selectedUser.role !== 'instructor' && selectedUser.quiz_attempts?.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">Recent Quiz Attempts</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedUser.quiz_attempts.slice(0, 10).map(q => (
                      <div key={q.id} className="flex items-center justify-between p-2 bg-muted/20 rounded-lg text-sm">
                        <span className="font-medium truncate">{q.quiz_title || 'Quiz'}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">{q.score}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Student: payments */}
              {selectedUser.role !== 'instructor' && selectedUser.transactions?.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold">Payments</p>
                    <p className="text-xs text-muted-foreground">
                      Total spent: <span className="font-bold text-primary">{formatPrice(selectedUser.total_spent || 0)}</span>
                    </p>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedUser.transactions.slice(0, 10).map(t => (
                      <div key={t.receipt_id || t.created_at} className="flex items-center justify-between p-2 bg-muted/20 rounded-lg text-sm">
                        <span className="truncate">{t.course_title || t.type}</span>
                        <span className="shrink-0 ml-2 flex items-center gap-2">
                          <span className="text-xs uppercase text-muted-foreground">{t.status}</span>
                          <span className="font-medium">{formatPrice(t.amount || 0)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── Edit User Modal ── */}
      {editUser && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto p-4 pt-24 bg-background/80 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Edit User</h2>
              <button onClick={() => setEditUser(null)} className="p-1 rounded hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              {['name','email','bio','location','website'].map(field => (
                <div key={field}>
                  <label className="text-xs font-semibold uppercase text-muted-foreground block mb-1">{field}</label>
                  <Input value={editUser[field] || ''} onChange={e => setEditUser(p => ({...p, [field]: e.target.value}))} />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground block mb-1">Role</label>
                <select value={editUser.role} onChange={e => setEditUser(p => ({...p, role: e.target.value}))}
                  disabled={editUser.role === 'superadmin' || editUser.id === user?.id}
                  className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-50">
                  <option value="student">student</option>
                  <option value="instructor">instructor</option>
                  <option value="admin">admin</option>
                  <option value="superadmin">superadmin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button className="flex-1" disabled={actionLoading === 'editUser'} onClick={saveUserEdit}>
                {actionLoading === 'editUser' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {emergencyTarget && (
        <EmergencyPasswordResetModal
          instructor={emergencyTarget}
          onClose={() => setEmergencyTarget(null)}
          onDone={(msg) => {
            setEmergencyTarget(null);
            showStatus('success', msg);
            load('Instructors');
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ── Admin: Receipts tab — verify-by-ID + full transaction table
// ─────────────────────────────────────────────────────────────────────────
function AdminReceiptsTab() {
  const [lookup, setLookup]   = useState('');
  const [found,  setFound]    = useState(null);
  const [busy,   setBusy]     = useState(false);
  const [msg,    setMsg]      = useState(null);

  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    API('/api/transactions?').then(d => setRows(d.transactions || [])).catch(()=>{}).finally(()=>setLoading(false));
  }, []);

  const verify = async (markStatus = null) => {
    if (!lookup.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const r = await API('/api/admin/transactions/verify', {
        method: 'POST',
        body: JSON.stringify({ receipt_id: lookup.trim(), ...(markStatus ? { mark_status: markStatus } : {}) })
      });
      if (!r.found) {
        setFound(null);
        setMsg({ type: 'error', text: r.message || 'No transaction found with that ID.' });
      } else {
        setFound(r.transaction);
        setMsg({ type: 'success', text: markStatus ? `Status updated to "${markStatus}".` : 'Transaction found.' });
        // Refresh table if status changed
        if (markStatus) {
          API('/api/transactions?').then(d => setRows(d.transactions || [])).catch(()=>{});
        }
      }
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" /> Receipts & Transaction Verification
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Look up any transaction by its receipt ID or reference, and update its status.
        </p>
      </div>

      {/* Verify-by-ID card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-primary" /> Verify by Receipt ID
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Paste receipt ID (e.g. LA-RCPT-XXXX-XXXX) or provider reference"
              value={lookup}
              onChange={e => setLookup(e.target.value)}
              className="flex-1 font-mono text-sm"
              onKeyDown={e => { if (e.key === 'Enter') verify(); }}
            />
            <Button onClick={() => verify()} disabled={busy || !lookup.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
            </Button>
          </div>

          {msg && (
            <div className={cn('p-3 rounded-lg text-sm flex items-center gap-2',
              msg.type === 'success' ? 'bg-success/10 text-success border border-success/30'
                                     : 'bg-destructive/10 text-destructive border border-destructive/30')}>
              {msg.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {msg.text}
            </div>
          )}

          {found && (
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border">
                <span className="font-mono text-xs">{found.receipt_id}</span>
                <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded',
                  found.status === 'success' ? 'bg-success/10 text-success' :
                  found.status === 'failed'  ? 'bg-destructive/10 text-destructive' :
                                                'bg-warning/10 text-warning')}>
                  {found.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div><span className="text-muted-foreground">Type:</span> <strong>{found.type}</strong></div>
                <div><span className="text-muted-foreground">Amount:</span> <strong>{found.currency === 'GHS' || !found.currency ? 'GH₵' : found.currency} {Number(found.amount || 0).toFixed(2)}</strong></div>
                <div><span className="text-muted-foreground">User:</span> {found.user_name || found.user_email || '—'}</div>
                <div><span className="text-muted-foreground">Course:</span> {found.course_title || '—'}</div>
                <div><span className="text-muted-foreground">Provider:</span> {found.provider}</div>
                <div><span className="text-muted-foreground">Ref:</span> <span className="font-mono">{found.provider_ref || '—'}</span></div>
                <div><span className="text-muted-foreground">Instructor share:</span> {Number(found.instructor_share || 0).toFixed(2)}</div>
                <div><span className="text-muted-foreground">Platform share:</span> {Number(found.platform_share || 0).toFixed(2)}</div>
                <div className="col-span-2"><span className="text-muted-foreground">Created:</span> {found.created_at}</div>
              </div>
              {/* Status update buttons */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                <Button size="sm" variant="outline" disabled={busy || found.status === 'success'} onClick={() => verify('success')}
                  className="border-success/40 text-success hover:bg-success/10 text-xs">
                  Mark Success
                </Button>
                <Button size="sm" variant="outline" disabled={busy || found.status === 'failed'} onClick={() => verify('failed')}
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 text-xs">
                  Mark Failed
                </Button>
                <Button size="sm" variant="outline" disabled={busy || found.status === 'pending'} onClick={() => verify('pending')}
                  className="text-xs">
                  Mark Pending
                </Button>
                <Button size="sm" variant="outline" disabled={busy || found.status === 'refunded'} onClick={() => verify('refunded')}
                  className="text-xs">
                  Mark Refunded
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* All transactions table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">All Transactions ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase font-bold text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-2 py-2 text-left">Receipt</th>
                  <th className="px-2 py-2 text-left">Date</th>
                  <th className="px-2 py-2 text-left">Type</th>
                  <th className="px-2 py-2 text-left">User</th>
                  <th className="px-2 py-2 text-left">Course</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="px-2 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">No transactions yet.</td></tr>
                ) : rows.slice(0, 50).map(t => (
                  <tr key={t.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-2 py-2 font-mono text-[11px]">{t.receipt_id}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-2 py-2 text-[10px] uppercase font-bold">{t.type}</td>
                    <td className="px-2 py-2 text-xs">{t.user_name || t.user_email || '—'}</td>
                    <td className="px-2 py-2 text-xs">{t.course_title || '—'}</td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums">{Number(t.amount || 0).toFixed(2)}</td>
                    <td className="px-2 py-2">
                      <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded',
                        t.status === 'success' ? 'bg-success/10 text-success' :
                        t.status === 'failed'  ? 'bg-destructive/10 text-destructive' :
                                                  'bg-warning/10 text-warning')}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 50 && (
            <p className="text-xs text-center text-muted-foreground mt-3">
              Showing 50 of {rows.length}. Use the filters on the Receipts page for more.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ── Admin: Footer tab — contact details, socials, platform/support links
// ─────────────────────────────────────────────────────────────────────────
function AdminFooterTab() {
  const [cfg, setCfg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    API('/api/admin/footer')
      .then((d) => setCfg({ ...mergeFooterConfig(d), _support_links_customized: !!d._support_links_customized }))
      .catch((e) => setMsg({ type: 'error', text: e.message }))
      .finally(() => setLoading(false));
  }, []);

  const patch = (fields) => setCfg((c) => ({ ...c, ...fields }));
  const patchSocial = (name, fields) =>
    setCfg((c) => ({ ...c, socials: { ...c.socials, [name]: { ...c.socials[name], ...fields } } }));

  const setLink = (key, i, fields) =>
    setCfg((c) => {
      const list = [...(c[key] || [])];
      list[i] = { ...list[i], ...fields };
      return { ...c, [key]: list, ...(key === 'support_links' ? { _support_links_customized: true } : {}) };
    });
  const addLink = (key, row) =>
    setCfg((c) => ({ ...c, [key]: [...(c[key] || []), row], ...(key === 'support_links' ? { _support_links_customized: true } : {}) }));
  const removeLink = (key, i) =>
    setCfg((c) => ({ ...c, [key]: (c[key] || []).filter((_, idx) => idx !== i), ...(key === 'support_links' ? { _support_links_customized: true } : {}) }));
  const moveLink = (key, i, dir) =>
    setCfg((c) => {
      const list = [...(c[key] || [])];
      const j = i + dir;
      if (j < 0 || j >= list.length) return c;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...c, [key]: list };
    });

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      // When the Support rows are only the auto-derived email/phone, tell the
      // backend to regenerate them from the contact details instead of saving
      // the (possibly stale) values shown in the form.
      const payload = { ...cfg, _keep_support_links: !cfg._support_links_customized };
      await API('/api/admin/footer', { method: 'PUT', body: JSON.stringify(payload) });
      setMsg({ type: 'success', text: 'Footer saved. It updates on the public site within a page reload.' });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary/50" /></div>;
  }
  if (!cfg) {
    return <p className="text-sm text-destructive">{msg?.text || 'Could not load footer settings.'}</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" /> Footer &amp; Contact
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Edit the public footer: contact details, social icons, and the Platform/Support link lists.
        </p>
      </div>

      {msg && (
        <div className={cn('flex items-center gap-3 p-3 rounded-xl border text-sm font-medium',
          msg.type === 'success' ? 'bg-success/5 text-success border-success/20'
                                 : 'bg-destructive/5 text-destructive border-destructive/20')}>
          {msg.text}
          <button onClick={() => setMsg(null)} className="ml-auto opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* Contact details */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Contact details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Support email</label>
              <Input value={cfg.email} onChange={(e) => patch({ email: e.target.value })}
                placeholder="support@example.com" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Phone / WhatsApp</label>
              <Input value={cfg.phone} onChange={(e) => patch({ phone: e.target.value })}
                placeholder="+233 ..." className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Location</label>
              <Input value={cfg.location} onChange={(e) => patch({ location: e.target.value })}
                placeholder="City, Country" className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Tagline / blurb</label>
            <textarea value={cfg.tagline} onChange={(e) => patch({ tagline: e.target.value })}
              rows={3} maxLength={500}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        </CardContent>
      </Card>

      {/* Socials */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Social icons</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Enable a social, give its destination URL, and optionally an icon image URL
            (leave icon blank to use the built-in brand icon).
          </p>
          {SOCIAL_NAMES.map((name) => {
            const s = cfg.socials[name] || {};
            return (
              <div key={name} className="grid items-center gap-3 sm:grid-cols-[110px_1fr_1fr_auto] border border-border rounded-xl p-3">
                <label className="flex items-center gap-2 text-sm font-semibold capitalize">
                  <input type="checkbox" checked={!!s.enabled}
                    onChange={(e) => patchSocial(name, { enabled: e.target.checked })} />
                  {name}
                </label>
                <Input value={s.url || ''} placeholder="https://…"
                  onChange={(e) => patchSocial(name, { url: e.target.value })} />
                <Input value={s.icon_url || ''} placeholder="Icon image URL (optional)"
                  onChange={(e) => patchSocial(name, { icon_url: e.target.value })} />
                {s.icon_url
                  ? <img src={s.icon_url} alt="" className="h-7 w-7 object-contain rounded border border-border" />
                  : <span className="h-7 w-7" />}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Link lists */}
      {[
        { key: 'platform_links', title: 'Platform links', withAudience: true },
        { key: 'support_links',  title: 'Support links',  withAudience: false },
      ].map(({ key, title, withAudience }) => (
        <Card key={key}>
          <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {key === 'support_links' && !cfg._support_links_customized && (
              <p className="text-xs text-muted-foreground">
                These stay in sync with the contact email and phone above. Edit a row to
                give it its own address.
              </p>
            )}
            {(cfg[key] || []).map((link, i) => (
              <div key={i} className={cn('grid items-center gap-2 border border-border rounded-xl p-3',
                withAudience ? 'sm:grid-cols-[1fr_1fr_150px_auto_auto]' : 'sm:grid-cols-[1fr_1fr_auto_auto]')}>
                <Input value={link.label || ''} placeholder="Label"
                  onChange={(e) => setLink(key, i, { label: e.target.value })} />
                <Input value={link.url || ''} placeholder="/path or https://…"
                  onChange={(e) => setLink(key, i, { url: e.target.value })} />
                {withAudience && (
                  <select value={link.audience || 'all'}
                    onChange={(e) => setLink(key, i, { audience: e.target.value })}
                    className="h-10 rounded-lg border border-input bg-background px-2 text-sm">
                    {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                )}
                <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <input type="checkbox" checked={link.enabled !== false}
                    onChange={(e) => setLink(key, i, { enabled: e.target.checked })} /> On
                </label>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveLink(key, i, -1)} disabled={i === 0}
                    className="p-1.5 rounded hover:bg-muted disabled:opacity-30" title="Move up">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button onClick={() => moveLink(key, i, 1)} disabled={i === (cfg[key] || []).length - 1}
                    className="p-1.5 rounded hover:bg-muted disabled:opacity-30" title="Move down">
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button onClick={() => removeLink(key, i)}
                    className="p-1.5 rounded text-destructive hover:bg-destructive/10" title="Remove">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline"
              onClick={() => addLink(key, withAudience
                ? { label: '', url: '', enabled: true, audience: 'all' }
                : { label: '', url: '', enabled: true })}>
              <Plus className="h-4 w-4 mr-1" /> Add link
            </Button>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Saving…</> : <><Save className="h-4 w-4 mr-2" /> Save footer</>}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ── Admin: Settings tab — revenue split between instructor and platform
// ─────────────────────────────────────────────────────────────────────────
function AdminSettingsTab() {
  const [instructorPct, setInstructorPct] = useState(80);
  const [adminPct, setAdminPct]           = useState(20);
  const [requirePayoutCourses, setRequirePayoutCourses] = useState(true);
  const [requirePayoutApproval, setRequirePayoutApproval] = useState(false);
  const [homepageStats, setHomepageStats] = useState(true);
  const [statCourses, setStatCourses] = useState(50);
  const [statStudents, setStatStudents] = useState(2500);
  const [statInstructors, setStatInstructors] = useState(40);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [savingPayout, setSavingPayout] = useState(false);
  const [msg, setMsg]         = useState(null);
  const [payoutMsg, setPayoutMsg] = useState(null);
  const [providerStatus, setProviderStatus] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      API('/api/admin/platform-settings').then(d => {
        setInstructorPct(Number(d.instructor_share || 0));
        setAdminPct(Number(d.admin_share || 0));
        setRequirePayoutCourses(d.require_payout_before_courses !== false);
        setRequirePayoutApproval(!!d.require_payout_before_approval);
        setHomepageStats(d.homepage_stats_enabled !== false);
        const v = d.homepage_stats_values || {};
        setStatCourses(Number(v.courses ?? 50));
        setStatStudents(Number(v.students ?? 2500));
        setStatInstructors(Number(v.instructors ?? 40));
      }).catch(() => {}),
      API('/api/admin/payments/provider-status').then(setProviderStatus).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const savePayoutSettings = async () => {
    setSavingPayout(true); setPayoutMsg(null);
    try {
      await API('/api/admin/platform-settings', {
        method: 'PUT',
        body: JSON.stringify({
          instructor_share: instructorPct, admin_share: adminPct,
          require_payout_before_courses: requirePayoutCourses,
          require_payout_before_approval: requirePayoutApproval,
          homepage_stats_enabled: homepageStats,
          homepage_stats_values: {
            courses: Number(statCourses) || 0,
            students: Number(statStudents) || 0,
            instructors: Number(statInstructors) || 0,
          },
        })
      });
      setPayoutMsg({ type: 'success', text: 'Payout rules saved.' });
    } catch (e) {
      setPayoutMsg({ type: 'error', text: e.message });
    } finally { setSavingPayout(false); }
  };

  // Keep the two in sync (sliders should always sum to 100)
  const setInstr = (n) => {
    const clamped = Math.max(0, Math.min(100, Number(n) || 0));
    setInstructorPct(clamped);
    setAdminPct(100 - clamped);
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await API('/api/admin/platform-settings', {
        method: 'PUT',
        body: JSON.stringify({ instructor_share: instructorPct, admin_share: adminPct })
      });
      setMsg({ type: 'success', text: 'Revenue split saved.' });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" /> Platform Settings
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure how revenue is split between instructors and the platform on every paid course purchase.
        </p>
      </div>

      {/* Payment Provider status card */}
      {providerStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" /> Payment Provider
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold flex items-center gap-2">
                  {providerStatus.is_live ? (
                    <>
                      <span className="inline-block h-2 w-2 rounded-full bg-success animate-pulse" />
                      Live — Paystack
                    </>
                  ) : (
                    <>
                      <span className="inline-block h-2 w-2 rounded-full bg-warning" />
                      Demo Mode — Mock Provider
                    </>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {providerStatus.is_live
                    ? 'Real payments are being processed through Paystack.'
                    : 'Payments are simulated. No real money is charged. Split rules and receipts still work correctly.'}
                </p>
              </div>
              <div className={cn(
                'text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded',
                providerStatus.is_live
                  ? 'bg-success/10 text-success border border-success/30'
                  : 'bg-warning/10 text-warning border border-warning/30'
              )}>
                {providerStatus.provider}
              </div>
            </div>

            {!providerStatus.is_live && (
              <div className="p-3 rounded-lg bg-muted/30 border border-border text-xs space-y-2">
                <p className="font-bold text-foreground">To switch to real Paystack payments:</p>
                <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                  <li>Sign up at <span className="text-primary">paystack.com</span> and complete KYC.</li>
                  <li>Get your secret key from Dashboard → Settings → API Keys.</li>
                  <li>Set env var: <code className="px-1 py-0.5 bg-background rounded text-[11px]">PAYSTACK_SECRET_KEY=sk_live_…</code></li>
                  <li>Set env var: <code className="px-1 py-0.5 bg-background rounded text-[11px]">PAYSTACK_CALLBACK_URL=https://your-site.com/payment/return</code></li>
                  <li>In Paystack Dashboard → Settings → Webhooks, add your backend webhook URL:
                    <code className="block mt-1 px-2 py-1 bg-background rounded text-[11px] break-all">https://your-backend.onrender.com{providerStatus.webhook_url}</code>
                  </li>
                  <li>Enable Transfers in Paystack Dashboard → Settings.</li>
                </ol>
                <p className="text-[11px] text-muted-foreground pt-1">
                  Once these are set, everything switches to live automatically — no code changes needed.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" /> Revenue Split
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary/50" /></div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Instructor receives</span>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="0" max="100" step="1"
                      value={instructorPct}
                      onChange={e => setInstr(e.target.value)}
                      className="w-20 h-9 text-right tabular-nums" />
                    <span className="text-sm font-bold">%</span>
                  </div>
                </div>
                <input type="range" min="0" max="100" step="1"
                  value={instructorPct}
                  onChange={e => setInstr(e.target.value)}
                  className="w-full accent-primary" />
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-success/10 border border-success/30 text-center">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Instructor</p>
                    <p className="text-2xl font-bold tabular-nums text-success">{instructorPct}%</p>
                  </div>
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/30 text-center">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Platform</p>
                    <p className="text-2xl font-bold tabular-nums text-primary">{adminPct}%</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Example: on a {''}<strong>GH₵ 100</strong>{''} course purchase, instructor gets {''}
                  <strong>GH₵ {(instructorPct).toFixed(2)}</strong>{''} and platform keeps {''}
                  <strong>GH₵ {(adminPct).toFixed(2)}</strong>.
                </p>
              </div>

              {msg && (
                <div className={cn('p-3 rounded-lg text-sm flex items-center gap-2',
                  msg.type === 'success' ? 'bg-success/10 text-success border border-success/30'
                                         : 'bg-destructive/10 text-destructive border border-destructive/30')}>
                  {msg.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {msg.text}
                </div>
              )}

              <Button onClick={save} disabled={saving} className="w-full">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Revenue Split'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" /> Instructor payout requirements
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-primary"
              checked={requirePayoutCourses}
              onChange={e => setRequirePayoutCourses(e.target.checked)} />
            <span>
              <span className="text-sm font-semibold block">Require a payout method before an instructor can create courses</span>
              <span className="text-xs text-muted-foreground">
                Instructors who have not added a mobile money number or bank account cannot create
                any course (free or paid) and see a “Set up your payout method” screen.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-primary"
              checked={requirePayoutApproval}
              onChange={e => setRequirePayoutApproval(e.target.checked)} />
            <span>
              <span className="text-sm font-semibold block">Also require it before you can approve an instructor</span>
              <span className="text-xs text-muted-foreground">
                Blocks the Approve button until the applicant has saved a payout method. Off by
                default, so you can approve first and they set it up after.
              </span>
            </span>
          </label>
          <div className="border-t border-border pt-4 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-primary"
                checked={homepageStats}
                onChange={e => setHomepageStats(e.target.checked)} />
              <span>
                <span className="text-sm font-semibold block">Show stats on the homepage</span>
                <span className="text-xs text-muted-foreground">
                  Shows a stats strip on the landing page. Uncheck to hide the whole strip.
                </span>
              </span>
            </label>
            {homepageStats && (
              <div className="grid grid-cols-3 gap-3 pl-7">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Courses</label>
                  <Input type="number" min="0" step="1" value={statCourses}
                    onChange={e => setStatCourses(e.target.value)} className="h-9" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Students</label>
                  <Input type="number" min="0" step="1" value={statStudents}
                    onChange={e => setStatStudents(e.target.value)} className="h-9" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground">Instructors</label>
                  <Input type="number" min="0" step="1" value={statInstructors}
                    onChange={e => setStatInstructors(e.target.value)} className="h-9" />
                </div>
                <p className="col-span-3 text-[11px] text-muted-foreground">
                  These are display numbers you choose for marketing — they are not counted from
                  real users. Preview: <strong>{Number(statCourses) || 0}+</strong> Courses ·{' '}
                  <strong>{Number(statStudents) || 0}+</strong> Students ·{' '}
                  <strong>{Number(statInstructors) || 0}+</strong> Instructors
                </p>
              </div>
            )}
          </div>

          {payoutMsg && (
            <div className={cn('p-3 rounded-lg text-sm flex items-center gap-2',
              payoutMsg.type === 'success' ? 'bg-success/10 text-success border border-success/30'
                                           : 'bg-destructive/10 text-destructive border border-destructive/30')}>
              {payoutMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {payoutMsg.text}
            </div>
          )}

          <Button onClick={savePayoutSettings} disabled={savingPayout} className="w-full">
            {savingPayout ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save payout rules'}
          </Button>
        </CardContent>
      </Card>
      <SignupVerificationCard />
      <EmailSendersCard />
      <DatabaseBackupCard />
    </div>
  );
}

// ─── Signup verification mode toggle ──────────────────────────────────────
function SignupVerificationCard() {
  const [mode, setMode]     = useState('none');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState(null);

  useEffect(() => {
    setLoading(true);
    API('/api/admin/settings/signup-verification')
      .then(d => setMode(d.mode || 'none'))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async (newMode) => {
    setSaving(true); setMsg(null);
    try {
      await API('/api/admin/settings/signup-verification', {
        method: 'PUT',
        body: JSON.stringify({ mode: newMode }),
      });
      setMode(newMode);
      setMsg({ type: 'success', text: 'Signup verification mode updated.' });
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally { setSaving(false); }
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-bold">Signup Verification</h3>
        <p className="text-xs text-muted-foreground">
          Choose how new user signups are handled.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-2">
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors">
              <input
                type="radio"
                name="signup-mode"
                value="none"
                checked={mode === 'none'}
                disabled={saving}
                onChange={() => save('none')}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-semibold">No verification</p>
                <p className="text-xs text-muted-foreground">
                  Users sign up and are immediately logged in. (Default)
                </p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-border hover:bg-muted/40 transition-colors">
              <input
                type="radio"
                name="signup-mode"
                value="email_otp"
                checked={mode === 'email_otp'}
                disabled={saving}
                onChange={() => save('email_otp')}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-semibold">Email OTP verification (SendPulse)</p>
                <p className="text-xs text-muted-foreground">
                  Users must enter a 6-digit code sent to their email before their account is active. Requires SendPulse env vars set on the backend.
                </p>
              </div>
            </label>
            {msg && (
              <div className={`text-xs mt-2 ${msg.type === 'error' ? 'text-red-500' : 'text-green-500'}`}>
                {msg.text}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Database backup / restore ────────────────────────────────────────────
function DatabaseBackupCard() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const download = async () => {
    setExporting(true);
    try {
      const token = sessionStorage.getItem('auth_token');
      const base = import.meta.env.VITE_API_URL || '';
      const r = await fetch(`${base}/api/admin/database/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('Export failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `learnafrica-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Backup download failed: ' + e.message);
    } finally { setExporting(false); }
  };

  const runImport = async () => {
    if (!importFile) { alert('Choose a backup file first.'); return; }
    if (confirmText !== 'CONFIRM') { alert('Type CONFIRM to proceed.'); return; }
    if (!password) { alert('Enter your admin password.'); return; }
    setImporting(true); setImportResult(null);
    try {
      const text = await importFile.text();
      const backup = JSON.parse(text);
      const r = await API('/api/admin/database/import', {
        method: 'POST',
        body: JSON.stringify({ backup, password, confirm: 'CONFIRM' }),
      });
      setImportResult({ type: 'success', ...r });
      setShowConfirm(false);
      setConfirmText(''); setPassword('');
    } catch (e) {
      setImportResult({ type: 'error', message: e.message });
    } finally { setImporting(false); }
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-bold">Database Backup</h3>
        <p className="text-xs text-muted-foreground">
          Export everything as a JSON file, or restore from a previous backup.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Export */}
        <div>
          <h4 className="text-sm font-bold mb-2">Export</h4>
          <p className="text-xs text-muted-foreground mb-3">
            Downloads a JSON file with all users, courses, lessons, enrolments, transactions, and settings. Uploaded files on Supabase are NOT included — back those up separately in the Supabase dashboard.
          </p>
          <Button onClick={download} disabled={exporting}>
            {exporting ? 'Preparing download…' : 'Download full backup'}
          </Button>
        </div>

        {/* Import */}
        <div className="pt-4 border-t border-border">
          <h4 className="text-sm font-bold mb-2 text-red-500">Restore from backup</h4>
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 mb-3">
            <p className="text-xs text-red-500 font-semibold mb-1">⚠ Destructive action</p>
            <p className="text-xs text-foreground/80">
              Restoring OVERWRITES your current database entirely. Users who signed up after the backup will lose their accounts. Course changes made since the backup will be lost. A pre-restore snapshot of your current data is saved on the server as a rollback file — but you should also download a fresh backup right now before proceeding.
            </p>
          </div>

          <input
            type="file"
            accept="application/json,.json"
            onChange={e => { setImportFile(e.target.files?.[0] || null); setImportResult(null); }}
            className="text-xs mb-3"
          />

          {importFile && !showConfirm && (
            <Button variant="outline" onClick={() => setShowConfirm(true)} className="border-red-500/40 text-red-500">
              Continue with restore…
            </Button>
          )}

          {showConfirm && (
            <div className="space-y-3 mt-2 p-4 rounded-lg border border-red-500/30 bg-red-500/5">
              <div>
                <label className="text-xs font-semibold text-red-500">
                  Type CONFIRM to enable the restore button:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder="CONFIRM"
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-red-500">
                  Re-enter your admin password:
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={runImport}
                  disabled={importing || confirmText !== 'CONFIRM' || !password}
                  className="bg-red-500 hover:bg-red-600 text-white"
                >
                  {importing ? 'Restoring…' : 'Restore now (destructive)'}
                </Button>
                <Button variant="outline" onClick={() => { setShowConfirm(false); setConfirmText(''); setPassword(''); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {importResult && (
            <div className={`mt-3 p-3 rounded-lg text-xs ${importResult.type === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/30' : 'bg-green-500/10 text-green-500 border border-green-500/30'}`}>
              {importResult.type === 'error'
                ? <>❌ {importResult.message}</>
                : <>
                    ✓ Restore complete: {importResult.rows_inserted} rows inserted.
                    {importResult.pre_restore_snapshot_path && (
                      <p className="mt-1 opacity-80">Rollback snapshot saved on server at: {importResult.pre_restore_snapshot_path}</p>
                    )}
                  </>
              }
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ── Admin: Payouts tab — see pending balances + pay instructors
// ─────────────────────────────────────────────────────────────────────────
function AdminPayoutsTab() {
  const [data,    setData]    = useState({ instructors: [], total_pending: 0, currency: 'GHS' });
  const [requests, setRequests] = useState({ requests: [], total_requested: 0 });
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [busyId,  setBusyId]  = useState(null);
  const [reqBusy, setReqBusy] = useState(null);
  const [msg,     setMsg]     = useState(null);

  const load = () => {
    setLoading(true);
    API('/api/admin/payouts/pending')
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
    API('/api/admin/payouts/requests?status=requested')
      .then(d => setRequests(d))
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const markSent = async (req) => {
    const ref = window.prompt(
      `Mark ${req.instructor_name || 'instructor'}'s request of GH₵ ${Number(req.amount).toFixed(2)} as sent?\n\n` +
      `Only do this AFTER you have paid them from your own account.\n\n` +
      `Optional: enter a payment reference (e.g. MoMo transaction ID):`,
      ''
    );
    if (ref === null) return;
    setReqBusy(req.id); setMsg(null);
    try {
      const r = await API(`/api/admin/payouts/requests/${req.id}/mark-sent`, {
        method: 'POST', body: JSON.stringify({ reference: ref }),
      });
      setMsg({ type: 'success', text: r.message });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Could not mark as sent' });
    } finally { setReqBusy(null); }
  };

  const rejectReq = async (req) => {
    const note = window.prompt(`Reject ${req.instructor_name || 'instructor'}'s payout request? Optional reason:`, '');
    if (note === null) return;
    setReqBusy(req.id); setMsg(null);
    try {
      await API(`/api/admin/payouts/requests/${req.id}/reject`, {
        method: 'POST', body: JSON.stringify({ note }),
      });
      setMsg({ type: 'success', text: 'Request rejected.' });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Could not reject' });
    } finally { setReqBusy(null); }
  };

  const payOne = async (inst) => {
    if (!window.confirm(`Pay ${inst.name} GH₵ ${Number(inst.pending).toFixed(2)} to ${inst.method_label}?`)) return;
    setBusyId(inst.instructor_id); setMsg(null);
    try {
      const r = await API(`/api/admin/payouts/pay/${inst.instructor_id}`, { method: 'POST' });
      setMsg({ type: 'success', text: `Paid ${inst.name} GH₵ ${Number(r.amount).toFixed(2)}. Receipt: ${r.receipt_id}` });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Payout failed' });
    } finally { setBusyId(null); }
  };

  // Admin pays the instructor from their own account — no request needed.
  const payManualOne = async (inst) => {
    const ref = window.prompt(
      `Mark ${inst.name}'s GH₵ ${Number(inst.pending).toFixed(2)} as paid manually?\n\n` +
      `Only do this AFTER you have paid them from your own account.\n\n` +
      `Optional: enter a payment reference (e.g. MoMo transaction ID):`,
      ''
    );
    if (ref === null) return;
    setBusyId(inst.instructor_id); setMsg(null);
    try {
      const r = await API(`/api/admin/payouts/pay-manual/${inst.instructor_id}`, {
        method: 'POST', body: JSON.stringify({ reference: ref }),
      });
      setMsg({ type: 'success', text: r.message });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Manual payout failed' });
    } finally { setBusyId(null); }
  };

  const payAllManual = async () => {
    if (data.instructors.length === 0) {
      setMsg({ type: 'error', text: 'No instructors with a pending balance.' });
      return;
    }
    const total = data.instructors.reduce((s, i) => s + Number(i.pending || 0), 0);
    const ref = window.prompt(
      `Mark all ${data.instructors.length} instructor(s) paid, total GH₵ ${total.toFixed(2)}?\n\n` +
      `Only do this AFTER you have paid them from your own account.\n\n` +
      `Optional: enter a payment reference to attach to all:`,
      ''
    );
    if (ref === null) return;
    setBusy(true); setMsg(null);
    try {
      const r = await API('/api/admin/payouts/pay-all-manual', {
        method: 'POST', body: JSON.stringify({ reference: ref }),
      });
      setMsg({ type: 'success', text: r.message });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Bulk manual payout failed' });
    } finally { setBusy(false); }
  };

  const payAll = async () => {
    const eligible = data.instructors.filter(i => i.has_payment_method);
    if (eligible.length === 0) {
      setMsg({ type: 'error', text: 'No eligible instructors. None have set up a payment method.' });
      return;
    }
    const total = eligible.reduce((s, i) => s + Number(i.pending || 0), 0);
    if (!window.confirm(`Pay all ${eligible.length} instructor(s) a total of GH₵ ${total.toFixed(2)}?`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await API('/api/admin/payouts/pay-all', { method: 'POST' });
      setMsg({
        type: 'success',
        text: `Paid ${r.paid_count} instructor(s). Skipped ${r.skipped_count} (no payment method). Failed ${r.failed_count}.`,
      });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Bulk payout failed' });
    } finally { setBusy(false); }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary/50" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" /> Pay Instructors
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Send pending earnings to instructors' mobile money or bank accounts.
        </p>
        <p className="text-xs text-muted-foreground mt-2 p-2.5 rounded-lg bg-warning/10 border border-warning/30">
          <span className="font-bold">Starter Business:</span> Paystack Transfers are unavailable, so use the
          <span className="font-bold"> payment requests</span> below — pay the instructor yourself, then press
          <span className="font-bold"> Mark sent</span>. That resets their balance and notifies them.
        </p>
      </div>

      {/* ── Manual payout requests (Starter Business flow) ─────────────── */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Payment requests</span>
            <span className="text-xs font-normal text-muted-foreground">
              GH₵ {Number(requests.total_requested || 0).toFixed(2)} requested
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(requests.requests || []).length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm">
              No open payment requests.
            </div>
          ) : (
            <div className="space-y-2">
              {requests.requests.map(req => (
                <div key={req.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg border border-border">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{req.instructor_name || 'Instructor'}</p>
                    <p className="text-[11px] text-muted-foreground">{req.instructor_email}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Requested {String(req.requested_at || '').slice(0, 10)} · send to{' '}
                      {req.current_method === 'momo'
                        ? `${(req.current_details || {}).provider || 'MoMo'} · ${(req.current_details || {}).phone || ''}`
                        : `${(req.current_details || {}).bank_name || 'Bank'} · ${(req.current_details || {}).account_number || ''}`}
                    </p>
                    {req.details_changed && (
                      <p className="text-[11px] text-warning mt-1 flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        Payout number changed since this request — the number above is the current one. Double-check before sending.
                      </p>
                    )}
                  </div>
                  <p className="font-bold tabular-nums text-sm">GH₵ {Number(req.amount).toFixed(2)}</p>
                  <div className="flex gap-2">
                    <Button size="sm" className="text-xs h-8 bg-success hover:bg-success/90 text-success-foreground"
                      onClick={() => markSent(req)} disabled={reqBusy === req.id}>
                      {reqBusy === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Mark sent'}
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-8"
                      onClick={() => rejectReq(req)} disabled={reqBusy === req.id}>
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                Total pending across all instructors
              </p>
              <p className="text-3xl sm:text-4xl font-bold mt-1 tabular-nums">
                GH₵ {Number(data.total_pending).toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {data.instructors.length} instructor{data.instructors.length === 1 ? '' : 's'} with pending balance
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={payAllManual}
                disabled={busy || data.total_pending <= 0}
                variant="outline"
                className="h-11 px-6"
                title="I already paid everyone myself — mark them all paid"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" /> Mark All Paid
              </Button>
              <Button
                onClick={payAll}
                disabled={busy || data.total_pending <= 0}
                className="bg-success hover:bg-success/90 text-success-foreground h-11 px-6"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Banknote className="h-4 w-4 mr-2" /> Pay All Instructors</>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {msg && (
        <div className={cn('p-3 rounded-lg text-sm flex items-center gap-2',
          msg.type === 'success' ? 'bg-success/10 text-success border border-success/30'
                                 : 'bg-destructive/10 text-destructive border border-destructive/30')}>
          {msg.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          <span>{msg.text}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Instructors with pending balances</CardTitle>
        </CardHeader>
        <CardContent>
          {data.instructors.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              <Wallet className="h-10 w-10 mx-auto mb-2 opacity-30" />
              All caught up — no pending payouts.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase font-bold text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-2 py-2.5 text-left">Instructor</th>
                    <th className="px-2 py-2.5 text-right">Pending</th>
                    <th className="px-2 py-2.5 text-left">Payout Method</th>
                    <th className="px-2 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.instructors.map(inst => (
                    <tr key={inst.instructor_id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-2 py-3">
                        <div className="font-medium">{inst.name}</div>
                        <div className="text-[10px] text-muted-foreground">{inst.email}</div>
                      </td>
                      <td className="px-2 py-3 text-right font-bold tabular-nums">
                        GH₵ {Number(inst.pending).toFixed(2)}
                      </td>
                      <td className="px-2 py-3 text-xs">
                        {inst.has_payment_method ? (
                          <span className="inline-flex items-center gap-1.5 text-foreground">
                            <CheckCircle2 className="h-3 w-3 text-success" />
                            {inst.method_label}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-warning">
                            <AlertTriangle className="h-3 w-3" />
                            Not set up
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => payManualOne(inst)}
                            disabled={busyId === inst.instructor_id}
                            className="text-xs h-8"
                            title="I already paid them myself — mark it paid"
                          >
                            {busyId === inst.instructor_id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : 'Mark paid'}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => payOne(inst)}
                            disabled={!inst.has_payment_method || busyId === inst.instructor_id}
                            className="text-xs h-8"
                            title="Send via Paystack Transfer (needs a Registered Business)"
                          >
                            {busyId === inst.instructor_id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : 'Pay Out'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <span className="font-bold">Mark paid / Mark All Paid</span> work on a Starter Business — pay the
        instructor yourself, then press them to record it and reset their balance.
        <span className="font-bold"> Pay Out / Pay All Instructors</span> send real Paystack Transfers, which
        need a Registered Business.
      </p>
    </div>
  );
}

// ── Admin: Blog ───────────────────────────────────────────────────────────────
function AdminBlogTab() {
  const empty = { title: '', slug: '', excerpt: '', cover: '', body: '', is_published: true };
  const [posts, setPosts]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy]         = useState(false);
  const [status, setStatus]     = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await API('/api/admin/blog');
      const j = await r.json().catch(() => ({}));
      setPosts(j.posts || []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const startCreate = () => { setEditingId(null); setForm(empty); setShowForm(true); setStatus(null); };
  const startEdit   = (p) => {
    setEditingId(p.id);
    setForm({
      title: p.title || '', slug: p.slug || '', excerpt: p.excerpt || '',
      cover: p.cover || '', body: p.body || '', is_published: !!p.is_published,
    });
    setShowForm(true); setStatus(null);
  };

  const save = async () => {
    if (!form.title.trim()) { setStatus({ type: 'error', msg: 'Title is required.' }); return; }
    setBusy(true); setStatus(null);
    try {
      const r = editingId
        ? await API(`/api/admin/blog/${editingId}`, { method: 'PUT', body: JSON.stringify(form) })
        : await API('/api/admin/blog', { method: 'POST', body: JSON.stringify(form) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Save failed');
      setStatus({ type: 'success', msg: editingId ? 'Post updated.' : 'Post created.' });
      setShowForm(false); setForm(empty); setEditingId(null);
      load();
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    try {
      const r = await API(`/api/admin/blog/${id}`, { method: 'DELETE' });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Delete failed'); }
      load();
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><FileText className="h-5 w-5" /> Blog</h2>
          <p className="text-sm text-muted-foreground">
            Publish articles with Markdown. They appear at <code>/blog</code> for SEO.
          </p>
        </div>
        <Button onClick={startCreate} className="gap-2"><Plus className="h-4 w-4" /> New post</Button>
      </div>

      {status && (
        <div className={cn('text-sm rounded-lg px-3 py-2',
          status.type === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
          {status.msg}
        </div>
      )}

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Input placeholder="Title" value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <Input placeholder="Slug (optional — generated from the title)" value={form.slug}
              onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} />
            <Input placeholder="Excerpt / summary" value={form.excerpt}
              onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))} />
            <Input placeholder="Cover image URL" value={form.cover}
              onChange={e => setForm(f => ({ ...f, cover: e.target.value }))} />
            <textarea
              placeholder="Body (Markdown or plain text)"
              value={form.body}
              onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              rows={10}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_published}
                onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} />
              Published (visible publicly)
            </label>
            <div className="flex gap-2">
              <Button onClick={save} disabled={busy} className="gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingId ? 'Save changes' : 'Create post'}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="py-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
      ) : posts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6">No posts yet.</p>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {posts.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    /blog/{p.slug} · {p.is_published ? 'Published' : 'Draft'}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEdit(p)}
                    className="p-2 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => remove(p.id)}
                    className="p-2 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Admin: Audit Log ──────────────────────────────────────────────────────────
function AdminCredentialsTab({ isSuperadmin }) {
  const [creds, setCreds]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [type, setType]     = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [reason, setReason] = useState('');
  const [target, setTarget] = useState(null); // credential pending revocation
  const [msg, setMsg]       = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ type, limit: '200' });
      if (filter) qs.set('q', filter);
      const j = await API(`/api/admin/credentials?${qs.toString()}`);
      setCreds(j.credentials || []);
    } finally {
      setLoading(false);
    }
  }, [type, filter]);
  useEffect(() => { load(); }, [load]);

  const doRevoke = async () => {
    if (!target) return;
    setBusyId(target.cred_id);
    setMsg(null);
    try {
      await API('/api/admin/credentials/revoke', {
        method: 'POST',
        body: JSON.stringify({ id: target.cred_id, type: target.type, reason }),
      });
      setTarget(null); setReason('');
      setMsg({ ok: true, text: 'Credential revoked.' });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e.message || 'Failed to revoke.' });
    } finally {
      setBusyId(null);
    }
  };

  const doRestore = async (c) => {
    setBusyId(c.cred_id);
    setMsg(null);
    try {
      await API('/api/admin/credentials/restore', {
        method: 'POST',
        body: JSON.stringify({ id: c.cred_id, type: c.type }),
      });
      setMsg({ ok: true, text: 'Credential restored.' });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e.message || 'Failed to restore.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><Award className="h-5 w-5" /> Credentials</h2>
          <p className="text-sm text-muted-foreground">
            Every issued certificate and badge. Revoking keeps the ID on record but marks it invalid when verified.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={type} onChange={e => setType(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm">
            <option value="all">All</option>
            <option value="certificate">Certificates</option>
            <option value="badge">Badges</option>
          </select>
          <Input placeholder="Search ID, holder, course…" value={filter}
            onChange={e => setFilter(e.target.value)} className="w-64" />
          <Button variant="outline" onClick={load} className="gap-2"><RefreshCw className="h-4 w-4" /> Refresh</Button>
        </div>
      </div>

      {msg && (
        <div className={cn('rounded-xl border px-4 py-2 text-sm',
          msg.ok ? 'bg-success/5 border-success/30 text-success' : 'bg-destructive/5 border-destructive/30 text-destructive')}>
          {msg.text}
        </div>
      )}

      {!isSuperadmin && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-2 text-sm text-warning">
          Only a superadmin can revoke or restore a credential. You can review them here.
        </div>
      )}

      {target && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm">
              Revoke <span className="font-semibold">{target.cred_id}</span> ({target.type}) for{' '}
              <span className="font-semibold">{target.user_name || 'unknown'}</span>? Type a reason (optional).
            </p>
            <Input placeholder="Reason (shown in the audit log)" value={reason}
              onChange={e => setReason(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="destructive" onClick={doRevoke} disabled={busyId === target.cred_id} className="gap-2">
                {busyId === target.cred_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Confirm revoke
              </Button>
              <Button variant="outline" onClick={() => { setTarget(null); setReason(''); }}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="py-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
      ) : creds.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6">No credentials found.</p>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">ID</th>
                  <th className="text-left p-3">Type</th>
                  <th className="text-left p-3">Holder</th>
                  <th className="text-left p-3">Course / Badge</th>
                  <th className="text-left p-3">Issued</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-right p-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {creds.map(c => (
                  <tr key={c.type + c.cred_id} className="hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{c.cred_id}</td>
                    <td className="p-3 capitalize">{c.type}</td>
                    <td className="p-3">{c.user_name || '—'}</td>
                    <td className="p-3 text-muted-foreground">{c.label || '—'}</td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">
                      {c.issued_at ? new Date(c.issued_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="p-3">
                      {c.revoked_at
                        ? <span className="text-destructive font-semibold">Revoked</span>
                        : <span className="text-success font-semibold">Active</span>}
                    </td>
                    <td className="p-3 text-right">
                      {isSuperadmin && (c.revoked_at ? (
                        <Button size="sm" variant="outline" disabled={busyId === c.cred_id}
                          onClick={() => doRestore(c)}>Restore</Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={busyId === c.cred_id}
                          onClick={() => { setTarget(c); setReason(''); }}>Revoke</Button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AdminAuditLogTab() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('');
  const [total, setTotal]     = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '200' });
      if (filter) qs.set('action', filter);
      const r = await API(`/api/admin/audit-log?${qs.toString()}`);
      const j = await r.json().catch(() => ({}));
      setEntries(j.log || []);
      setTotal(j.total || 0);
    } finally {
      setLoading(false);
    }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const ACTION_LABEL = {
    suspend_user: 'Suspended user', activate_user: 'Activated user',
    delete_user: 'Deleted user', delete_course: 'Deleted course',
    course_status: 'Changed course status', instructor_approved: 'Approved instructor',
    instructor_rejected: 'Rejected instructor', broadcast: 'Sent broadcast',
    blog_create: 'Created blog post', blog_update: 'Updated blog post',
    blog_delete: 'Deleted blog post',
    role_change: 'Changed user role',
    certificate_issue: 'Issued certificate',
    badge_issue: 'Issued badge',
    credential_revoke: 'Revoked credential',
    credential_restore: 'Restored credential',
    coupon_create: 'Created coupon', coupon_update: 'Updated coupon',
    coupon_delete: 'Deleted coupon',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2"><History className="h-5 w-5" /> Audit Log</h2>
          <p className="text-sm text-muted-foreground">
            Every admin action, newest first. {total} recorded.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Filter by action…" value={filter}
            onChange={e => setFilter(e.target.value)} className="w-56" />
          <Button variant="outline" onClick={load} className="gap-2"><RefreshCw className="h-4 w-4" /> Refresh</Button>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6">No audit entries yet.</p>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-3">When</th>
                  <th className="text-left p-3">Actor</th>
                  <th className="text-left p-3">Action</th>
                  <th className="text-left p-3">Target</th>
                  <th className="text-left p-3">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {e.created_at ? new Date(e.created_at).toLocaleString() : ''}
                    </td>
                    <td className="p-3">
                      <span className="font-medium">{e.actor_name || '—'}</span>
                      <span className="text-xs text-muted-foreground block">{e.actor_role}</span>
                    </td>
                    <td className="p-3">{ACTION_LABEL[e.action] || e.action}</td>
                    <td className="p-3 text-muted-foreground">{e.target_label || e.target_id || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground">{e.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

