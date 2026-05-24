import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/common/Button';
import { Share2, Download, ArrowLeft, Linkedin, Twitter, Facebook, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { API_BASE } from '@/lib/api';

const PrintableCertificate = ({ data, user }) => (
  <div className="hidden print:block fixed inset-0 z-[9999] h-screen w-screen overflow-hidden bg-white text-black">
    <style dangerouslySetInnerHTML={{ __html: `@media print { @page { size: A4 landscape; margin: 0 !important; } html, body { margin: 0 !important; padding: 0 !important; width: 100%; height: 100%; overflow: hidden; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }` }} />
    <div className="box-border flex h-full w-full items-center justify-center p-6">
      <div className="relative flex h-[95%] w-[98%] flex-col overflow-hidden rounded-sm border-[14px] border-double border-slate-900 bg-white px-10 py-8 text-center shadow-none">
        <div className="absolute inset-6 border border-slate-200 pointer-events-none" />
        <div className="absolute left-8 top-8 h-12 w-12 border-l-4 border-t-4 border-primary/60" />
        <div className="absolute right-8 top-8 h-12 w-12 border-r-4 border-t-4 border-primary/60" />
        <div className="absolute bottom-8 left-8 h-12 w-12 border-b-4 border-l-4 border-primary/60" />
        <div className="absolute bottom-8 right-8 h-12 w-12 border-b-4 border-r-4 border-primary/60" />

        <div className="relative z-10 flex flex-col items-center pt-2">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-primary">LearnAfrica Lite</p>
          <h1 className="font-serif text-5xl font-bold uppercase tracking-[0.15em] text-slate-900">Certificate of Completion</h1>
          <div className="mt-4 h-px w-48 bg-gradient-to-r from-transparent via-slate-400 to-transparent" />
          <p className="mt-4 text-lg italic text-slate-600">Awarded in recognition of outstanding course completion</p>
        </div>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-10">
          <p className="text-lg text-slate-700">This certifies that</p>
          <h2 className="my-5 inline-block border-b-4 border-slate-900 px-16 pb-2 font-serif text-5xl font-bold leading-tight text-slate-900">{user?.name || 'Authorized Learner'}</h2>
          <p className="text-lg text-slate-700">has successfully completed all course requirements for</p>
          <h3 className="mt-4 max-w-5xl font-serif text-4xl font-bold leading-tight text-primary">{data.courseName}</h3>
          <p className="mt-5 max-w-4xl text-sm leading-relaxed text-slate-500">This certificate acknowledges the recipient's dedication, consistent effort, and demonstrated mastery of the course material.</p>
        </div>

        <div className="relative z-10 mt-4">
          <div className="flex w-full items-end justify-between gap-10 px-8">
            <div className="flex flex-1 flex-col items-center">
              <p className="w-56 border-b border-slate-900 pb-1 font-serif text-xl italic text-slate-900">{data.instructorName}</p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Course Instructor</p>
            </div>
            <div className="mx-6 flex shrink-0 flex-col items-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-primary text-primary">
                <div className="text-center text-[8px] font-bold uppercase leading-tight tracking-wide">LearnAfrica<br/>Lite<br/>Official<br/>Seal</div>
              </div>
            </div>
            <div className="flex flex-1 flex-col items-center">
              <p className="w-56 border-b border-slate-900 pb-1 text-xl font-semibold text-slate-900">{data.completionDate}</p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Date Issued</p>
            </div>
          </div>
          <div className="mt-6 border-t border-slate-200 pt-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-slate-500">Certificate ID: {data.certificateId} • Verify at LEARNAFRICA.COM/VERIFY</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default function CertificatePage() {
  const { courseId } = useParams();
  const { user } = useAuth();
  const [courseData, setCourseData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCertificate = async () => {
      setIsLoading(true);
      try {
        const token = sessionStorage.getItem('auth_token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        // Fetch certificate data
        const response = await fetch(`${API_BASE}/api/certificates/${courseId}`,  { headers });
        if (!response.ok) {
          throw new Error(response.status === 403
            ? 'You must complete this course to view the certificate'
            : 'Certificate not found');
        }
        const data = await response.json();
        const cert = data.certificate;

        // Register / retrieve the persistent certificate ID for verification
        if (token) {
          try {
            const issueRes = await fetch(`${API_BASE}/api/certificates/${courseId}/issue`,  {
              method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
            });
            if (issueRes.ok) {
              const issueData = await issueRes.json();
              cert.certificateId = issueData.cert_id;
            }
          } catch {}
        }
        setCourseData(cert);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchCertificate();
  }, [courseId]);

  const handleDownload = () => {
    window.print();
  };

  const handleShare = async () => {
    const shareData = {
      title: `My ${courseData?.courseName} Certificate`,
      text: `I just completed ${courseData?.courseName} on LearnAfrica!`,
      url: window.location.href,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      alert('Certificate link copied to clipboard!');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your certificate...</p>
        </div>
      </div>
    );
  }

  if (error || !courseData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <div className="w-20 h-20 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <svg className="w-10 h-10 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold">Certificate Unavailable</h2>
          <p className="text-muted-foreground">{error || 'Complete the course first to earn your certificate.'}</p>
          <Link to="/dashboard">
            <Button>Go to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen print:bg-white">
      <div className="print:hidden bg-gradient-to-br from-primary/5 via-background to-accent/5 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
            <Link to="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" onClick={handleShare} className="rounded-xl"><Share2 className="w-4 h-4 mr-2" />Share</Button>
              <Button onClick={handleDownload} className="rounded-xl shadow-sm"><Download className="w-4 h-4 mr-2" />Download PDF</Button>
            </div>
          </div>

          <div id="certificate-content" className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
            <div className="h-3 bg-gradient-to-r from-primary via-accent to-primary" />
            <div className="p-6 md:p-12 text-center">
              <div className="mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/20 mb-4">
                  <svg className="w-10 h-10 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222" />
                  </svg>
                </div>
                <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground tracking-wide">Certificate of Completion</h1>
                <p className="text-muted-foreground mt-2 text-lg">LearnAfrica Lite</p>
                <div className="flex items-center gap-4 justify-center mt-6">
                  <div className="h-px w-24 bg-gradient-to-r from-transparent to-primary/50" />
                  <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                  <div className="h-px w-24 bg-gradient-to-l from-transparent to-primary/50" />
                </div>
              </div>

              <p className="text-lg text-muted-foreground mb-2">This certifies that</p>
              <h2 className="text-3xl md:text-4xl font-serif font-bold text-primary mb-6 border-b-2 border-primary/30 pb-4 inline-block px-8">{user?.name || 'Authorized Learner'}</h2>
              <p className="text-lg text-muted-foreground mb-2">has successfully completed the course</p>
              <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-6">{courseData.courseName}</h3>

              <div className="flex flex-wrap justify-center gap-4 md:gap-6 mb-8">
                <div className="px-5 py-3 bg-muted/50 rounded-xl border border-border/50">
                  <p className="text-sm text-muted-foreground">Grade Achieved</p>
                  <p className="text-2xl font-bold text-primary">A</p>
                </div>
                <div className="px-5 py-3 bg-muted/50 rounded-xl border border-border/50">
                  <p className="text-sm text-muted-foreground">Hours Completed</p>
                  <p className="text-2xl font-bold text-foreground">24</p>
                </div>
                <div className="px-5 py-3 bg-muted/50 rounded-xl border border-border/50">
                  <p className="text-sm text-muted-foreground">Completion Date</p>
                  <p className="text-lg font-semibold text-foreground">{courseData.completionDate}</p>
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 pt-8 border-t border-border">
                <div className="text-center">
                  <div className="font-serif text-2xl italic text-primary mb-2">{courseData.instructorName}</div>
                  <div className="h-px w-40 bg-foreground mx-auto mb-1" />
                  <p className="text-sm text-muted-foreground">Course Instructor</p>
                </div>
                <div className="flex items-center justify-center w-20 h-20 rounded-full border-4 border-primary/20 bg-gradient-to-br from-primary/10 to-accent/10">
                  <div className="text-center"><div className="text-sm font-bold text-primary">LA</div><div className="text-[8px] uppercase font-semibold tracking-wide text-muted-foreground">Official</div></div>
                </div>
                <div className="text-center">
                  <div className="font-serif text-2xl italic text-primary mb-2">LearnAfrica Team</div>
                  <div className="h-px w-40 bg-foreground mx-auto mb-1" />
                  <p className="text-sm text-muted-foreground">Platform Director</p>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-border text-center">
                <p className="text-xs text-muted-foreground">Certificate ID: <span className="font-mono font-semibold">{courseData.certificateId}</span></p>
                <p className="text-xs text-muted-foreground mt-1">Verify at: learnafrica.com/verify/{courseData.certificateId}</p>
              </div>
            </div>
            <div className="h-3 bg-gradient-to-r from-primary via-accent to-primary" />
          </div>

          <div className="mt-8 text-center">
            <p className="text-muted-foreground mb-4 text-sm">Share your achievement</p>
            <div className="flex justify-center gap-4">
              <Link to="#" className="p-3 bg-card border border-border rounded-xl hover:bg-muted transition-colors text-foreground group shadow-sm"><Linkedin className="w-5 h-5 group-hover:text-[#0A66C2]" /></Link>
              <Link to="#" className="p-3 bg-card border border-border rounded-xl hover:bg-muted transition-colors text-foreground group shadow-sm"><Twitter className="w-5 h-5 group-hover:text-[#1DA1F2]" /></Link>
              <Link to="#" className="p-3 bg-card border border-border rounded-xl hover:bg-muted transition-colors text-foreground group shadow-sm"><Facebook className="w-5 h-5 group-hover:text-[#1877F2]" /></Link>
            </div>
          </div>
        </div>
      </div>

      <PrintableCertificate data={courseData} user={user} />
    </div>
  );
}