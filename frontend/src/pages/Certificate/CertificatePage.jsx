import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/common/Button';
import { useToast } from '../../components/common/Toast';
import { ScaleToFit } from '../../components/common/ScaleToFit';
import { CertificateSeal } from '../../components/certificate/CertificateSeal';
import { Share2, Download, ArrowLeft, Linkedin, Twitter, Facebook, Loader2, Pencil, Check, X, AlertCircle, Copy, Mail } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState, useEffect } from 'react';
import { API_BASE, publicFetch } from '@/lib/api';
import { verifyUrl, siteHost } from '@/lib/siteUrl';
import { shareText, linkedInShare, twitterShare, facebookShare, whatsappShare, emailShare, nativeOrCopyShare } from '@/lib/share';

/**
 * CertificateDocument — the SINGLE source of truth for what a certificate
 * looks like. Previously this file had two independently-styled copies
 * (one for on-screen preview, a second "PrintableCertificate" only shown
 * via print CSS) that could silently drift apart. There is now exactly one
 * copy of the certificate markup; print vs screen differences are handled
 * with Tailwind's print: variants on the SAME elements, so the content
 * (name, course, instructor, date, certificate ID) can never differ between
 * what you see and what you download, because it's the same DOM.
 *
 * On screen, this renders at one fixed, comfortably-designed size
 * (CERT_DESIGN_WIDTH x CERT_DESIGN_HEIGHT) and is wrapped in <ScaleToFit>
 * by its caller, which shrinks or grows the WHOLE composition to fit
 * whatever screen it's on, like a slide-viewer would. Nothing here needs
 * to be responsive itself, because nothing reflows: a phone and a desktop
 * both see the identical layout, just scaled differently. Print uses its
 * own separate, already-tested fit logic (declared landscape + a
 * self-scaling aspect-ratio box), completely independent of the on-screen
 * design size below.
 */
export const CERT_DESIGN_WIDTH = 900;
export const CERT_DESIGN_HEIGHT = 636; // 1.414:1 landscape ratio

function CertificateDocument({ data, displayName }) {
  return (
    <div
      id="certificate-content"
      className="relative bg-white text-slate-900 border-[6px] border-double border-slate-900 rounded-sm overflow-hidden
                 w-[900px] h-[636px]
                 print:w-full print:h-auto print:aspect-[1.414/1] print:border-[10px] print:rounded-none"
    >
      {/* A4 landscape is requested explicitly (297mm x 210mm) rather than the
          bare `landscape` keyword, which some print engines ignore. Desktop
          browsers honour this and print landscape. A few mobile browsers
          (notably iOS Safari) print portrait regardless — the
          print:aspect-[1.414/1] class above is the safety net for those:
          whatever orientation the device actually gives it, the content
          scales to that single page instead of overflowing onto a second one. */}
      <style dangerouslySetInnerHTML={{ __html: `@media print { @page { size: A4 landscape; margin: 8mm; } html, body { margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }` }} />
      <div className="absolute inset-4 border border-slate-200 pointer-events-none" />
      <div className="absolute left-5 top-5 h-10 w-10 border-l-4 border-t-4 border-primary/60" />
      <div className="absolute right-5 top-5 h-10 w-10 border-r-4 border-t-4 border-primary/60" />
      <div className="absolute bottom-5 left-5 h-10 w-10 border-b-4 border-l-4 border-primary/60" />
      <div className="absolute bottom-5 right-5 h-10 w-10 border-b-4 border-r-4 border-primary/60" />

      <div className="relative z-10 flex flex-col items-center px-12 py-14 text-center">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.3em] text-primary">LearnAfrica Lite</p>
        <h1 className="font-serif text-5xl font-bold uppercase tracking-[0.15em] text-slate-900">
          Certificate of Completion
        </h1>
        <div className="mt-4 h-px w-48 bg-gradient-to-r from-transparent via-slate-400 to-transparent" />
        <p className="mt-4 text-lg italic text-slate-600">
          Awarded in recognition of outstanding course completion
        </p>

        <p className="mt-8 text-lg text-slate-700">This certifies that</p>
        <h2 className="my-4 inline-block border-b-4 border-slate-900 px-16 pb-2 font-serif text-5xl font-bold leading-tight text-slate-900">
          {displayName}
        </h2>
        <p className="text-lg text-slate-700">has successfully completed all course requirements for</p>
        <h3 className="mt-3 max-w-3xl font-serif text-4xl font-bold leading-tight text-primary">
          {data.courseName}
        </h3>

        <div className="mt-8 flex w-full items-center justify-between gap-10 px-8">
          <div className="flex flex-1 flex-col items-center">
            <p className="w-56 border-b border-slate-900 pb-1 font-serif text-xl italic text-slate-900">
              {data.instructorName}
            </p>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Course Instructor</p>
          </div>
          <div className="flex shrink-0 flex-col items-center">
            <CertificateSeal size={116} />
          </div>
          <div className="flex flex-1 flex-col items-center">
            <p className="w-56 border-b border-slate-900 pb-1 text-xl font-semibold text-slate-900">
              {data.completionDate}
            </p>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">Date Issued</p>
          </div>
        </div>

        <div className="mt-8 flex w-full items-center justify-between gap-6 border-t border-slate-200 pt-4 text-left">
          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-slate-500">
            Certificate ID: {data.certificateId}
            <br />
            Verify at {siteHost()}/#verify-section
          </p>
          <div className="flex shrink-0 flex-col items-center">
            {data.certificateId && (
              <QRCodeSVG value={verifyUrl(data.certificateId)} size={62} level="M" marginSize={0} bgColor="#ffffff" fgColor="#0f4d34" />
            )}
            <p className="mt-1 text-[7px] font-bold uppercase tracking-[0.2em] text-slate-400">Scan to verify</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditNameControl({ courseId, currentName, remaining, onUpdated, supportEmail }) {
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
        <a href={`mailto:${supportEmail}`} className="text-primary hover:underline font-medium">Contact support</a> for further correction.
      </p>
    );
  }

  if (!editing) {
    return (
      <button
        onClick={startEdit}
        className="print:hidden inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors mt-2"
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
  const [supportEmail, setSupportEmail] = useState('support@learnafrica.com');

  // Support address comes from the admin-configured footer, so the certificate
  // never shows the built-in demo address once the admin has set a real one.
  useEffect(() => {
    let alive = true;
    publicFetch('/api/site/footer')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.email) setSupportEmail(d.email); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

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

  const shareUrl = courseData?.certificateId
    ? verifyUrl(courseData.certificateId)
    : window.location.href;
  const shareMessage = shareText(`My ${courseData?.courseName} Certificate`, courseData?.courseName || 'a course');

  const handleNativeShare = async () => {
    const result = await nativeOrCopyShare({
      title: `My ${courseData?.courseName} Certificate`,
      text: shareMessage,
      url: shareUrl,
    });
    if (result === 'copied') showToast({ type: 'success', message: 'Certificate link copied to clipboard.' });
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast({ type: 'success', message: 'Certificate link copied to clipboard.' });
    } catch {
      showToast({ type: 'error', message: 'Could not copy the link.' });
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
              <Button variant="outline" onClick={handleNativeShare} className="rounded-xl"><Share2 className="w-4 h-4 mr-2" />Share</Button>
              <Button onClick={handleDownload} className="rounded-xl shadow-sm"><Download className="w-4 h-4 mr-2" />Download PDF</Button>
            </div>
          </div>

          <div className="shadow-2xl rounded-2xl overflow-hidden">
            <ScaleToFit designWidth={CERT_DESIGN_WIDTH} designHeight={CERT_DESIGN_HEIGHT}>
              <CertificateDocument data={courseData} displayName={displayName} />
            </ScaleToFit>
          </div>

          <div className="text-center mt-3">
            <EditNameControl
              courseId={courseId}
              currentName={displayName}
              remaining={courseData.nameChangesRemaining ?? 3}
              supportEmail={supportEmail}
              onUpdated={(name, remaining) => setCourseData(prev => ({ ...prev, certificateName: name, nameChangesRemaining: remaining }))}
            />
          </div>

          <div className="mt-8 text-center">
            <p className="text-muted-foreground mb-4 text-sm">Share your achievement</p>
            <div className="flex flex-wrap justify-center gap-3">
              <a href={linkedInShare(shareUrl)} target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn" className="p-3 bg-card border border-border rounded-xl hover:bg-muted transition-colors text-foreground group shadow-sm"><Linkedin className="w-5 h-5 group-hover:text-[#0A66C2]" /></a>
              <a href={twitterShare(shareUrl, shareMessage)} target="_blank" rel="noopener noreferrer" aria-label="Share on X" className="p-3 bg-card border border-border rounded-xl hover:bg-muted transition-colors text-foreground group shadow-sm"><Twitter className="w-5 h-5 group-hover:text-[#1DA1F2]" /></a>
              <a href={facebookShare(shareUrl)} target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook" className="p-3 bg-card border border-border rounded-xl hover:bg-muted transition-colors text-foreground group shadow-sm"><Facebook className="w-5 h-5 group-hover:text-[#1877F2]" /></a>
              <a href={whatsappShare(shareUrl, shareMessage)} target="_blank" rel="noopener noreferrer" aria-label="Share on WhatsApp" className="p-3 bg-card border border-border rounded-xl hover:bg-muted transition-colors text-foreground group shadow-sm">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current group-hover:text-[#25D366]" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 01-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 4.54 0 8.24 3.7 8.24 8.24 0 4.55-3.7 8.24-8.24 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.98-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43-.14-.01-.31-.01-.47-.01-.16 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.16 1.74 2.66 4.22 3.73.59.25 1.05.4 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.28z"/></svg>
              </a>
              <a href={emailShare(shareUrl, shareMessage)} aria-label="Share by email" className="p-3 bg-card border border-border rounded-xl hover:bg-muted transition-colors text-foreground group shadow-sm"><Mail className="w-5 h-5 group-hover:text-primary" /></a>
              <button type="button" onClick={handleCopyLink} aria-label="Copy certificate link" className="p-3 bg-card border border-border rounded-xl hover:bg-muted transition-colors text-foreground group shadow-sm"><Copy className="w-5 h-5 group-hover:text-primary" /></button>
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
