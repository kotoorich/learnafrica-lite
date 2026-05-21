import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Trophy, RotateCcw, BookOpen, Award, Download, Share2, Loader2 } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/api';

// ── Inline printable certificate ──────────────────────────────────────────
function InlineCertificate({ certData, user }) {
  return (
    <div id="quiz-cert-print" className="bg-white text-black rounded-2xl overflow-hidden border border-border shadow-lg">
      <style>{`
        @media print {
          body > *:not(#quiz-cert-printroot) { display: none !important; }
          #quiz-cert-printroot { display: block !important; }
          @page { size: A4 landscape; margin: 0; }
        }
      `}</style>
      <div className="h-2 bg-gradient-to-r from-primary via-amber-400 to-primary" />
      <div className="p-6 md:p-10 text-center space-y-4">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-primary">LearnAfrica Lite</p>
        <h2 className="text-3xl md:text-4xl font-serif font-bold tracking-wide text-slate-900">
          Certificate of Completion
        </h2>
        <div className="flex items-center gap-3 justify-center">
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-primary/40" />
          <Award className="h-5 w-5 text-amber-500" />
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-primary/40" />
        </div>
        <div>
          <p className="text-base text-slate-500">This certifies that</p>
          <h3 className="text-2xl md:text-3xl font-serif font-bold text-slate-900 border-b-2 border-slate-800 inline-block px-8 pb-1 mt-2">
            {user?.name || 'Learner'}
          </h3>
        </div>
        <div>
          <p className="text-base text-slate-500">has successfully completed the course</p>
          <p className="text-xl md:text-2xl font-bold text-primary mt-1">{certData.courseName}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-4 py-2">
          <div className="px-4 py-2 rounded-xl bg-slate-50 border text-center">
            <p className="text-xs text-slate-500">Instructor</p>
            <p className="font-semibold text-sm text-slate-800">{certData.instructorName}</p>
          </div>
          <div className="px-4 py-2 rounded-xl bg-slate-50 border text-center">
            <p className="text-xs text-slate-500">Completed</p>
            <p className="font-semibold text-sm text-slate-800">{certData.completionDate}</p>
          </div>
        </div>
        <p className="text-[10px] font-mono text-slate-400">
          ID: {certData.certificateId} · Verify at learnafrica.com/verify
        </p>
      </div>
      <div className="h-2 bg-gradient-to-r from-primary via-amber-400 to-primary" />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export function QuizResultsPage() {
  const { state } = useLocation();
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const printRef  = useRef(null);

  if (!state) { navigate(-1); return null; }

  const {
    answers, questions, score, correctCount, totalQuestions, passed,
    correctAnswers, courseId, lessonId, quizTitle,
    isFinalQuiz, hasCertificate,
  } = state;

  const [certData,    setCertData]    = useState(null);
  const [certLoading, setCertLoading] = useState(false);
  const [certError,   setCertError]   = useState(null);
  const showCertSection = isFinalQuiz && hasCertificate;

  // If final quiz + passed → fetch/issue certificate
  useEffect(() => {
    if (!showCertSection || !passed || !courseId) return;
    setCertLoading(true);
    const token = sessionStorage.getItem('auth_token');
    const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    // Issue (idempotent) then fetch display data
    fetch(`${API_BASE}/api/certificates/${courseId}/issue`,  { method: 'POST', headers: h })
      .then(r => r.json())
      .then(async issueData => {
        const r2 = await fetch(`${API_BASE}/api/certificates/${courseId}`,  { headers: h });
        const d2 = await r2.json();
        const cert = d2.certificate || {};
        cert.certificateId = issueData.cert_id || cert.certificateId;
        setCertData(cert);
      })
      .catch(e => setCertError(e.message))
      .finally(() => setCertLoading(false));
  }, [showCertSection, passed, courseId]);

  const handleDownload = () => {
    // Open the full certificate page for printing
    window.open(`/certificate/${courseId}`, '_blank');
  };

  const isCorrectForQuestion = (q, idx) => {
    const qType = q.question_type || 'mcq';
    const userAns = answers[idx];
    const serverCorrect = correctAnswers ? correctAnswers[idx] : q.correctAnswer;
    if (qType === 'fill_blank') {
      const opts = Array.isArray(q.options) ? q.options : [];
      const correctText = String(opts[Number(serverCorrect)] ?? '').trim().toLowerCase();
      return String(userAns ?? '').trim().toLowerCase() === correctText;
    }
    return Number(userAns) === Number(serverCorrect);
  };

  // "Back to Course" goes back to the exact lesson, not the course overview
  const backToLesson = lessonId
    ? `/learn/course/${courseId}/lesson/${lessonId}`
    : `/courses/${courseId}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* ── Score card ── */}
        <Card className="p-8 text-center space-y-5">
          <div className={cn(
            'inline-flex h-20 w-20 items-center justify-center rounded-full mx-auto',
            passed ? 'bg-success/10' : 'bg-destructive/10'
          )}>
            {passed
              ? <Trophy className="h-10 w-10 text-success" />
              : <XCircle className="h-10 w-10 text-destructive" />}
          </div>

          <div>
            <p className={cn('text-lg font-semibold', passed ? 'text-success' : 'text-destructive')}>
              {passed ? '🎉 Passed!' : 'Keep Learning!'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {passed ? 'You have successfully passed the quiz!' : 'You need 70% to pass. Review and try again.'}
            </p>
          </div>

          {/* Score circle */}
          <div className="relative mx-auto h-36 w-36">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor"
                strokeWidth="10" className="text-muted" />
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor"
                strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${(score || 0) * 2.83} 283`}
                className={passed ? 'text-success' : 'text-destructive'} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold">{score}%</span>
              <span className="text-xs text-muted-foreground">Score</span>
            </div>
          </div>

          {/* Correct / incorrect counts */}
          <div className="flex justify-center gap-8">
            <div className="text-center">
              <p className="text-2xl font-bold text-success">{correctCount}</p>
              <p className="text-sm text-muted-foreground">Correct</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-destructive">{(totalQuestions || 0) - (correctCount || 0)}</p>
              <p className="text-sm text-muted-foreground">Incorrect</p>
            </div>
          </div>

          {quizTitle && <p className="text-xs text-muted-foreground font-medium">{quizTitle}</p>}

          {/* ── Certificate section (final quiz only) ── */}
          {showCertSection && passed && (
            <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-700/40 p-5 space-y-4">
              <div className="flex items-center justify-center gap-2">
                <Award className="h-6 w-6 text-amber-500" />
                <p className="font-bold text-foreground">🎓 Certificate Earned!</p>
              </div>
              <p className="text-sm text-muted-foreground">
                You passed the final exam. Your certificate is ready.
              </p>
              {certLoading ? (
                <div className="flex justify-center py-2">
                  <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                </div>
              ) : certData ? (
                <>
                  {/* Inline certificate preview */}
                  <InlineCertificate certData={certData} user={user} />
                  {/* Download button */}
                  <Button
                    onClick={handleDownload}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white gap-2 font-bold h-12">
                    <Download className="h-5 w-5" /> Download Certificate
                  </Button>
                </>
              ) : certError ? (
                <p className="text-sm text-destructive">{certError}</p>
              ) : null}
            </div>
          )}

          {showCertSection && !passed && (
            <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-4">
              <p className="text-sm font-semibold text-destructive">Final Exam Not Passed</p>
              <p className="text-xs text-muted-foreground mt-1">
                You need 70% to earn the certificate. You scored {score}%. Review the material and try again!
              </p>
            </div>
          )}

          {/* ── Action buttons — Back to Lesson | Download (if cert) | Try Again ── */}
          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            {/* Back to the exact lesson they came from */}
            <Link to={backToLesson} className="flex-1">
              <Button variant="outline" className="w-full gap-2">
                <BookOpen className="h-4 w-4" /> Back to Course
              </Button>
            </Link>

            {/* Download cert shortcut — only if earned */}
            {showCertSection && passed && certData && (
              <Button
                onClick={handleDownload}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white gap-2">
                <Download className="h-4 w-4" /> Download Certificate
              </Button>
            )}

            {/* Try Again */}
            <Button onClick={() => navigate(-1)} variant="outline" className="flex-1 gap-2">
              <RotateCcw className="h-4 w-4" /> Try Again
            </Button>
          </div>
        </Card>

        {/* ── Review answers ── */}
        <h2 className="text-xl font-bold px-1">Review Answers</h2>

        {(questions || []).map((q, idx) => {
          const qType = q.question_type || 'mcq';
          const correct = isCorrectForQuestion(q, idx);
          const serverCorrect = correctAnswers ? Number(correctAnswers[idx]) : Number(q.correctAnswer);
          const userAns = answers[idx];
          const opts = Array.isArray(q.options) ? q.options : [];

          return (
            <Card key={idx} className={cn('p-5 border-l-4',
              correct ? 'border-l-success' : 'border-l-destructive')}>
              <div className="flex items-start gap-3">
                <div className={cn('flex h-7 w-7 items-center justify-center rounded-full shrink-0 mt-0.5',
                  correct ? 'bg-success/10' : 'bg-destructive/10')}>
                  {correct
                    ? <CheckCircle className="h-4 w-4 text-success" />
                    : <XCircle    className="h-4 w-4 text-destructive" />}
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn(
                      'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                      qType === 'mcq'        ? 'bg-primary/10 text-primary'
                        : qType === 'true_false' ? 'bg-blue-500/10 text-blue-600'
                        : 'bg-orange-500/10 text-orange-600'
                    )}>
                      {qType === 'mcq' ? 'MCQ' : qType === 'true_false' ? 'True/False' : 'Fill in Blank'}
                    </span>
                    <p className="font-semibold text-sm">Q{idx + 1}: {q.question || q.question_text}</p>
                  </div>

                  {(qType === 'mcq' || qType === 'true_false') && (
                    <div className="space-y-1.5">
                      {opts.map((opt, oIdx) => {
                        const isCorrectOpt = oIdx === serverCorrect;
                        const isUserOpt    = oIdx === Number(userAns);
                        return (
                          <div key={oIdx} className={cn(
                            'flex items-center gap-2 p-2.5 rounded-lg text-xs border',
                            isCorrectOpt && isUserOpt  ? 'bg-success/10 border-success/30 text-success font-semibold'
                              : isCorrectOpt           ? 'bg-success/10 border-success/30 text-success'
                              : isUserOpt              ? 'bg-destructive/10 border-destructive/30 text-destructive'
                              :                          'bg-muted/30 border-border text-muted-foreground'
                          )}>
                            <span className="font-bold shrink-0">{String.fromCharCode(65 + oIdx)}.</span>
                            <span className="flex-1">{opt}</span>
                            {isCorrectOpt && <span className="shrink-0 font-bold">✓ Correct</span>}
                            {isUserOpt && !isCorrectOpt && <span className="shrink-0 font-bold">✗ Yours</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {qType === 'fill_blank' && (
                    <div className="space-y-1.5 text-sm">
                      <div className={cn('p-2.5 rounded-lg border text-xs',
                        correct
                          ? 'bg-success/10 border-success/30 text-success'
                          : 'bg-destructive/10 border-destructive/30 text-destructive')}>
                        Your answer: <strong>{String(userAns || '(blank)')}</strong>
                      </div>
                      {!correct && (
                        <div className="p-2.5 rounded-lg border bg-success/10 border-success/30 text-success text-xs">
                          Correct answer: <strong>{opts[serverCorrect] ?? ''}</strong>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          );
        })}

        {/* Bottom nav */}
        <div className="pb-8 flex gap-3">
          <Link to={backToLesson} className="flex-1">
            <Button variant="outline" className="w-full h-12">← Back to Course</Button>
          </Link>
          {showCertSection && passed && certData && (
            <Button onClick={handleDownload}
              className="flex-1 h-12 bg-amber-500 hover:bg-amber-600 text-white font-bold gap-2">
              <Download className="h-5 w-5" /> Certificate
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
