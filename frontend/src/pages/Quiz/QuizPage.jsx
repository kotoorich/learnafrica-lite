import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { QuizQuestion } from '@/components/quiz/QuizQuestion';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { API_BASE, parseErr } from '@/lib/api';
import { useCourseTimeTracking } from '@/lib/useCourseTimeTracking';
import { CourseTimeBar } from '@/components/common/CourseTimeBar';
import { EngagementCheckinModal } from '@/components/common/EngagementCheckinModal';

export function QuizPage() {
  const { courseId, lessonId } = useParams();
  const navigate = useNavigate();
  const { updateProgress } = useAuth();

  // Same course-wide minimum-time tracking used on lesson pages, so the
  // indicator (and the 30-minute engagement check-in) is present during
  // quizzes too, not just lessons. This pauses only the minimum-time
  // ticker during a check-in, the quiz's own countdown (timeLeft below)
  // is a separate concern and keeps running regardless.
  const { timeSpent, timeRequired, timeEnforce, showCheckin, confirmContinue } =
    useCourseTimeTracking(courseId, { ready: true });

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [course, setCourse] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinalQuiz,  setIsFinalQuiz]  = useState(false);
  const [timeGate, setTimeGate] = useState(null); // {required_seconds, spent_seconds, message}
  const submittedRef = useRef(false);

  useEffect(() => {
    const fetchQuiz = async () => {
      setIsLoading(true);
      try {
        const token = sessionStorage.getItem('auth_token');
        const headers = token ? { Authorization: 'Bearer ' + token } : {};
        const [quizRes, courseRes] = await Promise.all([
          fetch(`${API_BASE}/api/courses/${courseId}/quizzes/${lessonId}`,  { headers }),
          fetch(`${API_BASE}/api/courses/${courseId}`,  { headers })
        ]);
        if (!quizRes.ok) throw new Error((await parseErr(quizRes, 'Failed to load quiz')) || 'Quiz not found');
        const quizData = await quizRes.json();
        setQuiz(quizData.quiz);
        if (courseRes.ok) {
          const cd = (await courseRes.json()).course;
          setCourse(cd);
          // Find if this specific lesson is the final quiz
          const allLessons = (cd.sections || []).flatMap(s => s.lessons || []);
          const thisLesson = allLessons.find(l => String(l.id) === String(lessonId));
          if (thisLesson) setIsFinalQuiz(!!thisLesson.is_final);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuiz();
  }, [courseId, lessonId]);

  useEffect(() => {
    if (!quiz) return;
    // Prefer the explicit duration_seconds field (modern); fall back to parsing the text duration.
    const explicit = Number(quiz.duration_seconds || quiz.durationSeconds || 0);
    if (explicit > 0) {
      setTimeLeft(explicit);
      return;
    }
    if (quiz.duration && quiz.duration !== 'No limit') {
      const mins = parseInt(quiz.duration);
      if (!isNaN(mins) && mins > 0) setTimeLeft(mins * 60);
    }
  }, [quiz]);

  // Countdown
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || isLoading || isSubmitting) return;
    const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isLoading, isSubmitting]);

  const handleSubmit = async () => {
    if (submittedRef.current || isSubmitting) return;
    submittedRef.current = true;
    setIsSubmitting(true);
    try {
      const token = sessionStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/quizzes/submit`,  {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
        body: JSON.stringify({ quiz_id: quiz.id, answers, course_id: courseId, lesson_id: lessonId })
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 403 && result.error === 'time_gate') {
        // Time gate failed — show modal, don't error out
        setTimeGate({
          required_seconds: result.required_seconds || 0,
          spent_seconds:    result.spent_seconds    || 0,
          message:          result.message          || 'You need more time on this course before taking the final quiz.',
        });
        submittedRef.current = false;
        setIsSubmitting(false);
        return;
      }
      if (response.status === 429 && result.error === 'attempt_limit') {
        // Out of attempts — surface the server's message, don't retry.
        setError(result.message || 'You have used all attempts for this quiz.');
        submittedRef.current = false;
        setIsSubmitting(false);
        return;
      }
      if (!response.ok) throw new Error(result.error || 'Submission failed');
      await updateProgress(courseId, lessonId, result.score);
      navigate(`/learn/course/${courseId}/quiz/${lessonId}/results`, {
        state: {
          answers,
          questions: quiz.questions,
          quizTitle: quiz.title,
          courseId, lessonId,
          score: result.score,
          correctCount: result.correct_count,
          totalQuestions: result.total_questions,
          passed: result.passed,
          correctAnswers: result.correct_answers,
          isFinalQuiz,
          hasCertificate: !!(course?.has_certificate),
        }
      });
    } catch (err) {
      setError(err.message);
      submittedRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Auto-submit when time runs out
  useEffect(() => {
    if (timeLeft === 0 && !submittedRef.current && quiz) {
      handleSubmit();
    }
  }, [timeLeft]);

  const formatTime = (sec) => {
    if (sec === null || sec < 0) return '00:00';
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };

  const handleSelectAnswer = (val) => setAnswers(prev => ({ ...prev, [currentQuestion]: val }));
  const handleNext = () => currentQuestion < questions.length - 1 && setCurrentQuestion(p => p + 1);
  const handlePrev = () => currentQuestion > 0 && setCurrentQuestion(p => p - 1);

  const questions = quiz?.questions || [];
  const answeredCount = Object.keys(answers).length;
  const canSubmit = questions.every((q, idx) => {
    const ans = answers[idx];
    if (ans === undefined || ans === null) return false;
    if ((q.question_type || 'mcq') === 'fill_blank') return String(ans).trim().length > 0;
    return true;
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error || !quiz) return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="p-8 text-center max-w-sm">
        <p className="text-destructive font-medium">{error || 'Quiz not available'}</p>
        <Link to={`/learn/course/${courseId}/lesson/${lessonId}`}><Button className="mt-4">Back to Lesson</Button></Link>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <CourseTimeBar timeSpent={timeSpent} timeRequired={timeRequired} timeEnforce={timeEnforce} />
      <EngagementCheckinModal show={showCheckin} onContinue={confirmContinue} />
      <header className="sticky top-0 z-30 border-b border-border bg-background">
        <div className="flex h-14 items-center justify-between px-4">
          <Link to={`/learn/course/${courseId}/lesson/${lessonId}`} className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
            <ChevronLeft className="h-4 w-4" /> Exit
          </Link>
          <div className="text-center">
            <p className="text-sm font-bold">{quiz.title}</p>
            {course && <p className="text-xs text-muted-foreground">{course.title}</p>}
            {quiz.max_attempts > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {Math.max(0, quiz.max_attempts - (quiz.attempts_used || 0))} of {quiz.max_attempts} attempt{quiz.max_attempts > 1 ? 's' : ''} remaining
              </p>
            )}
          </div>
          <div className={cn('flex items-center gap-2 text-xs bg-muted px-2 py-1 rounded-md',
            timeLeft !== null && timeLeft < 60 && 'text-destructive bg-destructive/10')}>
            <Clock className="h-3.5 w-3.5" />
            {timeLeft !== null ? formatTime(timeLeft) : 'No limit'}
          </div>
        </div>
        <div className="h-1 w-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
        </div>
      </header>

      <div className="container max-w-3xl mx-auto px-4 py-6">
        {/* Question nav dots */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {questions.map((_, idx) => (
            <button key={idx} onClick={() => setCurrentQuestion(idx)}
              className={cn('relative flex h-10 w-10 items-center justify-center rounded-xl text-xs font-bold transition-all',
                currentQuestion === idx ? 'bg-primary text-primary-foreground scale-110' :
                answers[idx] !== undefined ? 'bg-success/10 text-success border border-success/30' :
                'bg-card border border-border')}>
              {idx + 1}
              {answers[idx] !== undefined && currentQuestion !== idx &&
                <CheckCircle2 className="absolute -top-1 -right-1 h-3 w-3 bg-background rounded-full fill-success text-white" />}
            </button>
          ))}
        </div>

        <Card className="p-6 sm:p-10">
          <QuizQuestion
            question={questions[currentQuestion]}
            questionNumber={currentQuestion + 1}
            totalQuestions={questions.length}
            selectedAnswer={answers[currentQuestion]}
            onSelectAnswer={handleSelectAnswer}
          />
          <div className="flex justify-between mt-8 pt-6 border-t">
            <Button variant="ghost" onClick={handlePrev} disabled={currentQuestion === 0}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <span className="text-xs text-muted-foreground self-center">{currentQuestion + 1} / {questions.length}</span>
            {currentQuestion === questions.length - 1 ? (
              <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting} className="bg-primary">
                {isSubmitting ? 'Submitting...' : 'Submit Quiz'}
              </Button>
            ) : (
              <Button onClick={handleNext}>Next <ChevronRight className="h-4 w-4" /></Button>
            )}
          </div>
        </Card>
        {!canSubmit && currentQuestion === questions.length - 1 && (
          <div className="mt-4 p-3 bg-warning/10 text-sm rounded text-center">
            Answer all {questions.length} questions before submitting.
          </div>
        )}

        {/* Time gate modal — only shows if backend returned 403 time_gate */}
        {timeGate && (
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setTimeGate(null)}
          >
            <Card className="max-w-md w-full p-6 sm:p-8 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-center w-14 h-14 mx-auto rounded-full bg-warning/15">
                <Clock className="h-7 w-7 text-warning" />
              </div>
              <div className="text-center space-y-1.5">
                <h2 className="text-xl font-bold">More learning time needed</h2>
                <p className="text-sm text-muted-foreground">
                  {timeGate.message}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 rounded-lg bg-muted/40">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Required</p>
                  <p className="text-lg font-bold tabular-nums">
                    {Math.floor((timeGate.required_seconds || 0) / 60)} min
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/40">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">You have</p>
                  <p className="text-lg font-bold tabular-nums">
                    {Math.floor((timeGate.spent_seconds || 0) / 60)} min
                  </p>
                </div>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Go back to the course lessons and continue learning. Your time accumulates automatically.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setTimeGate(null)}>
                  Close
                </Button>
                <Button className="flex-1" onClick={() => navigate(`/courses/${courseId}`)}>
                  Back to course
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
