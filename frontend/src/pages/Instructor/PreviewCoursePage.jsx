/**
 * InstructorPreviewPage — full course+lesson preview for instructors.
 * Uses dedicated /api/instructor/courses/:id/preview endpoints.
 * No enrollment, no payments, no progress saved, no certificates.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, CheckCircle, Play, FileText,
  MessageSquare, BookOpen, Clock, Menu, X, FolderOpen,
  ExternalLink, Download, File, ArrowUpRight, HelpCircle,
  Loader2, AlertTriangle, Eye, Lock
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { cn } from '@/lib/utils';
import { API_BASE, parseErr } from '@/lib/api';

// ── helpers ───────────────────────────────────────────────────────────────
const getEmbedUrl = (url) => {
  if (!url) return null;
  try {
    if (url.includes('youtube.com/watch')) {
      const id = new URL(url).searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.includes('youtu.be/')) {
      const id = url.split('/').pop().split('?')[0];
      return `https://www.youtube.com/embed/${id}`;
    }
    if (url.includes('vimeo.com/')) {
      const id = url.split('/').pop().split('?')[0];
      return `https://player.vimeo.com/video/${id}`;
    }
  } catch {}
  return url.startsWith('http') ? url : null;
};

const authedFetch = (url) => {
  const token = sessionStorage.getItem('auth_token');
  return fetch(`${API_BASE}${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
};

// ── Preview Banner ────────────────────────────────────────────────────────
function PreviewBanner({ courseTitle, isPaid, price }) {
  return (
    <div className="sticky top-0 z-50 w-full bg-amber-500 text-amber-950 text-xs font-bold px-4 py-2 flex items-center justify-center gap-2 shadow-md">
      <Eye className="h-3.5 w-3.5 shrink-0" />
      <span>
        INSTRUCTOR PREVIEW
        {isPaid && price > 0
          ? ` — This is a paid course ($${price}). Students see a payment flow here. No charges are made in preview.`
          : ' — You are viewing this course as a student would. No progress or certificates are recorded.'}
      </span>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────
function PreviewSidebar({ sections, allLessons, activeLessonId, courseId, onSelect, onClose }) {
  const [openSections, setOpenSections] = useState(() => {
    const s = new Set();
    sections.forEach(sec => {
      if ((sec.lessons || []).some(l => String(l.id) === String(activeLessonId)))
        s.add(sec.id);
    });
    if (s.size === 0 && sections.length > 0) s.add(sections[0].id);
    return s;
  });

  useEffect(() => {
    sections.forEach(sec => {
      if ((sec.lessons || []).some(l => String(l.id) === String(activeLessonId)))
        setOpenSections(prev => new Set([...prev, sec.id]));
    });
  }, [activeLessonId, sections]);

  const toggle = (id) => setOpenSections(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-5 border-b lg:hidden">
        <h3 className="font-bold tracking-tight">Course Content</h3>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <h3 className="font-black text-[10px] uppercase tracking-[0.2em] px-2 hidden lg:block text-muted-foreground">
          Lessons Plan
        </h3>
        {sections.map(sec => {
          const secLessons = sec.lessons || [];
          const isOpen = openSections.has(sec.id);
          return (
            <div key={sec.id}>
              <button onClick={() => toggle(sec.id)}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-accent/50 transition-colors text-left">
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 text-xs font-bold text-foreground truncate">{sec.title}</span>
                <span className="text-[10px] text-muted-foreground">{secLessons.length}</span>
                <ChevronRight className={cn('h-3 w-3 text-muted-foreground/60 shrink-0 transition-transform', isOpen && 'rotate-90')} />
              </button>
              {isOpen && secLessons.map((l, idx) => {
                const gIdx     = allLessons.findIndex(x => String(x.id) === String(l.id));
                const isCurrent = String(l.id) === String(activeLessonId);
                const isQuiz   = l.type === 'quiz';
                return (
                  <button key={l.id}
                    onClick={() => { onSelect(l.id); onClose?.(); }}
                    className={cn(
                      'flex items-center gap-3 rounded-xl p-3 text-sm transition-all group w-full text-left ml-4',
                      isCurrent ? 'bg-primary text-primary-foreground shadow-lg' : 'hover:bg-accent'
                    )}>
                    <div className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full shrink-0 text-xs font-black transition-colors',
                      isCurrent ? 'bg-white text-primary' : 'bg-muted group-hover:bg-background'
                    )}>
                      {isQuiz ? <HelpCircle className="h-3.5 w-3.5" /> : gIdx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-bold tracking-tight leading-tight">{l.title}</p>
                      <p className={cn('text-[10px] mt-0.5 font-medium opacity-70',
                        isCurrent ? 'text-primary-foreground' : 'text-muted-foreground')}>
                        {isQuiz ? 'Quiz' : l.duration || ''}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── Preview Quiz ─────────────────────────────────────────────────────────────
// Instructors can take the quiz in preview, but nothing is saved
function PreviewQuiz({ courseId, lessonId }) {
  const [quiz,     setQuiz]     = useState(null);
  const [answers,  setAnswers]  = useState({});
  const [submitted,setSubmitted]= useState(false);
  const [score,    setScore]    = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [current,  setCurrent]  = useState(0);

  useEffect(() => {
    const token = sessionStorage.getItem('auth_token');
    fetch(`${API_BASE}/api/courses/${courseId}/quizzes/${lessonId}`, 
      { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then(d => setQuiz(d?.quiz || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [courseId, lessonId]);

  const submitPreview = () => {
    if (!quiz?.questions?.length) return;
    let correct = 0;
    quiz.questions.forEach((q, i) => {
      const ua = answers[i];
      if (q.question_type === 'fill_blank') {
        const opts = Array.isArray(q.options) ? q.options : [];
        if (String(ua||'').trim().toLowerCase() === String(opts[Number(q.correct_answer)]||'').trim().toLowerCase()) correct++;
      } else {
        if (Number(ua) === Number(q.correct_answer)) correct++;
      }
    });
    setScore(Math.round((correct / quiz.questions.length) * 100));
    setSubmitted(true);
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary/40" /></div>;
  if (!quiz?.questions?.length) return (
    <div className="p-6 rounded-xl border border-border bg-muted/20 text-center">
      <HelpCircle className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
      <p className="text-sm text-muted-foreground">No questions for this quiz yet.</p>
    </div>
  );

  const q = quiz.questions[current];
  const opts = Array.isArray(q.options) ? q.options : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
        <Eye className="h-4 w-4 text-amber-600 shrink-0" />
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
          Preview Mode — Your answers are not saved or graded in the system.
        </p>
      </div>

      {!submitted ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Question {current + 1} of {quiz.questions.length}</span>
            <span>{quiz.title}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${((current + 1) / quiz.questions.length) * 100}%` }} />
          </div>

          <div className="p-5 rounded-xl border border-border bg-card">
            <p className="font-semibold mb-4">{q.question_text || q.text}</p>
            {q.question_type === 'fill_blank' ? (
              <input value={answers[current] || ''} onChange={e => setAnswers(a => ({...a, [current]: e.target.value}))}
                placeholder="Type your answer…"
                className="w-full border border-input rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary bg-background" />
            ) : (
              <div className="space-y-2">
                {opts.map((opt, oi) => (
                  <button key={oi} onClick={() => setAnswers(a => ({...a, [current]: oi}))}
                    className={cn(
                      'w-full text-left p-3 rounded-lg border text-sm transition-all',
                      answers[current] === oi
                        ? 'border-primary bg-primary/10 font-semibold'
                        : 'border-border hover:border-primary/40 hover:bg-muted/30'
                    )}>
                    <span className="font-bold mr-2">{String.fromCharCode(65 + oi)}.</span>{opt}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            {current > 0 && (
              <Button variant="outline" onClick={() => setCurrent(c => c - 1)} className="flex-1">← Previous</Button>
            )}
            {current < quiz.questions.length - 1 ? (
              <Button onClick={() => setCurrent(c => c + 1)} className="flex-1"
                disabled={answers[current] === undefined}>Next →</Button>
            ) : (
              <Button onClick={submitPreview} className="flex-1 bg-primary"
                disabled={Object.keys(answers).length < quiz.questions.length}>
                Submit Preview
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-center">
          <div className={cn(
            'inline-flex h-20 w-20 items-center justify-center rounded-full mx-auto',
            score >= 70 ? 'bg-success/10' : 'bg-destructive/10'
          )}>
            <span className="text-2xl font-bold">{score}%</span>
          </div>
          <p className="font-bold text-lg">{score >= 70 ? '✅ Would Pass!' : '❌ Would Fail'}</p>
          <p className="text-sm text-muted-foreground">
            {score >= 70
              ? 'Students who score ≥70% on this final exam will earn their certificate.'
              : 'Students need 70% to pass. Consider reviewing the question difficulty.'}
          </p>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
            Preview only — no score was recorded, no certificate issued.
          </div>
          <Button variant="outline" onClick={() => { setSubmitted(false); setAnswers({}); setCurrent(0); setScore(null); }}>
            Retake Preview
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main Preview Page ─────────────────────────────────────────────────────
export function PreviewCoursePage() {
  const { courseId } = useParams();
  const navigate = useNavigate();

  const [course,       setCourse]       = useState(null);
  const [allLessons,   setAllLessons]   = useState([]);
  const [sections,     setSections]     = useState([]);
  const [activeLesson, setActiveLesson] = useState(null);
  const [activeTab,    setActiveTab]    = useState('content');
  const [showSidebar,  setShowSidebar]  = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [lessonLoading,setLessonLoading]= useState(false);
  const [error,        setError]        = useState(null);

  // Load course structure via preview API
  useEffect(() => {
    setLoading(true);
    authedFetch(`/api/instructor/courses/${courseId}/preview`)
      .then(async r => {
        if (!r.ok) throw new Error(await parseErr(r, 'Course not found'));
        return r.json();
      })
      .then(data => {
        const c = data.course;
        setCourse(c);
        const secs = c.sections || [];
        setSections(secs);
        const flat = secs.flatMap(s => s.lessons || []);
        setAllLessons(flat);
        // Auto-load first lesson
        if (flat.length > 0) loadLesson(flat[0].id, courseId);
        else setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [courseId]);

  const loadLesson = useCallback(async (lessonId, cid) => {
    setLessonLoading(true); setActiveTab('content');
    try {
      const r = await authedFetch(`/api/instructor/courses/${cid || courseId}/lessons/${lessonId}/preview`);
      if (!r.ok) throw new Error(await parseErr(r, 'Lesson not found'));
      const data = await r.json();
      setActiveLesson(data.lesson);
    } catch (e) { console.error(e); }
    setLessonLoading(false); setLoading(false);
  }, [courseId]);

  const currentIndex = useMemo(
    () => allLessons.findIndex(l => String(l.id) === String(activeLesson?.id)),
    [allLessons, activeLesson]
  );
  const prevLesson = currentIndex > 0                      ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="text-xl font-bold">Preview Unavailable</h2>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => navigate(-1)}>← Go Back</Button>
      </div>
    </div>
  );

  const isPaid = course && !course.is_free && course.price > 0;
  const embedUrl = activeLesson ? (activeLesson.videoUrl || activeLesson.video_url || '') : '';
  const isIframe = embedUrl && (embedUrl.includes('youtube.com/embed') || embedUrl.includes('youtu.be') || embedUrl.includes('vimeo.com'));
  const embedSrc = (() => {
    if (!embedUrl) return null;
    try {
      if (embedUrl.includes('youtube.com/watch')) {
        const id = new URL(embedUrl).searchParams.get('v');
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (embedUrl.includes('youtu.be/')) return `https://www.youtube.com/embed/${embedUrl.split('/').pop().split('?')[0]}`;
      if (embedUrl.includes('vimeo.com/')) return `https://player.vimeo.com/video/${embedUrl.split('/').pop().split('?')[0]}`;
    } catch {}
    return embedUrl.startsWith('http') ? embedUrl : null;
  })();
  const resources = activeLesson?.resources || [];
  const navBtnClass = "h-11 px-3 sm:px-4 border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200 flex items-center justify-center gap-2 shrink-0";

  return (
    <div className="flex flex-col bg-background font-sans antialiased text-foreground">

      {/* Preview banner */}
      <PreviewBanner courseTitle={course?.title} isPaid={isPaid} price={course?.price} />

      {/* Header */}
      <header className="sticky top-8 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/instructor/courses')}
              className="gap-2 text-muted-foreground hover:text-primary">
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Courses</span>
            </Button>
            <div className="hidden md:block h-4 w-px bg-border" />
            <p className="hidden md:block text-sm font-semibold truncate max-w-xs">{course?.title}</p>
          </div>
          <div className="flex items-center gap-3">
            {allLessons.length > 0 && (
              <span className="text-xs font-bold tabular-nums text-muted-foreground bg-muted px-2 py-1 rounded">
                {currentIndex + 1} / {allLessons.length}
              </span>
            )}
            <div className="hidden lg:flex items-center gap-1.5">
              {prevLesson
                ? <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => loadLesson(prevLesson.id)}><ChevronLeft className="h-4 w-4" /></Button>
                : <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled><ChevronLeft className="h-4 w-4" /></Button>}
              {nextLesson
                ? <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => loadLesson(nextLesson.id)}><ChevronRight className="h-4 w-4" /></Button>
                : <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled><ChevronRight className="h-4 w-4" /></Button>}
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowSidebar(true)}
              className="lg:hidden h-9 w-9 p-0">
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto outline-none px-4 sm:px-6 lg:px-8 py-6">

          {/* Video */}
          {embedSrc && (
            <div className="aspect-video w-full bg-slate-950 relative shadow-inner rounded-2xl overflow-hidden">
              {(embedSrc.includes('youtube.com/embed') || embedSrc.includes('vimeo.com')) ? (
                <iframe src={embedSrc} className="w-full h-full" allowFullScreen
                  title={activeLesson?.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" />
              ) : (
                <video controls className="w-full h-full object-cover" preload="metadata">
                  <source src={embedSrc} type="video/mp4" />
                </video>
              )}
            </div>
          )}

          {lessonLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
            </div>
          ) : activeLesson ? (
            <div className="max-w-4xl mx-auto py-8">

              {/* Lesson meta */}
              <div className="mb-10">
                <div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                  {activeLesson.duration && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{activeLesson.duration}</span>
                    </div>
                  )}
                  {activeLesson.type === 'quiz' && (
                    <span className="flex items-center gap-1.5 text-primary">
                      <HelpCircle className="h-3.5 w-3.5" /> Quiz
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-4">{activeLesson.title}</h1>
                {activeLesson.description && (
                  <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-3xl">{activeLesson.description}</p>
                )}
              </div>

              {/* Tabs */}
              <div className="border-b border-border mb-8">
                <div className="flex items-center gap-4 sm:gap-10 overflow-x-auto pb-px">
                  {['content','resources','notes'].map(id => (
                    <button key={id} onClick={() => setActiveTab(id)}
                      className={cn(
                        'flex items-center gap-2 pb-4 text-sm font-bold transition-all whitespace-nowrap capitalize border-b-2 tracking-wide shrink-0',
                        activeTab === id
                          ? 'border-primary text-primary translate-y-[1px]'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      )}>
                      {id === 'content'   && <FileText   className="h-4 w-4 shrink-0" />}
                      {id === 'resources' && <FolderOpen className="h-4 w-4 shrink-0" />}
                      {id === 'notes'     && <BookOpen   className="h-4 w-4 shrink-0" />}
                      <span>{id}</span>
                      {id === 'resources' && resources.length > 0 && (
                        <span className="ml-0.5 bg-primary/15 text-primary text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                          {resources.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              <div className="min-h-[300px]">

                {activeTab === 'content' && (
                  <div>
                    {activeLesson.content ? (
                      <div className="prose prose-slate dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{ __html: activeLesson.content }} />
                    ) : (
                      <p className="text-muted-foreground italic text-sm">No written content for this lesson.</p>
                    )}
                    {activeLesson.type === 'quiz' && (
                      <PreviewQuiz courseId={courseId} lessonId={activeLesson.id} />
                    )}
                  </div>
                )}

                {activeTab === 'resources' && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-bold mb-4">Lesson Resources</h3>
                    {resources.length > 0 ? resources.map((r, i) => (
                      <div key={r.id || i} onClick={() => window.open(r.url, '_blank')}
                        className="flex items-center justify-between p-4 rounded-lg bg-card/50 border border-border hover:border-primary/50 hover:bg-card transition-all group cursor-pointer">
                        <div className="flex items-center gap-4">
                          <div className="p-2 rounded bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                            <File className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-foreground">{r.title}</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{r.type || r.file_type}</p>
                          </div>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    )) : (
                      <div className="text-center py-10 border border-dashed border-border rounded-xl">
                        <Download className="h-8 w-8 mx-auto text-muted-foreground/20 mb-3" />
                        <p className="text-muted-foreground text-sm">No resources for this lesson.</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'notes' && (
                  <Card className="p-6 border-dashed bg-muted/30">
                    <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                      <Eye className="h-5 w-5 text-amber-500" />
                      <p className="text-sm font-semibold">Preview Mode — Notes are not saved</p>
                    </div>
                    <textarea disabled
                      placeholder="In preview mode, notes are not saved. Students can take notes here when enrolled."
                      className="w-full min-h-[180px] rounded-xl border border-input bg-muted/30 px-4 py-3 text-sm resize-none text-muted-foreground cursor-not-allowed" />
                  </Card>
                )}
              </div>

              {/* Navigation footer */}
              <div className="mt-16 pt-8 border-t border-border">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 flex justify-start">
                    {prevLesson && (
                      <Button variant="outline" className={navBtnClass} onClick={() => loadLesson(prevLesson.id)}>
                        <ChevronLeft className="h-5 w-5" />
                        <span className="hidden sm:inline">Previous</span>
                      </Button>
                    )}
                  </div>
                  {/* Centre — preview mode message instead of Mark Complete */}
                  <div className="flex-1 flex justify-center">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/30">
                      <Eye className="h-3.5 w-3.5 text-amber-600" />
                      <span className="text-[10px] font-black uppercase tracking-tighter text-amber-600">Preview Mode</span>
                    </div>
                  </div>
                  <div className="flex-1 flex justify-end">
                    {nextLesson && (
                      <Button variant="outline" className={navBtnClass} onClick={() => loadLesson(nextLesson.id)}>
                        <span className="hidden sm:inline">Next</span>
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-24 text-center px-6">
              <BookOpen className="h-12 w-12 text-muted-foreground/20 mb-4" />
              <p className="font-semibold text-muted-foreground">No lessons in this course yet.</p>
              <Button variant="outline" className="mt-6" onClick={() => navigate(`/instructor/courses/edit/${courseId}`)}>
                Add Lessons
              </Button>
            </div>
          )}
        </main>

        {/* Sidebar */}
        <aside className={cn(
          'fixed inset-y-0 right-0 z-40 lg:z-30 w-full sm:w-80 border-l border-border bg-card transition-transform duration-300 lg:static lg:translate-x-0',
          showSidebar ? 'translate-x-0' : 'translate-x-full'
        )}>
          <div className="flex flex-col h-full shadow-2xl lg:shadow-none">
            <PreviewSidebar
              sections={sections}
              allLessons={allLessons}
              activeLessonId={activeLesson?.id}
              courseId={courseId}
              onSelect={(id) => loadLesson(id)}
              onClose={() => setShowSidebar(false)}
            />
          </div>
        </aside>
        {showSidebar && (
          <div className="fixed inset-0 z-10 bg-background/60 backdrop-blur-sm lg:hidden"
            onClick={() => setShowSidebar(false)} />
        )}
      </div>
    </div>
  );
}
