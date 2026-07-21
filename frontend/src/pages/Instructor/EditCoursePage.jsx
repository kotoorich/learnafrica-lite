import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Switch } from '@/components/common/Switch';
import { TimePicker, formatDuration } from '@/components/common/TimePicker';
import { cn } from '@/lib/utils';
import { ImageUpload } from '@/components/common/ImageUpload';
import { CurriculumSection } from './CurriculumSection';
import LiveSessionsSection from '@/components/common/LiveSessionsSection';
import { API_BASE } from '@/lib/api';
import { PRESET_CATEGORIES, DIFFICULTIES } from '@/lib/categories';
import { formatPrice } from '@/lib/money';
import { safeStringify } from '@/lib/safeStringify';


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
    courseCode: '',
  });
  const [perks,    setPerks]    = useState({ hasCertificate: true, lifetimeAccess: true, hasResources: false });
  const [minTimeSeconds, setMinTimeSeconds] = useState(0);
  const [enforceMinTime, setEnforceMinTime] = useState(false);
  const [weeksRequired, setWeeksRequired] = useState(0);
  const [hoursRequiredSeconds, setHoursRequiredSeconds] = useState(0);
  const [tags,     setTags]     = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [outcomes, setOutcomes] = useState(['']);
  const [sections, setSections] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(false);

  // Live auto-sum of every lesson's duration_seconds (updates as instructor edits).
  // MUST come after `sections` declaration (temporal dead zone).
  const computedHoursSeconds = useMemo(() => {
    return sections.reduce((tot, sec) => {
      const lessonsSec = (sec.lessons || []).reduce(
        (s, l) => s + Number(l.duration_seconds || 0), 0
      );
      return tot + lessonsSec;
    }, 0);
  }, [sections]);

  // Section/lesson helpers
  const addSection = () =>
    setSections(p => [...p, { id: crypto.randomUUID(), title: '', lessons: [] }]);
  const removeSection = (id) =>
    setSections(p => p.filter(s => s.id !== id));
  const updateSectionTitle = (id, t) =>
    setSections(p => p.map(s => s.id === id ? { ...s, title: t } : s));
  const addLesson = (sId, type = 'video') =>
    setSections(p => p.map(s => s.id === sId
      ? { ...s, lessons: [...s.lessons, {
          id: crypto.randomUUID(),
          title: type === 'quiz' ? 'New Quiz' : 'New Lesson',
          type,
          videoUrl: '',
          duration: '',
          content: '',
          questions: type === 'quiz' ? [] : undefined,
          resources: []
        }] }
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
          courseCode: c.course_code || c.courseCode || '',
        });
        setTags(c.tags || []);
        setOutcomes((c.learningOutcomes || []).length ? c.learningOutcomes : ['']);
        if (c.perks) setPerks(c.perks);
        setMinTimeSeconds(Number(c.min_time_seconds || 0));
        setEnforceMinTime(!!c.enforce_min_time);
        setWeeksRequired(Number(c.weeks_required || c.duration_weeks || 0));
        setHoursRequiredSeconds(Number(c.hours_required_seconds || 0));
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
              text_content: les.text_content || les.textContent || '',
              duration_seconds: Number(les.duration_seconds || 0),
              is_final: les.is_final || false,
              component_key: les.component_key || les.componentKey || '',
              componentKey:  les.component_key || les.componentKey || '',
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
        course_code: (form.courseCode || '').trim() || null,
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
            text_content: l.text_content || l.textContent || '',
            duration_seconds: Number(l.duration_seconds || 0),
            is_final: l.is_final || false,
            order: li,
            component_key: l.component_key || l.componentKey || null,
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
        min_time_seconds: minTimeSeconds,
        enforce_min_time: enforceMinTime,
        weeks_required: weeksRequired,
      };
      await apiFetch(`/api/instructor/courses/${courseId}`, { method: 'PUT', body: safeStringify(payload) });
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
            {/* Category with custom-category support */}
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Category</label>
              <select className={inputCls}
                value={PRESET_CATEGORIES.includes(form.category) ? form.category : (form.category ? '__custom' : '')}
                onChange={e => {
                  if (e.target.value === '__custom') setField('category', '');
                  else setField('category', e.target.value);
                }}>
                <option value="">Select…</option>
                {PRESET_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                <option value="__custom">+ Custom category…</option>
              </select>
              {form.category && !PRESET_CATEGORIES.includes(form.category) && (
                <input className={inputCls + ' mt-2'}
                  value={form.category}
                  onChange={e => setField('category', e.target.value)}
                  placeholder="Type your custom category…" />
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Difficulty</label>
              <select className={inputCls} value={form.difficulty}
                onChange={e => setField('difficulty', e.target.value)}>
                <option value="">Select…</option>
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Course Code (optional)</label>
            <input
              type="text"
              className={inputCls}
              value={form.courseCode}
              onChange={e => setField('courseCode', e.target.value)}
              placeholder="e.g. WEB-101, PYDS-201"
              maxLength={40}
            />
            <p className="text-[10px] text-muted-foreground">
              Short identifier. Leave blank if you don't need one.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Course Thumbnail</label>
            <ImageUpload value={form.thumbnail} onChange={val => setField('thumbnail', val)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Rating (0–5 ★)</label>
              <div className="relative">
                <input type="text" inputMode="decimal" min="0" max="5" step="0.1" className={inputCls}
                  value={form.rating} onChange={e => setField('rating', e.target.value)} placeholder="4.5" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-warning">★</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase text-muted-foreground">Review Count</label>
              <input type="text" inputMode="numeric" min="0" className={inputCls}
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

          {/* ── Course time settings ────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Weeks required</label>
              <input type="text" inputMode="numeric" min="0" className={inputCls} value={weeksRequired}
                onChange={e => setWeeksRequired(Math.max(0, parseInt(e.target.value) || 0))}
                placeholder="e.g. 8" />
              <p className="text-[10px] text-muted-foreground">Shown to students as the recommended course length.</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Hours required (auto)</label>
              <div className="h-10 px-3 rounded-lg bg-muted/40 border border-border flex items-center text-sm font-bold tabular-nums">
                {formatDuration(computedHoursSeconds) || '0 min'}
              </div>
              <p className="text-[10px] text-muted-foreground">Sum of every lesson's duration. Edit each lesson's time picker to change.</p>
            </div>
          </div>

          {/* ── Minimum learning time gate ──────────────────────────── */}
          <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold">Enforce minimum learning time</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When ON, students must spend at least this much time on the course before they can take the final quiz.
                </p>
              </div>
              <Switch
                checked={enforceMinTime}
                onChange={v => {
                  setEnforceMinTime(v);
                  if (v && minTimeSeconds === 0) setMinTimeSeconds(1800);
                }}
              />
            </div>
            {enforceMinTime && (
              <div className="flex flex-col items-center sm:items-start gap-2">
                <div className="flex justify-center sm:justify-start w-full">
                  <TimePicker value={minTimeSeconds} onChange={setMinTimeSeconds} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Students must spend at least <span className="font-bold text-foreground">{formatDuration(minTimeSeconds)}</span> on this course before unlocking the final quiz.
                </p>
              </div>
            )}
          </div>

          <Button onClick={() => setTab('curriculum')} className="w-full h-11">Next: Curriculum →</Button>
        </Card>
      )}

      {/* CURRICULUM */}
      {tab === 'curriculum' && (
        <>
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
        {/* Live cohort sessions */}
        <Card className="p-4 sm:p-6 mt-4">
          <LiveSessionsSection courseId={courseId} mode="instructor" />
        </Card>
        </>
      )}

      {/* FINISH */}
      {tab === 'finish' && (
        <Card className="p-6 space-y-5">
          <h2 className="text-lg font-bold">Pricing &amp; Publish</h2>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">Price (GH₵) — 0 for free</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
              <input type="text" inputMode="decimal" min="0" step="0.01"
                className={cn(inputCls, 'pl-7 text-lg font-bold h-12')}
                value={form.price} onChange={e => setField('price', e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              {parseFloat(form.price) > 0
                ? `Students pay ${formatPrice(parseFloat(form.price))}`
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
              ['Price',      parseFloat(form.price) > 0 ? `${formatPrice(parseFloat(form.price))}` : 'Free'],
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
