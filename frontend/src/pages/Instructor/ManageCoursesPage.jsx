import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Users, Star, Eye, EyeOff, Loader2, BookOpen, BarChart2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api';

const api = async (endpoint, options = {}) => {
  const token = sessionStorage.getItem('auth_token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};

export default function ManageCoursesPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [status, setStatus] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api('/api/instructor/courses');
      setCourses(data.courses || []);
    } catch (e) { setStatus({ type: 'error', msg: e.message }); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (cid) => {
    setDeletingId(cid);
    try {
      await api(`/api/instructor/courses/${cid}`, { method: 'DELETE' });
      setStatus({ type: 'success', msg: 'Course deleted.' });
      setCourses(prev => prev.filter(c => c.id !== cid));
    } catch (e) { setStatus({ type: 'error', msg: e.message }); }
    setDeletingId('');
    setConfirmDelete(null);
  };

  if (loading) return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary/60" /></div>;

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Courses</h1>
          <p className="text-muted-foreground text-sm mt-1">{courses.length} course{courses.length !== 1 ? 's' : ''} created</p>
        </div>
        <Link to="/instructor/courses/create">
          <Button className="gap-2"><Plus className="h-4 w-4" />New Course</Button>
        </Link>
      </div>

      {status && (
        <div className={cn('p-4 rounded-xl text-sm font-medium flex items-center gap-2 border',
          status.type === 'success' ? 'bg-success/5 text-success border-success/20' : 'bg-destructive/5 text-destructive border-destructive/20')}>
          {status.msg}
          <button onClick={() => setStatus(null)} className="ml-auto opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {courses.length === 0 ? (
        <Card><CardContent className="p-16 text-center space-y-4">
          <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="text-lg font-semibold">No courses yet</p>
          <p className="text-muted-foreground">Create your first course to start teaching.</p>
          <Link to="/instructor/courses/create"><Button className="gap-2"><Plus className="h-4 w-4" />Create Course</Button></Link>
        </CardContent></Card>
      ) : (
        <div className="grid gap-5">
          {courses.map(c => (
            <Card key={c.id} className="overflow-hidden">
              {/* Delete confirm overlay */}
              {confirmDelete === c.id && (
                <div className="absolute inset-0 z-10 bg-background/95 flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-destructive/30 p-6">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                  <p className="font-bold text-center">Delete "<span className="text-destructive">{c.title}</span>"?</p>
                  <p className="text-sm text-muted-foreground text-center">This will permanently delete all lessons and student progress.</p>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                    <Button variant="destructive" onClick={() => handleDelete(c.id)} disabled={deletingId === c.id}>
                      {deletingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex gap-5 p-5 relative">
                <img src={c.thumbnail || '/placeholder.jpg'} alt={c.title}
                  className="w-32 h-24 rounded-xl object-cover shrink-0 hidden sm:block" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border',
                          c.status === 'published' ? 'bg-success/10 text-success border-success/20' :
                          c.status === 'suspended' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                          'bg-muted text-muted-foreground border-border')}>
                          {c.status || 'published'}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-medium">{c.category}</span>
                        <span className="text-[10px] text-muted-foreground font-medium">{c.difficulty}</span>
                      </div>
                      <h3 className="font-bold text-base truncate">{c.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{c.description}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-5 mt-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{c.student_count || c.enrollments || 0} students</span>
                    <span className="flex items-center gap-1.5"><Star className="h-4 w-4 fill-warning text-warning" />{c.rating || '—'}</span>
                    <span className="font-semibold text-foreground">{c.is_free ? 'Free' : `$${c.price}`}</span>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Link to={`/instructor/preview/${c.id}`}>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs"><Eye className="h-3.5 w-3.5" />Preview</Button>
                    </Link>
                    <Link to={`/instructor/courses/edit/${c.id}`}>
                      <Button variant="outline" size="sm" className="gap-1.5 text-xs"><Edit2 className="h-3.5 w-3.5" />Edit</Button>
                    </Link>
                    <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setConfirmDelete(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />Delete
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
