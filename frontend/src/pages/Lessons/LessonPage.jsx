import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, CheckCircle, Play, FileText,
  MessageSquare, BookOpen, Clock, Menu, X, Save, Lock,
  FolderOpen, ExternalLink, Download, Image as ImageIcon,
  File, ArrowUpRight, HelpCircle, Loader2, AlertTriangle, Flag
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { DiscussionBoard } from '@/components/lesson/DiscussionBoard';
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

// ── Resource item (teammate's exact component) ────────────────────────────
const ResourceItem = ({ resource }) => {
  const { title, url, type, file_type } = resource;
  const rtype = type || file_type || 'file';

  const handleOpen  = () => window.open(url, '_blank', 'noopener,noreferrer');
  const handleDownload = async (e) => {
    e.preventDefault(); e.stopPropagation();
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl; a.download = title;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(blobUrl);
    } catch {
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.click();
    }
  };

  return (
    <div onClick={handleOpen}
      className="flex items-center justify-between p-4 rounded-lg bg-card/50 border border-border hover:border-primary/50 hover:bg-card transition-all group cursor-pointer">
      <div className="flex items-center gap-4">
        <div className="p-2 rounded bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          {rtype === 'image' && <ImageIcon className="h-5 w-5" />}
          {rtype === 'link'  && <ExternalLink className="h-5 w-5" />}
          {(rtype === 'file' || rtype === 'pdf') && <File className="h-5 w-5" />}
          {!['image','link','file','pdf'].includes(rtype) && <File className="h-5 w-5" />}
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">{title}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{rtype}</p>
        </div>
      </div>
      <div className="flex items-center">
        {rtype === 'link' ? (
          <div className="text-muted-foreground group-hover:text-primary transition-colors">
            <ArrowUpRight className="h-4 w-4" />
          </div>
        ) : (
          <button onClick={handleDownload}
            className="p-2 -mr-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-full transition-all">
            <Download className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};

// ── Sidebar lesson list ───────────────────────────────────────────────────
// Shows sections with nested lessons (from real API)
function SidebarContent({ sections, allLessons, lessonId, courseId, onClose }) {
  const [openSections, setOpenSections] = useState(() => {
    const s = new Set();
    sections.forEach(sec => {
      if ((sec.lessons || []).some(l => String(l.id) === String(lessonId)))
        s.add(sec.id);
    });
    if (s.size === 0 && sections.length > 0) s.add(sections[0].id);
    return s;
  });

  useEffect(() => {
    sections.forEach(sec => {
      if ((sec.lessons || []).some(l => String(l.id) === String(lessonId)))
        setOpenSections(prev => new Set([...prev, sec.id]));
    });
  }, [lessonId, sections]);

  const toggle = (id) => setOpenSections(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const link = (l) => l.type === 'quiz'
    ? `/learn/course/${courseId}/quiz/${l.id}`
    : `/learn/course/${courseId}/lesson/${l.id}`;

  return (
    <div className="space-y-1.5">
      {sections.map(sec => {
        const secLessons = sec.lessons || [];
        const isOpen = openSections.has(sec.id);
        const doneCount = secLessons.filter(l => l.is_completed || l.isCompleted).length;

        return (
          <div key={sec.id}>
            {/* Section header */}
            <button onClick={() => toggle(sec.id)}
              className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-accent/50 transition-colors text-left">
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="flex-1 text-xs font-bold text-foreground truncate">{sec.title}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{doneCount}/{secLessons.length}</span>
              <ChevronRight className={cn('h-3 w-3 text-muted-foreground/60 shrink-0 transition-transform', isOpen && 'rotate-90')} />
            </button>

            {isOpen && secLessons.map((l) => {
              const gIdx = allLessons.findIndex(x => String(x.id) === String(l.id));
              const isDone    = l.is_completed || l.isCompleted;
              const isLocked  = gIdx > 0 && !allLessons[gIdx-1]?.is_completed && !allLessons[gIdx-1]?.isCompleted;
              const isCurrent = String(l.id) === String(lessonId);
              const isQuiz    = l.type === 'quiz';

              return (
                <Link key={l.id}
                  to={isLocked ? '#' : link(l)}
                  onClick={e => { if (isLocked) e.preventDefault(); else onClose?.(); }}
                  className={cn(
                    'flex items-center gap-3 rounded-xl p-3 text-sm transition-all group ml-4',
                    isCurrent  ? 'bg-primary text-primary-foreground shadow-lg'
                      : isLocked ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-accent'
                  )}>
                  <div className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full shrink-0 text-xs font-black transition-colors',
                    isDone     ? 'bg-success text-white'
                      : isCurrent ? 'bg-white text-primary'
                      : 'bg-muted group-hover:bg-background'
                  )}>
                    {isDone     ? <CheckCircle className="h-4 w-4 stroke-[3px]" />
                      : isLocked ? <Lock className="h-3.5 w-3.5" />
                      : isQuiz   ? <HelpCircle className="h-3.5 w-3.5" />
                      : gIdx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-bold tracking-tight leading-tight">{l.title}</p>
                    <p className={cn('text-[10px] mt-0.5 font-medium opacity-70',
                      isCurrent ? 'text-primary-foreground' : 'text-muted-foreground')}>
                      {isQuiz ? 'Quiz' : l.duration || ''}
                      {l.is_final ? ' · Final' : ''}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────
export function LessonPage() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const { user, updateProgress } = useAuth();

  const [lesson,       setLesson]       = useState(null);
  const [sections,     setSections]     = useState([]);
  const [allLessons,   setAllLessons]   = useState([]);
  const [isCompleted,  setIsCompleted]  = useState(false);
  const [showSidebar,  setShowSidebar]  = useState(false);
  const [activeTab,    setActiveTab]    = useState('content');
  const [userNotes,    setUserNotes]    = useState('');
  const [saveStatus,   setSaveStatus]   = useState('idle');
  const [isSaving,     setIsSaving]     = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  // Fetch lesson detail from real API
  useEffect(() => {
    if (!lessonId || lessonId === 'undefined') {
      setError('Invalid lesson'); setLoading(false); return;
    }
    let cancelled = false;
    setLoading(true); setError(null); setActiveTab('content');
    authedFetch(`/api/courses/${courseId}/lessons/${lessonId}`)
      .then(async r => {
        const data = await r.json();
        if (r.status === 403) {
          // Not enrolled — redirect to course page instead of error screen
          if (!cancelled) navigate(`/courses/${courseId}`, { replace: true });
          return null;
        }
        if (!r.ok) throw new Error(data.error || data.message || 'Lesson not found');
        return data;
      })
      .then(d => { if (!cancelled && d) { setLesson(d.lesson); setIsCompleted(!!d.lesson?.isCompleted); } })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [courseId, lessonId]);

  // Fetch course structure (sections + flat lessons for nav)
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    authedFetch(`/api/courses/${courseId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.course) return;
        const secs = (data.course.sections || []).map(s => ({
          ...s,
          lessons: (s.lessons || []).map(l => ({
            ...l, is_completed: l.is_completed || l.isCompleted || false
          }))
        }));
        setSections(secs);
        setAllLessons(secs.flatMap(s => s.lessons));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [courseId]);

  // Keep completed flags in sync after marking complete
  const syncDone = useCallback((lid) => {
    setSections(p => p.map(s => ({ ...s, lessons: s.lessons.map(l =>
      String(l.id) === String(lid) ? { ...l, is_completed: true, isCompleted: true } : l
    )})));
    setAllLessons(p => p.map(l =>
      String(l.id) === String(lid) ? { ...l, is_completed: true, isCompleted: true } : l
    ));
  }, []);

  // Load notes
  useEffect(() => {
    if (user?.id && lessonId) {
      const key = `notes_user_${user.id}_${courseId}_${lessonId}`;
      setUserNotes(localStorage.getItem(key) || '');
    }
  }, [user?.id, courseId, lessonId]);

  const currentIndex = useMemo(
    () => allLessons.findIndex(l => String(l.id) === String(lessonId)),
    [allLessons, lessonId]
  );
  const prevLesson = currentIndex > 0                      ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;
  const currentLessonFinished = isCompleted || lesson?.isCompleted;
  const isQuizLesson = lesson?.type === 'quiz';
  const isLastLesson = currentIndex === allLessons.length - 1 && allLessons.length > 0;

  const handleMarkComplete = async () => {
    if (currentLessonFinished) return;
    setIsSaving(true);
    try {
      await updateProgress(courseId, lessonId);
      setIsCompleted(true);
      setLesson(p => p ? { ...p, isCompleted: true } : p);
      syncDone(lessonId);
    } catch (e) { console.error(e); }
    setIsSaving(false);
  };

  const handleSaveNotes = async () => {
    if (!user?.id) return;
    setSaveStatus('saving');
    const key = `notes_user_${user.id}_${courseId}_${lessonId}`;
    localStorage.setItem(key, userNotes);
    await new Promise(r => setTimeout(r, 800));
    setSaveStatus('success');
    setTimeout(() => setSaveStatus('idle'), 3000);
  };

  // ── Guards ────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (error || !lesson) return (
    <div className="flex flex-col bg-background font-sans antialiased text-foreground">
      <header className="border-b border-border bg-background/95 backdrop-blur p-4">
        <Link to={`/courses/${courseId}`}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
          <ChevronLeft className="h-4 w-4" /> Back to Course
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <h2 className="text-xl font-bold">Lesson Not Available</h2>
          <p className="text-sm text-muted-foreground">{error || 'Could not load this lesson.'}</p>
          <Link to={`/courses/${courseId}`}><Button variant="outline">← Back to Course</Button></Link>
        </div>
      </main>
    </div>
  );

  const embedUrl   = getEmbedUrl(lesson.videoUrl || lesson.video_url || '');
  const isIframe   = embedUrl && (embedUrl.includes('youtube.com/embed') || embedUrl.includes('vimeo.com'));
  const resources  = lesson.resources || [];

  // teammate's nav button classes
  const navBtnClass = "h-11 px-3 sm:px-4 border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-200 flex items-center justify-center gap-2 shrink-0";

  return (
    <div className="flex flex-col bg-background font-sans antialiased text-foreground">

      {/* ── HEADER (teammate's exact sticky header) ── */}
      <header className="border-b border-border bg-card/30">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <Link to={`/courses/${courseId}`}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Course</span>
            </Link>
            <div className="hidden md:block h-4 w-px bg-border" />
            <div className="hidden md:block">
              <p className="text-sm font-semibold truncate max-w-xs">{lesson.courseTitle || ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {allLessons.length > 0 && (
              <span className="text-xs font-bold tabular-nums text-muted-foreground bg-muted px-2 py-1 rounded">
                {currentIndex + 1} / {allLessons.length}
              </span>
            )}
            <Button variant="outline" size="sm"
              onClick={() => setShowSidebar(true)}
              className="lg:hidden h-9 w-9 p-0">
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── MAIN (scrollable) ── */}
        <main className="flex-1 overflow-y-auto outline-none px-4 sm:px-6 lg:px-8 py-6">

          {/* VIDEO */}
          {embedUrl && (
            <div className="aspect-video w-full bg-slate-950 relative shadow-inner rounded-2xl overflow-hidden">
              {isIframe ? (
                <iframe src={embedUrl} className="w-full h-full" allowFullScreen
                  title={lesson.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" />
              ) : (
                <video controls className="w-full h-full object-cover" preload="metadata">
                  <source src={embedUrl} type="video/mp4" />
                </video>
              )}
            </div>
          )}

          <div className="max-w-4xl mx-auto py-8">

            {/* Lesson meta */}
            <div className="mb-10">
              <div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                {lesson.duration && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{lesson.duration}</span>
                  </div>
                )}
                {lesson.is_final && (
                  <span className="flex items-center gap-1.5 text-warning">
                    <Flag className="h-3.5 w-3.5" /> Final Exam
                  </span>
                )}
                {currentLessonFinished && (
                  <span className="flex items-center gap-1.5 text-success">
                    <CheckCircle className="h-3.5 w-3.5" /> Completed
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight mb-4">{lesson.title}</h1>
              {lesson.description && (
                <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-3xl">{lesson.description}</p>
              )}
            </div>

            {/* ── TABS ── */}
            <div className="border-b border-border mb-8 w-full max-w-full overflow-hidden">
              <div className="flex items-center gap-4 sm:gap-10 overflow-x-auto pb-px">
                {['content','resources','notes','discussion'].map(id => (
                  <button key={id} onClick={() => setActiveTab(id)}
                    className={cn(
                      'flex items-center gap-2 pb-4 text-sm font-bold transition-all whitespace-nowrap capitalize border-b-2 tracking-wide shrink-0',
                      activeTab === id
                        ? 'border-primary text-primary translate-y-[1px]'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}>
                    {id === 'content'    && <FileText    className="h-4 w-4 shrink-0" />}
                    {id === 'resources'  && <FolderOpen  className="h-4 w-4 shrink-0" />}
                    {id === 'notes'      && <BookOpen    className="h-4 w-4 shrink-0" />}
                    {id === 'discussion' && <MessageSquare className="h-4 w-4 shrink-0" />}
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

            {/* ── TAB CONTENT ── */}
            <div className="min-h-[300px] leading-relaxed">

              {/* Content */}
              {activeTab === 'content' && (
                <div>
                  {lesson.content ? (
                    <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-p:text-muted-foreground prose-p:leading-7"
                      dangerouslySetInnerHTML={{ __html: lesson.content }} />
                  ) : (
                    <p className="text-muted-foreground italic text-sm">No written content for this lesson.</p>
                  )}
                  {isQuizLesson && !currentLessonFinished && (
                    <div className="mt-6">
                      <Link to={`/learn/course/${courseId}/quiz/${lessonId}`}>
                        <Button size="lg" className="w-full gap-2">
                          <HelpCircle className="h-5 w-5" /> Start Quiz
                        </Button>
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Resources — real lesson resources from API */}
              {activeTab === 'resources' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <h3 className="text-lg font-bold mb-4">Lesson Resources</h3>
                  {resources.length > 0 ? (
                    <div className="space-y-3">
                      {resources.map((res, i) => (
                        <ResourceItem key={res.id || i} resource={res} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 border border-dashed border-border rounded-xl">
                      <Download className="h-8 w-8 mx-auto text-muted-foreground/20 mb-3" />
                      <p className="text-muted-foreground">No resources available for this lesson.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Notes */}
              {activeTab === 'notes' && (
                <Card className="p-6 sm:p-8 border-dashed bg-muted/30 relative overflow-hidden">
                  <div className="flex items-center justify-between mb-4 gap-4">
                    <h3 className="font-bold text-lg tracking-tight text-foreground flex items-center gap-2 shrink-0">
                      <FileText className="h-5 w-5 text-primary" /> Quick Notes
                    </h3>
                    <div className={cn(
                      'flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-full bg-success/10 border border-success/20 transition-all duration-500',
                      saveStatus === 'success' ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
                    )}>
                      <CheckCircle className="h-3.5 w-3.5 text-success" />
                      <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-tight text-success whitespace-nowrap">
                        Saved
                      </span>
                    </div>
                  </div>
                  <div className="relative group">
                    <textarea value={userNotes}
                      onChange={e => { setUserNotes(e.target.value); if (saveStatus === 'success') setSaveStatus('idle'); }}
                      placeholder="Type your study notes here..."
                      className="w-full min-h-[220px] rounded-xl border border-input bg-background/50 px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none resize-none transition-all mb-4 placeholder:text-muted-foreground/50" />
                    {!userNotes.trim() && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-20 transition-opacity group-focus-within:opacity-0">
                        <BookOpen className="h-8 w-8 mb-2" />
                        <p className="text-[10px] font-bold uppercase tracking-widest">Empty Workspace</p>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-center">
                    <Button onClick={handleSaveNotes}
                      disabled={saveStatus === 'saving' || !userNotes.trim()}
                      variant={saveStatus === 'success' ? 'outline' : 'default'}
                      className={cn(
                        'font-bold uppercase tracking-wider text-[10px] sm:text-xs h-10 px-8 flex items-center gap-2 transition-all duration-300',
                        saveStatus === 'success' && 'border-success text-success hover:bg-success/5',
                        !userNotes.trim() && 'opacity-50 cursor-not-allowed grayscale'
                      )}>
                      {saveStatus === 'saving' ? (
                        <><div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" /><span>Syncing...</span></>
                      ) : saveStatus === 'success' ? (
                        <><CheckCircle className="h-3.5 w-3.5" /><span>Changes Saved</span></>
                      ) : (
                        <><Save className="h-3.5 w-3.5" /><span>Save Session Notes</span></>
                      )}
                    </Button>
                  </div>
                </Card>
              )}

              {/* Discussion — real DiscussionBoard */}
              {activeTab === 'discussion' && (
                <DiscussionBoard courseId={courseId} lessonId={lessonId} />
              )}
            </div>

            {/* ── NAV FOOTER (teammate's exact 3-column layout) ── */}
            <div className="mt-16 pt-8 border-t border-border">
              <div className="flex items-center justify-between gap-4">

                {/* Previous */}
                <div className="flex-1 flex justify-start">
                  {prevLesson && (
                    <Link to={`/learn/course/${courseId}/lesson/${prevLesson.id}`}>
                      <Button variant="outline" className={navBtnClass}>
                        <ChevronLeft className="h-5 w-5" />
                        <span className="hidden sm:inline">Previous</span>
                      </Button>
                    </Link>
                  )}
                </div>

                {/* Centre: Mark Complete or status */}
                <div className="flex-1 flex justify-center">
                  {!currentLessonFinished ? (
                    <Button onClick={handleMarkComplete} disabled={isSaving}
                      className="w-full max-w-[180px] h-11 font-bold uppercase tracking-widest text-[10px] sm:text-xs shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                      <CheckCircle className="h-4 w-4 shrink-0" />
                      <span>{isSaving ? 'Saving...' : 'Mark Complete'}</span>
                    </Button>
                  ) : (
                    <div className={cn(
                      'px-4 py-2 rounded-full bg-success/10 border border-success/20 flex items-center gap-2',
                      isLastLesson && 'hidden sm:flex'
                    )}>
                      <CheckCircle className="h-3.5 w-3.5 text-success" />
                      <span className="text-[10px] font-black uppercase tracking-tighter text-success">Finished</span>
                    </div>
                  )}
                </div>

                {/* Next */}
                <div className="flex-1 flex justify-end">
                  <Button variant="outline" className={navBtnClass}
                    onClick={() => nextLesson && navigate(`/learn/course/${courseId}/lesson/${nextLesson.id}`)}
                    disabled={!currentLessonFinished || !nextLesson}>
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>

              </div>
            </div>
          </div>
        </main>

        {/* ── SIDEBAR (teammate's exact right sidebar) ── */}
        <aside className={cn(
          'fixed inset-y-0 right-0 z-40 lg:z-30 w-full sm:w-80 border-l border-border bg-card transition-transform duration-300 lg:static lg:translate-x-0',
          showSidebar ? 'translate-x-0' : 'translate-x-full'
        )}>
          <div className="flex flex-col h-full shadow-2xl lg:shadow-none">
            <div className="flex items-center justify-between p-5 border-b lg:hidden">
              <h3 className="font-bold tracking-tight">Course Content</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowSidebar(false)} className="h-8 w-8 p-0">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <h3 className="font-black text-[10px] uppercase tracking-[0.2em] px-2 hidden lg:block text-muted-foreground">
                Lessons Plan
              </h3>
              {sections.length > 0 ? (
                <SidebarContent
                  sections={sections}
                  allLessons={allLessons}
                  lessonId={lessonId}
                  courseId={courseId}
                  onClose={() => setShowSidebar(false)}
                />
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
              )}
            </div>
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
