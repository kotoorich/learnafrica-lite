import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { BookOpen, Layout, ChevronRight, Loader2, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/common/Card';
import { cn } from '@/lib/utils';
import { useCurriculum } from '@/lib/useCurriculum';
import { CurriculumSection } from './CurriculumSection';
import { useAuth } from '@/context/AuthContext';
import { ImageUpload } from '@/components/common/ImageUpload';
import { API_BASE } from '@/lib/api';

const PRESET_CATEGORIES = [
  'Web Development','Data Science','Mobile Development','Marketing',
  'Design','Cybersecurity','Business','Finance','Health & Wellness',
  'Photography','Music','Language Learning','Personal Development','Other'
];
const DIFFICULTIES = ['Beginner','Intermediate','Advanced'];

const Field = ({ label, error, children }) => (
  <div className="space-y-1.5">
    <label className="text-sm font-semibold text-foreground">{label}</label>
    {children}
    {error && <p className="text-xs text-destructive font-medium">{error}</p>}
  </div>
);

const inputCls = "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary transition-all placeholder:text-muted-foreground/50";

export function CreateCoursePage() {
  const navigate = useNavigate();
  const { refreshCourses } = useAuth();
  const [tab, setTab] = useState('basics');

  const [form, setForm] = useState({
    title: '', description: '', category: '', difficulty: '',
    price: '0', thumbnail: '', durationWeeks: '', initialRating: '4.5', initialReviews: '0',
  });
  const [perks, setPerks] = useState({
    hasCertificate: true, lifetimeAccess: true, hasResources: false,
  });
  const [courseResources, setCourseResources] = useState([]);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [outcomes, setOutcomes] = useState(['']);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const { sections, addSection, removeSection, updateSectionTitle,
          addLesson, updateLesson, removeLesson } = useCurriculum([]);

  // ── validation ─────────────────────────────────────────────────────────────
  const validateBasics = () => {
    const errs = {};
    if (!form.title.trim())       errs.title       = 'Title is required';
    if (!form.description.trim()) errs.description = 'Description is required';
    if (!form.category)           errs.category    = 'Category is required';
    if (!form.difficulty)         errs.difficulty  = 'Difficulty is required';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const isBasicsComplete = form.title && form.description && form.category && form.difficulty;

  // ── handlers ───────────────────────────────────────────────────────────────
  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const addTag = (e) => {
    e?.preventDefault?.();
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags(p => [...p, t]);
    setTagInput('');
  };
  const removeTag = (t) => setTags(p => p.filter(x => x !== t));

  const addOutcome = () => setOutcomes(p => [...p, '']);
  const updateOutcome = (i, v) => setOutcomes(p => p.map((o, idx) => idx === i ? v : o));
  const removeOutcome = (i) => setOutcomes(p => p.filter((_, idx) => idx !== i));

  const goToTab = (t) => {
    if (t === 'curriculum' && !validateBasics()) return;
    setTab(t);
  };

  const handleSubmit = async () => {
    if (!validateBasics()) { setTab('basics'); return; }
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const token = sessionStorage.getItem('auth_token');
      if (!token) throw new Error('Not authenticated. Please log in again.');

      const price = parseFloat(form.price) || 0;
      const payload = {
        title:          form.title.trim(),
        description:    form.description.trim(),
        category:       form.category,
        difficulty:     form.difficulty,
        price,
        is_free:        price === 0,
        thumbnail:      form.thumbnail || '/placeholder.jpg',
        duration_weeks:   parseInt(form.durationWeeks) || 0,
        initial_rating:   parseFloat(form.initialRating) || 4.5,
        initial_reviews:  parseInt(form.initialReviews) || 0,
        tags:           tags.filter(Boolean),
        learningOutcomes: outcomes.filter(o => o.trim()),
        duration:       'TBD',
        hasCertificate:   perks.hasCertificate,
        hasLifetimeAccess: perks.lifetimeAccess,
        hasResources:     perks.hasResources,
        perks: {
          hasCertificate:  perks.hasCertificate,
          lifetimeAccess:  perks.lifetimeAccess,
          hasResources:    perks.hasResources,
        },
        course_resources: courseResources.map(r => ({ title: r.title, url: r.url, file_type: r.file_type })),
        curriculum: sections.map((s, si) => ({
          title:   s.title || `Section ${si + 1}`,
          order:   si,
          lessons: (s.lessons || []).map((l, li) => ({
            title:     l.title  || `Lesson ${li + 1}`,
            type:      l.type   || 'video',
            content:   l.content  || '',
            videoUrl:  l.videoUrl || '',
            duration:  l.duration || '30 min',
            order:     li,
            is_final:  !!l.is_final,
            questions: (l.questions || []).map(q => ({
              text:          q.text          || '',
              options:       q.options       || ['','','',''],
              correctAnswer: q.correctAnswer ?? 0,
            })),
          })),
        })),
      };

      const res = await fetch(`${API_BASE}/api/instructor/courses`,  {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      let respData;
      try { respData = await res.json(); } catch { throw new Error(`Server error (${res.status})`); }

      if (!res.ok) throw new Error(respData.error || `Failed to create course (${res.status})`);

      // Upload any pending video files now that lessons exist in the DB
      const courseId = respData.course_id;
      if (courseId) {
        // Fetch the created course to get real lesson IDs
        const courseRes = await fetch(`${API_BASE}/api/instructor/courses/${courseId}`,  {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (courseRes.ok) {
          const courseData = await courseRes.json();
          const allLessons = (courseData.course?.sections || []).flatMap(s => s.lessons || []);

          // Find lessons with pending video files (blob URLs + _pendingVideoFile)
          const pendingVideos = [];
          sections.forEach(sec => {
            (sec.lessons || []).forEach(lesson => {
              if (lesson._pendingVideoFile) {
                // Match by title since IDs changed
                const savedLesson = allLessons.find(l => l.title === lesson.title && l.type === 'video');
                if (savedLesson) {
                  pendingVideos.push({ lessonId: savedLesson.id, file: lesson._pendingVideoFile });
                }
              }
            });
          });

          // Upload each pending video directly to Flask
          for (const { lessonId, file } of pendingVideos) {
            try {
              const fd = new FormData();
              fd.append('file', file);
              await fetch(`${API_BASE}/api/instructor/lessons/${lessonId}/upload-video`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: fd,
              });
            } catch (e) {
              console.warn('Video upload failed for lesson', lessonId, e.message);
            }
          }
        }
      }

      // Success
      await refreshCourses();
      navigate('/instructor/courses');
    } catch (err) {
      setSubmitError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── tabs ───────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'basics',     label: '1. Basics',     icon: Layout   },
    { id: 'curriculum', label: '2. Curriculum',  icon: BookOpen, needsBasics: true },
    { id: 'finish',     label: '3. Publish',     icon: CheckCircle2, needsBasics: true },
  ];

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl pb-20">
      {/* Header */}
      <div className="mb-6">
        <Link to="/instructor/courses"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to My Courses
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Create New Course</h1>
        <p className="text-sm text-muted-foreground mt-1">Fill in the details, build your curriculum, then publish.</p>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 bg-muted/30 p-1.5 rounded-xl border border-border mb-6 overflow-x-auto">
        {tabs.map(t => {
          const locked = t.needsBasics && !isBasicsComplete;
          const active = tab === t.id;
          return (
            <button key={t.id}
              onClick={() => !locked && goToTab(t.id)}
              disabled={locked}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex-1 justify-center whitespace-nowrap',
                active  ? 'bg-primary text-primary-foreground shadow-sm' :
                locked  ? 'text-muted-foreground/40 cursor-not-allowed' :
                          'text-muted-foreground hover:bg-muted'
              )}>
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── BASICS TAB ── */}
      {tab === 'basics' && (
        <Card className="p-5 sm:p-8 space-y-6">
          <Field label="Course Title *" error={fieldErrors.title}>
            <input className={inputCls} value={form.title}
              onChange={e => { set('title', e.target.value); setFieldErrors(p => ({...p, title: ''})); }}
              placeholder="e.g. Complete Web Development Bootcamp" />
          </Field>

          <Field label="Description *" error={fieldErrors.description}>
            <textarea className={cn(inputCls, 'h-28 resize-none')} value={form.description}
              onChange={e => { set('description', e.target.value); setFieldErrors(p => ({...p, description: ''})); }}
              placeholder="What will students learn? What problems does this course solve?" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Category *" error={fieldErrors.category}>
              <select className={inputCls}
                value={PRESET_CATEGORIES.includes(form.category) ? form.category : (form.category ? '__custom' : '')}
                onChange={e => {
                  setFieldErrors(p => ({...p, category: ''}));
                  if (e.target.value === '__custom') set('category', '');
                  else set('category', e.target.value);
                }}>
                <option value="">Select category…</option>
                {PRESET_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                <option value="__custom">+ Custom category…</option>
              </select>
              {!PRESET_CATEGORIES.includes(form.category) && (
                <input className={cn(inputCls, 'mt-2')}
                  value={form.category}
                  onChange={e => set('category', e.target.value)}
                  placeholder="Type your custom category…" />
              )}
            </Field>
            <Field label="Difficulty *" error={fieldErrors.difficulty}>
              <select className={inputCls} value={form.difficulty}
                onChange={e => { set('difficulty', e.target.value); setFieldErrors(p => ({...p, difficulty: ''})); }}>
                <option value="">Select level…</option>
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Course Thumbnail (optional)">
            <ImageUpload
              value={form.thumbnail}
              onChange={val => set('thumbnail', val)}
            />
          </Field>

          <Field label="Tags (optional)">
            <div className="flex gap-2">
              <input className={cn(inputCls, 'flex-1')} value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="e.g. JavaScript" />
              <Button type="button" variant="outline" onClick={addTag} className="shrink-0">Add</Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map(t => (
                  <span key={t} className="flex items-center gap-1 bg-primary/10 text-primary px-2.5 py-1 rounded-full text-xs font-semibold">
                    {t}
                    <button type="button" onClick={() => removeTag(t)} className="text-primary/60 hover:text-primary ml-0.5">×</button>
                  </span>
                ))}
              </div>
            )}
          </Field>

          <Field label="Learning Outcomes (optional)">
            <div className="space-y-2">
              {outcomes.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input className={cn(inputCls, 'flex-1')} value={o}
                    onChange={e => updateOutcome(i, e.target.value)}
                    placeholder={`Outcome ${i + 1}`} />
                  {outcomes.length > 1 && (
                    <button type="button" onClick={() => removeOutcome(i)}
                      className="text-muted-foreground hover:text-destructive text-lg px-2">×</button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addOutcome}
              className="mt-2 text-xs text-primary hover:underline font-semibold">+ Add outcome</button>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Duration (weeks)">
              <input type="number" min="0" className={inputCls} value={form.durationWeeks}
                onChange={e => set('durationWeeks', e.target.value)}
                placeholder="e.g. 6" />
            </Field>
            <Field label="Initial Rating (0–5 ★)">
              <div className="relative">
                <input type="number" min="0" max="5" step="0.1" className={inputCls}
                  value={form.initialRating}
                  onChange={e => set('initialRating', e.target.value)}
                  placeholder="e.g. 4.5" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-warning">★</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Displayed on the course card. Default is 4.5</p>
            </Field>
            <Field label="Number of Reviews">
              <input type="number" min="0" className={inputCls}
                value={form.initialReviews}
                onChange={e => set('initialReviews', e.target.value)}
                placeholder="e.g. 0" />
              <p className="text-[10px] text-muted-foreground mt-1">Review count shown next to the stars.</p>
            </Field>
            <Field label="Price (USD — set in step 3)">
              <input type="number" min="0" step="0.01" className={inputCls} value={form.price}
                onChange={e => set('price', e.target.value)} placeholder="0.00" />
            </Field>
          </div>
          <Button onClick={() => goToTab('curriculum')} className="w-full h-12" disabled={!isBasicsComplete}>
            Next: Build Curriculum <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </Card>
      )}

      {/* ── CURRICULUM TAB ── */}
      {tab === 'curriculum' && (
        <CurriculumSection
          sections={sections}
          coursePerks={perks}
          updateCoursePerks={setPerks}
          courseResources={courseResources}
          updateCourseResources={setCourseResources}
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

      {/* ── FINISH TAB ── */}
      {tab === 'finish' && (
        <Card className="p-5 sm:p-8 space-y-6 max-w-md mx-auto">
          <div>
            <h2 className="text-lg font-bold">Pricing & Publish</h2>
            <p className="text-sm text-muted-foreground mt-1">Set your price and publish the course.</p>
          </div>

          {submitError && (
            <div className="flex items-start gap-3 p-4 bg-destructive/5 border border-destructive/20 rounded-xl text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <Field label="Price (USD) — enter 0 for free">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
              <input type="number" min="0" step="0.01" value={form.price}
                onChange={e => set('price', e.target.value)}
                className={cn(inputCls, 'pl-7 text-lg font-bold h-12')}
                placeholder="0.00" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {parseFloat(form.price) > 0 ? `Students will pay $${parseFloat(form.price).toFixed(2)}` : 'This course will be free'}
            </p>
          </Field>

          {/* Summary */}
          <div className="bg-muted/30 rounded-xl p-4 space-y-2 text-sm border border-border">
            <p className="font-bold text-xs uppercase text-muted-foreground mb-3">Course Summary</p>
            <div className="flex justify-between"><span className="text-muted-foreground">Title</span><span className="font-medium truncate max-w-[180px]">{form.title}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span className="font-medium">{form.category}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Difficulty</span><span className="font-medium">{form.difficulty}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Sections</span><span className="font-medium">{sections.length}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Lessons</span><span className="font-medium">{sections.reduce((a,s) => a + (s.lessons?.length||0), 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="font-bold">{parseFloat(form.price) > 0 ? `$${parseFloat(form.price).toFixed(2)}` : 'Free'}</span></div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setTab('curriculum')} className="flex-1 h-12">
              ← Back
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1 h-12 font-bold">
              {isSubmitting
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Publishing…</>
                : <><CheckCircle2 className="mr-2 h-4 w-4" />Publish Course</>}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
