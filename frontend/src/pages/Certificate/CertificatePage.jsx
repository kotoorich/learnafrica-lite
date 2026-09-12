import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/common/Button';
import { useToast } from '../../components/common/Toast';
import { Share2, Download, ArrowLeft, Linkedin, Twitter, Facebook, Loader2, Pencil, Check, X, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { API_BASE } from '@/lib/api';

/**
 * CertificateDocument — the SINGLE source of truth for what a certificate
 * looks like. Previously this file had two independently-styled copies
 * (one for on-screen preview, a second "PrintableCertificate" only shown
 * via print CSS) that could silently drift apart. There is now exactly one
 * copy of the certificate markup; print vs screen differences are handled
 * with Tailwind's print: variants on the SAME elements, so the content
 * (name, course, instructor, date, certificate ID) can never differ between
 * what you see and what you download, because it's the same DOM.
 */
function CertificateDocument({ data, displayName }) {
  return (
    <div
      id="certificate-content"
      className="relative bg-white text-slate-900 border-[6px] border-double border-slate-900 rounded-sm overflow-hidden
                 print:static print:mx-auto print:my-0 print:w-full print:max-w-none print:h-auto print:border-[10px] print:rounded-none"
      style={{ aspectRatio: '1.414 / 1' }}
    >
      {/* FIX for mobile "overlapping onto a second page": the old version
          forced @page size to A4 landscape and sized this box with
          print:h-screen/print:w-screen. Many mobile browsers (Android
          Chrome's PDF export, iOS Safari) don't reliably honor a forced
          landscape orientation, they often print portrait regardless. A
          landscape-shaped, full-viewport-sized box then no longer fits the
          narrower portrait page it actually got, and overflows onto a
          second page. This version doesn't force an orientation at all
          (size: auto lets the device decide) and instead uses a fixed
          aspect-ratio box that scales itself down to fit whatever single
          page width it's actually given, on any device. */}
      <style dangerouslySetInnerHTML={{ __html: `@media print { @page { size: auto; margin: 8mm; } html, body { margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }` }} />
      <div className="absolute inset-4 border border-slate-200 pointer-events-none print:inset-3" />
      <div className="absolute left-5 top-5 h-10 w-10 border-l-4 border-t-4 border-primary/60 print:left-6 print:top-6 print:h-8 print:w-8" />
      <div className="absolute right-5 top-5 h-10 w-10 border-r-4 border-t-4 border-primary/60 print:right-6 print:top-6 print:h-8 print:w-8" />
      <div className="absolute bottom-5 left-5 h-10 w-10 border-b-4 border-l-4 border-primary/60 print:bottom-6 print:left-6 print:h-8 print:w-8" />
      <div className="absolute bottom-5 right-5 h-10 w-10 border-b-4 border-r-4 border-primary/60 print:bottom-6 print:right-6 print:h-8 print:w-8" />

      <div className="relative z-10 flex flex-col items-center px-6 py-10 sm:px-12 sm:py-14 text-center">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-primary">LearnAfrica Lite</p>
        <h1 className="font-serif text-3xl sm:text-5xl font-bold uppercase tracking-[0.1em] sm:tracking-[0.15em] text-slate-900">
          Certificate of Completion
        </h1>
        <div className="mt-4 h-px w-40 sm:w-48 bg-gradient-to-r from-transparent via-slate-400 to-transparent" />
        <p className="mt-4 text-sm sm:text-lg italic text-slate-600">
          Awarded in recognition of outstanding course completion
        </p>

        <p className="mt-8 text-base sm:text-lg text-slate-700">This certifies that</p>
        <h2 className="my-4 inline-block border-b-4 border-slate-900 px-6 sm:px-16 pb-2 font-serif text-3xl sm:text-5xl font-bold leading-tight text-slate-900">
          {displayName}
        </h2>
        <p className="text-base sm:text-lg text-slate-700">has successfully completed all course requirements for</p>
        <h3 className="mt-3 max-w-3xl font-serif text-xl sm:text-4xl font-bold leading-tight text-primary">
          {data.courseName}
        </h3>

        <div className="mt-8 flex w-full flex-col sm:flex-row items-center justify-between gap-8 sm:gap-10 sm:px-8">
          <div className="flex flex-1 flex-col items-center">
            <p className="w-44 sm:w-56 border-b border-slate-900 pb-1 font-serif text-base sm:text-xl italic text-slate-900">
              {data.instructorName}
            </p>
            <p className="mt-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Course Instructor</p>
          </div>
          <div className="flex shrink-0 flex-col items-center">
            <div className="flex h-16 w-16 sm:h-24 sm:w-24 items-center justify-center rounded-full border-4 border-primary text-primary">
              <div className="text-center text-[7px] sm:text-[8px] font-bold uppercase leading-tight tracking-wide">
                LearnAfrica<br />Lite<br />Official<br />Seal
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-col items-center">
            <p className="w-44 sm:w-56 border-b border-slate-900 pb-1 text-base sm:text-xl font-semibold text-slate-900">
              {data.completionDate}
            </p>
            <p className="mt-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Date Issued</p>
          </div>
        </div>

        <div className="mt-8 w-full border-t border-slate-200 pt-4">
          <p className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.2em] sm:tracking-[0.25em] text-slate-500">
            Certificate ID: {data.certificateId} &bull; Verify at learnafrica-lite-weld.vercel.app/#verify-section
          </p>
        </div>
      </div>
    </div>
  );
}

function EditNameControl({ courseId, currentName, remaining, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const { showToast } = useToast();

  const startEdit = () => { setValue(currentName); setErr(''); setEditing(true); };
  const cancel = () => { setEditing(false); setErr(''); };

  const save = async () => {
    const trimmed = value.trim();
    if (trimmed.length < 2) { setErr('Name is too short.'); return; }
    setSaving(true); setErr('');
    try {
      const token = sessionStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/api/certificates/${courseId}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update name.');
      onUpdated(data.certificateName, data.nameChangesRemaining);
      showToast({ type: 'success', message: 'Certificate name updated.' });
      setEditing(false);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (remaining <= 0 && !editing) {
    return (
      <p className="print:hidden text-xs text-muted-foreground flex items-center justify-center gap-1.5 mt-2">
        <AlertCircle className="h-3.5 w-3.5" />
        You've used all 3 name changes for this certificate.{' '}
        <a href="mailto:support@learnafrica.com" className="text-primary hover:underline font-medium">Contact support</a> for further correction.
      </p>
    );
  }

  if (!editing) {
    return (
      <button
        onClick={startEdit}
        className="print:hidden inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mt-2"
      >
        <Pencil className="h-3 w-3" /> Edit name on certificate ({remaining} change{remaining === 1 ? '' : 's'} left)
      </button>
    );
  }

  return (
    <div className="print:hidden mt-3 flex flex-col items-center gap-2">
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          maxLength={100}
          autoFocus
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button onClick={save} disabled={saving} className="h-9 w-9 flex items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
        <button onClick={cancel} disabled={saving} className="h-9 w-9 flex items-center justify-center rounded-lg border border-input">
          <X className="h-4 w-4" />
        </button>
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <p className="text-[11px] text-muted-foreground">This name change will use 1 of your {remaining} remaining edits.</p>
    </div>
  );
}

export default function CertificatePage() {
  const { courseId } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [courseData, setCourseData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCertificate = async () => {
      setIsLoading(true);
      try {
        const token = sessionStorage.getItem('auth_token');
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const response = await fetch(`${API_BASE}/api/certificates/${courseId}`, { headers });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Certificate not found');
        }
        const cert = data.certificate;

        if (token) {
          try {
            const issueRes = await fetch(`${API_BASE}/api/certificates/${courseId}/issue`, {
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
    // NOTE on honesty: browsers give JS no reliable signal that a print-to-PDF
    // dialog actually completed (the user could still cancel it). This toast
    // confirms the download was *prepared and handed to the browser*, which
    // is the most we can truthfully confirm from here.
    window.print();
    showToast({ type: 'success', message: 'Certificate ready, use "Save as PDF" in the print dialog to download.' });
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
      showToast({ type: 'success', message: 'Certificate link copied to clipboard.' });
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
            <AlertCircle className="w-10 h-10 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold">Certificate Unavailable</h2>
          <p className="text-muted-foreground">{error || 'Complete the course first to earn your certificate.'}</p>
          <Link to="/dashboard">
            <Button><ArrowLeft className="w-4 h-4 mr-2" />Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  const displayName = courseData.certificateName || courseData.userName || user?.name || 'Authorized Learner';

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

          <div className="shadow-2xl rounded-2xl overflow-hidden">
            <CertificateDocument data={courseData} displayName={displayName} />
          </div>

          <div className="text-center mt-3">
            <EditNameControl
              courseId={courseId}
              currentName={displayName}
              remaining={courseData.nameChangesRemaining ?? 3}
              onUpdated={(name, remaining) => setCourseData(prev => ({ ...prev, certificateName: name, nameChangesRemaining: remaining }))}
            />
          </div>

          <div className="mt-8 text-center">
            <p className="text-muted-foreground mb-4 text-sm">Share your achievement</p>
            <div className="flex justify-center gap-4">
              <a href="#" className="p-3 bg-card border border-border rounded-xl hover:bg-muted transition-colors text-foreground group shadow-sm"><Linkedin className="w-5 h-5 group-hover:text-[#0A66C2]" /></a>
              <a href="#" className="p-3 bg-card border border-border rounded-xl hover:bg-muted transition-colors text-foreground group shadow-sm"><Twitter className="w-5 h-5 group-hover:text-[#1DA1F2]" /></a>
              <a href="#" className="p-3 bg-card border border-border rounded-xl hover:bg-muted transition-colors text-foreground group shadow-sm"><Facebook className="w-5 h-5 group-hover:text-[#1877F2]" /></a>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden on screen, this exact same component becomes the printed page via the print: variants inside it. No second copy. */}
      <div className="hidden print:block">
        <CertificateDocument data={courseData} displayName={displayName} />
      </div>
    </div>
  );
}
