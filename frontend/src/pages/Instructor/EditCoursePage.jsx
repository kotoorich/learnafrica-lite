import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { cn } from '@/lib/utils';
import { ImageUpload } from '@/components/common/ImageUpload';
import { CurriculumSection } from './CurriculumSection';
import { API_BASE } from '@/lib/api';

const CATEGORIES = [
  'Web Development','Data Science','Mobile Development','Marketing',
  'Design','Cybersecurity','Business','Finance','Other'
];
const DIFFICULTIES = ['Beginner','Intermediate','Advanced'];
const inputCls = "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary";

const apiFetch = async (url, opts = {}) => {
  const token = sessionStorage.getItem('auth_token');
  const res = await fetch(`${API_BASE}${url}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `Server error (${res.status})`);
  return d;
};

export function EditCoursePage() {
  const { courseId } = useParams();
  const navigate = useNavigate();

  const [tab,      setTab]      = useState('basics');
  const [form,     setForm]     = useState({
    title: '', description: '', category: '', difficulty: '',
    price: '0', thumbnail: '', rating: '4.5', num_reviews: '0',
  });
  const [perks,    setPerks]    = useState({ hasCertificate: true, lifetimeAccess: true, hasResources: false });
  const [tags,     setTags]     = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [outcomes, setOutcomes] = useState(['']);
  const [sections, setSections] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  // Section/lesson helpers
  const addSection = () =>
    setSections(p => [...p, { id: crypto.randomUUID(), title: '', lessons: [] }]);
  const removeSection = (id) =>
    setSections(p => p.filter(s => s.id !== id));
  const updateSectionTitle = (id, t) =>
    setSections(p => p.map(s => s.id === id ? { ...s, title: t } : s));
  const addLesson = (sId) =>
    setSections(p => p.map(s => s.id === sId
      ? { ...s, lessons: [...s.lessons, { id: crypto.randomUUID(), title: '', type: 'video', videoUrl: '', duration: '', content: '', questions: [], resources: [] }] }
      : s));
  const removeLesson = (sId, lId) =>
    setSections(p => p.map(s => s.id === sId
      ? { ...s, lessons: s.lessons.filter(l => l.id !== lId) }
      : s));
  const updateLesson = (sId, lId, upd) =>
    setSections(p => p.map(s => s.id === sId
      ? { ...s, lessons: s.lessons.map(l => l.id === lId ? { ...l, ...upd } : l) }
      : s));

  // Load existing course
  useEffect(() => {
    apiFetch(`/api/instructor/courses/${courseId}`)
      .then(data => {
        const c = data.course;
        setForm({
          title: c.title || '',
          description: c.description || '',
          category: c.category || '',
          difficulty: c.difficulty || '',
          price: String(c.price || 0),
          thumbnail: c.thumbnail || '',
          rating: String(c.rating || '4.5'),
          num_reviews: String(c.num_reviews || '0'),
        });
        setTags(c.tags || []);
        setOutcomes((c.learningOutcomes || []).length ? c.learningOutcomes : ['']);
        if (c.perks) setPerks(c.perks);
        if (c.sections && c.sections.length > 0) {
          setSections(c.sections.map(sec => ({
            id: sec.id || crypto.randomUUID(),
            title: sec.title || '',
            lessons: (sec.lessons || []).map(les => ({
              id: les.id || crypto.randomUUID(),
              title: les.title || '',
              type: les.type || 'video',
              content: les.content || '',
              videoUrl: les.videoUrl || les.video_url || '',
              duration: les.duration || '',
              is_final: les.is_final || false,
              resources: (les.resources || []).map(r => ({
                id: r.id || crypto.randomUUID(),
                title: r.title || '',
                url: r.url || '',
                file_type: r.file_type || r.type || 'file',
              })),
              questions: (les.questions || []).map(q => ({
                id: q.id || (Date.now() + Math.random()),
                text: q.text || q.question_text || '',
                options: Array.isArray(q.options) ? q.options : ['', '', '', ''],
                correctAnswer: q.correctAnswer ?? q.correct_answer ?? 0,
                question_type: q.question_type || 'mcq',
              })),
            })),
          })));
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [courseId]);

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags(p => [...p, t]);
    setTagInput('');
  };

  const handleSave = async () => {
    if (!form.title || !form.description || !form.category || !form.difficulty) {
      setError('Please fill in all required fields.');
      setTab('basics');
      return;
    }
    setSaving(true); setError(''); setSuccess(false);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        difficulty: form.difficulty,
        price: parseFloat(form.price) || 0,
        thumbnail: form.thumbnail || '/placeholder.jpg',
        initial_rating: parseFloat(form.rating) || 4.5,
        initial_reviews: parseInt(form.num_reviews) || 0,
        tags: tags.filter(Boolean),
        learningOutcomes: outcomes.filter(o => o.trim()),
        perks: {
          hasCertificate: perks.hasCertificate,
          lifetimeAccess: perks.lifetimeAccess,
          hasResources: perks.hasResources,
        },
        curriculum: sections.map((s, si) => ({
          title: s.title || `Section ${si + 1}`,
          order: si,
          lessons: (s.lessons || []).map((l, li) => ({
            id: l.id || undefined,
            title: l.title || `Lesson ${li + 1}`,
            type: l.type || 'video',
            content: l.content || '',
            videoUrl: l.videoUrl || '',
            duration: l.duration || '30 min',
            is_final: l.is_final || false,
            order: li,
            resources: (l.resources || [])
              .map(r => ({ title: r.title, url: r.url, file_type: r.file_type || r.type || 'file' }))
              .filter(r => r.title && r.url),
            questions: (l.questions || []).map(q => ({
              text: q.text || '',
              options: q.options || ['', '', '', ''],
              correctAnswer: q.correctAnswer ?? 0,
              question_type: q.question_type || 'mcq',
            })),
          })),
        })),
      };
      await apiFetch(`/api/instructor/courses/${courseId}`, { method: 'PUT', body: JSON.stringify(payload) });
      setSuccess(true);
      setTimeout(() => navigate('/instructor/courses'), 1500);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
    </div>
  );

  const tabs = [
    { id: 'basics',     label: '1. Basics'     },
    { id: 'curriculum', label: '2. Curriculum'  },
    { id: 'finish',     label: '3. Save'        },
  ];

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl pb-20">
      <Link to="/instructor/courses"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary mb-5">
        <ArrowLeft className="h-4 w-4" /> Back to My Courses
      </Link>
      <h1 className="text-2xl font-bold mb-6">Edit Course</h1>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-muted/30 p-1.5 rounded-xl border border-border mb-6">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all',
              tab === t.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted')}>
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-destructive/5 text-destructive text-sm rounded-xl border border-destructive/20">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
          <button onClick={() => setError('')} className="ml-auto opacity-60 hover:opacity-100">×</button>
        </div>
      )}
      {success && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-success/5 text-success text-sm rounded-xl border border-success/20">
          <CheckCircle2 className="h-4 w-4" />Saved! Redirecting…
        </div>
      )}

      {/* BASICS */}
      {tab === 'basics' && (
        <Card className="p-6 space-y-5">
          {[['title', 'Course Title *'], ['description', 'Description *']].map(([k, l]) => (
            <div key={k} className="space-y-1.5">
              <label className="text-sm font-semibold">{l}</label>
              {k === 'description'
                ? <textarea className={cn(inputCls, 'h-24 resize-none')} value={form[k]} onChange={e => setField(k, e.target.value)} />
                : <input className={inputCls} value={form[k]} onChange={e => setField(k, e.target.value)} />}
            </div>
          ))}
          <div className="grid grid-cols-2 gap-4">
            {[['category', 'Category', CATEGORIES], ['difficulty', 'Difficulty', DIFFICULTIES]].map(([k, l, opts]) => (
              <div key={k} className="space-y-1.5">
                <label className="text-sm font-semibold">{l}</label>
                <select className={inputCls} value={form[k]} onChange={e => setField(k, e.target.value)}>
                  <option value="">Select…</option>
                  {opts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Course Thumbnail</label>
            <ImageUpload value={form.thumbnail} onChange={val => setField('thumbnail', val)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Rating (0–5 ★)</label>
              <div className="relative">
                <input type="number" min="0" max="5" step="0.1" className={inputCls}
                  value={form.rating} onChange={e => setField('rating', e.target.value)} placeholder="4.5" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-warning">★</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Review Count</label>
              <input type="number" min="0" className={inputCls}
                value={form.num_reviews} onChange={e => setField('num_reviews', e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Tags</label>
            <div className="flex gap-2">
              <input className={cn(inputCls, 'flex-1')} value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Press Enter to add…" />
              <Button type="button" variant="outline" onClick={addTag}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map(t => (
                <span key={t} className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2.5 py-1 rounded-full">
                  {t}<button onClick={() => setTags(p => p.filter(x => x !== t))} className="ml-0.5 opacity-60">×</button>
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Learning Outcomes</label>
            {outcomes.map((o, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input className={cn(inputCls, 'flex-1')} value={o}
                  onChange={e => setOutcomes(p => p.map((x, j) => j === i ? e.target.value : x))}
                  placeholder={`Outcome ${i + 1}`} />
                {outcomes.length > 1 && (
                  <button onClick={() => setOutcomes(p => p.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive px-2">×</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setOutcomes(p => [...p, ''])}
              className="text-xs text-primary hover:underline">+ Add outcome</button>
          </div>
          <Button onClick={() => setTab('curriculum')} className="w-full h-11">Next: Curriculum →</Button>
        </Card>
      )}

      {/* CURRICULUM */}
      {tab === 'curriculum' && (
        <CurriculumSection
          sections={sections}
          coursePerks={perks}
          updateCoursePerks={setPerks}
          addSection={addSection}
          addLesson={addLesson}
          removeSection={removeSection}
          updateSectionTitle={updateSectionTitle}
          updateLesson={updateLesson}
          removeLesson={removeLesson}
          onBack={() => setTab('basics')}
          onNext={() => setTab('finish')}
        />
      )}

      {/* FINISH */}
      {tab === 'finish' && (
        <Card className="p-6 space-y-5">
          <h2 className="text-lg font-bold">Pricing &amp; Publish</h2>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Price (USD) — 0 for free</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
              <input type="number" min="0" step="0.01"
                className={cn(inputCls, 'pl-7 text-lg font-bold h-12')}
                value={form.price} onChange={e => setField('price', e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              {parseFloat(form.price) > 0
                ? `Students pay $${parseFloat(form.price).toFixed(2)}`
                : 'Free course'}
            </p>
          </div>
          <div className="bg-muted/30 rounded-xl p-4 text-sm space-y-2 border border-border">
            <p className="font-bold text-xs uppercase text-muted-foreground mb-3">Summary</p>
            {[
              ['Title',      form.title],
              ['Category',   form.category],
              ['Difficulty', form.difficulty],
              ['Sections',   sections.length],
              ['Lessons',    sections.reduce((a, s) => a + (s.lessons?.length || 0), 0)],
              ['Price',      parseFloat(form.price) > 0 ? `$${parseFloat(form.price).toFixed(2)}` : 'Free'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-muted-foreground">{k}</span>
                <span className="font-semibold truncate max-w-[200px]">{v}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setTab('curriculum')} className="flex-1 h-11">← Back</Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 h-11 font-bold">
              {saving
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</>
                : <><Save className="h-4 w-4 mr-2" />Save Course</>}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
