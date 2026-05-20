import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { cn } from '../../lib/utils';
import { API_BASE } from '@/lib/api';
import {
  Users, BookOpen, TrendingUp, Shield, CheckCircle2, XCircle, Loader2, Bell,
  Clock, AlertTriangle, UserCheck, UserX, BarChart2, Send, Eye, Trash2,
  GraduationCap, Edit2, X, Search, RefreshCw, Award, BookMarked,
  DollarSign, Video, Plus, ChevronDown, ChevronUp, Save
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

const TABS = ['Overview', 'Students', 'Instructors', 'Courses', 'Applications', 'Broadcast', 'Earnings', 'Guide'];

export default function AdminPage() {
  const { user } = useAuth();
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
      <div className="flex flex-wrap gap-2 border-b border-border pb-4 overflow-x-auto">
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
            {t}
            {t === 'Applications' && stats?.pending_instructors > 0 && (
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold">
                {stats.pending_instructors}
              </span>
            )}
          </button>
        ))}
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
                              <span key={c.id} className="text-xs bg-muted px-2 py-1 rounded-lg border border-border flex items-center gap-1.5">
                                {c.title}
                                <span className="text-muted-foreground">· {c.enrollments} students</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2 mt-4">
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
                        <td className="p-3 text-center">{c.is_free ? <span className="text-success font-medium">Free</span> : `$${c.price}`}</td>
                        <td className="p-3 text-center">{c.student_count || c.enrollments}</td>
                        <td className="p-3"><STATUS_BADGE status={c.status || 'published'} /></td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
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
                        <p className="text-2xl font-bold">${(earnings.total_gross||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
                        <p className="text-xs text-muted-foreground mt-1">Gross Revenue</p>
                      </div>
                      <div className="text-center p-3 bg-primary/5 rounded-xl border border-primary/20">
                        <p className="text-2xl font-bold text-primary">${(earnings.instructors_total||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
                        <p className="text-xs text-muted-foreground mt-1">To Instructors ({earnings.instructor_share_pct}%)</p>
                      </div>
                      <div className="text-center p-3 bg-success/5 rounded-xl border border-success/20">
                        <p className="text-2xl font-bold text-success">${(earnings.platform_total||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</p>
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
                              <td className="p-3 text-right font-medium">${inst.gross_revenue?.toFixed(2)}</td>
                              <td className="p-3 text-right font-bold text-primary">${inst.instructor_earnings?.toFixed(2)}</td>
                              <td className="p-3 text-right text-success">${inst.platform_earnings?.toFixed(2)}</td>
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

          {tab === 'Guide' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <GraduationCap className="h-5 w-5 text-primary" /> Instructor Guide Management
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Edit the steps and upload tutorial videos that instructors see on their dashboard.
                </p>
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
                          <div>
                            <label className="text-xs font-semibold uppercase text-muted-foreground">Or Upload Video File (mp4, webm — max 100MB)</label>
                            <div className="mt-1 flex items-center gap-3">
                              <input type="file" accept="video/*" id={`vid-${step.id}`} className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files[0];
                                  if (!file) return;
                                  setUploadingVideo(step.id);
                                  try {
                                    const token = sessionStorage.getItem('auth_token');
                                    const fd = new FormData(); fd.append('file', file);
                                    // Upload directly to Flask to bypass Vite proxy
                                    const res = await fetch(`${API_BASE}/api/admin/instructor-guide/${step.id}/upload-video`, {
                                      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd
                                    });
                                    const d = await res.json();
                                    if (!res.ok) throw new Error(d.error);
                                    setEditingStep(p => ({...p, video_url: d.url}));
                                    setGuideStatus({type:'success', msg:'Video uploaded!'});
                                  } catch(err) { setGuideStatus({type:'error', msg:err.message}); }
                                  setUploadingVideo('');
                                }} />
                              <label htmlFor={`vid-${step.id}`}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted text-sm font-medium cursor-pointer transition-colors">
                                {uploadingVideo === step.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                                {uploadingVideo === step.id ? 'Uploading…' : 'Upload Video'}
                              </label>
                              {editingStep.video_url && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-success font-medium truncate max-w-[160px]">
                                    ✓ {editingStep.video_url.split('/').pop()}
                                  </span>
                                  <button
                                    type="button"
                                    title="Remove video"
                                    onClick={async () => {
                                      if (!window.confirm('Remove the video from this step?')) return;
                                      try {
                                        await API(`/api/admin/instructor-guide/${step.id}`, {
                                          method: 'PUT',
                                          body: JSON.stringify({ video_url: null }),
                                        });
                                        setEditingStep(p => ({...p, video_url: null}));
                                        setGuideSteps(prev => prev.map(s => s.id === step.id ? {...s, video_url: null} : s));
                                        setGuideStatus({type:'success', msg:'Video removed.'});
                                      } catch(e) { setGuideStatus({type:'error', msg:e.message}); }
                                    }}
                                    className="flex items-center gap-1 text-xs text-destructive hover:underline shrink-0"
                                  >
                                    <X className="h-3 w-3" /> Remove
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <Card className="w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">User Details</h2>
              <button onClick={() => setSelectedUser(null)} className="p-1 rounded hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
                  {(selectedUser.name || 'U')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-lg">{selectedUser.name}</p>
                  <p className="text-muted-foreground">{selectedUser.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <ROLE_BADGE role={selectedUser.role} />
                    <STATUS_BADGE isActive={selectedUser.is_active} />
                  </div>
                </div>
              </div>
              {selectedUser.bio && <p className="text-sm text-muted-foreground">{selectedUser.bio}</p>}
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
              <p className="text-xs text-muted-foreground">Joined: {selectedUser.created_at?.slice(0,10)}</p>
            </div>
          </Card>
        </div>
      )}

      {/* ── Edit User Modal ── */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
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
    </div>
  );
}
