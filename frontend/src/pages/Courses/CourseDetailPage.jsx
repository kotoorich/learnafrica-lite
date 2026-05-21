import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Clock, Users, Star, BookOpen, Play, CheckCircle, ChevronDown, ChevronUp,
  Award, Globe, Calendar, AlertCircle, Lock, Loader2, Send,
  HelpCircle, Flag, Download, FileText, File, MapPin
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import CourseCard from '@/components/course/CourseCard';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api';

// ── Section Accordion ──────────────────────────────────────────────────────
function SectionAccordion({ section, course, sectionIndex, allLessons }) {
  const [open, setOpen] = useState(sectionIndex === 0);
  return (
    <Card className="overflow-hidden">
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors text-left">
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="font-medium">{section.title}</p>
            <p className="text-sm text-muted-foreground">
              {(section.lessons || []).length} lesson{(section.lessons || []).length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="h-5 w-5 shrink-0" /> : <ChevronDown className="h-5 w-5 shrink-0" />}
      </button>
      {open && (
        <div className="border-t">
          {(section.lessons || []).map((lesson) => {
            const globalIdx = allLessons.findIndex(l => l.id === lesson.id);
            const locked = globalIdx > 0 && allLessons[globalIdx - 1] && !allLessons[globalIdx - 1].isCompleted;
            const to = lesson.type === 'quiz'
              ? `/learn/course/${course.id}/quiz/${lesson.id}`
              : `/learn/course/${course.id}/lesson/${lesson.id}`;
            return (
              <Link key={lesson.id} to={!locked ? to : '#'}
                onClick={e => locked && e.preventDefault()}
                className={cn(
                  'flex items-center gap-4 p-4 border-b last:border-b-0 transition-colors',
                  locked ? 'opacity-50 cursor-not-allowed bg-muted/20' : 'hover:bg-accent/50'
                )}>
                <div className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full shrink-0',
                  lesson.isCompleted ? 'bg-success text-primary-foreground' : 'bg-muted'
                )}>
                  {lesson.isCompleted  ? <CheckCircle className="h-4 w-4" />
                   : locked            ? <Lock className="h-4 w-4 text-muted-foreground" />
                   : lesson.type === 'quiz' ? <HelpCircle className="h-4 w-4 text-muted-foreground" />
                   : <span className="text-sm font-medium">{globalIdx + 1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('font-medium truncate', locked && 'text-muted-foreground')}>
                    {lesson.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-sm text-muted-foreground">{lesson.duration}</span>
                    {lesson.is_final && (
                      <span className="text-[9px] font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <Flag className="h-2.5 w-2.5" /> Final Exam
                      </span>
                    )}
                  </div>
                </div>
                {locked && <Lock className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
                {!locked && !lesson.isCompleted && <Play className="h-4 w-4 text-primary animate-pulse shrink-0" />}
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Resource icon ──────────────────────────────────────────────────────────
function ResourceIcon({ type }) {
  if (type === 'pdf')  return <FileText className="h-4 w-4 text-red-500 shrink-0" />;
  if (type === 'link') return <Globe    className="h-4 w-4 text-primary shrink-0" />;
  return <File className="h-4 w-4 text-muted-foreground shrink-0" />;
}

// ── Main Page ──────────────────────────────────────────────────────────────
export function CourseDetailPage() {
  const { courseId } = useParams();
  const navigate     = useNavigate();
  const { user, enrollInCourse, isLoading: authLoading, courses, isAuthenticated } = useAuth();

  const [searchParams] = useSearchParams();
  const isPreviewMode = searchParams.get('preview') === '1' && ['instructor','admin','superadmin'].includes(user?.role);
  const [course,          setCourse]          = useState(null);
  const [isLoading,       setIsLoading]       = useState(true);
  const [isEnrolled,      setIsEnrolled]      = useState(false);
  const [progress,        setProgress]        = useState(0);
  const [reviews,         setReviews]         = useState([]);
  const [reviewText,      setReviewText]      = useState('');
  const [selectedRating,  setSelectedRating]  = useState(0);
  const [isSubmitting,    setIsSubmitting]    = useState(false);
  const [reviewError,     setReviewError]     = useState('');
  const [reviewDone,      setReviewDone]      = useState(false);
  const [visibleReviews,  setVisibleReviews]  = useState(3);
  const [enrolling,       setEnrolling]       = useState(false);

  // Scroll to top on course change
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [courseId]);

  // Fetch course from real API
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const token = sessionStorage.getItem('auth_token');
        const res = await fetch(`${API_BASE}/api/courses/${courseId}`, 
          { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!res.ok) throw new Error('Not found');
        setCourse((await res.json()).course);
      } catch { setCourse(null); }
      setIsLoading(false);
    };
    load();
  }, [courseId]);

  // Fetch real reviews
  useEffect(() => {
    fetch(`${API_BASE}/api/courses/${courseId}/reviews`)
      .then(r => r.json()).then(d => setReviews(d.reviews || [])).catch(() => {});
  }, [courseId, reviewDone]);

  // Sync enrollment state from AuthContext
  useEffect(() => {
    if (!course || !user) return;
    const ec = courses.find(c => c.id === courseId);
    setIsEnrolled(!!ec?.isEnrolled);
    setProgress(ec?.progress || 0);
  }, [course, user, courses, courseId]);

  const alreadyReviewed       = reviews.some(r => r.user_id === user?.id);
  const isInstructorOfCourse  = user && course && String(user.id) === String(course.instructor_id);

  const lessons = course?.lessons || [];
  const completedLessonsCount = lessons.filter(l => l.isCompleted).length;
  const displayProgress = isEnrolled
    ? (progress || (lessons.length > 0 ? Math.round((completedLessonsCount / lessons.length) * 100) : 0))
    : 0;

  // Total lesson-level resources across all lessons
  const totalLessonResources = useMemo(() =>
    lessons.reduce((acc, l) => acc + (l.resources?.length || 0), 0),
  [lessons]);

  // Course-level resources
  const courseResources = course?.course_resources || [];

  const isFree = course?.is_free === 1 || course?.is_free === true;

  // Safe resume link — never undefined
  const nextLesson   = lessons.find(l => !l.isCompleted) || lessons[0];
  const resumeTo     = nextLesson
    ? nextLesson.type === 'quiz'
      ? `/learn/course/${courseId}/quiz/${nextLesson.id}`
      : `/learn/course/${courseId}/lesson/${nextLesson.id}`
    : null;

  const buttonText = useMemo(() => {
    if (!user)       return 'Sign in to Enroll';
    if (!isEnrolled) return isFree ? 'Enroll for Free' : 'Buy Now';
    return displayProgress === 100 ? 'Review Course' : 'Continue Learning';
  }, [user, isEnrolled, displayProgress, isFree]);

  const averageRating = useMemo(() => {
    if (reviews.length > 0)
      return (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1);
    // Fall back to the instructor-set rating (default 4.5)
    return course?.rating ? Number(course.rating).toFixed(1) : '4.5';
  }, [reviews, course]);

  const handleEnroll = async () => {
    if (!isAuthenticated) {
      navigate(`/login?returnUrl=${encodeURIComponent(`/courses/${courseId}`)}`);
      return;
    }
    if (!isFree && course.price > 0) {
      navigate(`/payment/${courseId}`);
      return;
    }
    setEnrolling(true);
    try {
      await enrollInCourse(courseId);
      setIsEnrolled(true);
      // Reload course data so sections/lessons show and "Start Learning" works
      const token = sessionStorage.getItem('auth_token');
      const r = await fetch(`${API_BASE}/api/courses/${courseId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (r.ok) {
        const data = await r.json();
        if (data.course) {
          setCourse(data.course);
          const flat = (data.course.sections || []).flatMap(s => s.lessons || []);
          const firstLesson = flat[0];
          if (firstLesson) {
            const path = firstLesson.type === 'quiz'
              ? `/learn/course/${courseId}/quiz/${firstLesson.id}`
              : `/learn/course/${courseId}/lesson/${firstLesson.id}`;
            setTimeout(() => navigate(path), 800);
          } else {
            // No lessons yet - stay on course page, show success message
            setIsEnrolled(true);
          }
        }
      }
    } catch (err) {
      console.error('Enroll error:', err);
      if (err.message?.includes('401')) {
        sessionStorage.removeItem('auth_token');
        navigate(`/login?returnUrl=${encodeURIComponent(`/courses/${courseId}`)}`);
      }
    } finally {
      setEnrolling(false);
    }
  };

  const handleSubmitReview = async () => {
    if (selectedRating === 0) { setReviewError('Please select a star rating.'); return; }
    if (!reviewText.trim())   { setReviewError('Please write a comment.'); return; }
    setIsSubmitting(true); setReviewError('');
    try {
      const token = sessionStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/api/courses/${courseId}/reviews`,  {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating: selectedRating, content: reviewText.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit review');
      setReviewDone(p => !p);
      setReviewText(''); setSelectedRating(0);
    } catch (e) { setReviewError(e.message); }
    setIsSubmitting(false);
  };

  // Related courses
  const relatedCourses = useMemo(() =>
    courses.filter(c => c.id !== courseId && c.category === course?.category).slice(0, 3),
  [courses, courseId, course]);

  if (isLoading || authLoading) return (
    <div className="container py-20 flex justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
  if (!course) return (
    <div className="container py-20 text-center">
      <h2 className="text-2xl font-bold">Course not found</h2>
      <Link to="/courses" className="text-primary mt-4 inline-block hover:underline">← Browse Courses</Link>
    </div>
  );

  return (
    <div className="min-h-screen">

      {/* Preview banner */}
      {isPreviewMode && (
        <div className="bg-primary text-primary-foreground text-xs font-bold text-center py-2 px-4">
          👁 Instructor Preview — This is how your course appears to students. Enrollments and progress are not affected.
        </div>
      )}

      {/* ── Hero ── */}
      <section className="bg-gradient-to-r from-primary/10 via-primary/5 to-background py-12">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 lg:grid-cols-3">

            {/* Course info */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{course.category}</Badge>
                <Badge variant={
                  course.difficulty === 'Beginner' ? 'success' :
                  course.difficulty === 'Intermediate' ? 'warning' : 'destructive'
                }>{course.difficulty}</Badge>
                {isFree && <Badge variant="success">Free</Badge>}
              </div>

              <h1 className="text-3xl lg:text-4xl font-bold leading-tight">{course.title}</h1>
              <p className="text-lg text-muted-foreground">{course.description}</p>

              <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 fill-warning text-warning" />
                  <span className="font-semibold">{course.rating ? Number(course.rating).toFixed(1) : '4.5'}</span>
                  <span className="text-muted-foreground">
                    ({(course.enrollments || 0).toLocaleString()} students)
                  </span>
                </div>
                {course.duration && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />{course.duration}
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <BookOpen className="h-4 w-4" />
                  {lessons.length > 0 ? `${lessons.length} lessons` : 'No lessons available'}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="h-4 w-4" />English
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-muted overflow-hidden border shrink-0">
                  <img src={course.instructor_avatar || '/placeholder-user.jpg'}
                    alt={course.instructor_name} loading="lazy"
                    className="h-full w-full object-cover" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created by</p>
                  <p className="font-medium">{course.instructor_name}</p>
                  {course.instructor_title && (
                    <p className="text-xs text-muted-foreground">{course.instructor_title}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Enroll card */}
            <div className="lg:row-start-1">
              <Card className="sticky top-24 overflow-hidden border-2">
                {/* Thumbnail with play overlay */}
                <div className="aspect-video bg-muted relative">
                  <img src={course.thumbnail || '/placeholder.jpg'} alt={course.title}
                    loading="lazy" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                      <Play className="h-7 w-7 ml-1" />
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  {isPreviewMode ? (
                    /* ── Instructor Preview — show real UI but block actions ── */
                    <>
                      <div className="flex items-baseline gap-2">
                        {isFree
                          ? <span className="text-xl md:text-2xl font-bold text-success">Free</span>
                          : <>
                              <span className="text-xl md:text-2xl font-bold">${course.price}</span>
                              <span className="text-lg text-muted-foreground line-through">
                                ${(course.price * 1.5).toFixed(2)}
                              </span>
                            </>}
                      </div>
                      <div className="relative">
                        <Button className="w-full opacity-60 pointer-events-none" size="lg">
                          {isFree ? 'Enroll for Free' : 'Buy Now'}
                        </Button>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Preview only
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-center text-muted-foreground pt-1">
                        {isFree
                          ? 'Students see a free enroll button here. No enrollment recorded in preview.'
                          : 'Students see a payment button here. No payment is processed in preview.'}
                      </p>
                    </>
                  ) : enrolling ? (
                    <div className="flex flex-col items-center py-4 gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <p className="text-xs text-muted-foreground">Processing enrollment…</p>
                    </div>
                  ) : isEnrolled ? (
                    <>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm font-semibold">
                          <span>Your Progress</span>
                          <span className="text-primary">{displayProgress}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${displayProgress}%` }} />
                        </div>
                      </div>
                      {resumeTo ? (
                        <Link to={resumeTo}>
                          <Button className="w-full" size="lg">{buttonText}</Button>
                        </Link>
                      ) : (
                        <Button className="w-full" size="lg" disabled>No lessons yet</Button>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-2">
                        {isFree
                          ? <span className="text-xl md:text-2xl font-bold text-success">Free</span>
                          : <>
                              <span className="text-xl md:text-2xl font-bold">${course.price}</span>
                              <span className="text-lg text-muted-foreground line-through">
                                ${(course.price * 1.5).toFixed(2)}
                              </span>
                            </>}
                      </div>
                      <Button className="w-full" size="lg" onClick={handleEnroll}>
                        {!user ? 'Sign in to Enroll' : isFree ? 'Enroll for Free' : 'Buy Now'}
                      </Button>
                    </>
                  )}

                  {/* Course includes */}
                  <div className="space-y-3 pt-4 border-t">
                    <h4 className="font-semibold">This course includes:</h4>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className={cn('flex items-center gap-2', lessons.length === 0 && 'opacity-50')}>
                        <Play className="h-4 w-4 text-primary shrink-0" />
                        {lessons.length > 0 ? `${lessons.length} lesson${lessons.length !== 1 ? 's' : ''}` : 'No lessons available'}
                      </li>
                      <li className={cn('flex items-center gap-2', (totalLessonResources + courseResources.length) === 0 && 'opacity-50')}>
                        <BookOpen className="h-4 w-4 text-primary shrink-0" />
                        {(totalLessonResources + courseResources.length) > 0
                          ? `${totalLessonResources + courseResources.length} downloadable resource${(totalLessonResources + courseResources.length) !== 1 ? 's' : ''}`
                          : 'No additional resources'}
                      </li>
                      <li className={cn('flex items-center gap-2', !course.has_certificate && 'opacity-50')}>
                        <Award className="h-4 w-4 text-primary shrink-0" />
                        {course.has_certificate ? 'Certificate of completion' : 'No certificate included'}
                      </li>
                      <li className={cn('flex items-center gap-2', !course.has_lifetime_access && 'opacity-50')}>
                        <Calendar className="h-4 w-4 text-primary shrink-0" />
                        {course.has_lifetime_access ? 'Unlimited lifetime access' : 'Limited time access'}
                      </li>
                    </ul>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <section className="container mx-auto px-4 py-12">
        <div className="flex flex-col gap-8">
          <div className="lg:col-span-2 space-y-8">

            {/* What you'll learn */}
            <Card className="p-6 border-muted/20 bg-card/50">
              <h2 className="text-lg md:text-xl font-bold mb-4">What you'll learn</h2>
              {(course.learningOutcomes || []).length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {course.learningOutcomes.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 group">
                      <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5 transition-transform group-hover:scale-110" />
                      <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                        {item}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground bg-muted/20 p-4 rounded-xl border border-dashed border-muted">
                  <AlertCircle className="h-5 w-5 text-primary/60 shrink-0" />
                  <p className="text-sm italic">Learning objectives have not been listed yet.</p>
                </div>
              )}
            </Card>

            {/* Course Curriculum — real sections from API */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-1 sm:gap-4">
                <h2 className="text-lg md:text-xl font-bold tracking-tight">Course Curriculum</h2>
                <div className="flex items-center gap-1.5 text-xs md:text-sm font-medium text-muted-foreground">
                  <span>{lessons.length} lessons</span>
                  <span className="text-muted-foreground/30">•</span>
                  <span>{completedLessonsCount} completed</span>
                </div>
              </div>

              {lessons.length === 0 ? (
                <div className="text-center py-12 bg-muted/20 rounded-xl border border-dashed border-border">
                  <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground text-sm font-medium">No lessons added yet.</p>
                  <p className="text-muted-foreground/60 text-xs mt-1">Check back soon!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(course.sections || []).map((section, sIdx) => (
                    <SectionAccordion key={section.id || sIdx} section={section}
                      course={course} sectionIndex={sIdx} allLessons={lessons} />
                  ))}
                </div>
              )}
            </div>

            {/* Course-level downloadable resources */}
            {course.has_resources && courseResources.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg md:text-xl font-bold">Course Resources</h2>
                <Card className="divide-y divide-border">
                  {courseResources.map(r => (
                    <a key={r.id} href={r.url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors group">
                      <ResourceIcon type={r.file_type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.title}</p>
                        <p className="text-xs text-muted-foreground uppercase">
                          {r.file_type}{r.file_size ? ` · ${r.file_size}` : ''}
                        </p>
                      </div>
                      <Download className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                    </a>
                  ))}
                </Card>
              </div>
            )}

            {/* Instructor card — real data from API */}
            <Card className="p-5 md:p-8">
              <h2 className="text-lg md:text-xl font-bold mb-6 text-center md:text-left">Your Instructor</h2>
              <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                <div className="shrink-0">
                  <div className="h-24 w-24 md:h-28 md:w-28 rounded-2xl bg-primary/10 overflow-hidden ring-4 ring-background shadow-md">
                    <img src={course.instructor_avatar || '/placeholder-user.jpg'}
                      alt={course.instructor_name} loading="lazy"
                      className="h-full w-full object-cover" />
                  </div>
                </div>
                <div className="flex-1 space-y-4 text-center md:text-left">
                  <div>
                    <h3 className="text-xl md:text-2xl font-bold tracking-tight">{course.instructor_name}</h3>
                    <p className="text-primary font-medium text-sm md:text-base">
                      {course.instructor_title || 'Instructor'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center md:justify-start gap-3 md:gap-6">
                    <div className="flex flex-col sm:flex-row items-center gap-1.5 p-2 rounded-xl bg-muted/50 sm:bg-transparent">
                      <Star className="h-4 w-4 fill-warning text-warning" />
                      <span className="text-xs md:text-sm font-semibold">{averageRating} Rating</span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-1.5 p-2 rounded-xl bg-muted/50 sm:bg-transparent">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs md:text-sm font-semibold">
                        {(course.instructor_total_students || 0).toLocaleString()} Students
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-1.5 p-2 rounded-xl bg-muted/50 sm:bg-transparent col-span-2">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs md:text-sm font-semibold">
                        {course.instructor_total_courses || 1} Course{(course.instructor_total_courses || 1) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  {course.instructor_location && (
                    <div className="flex items-center justify-center md:justify-start gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {course.instructor_location}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-border">
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed text-center md:text-left">
                  {course.instructor_bio || 'No biography available.'}
                </p>
              </div>
            </Card>

            {/* ── Reviews ── */}
            <section className="space-y-6 pt-4 border-t border-border/40">
              <div className="flex items-center justify-between">
                <h2 className="text-lg md:text-xl font-bold tracking-tight">Student Reviews</h2>
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 fill-warning text-warning" />
                  <span className="font-bold">{averageRating}</span>
                  <span className="text-muted-foreground text-sm">
                    ({reviews.length > 0
                      ? reviews.length === 1 ? '1 review' : `${reviews.length} reviews`
                      : 'No reviews yet'})
                  </span>
                </div>
              </div>

              {/* Review form logic — real API */}
              {!user ? (
                <Card className="p-6 border-dashed bg-muted/20 flex flex-col items-center text-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-background flex items-center justify-center border border-border">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Want to leave a review?</p>
                    <p className="text-xs text-muted-foreground">Log in to your account to share your feedback.</p>
                  </div>
                  <Button size="sm" onClick={() => navigate('/login')}>Sign In to Review</Button>
                </Card>
              ) : isInstructorOfCourse ? (
                <Card className="p-6 border border-warning/20 bg-warning/5 flex flex-col items-center text-center gap-2">
                  <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center border border-warning/20 text-warning">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Instructor View</p>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                      You are viewing this course as its instructor. Reviews are reserved for enrolled students.
                    </p>
                  </div>
                </Card>
              ) : isEnrolled && !alreadyReviewed ? (
                <Card className="p-4 bg-primary/5 border-primary/20">
                  <h3 className="font-semibold text-sm mb-3">Rate this course</h3>
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-1">
                      {[1,2,3,4,5].map(s => (
                        <button key={s} type="button"
                          onClick={() => setSelectedRating(s)}
                          disabled={isSubmitting}
                          className="hover:scale-110 transition-transform disabled:opacity-50">
                          <Star className={cn('h-6 w-6 transition-colors',
                            s <= selectedRating ? 'fill-warning text-warning' : 'text-muted-foreground')} />
                        </button>
                      ))}
                    </div>
                    <textarea value={reviewText}
                      onChange={e => setReviewText(e.target.value)}
                      disabled={isSubmitting}
                      placeholder="Share your experience with this course…"
                      className="w-full p-3 rounded-md bg-background border border-border text-sm focus:ring-1 focus:ring-primary outline-none min-h-[100px] resize-none disabled:opacity-50" />
                    {reviewError && <p className="text-sm text-destructive">{reviewError}</p>}
                    <Button className="w-full md:w-fit" size="sm"
                      onClick={handleSubmitReview}
                      disabled={isSubmitting || !selectedRating || !reviewText.trim()}>
                      {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Posting…</> : <><Send className="mr-2 h-3.5 w-3.5" />Submit Review</>}
                    </Button>
                  </div>
                </Card>
              ) : alreadyReviewed ? (
                <div className="text-sm text-muted-foreground italic px-1">
                  You have already reviewed this course. Thank you!
                </div>
              ) : null}

              {/* Reviews list */}
              <div className="space-y-4">
                {reviews.length > 0 ? (
                  <>
                    {reviews.slice(0, visibleReviews).map(r => (
                      <div key={r.id} className="p-4 rounded-xl border border-border/50 bg-card/30">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-bold text-sm">{r.user_name}</p>
                            <div className="flex gap-0.5 mt-1">
                              {[...Array(5)].map((_,i) => (
                                <Star key={i} className={cn('h-3 w-3',
                                  i < r.rating ? 'fill-warning text-warning' : 'text-muted')} />
                              ))}
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground">{r.created_at?.slice(0,10)}</span>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{r.content}</p>
                      </div>
                    ))}
                    {reviews.length > 3 && (
                      <div className="flex justify-center pt-4">
                        {reviews.length > visibleReviews ? (
                          <Button variant="outline" size="sm"
                            onClick={() => setVisibleReviews(p => p + 3)}>
                            Load More Reviews
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm"
                            onClick={() => setVisibleReviews(3)}>
                            Show Less
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 px-4 rounded-2xl border-2 border-dashed border-muted/50 bg-muted/5">
                    <div className="h-12 w-12 rounded-full bg-muted/20 flex items-center justify-center mb-4">
                      <Star className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-muted-foreground">No reviews yet</p>
                    <p className="text-xs text-muted-foreground/60">Be the first to share your thoughts!</p>
                  </div>
                )}
              </div>
            </section>

            {/* Related Courses */}
            {relatedCourses.length > 0 && (
              <div className="space-y-6 pt-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl md:text-2xl font-bold tracking-tight">Related Courses</h2>
                  <Link to="/courses" className="text-sm font-medium text-primary hover:underline">View all</Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {relatedCourses.map(c => (
                    <CourseCard key={c.id} course={c} enrolled={c.isEnrolled || c.progress > 0} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
