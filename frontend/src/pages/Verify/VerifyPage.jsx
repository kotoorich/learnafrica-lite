import { useState } from 'react';
import { ShieldCheck, Search, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useOnScreen } from '@/lib/useOnScreen';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api';
import { Button } from '@/components/common/Button';
import MainLayout from '@/layouts/MainLayout'; // ← IMPORT ADDED

export default function VerifyPage() {
  const [credId,   setCredId]   = useState('');
  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [sectionRef, sectionVisible] = useOnScreen({ threshold: 0.2 });

  const handleVerify = async (e) => {
    e.preventDefault();
    const normalized = credId.replace(/\s+/g, '').toUpperCase();
    if (!normalized) return;
    setLoading(true); setResult(null); setSearched(false);
    try {
      const res  = await fetch(`${API_BASE}/api/verify?id=${encodeURIComponent(normalized)}`);
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ valid: false, message: 'Verification service unavailable.' });
    }
    setLoading(false); setSearched(true);
  };

  const fmt = (s) => {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }); }
    catch { return s; }
  };

  return (
    /* ── CHANGE: Wrapped entire page in MainLayout ── */
    <MainLayout>
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-1 flex items-center justify-center py-16 sm:py-24 bg-gradient-to-b from-background to-muted/20">
          <div className={cn(
            "container mx-auto px-4 max-w-2xl transition-all duration-700",
            sectionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          )}>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-4">
                <ShieldCheck className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold">Verify a Credential</h2>
              <p className="text-muted-foreground mt-2 text-sm sm:text-base">
                Enter a certificate or badge ID to verify its authenticity.
              </p>
            </div>

            <form onSubmit={handleVerify} className="flex gap-2 mb-6">
              <input type="text" value={credId}
                onChange={e => { setCredId(e.target.value); setSearched(false); setResult(null); }}
                placeholder="e.g. LA-CERT-ABCD-1A2B3C"
                className="flex-1 h-12 rounded-xl border border-input bg-background px-4 text-sm focus:ring-2 focus:ring-primary outline-none min-w-0" />
              <Button type="submit" disabled={loading || !credId.trim()} className="h-12 px-6 shrink-0 gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="hidden sm:inline">Verify</span>
              </Button>
            </form>

            {searched && result && (
              <div className={cn(
                'rounded-2xl border p-6 animate-in fade-in slide-in-from-bottom-2',
                result.valid ? 'bg-success/5 border-success/30' : 'bg-destructive/5 border-destructive/30'
              )}>
                {result.valid ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      </div>
                      <div>
                        <p className="font-bold text-success">Valid {result.type === 'certificate' ? 'Certificate' : 'Badge'}</p>
                        <p className="text-xs text-muted-foreground font-mono">{result.id}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/50">
                      <div>
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Holder</p>
                        <p className="font-semibold mt-0.5">{result.holder}</p>
                      </div>
                      {result.type === 'certificate' && (<>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-muted-foreground">Course</p>
                          <p className="font-semibold mt-0.5">{result.course}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase text-muted-foreground">Instructor</p>
                          <p className="font-semibold mt-0.5">{result.instructor}</p>
                        </div>
                      </>)}
                      {result.type === 'badge' && (
                        <div>
                          <p className="text-[10px] font-bold uppercase text-muted-foreground">Achievement</p>
                          <p className="font-semibold mt-0.5">{result.badge}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-bold uppercase text-muted-foreground">Issued</p>
                        <p className="font-semibold mt-0.5">{fmt(result.issued_at)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                      This {result.type} was issued by LearnAfrica Lite and is authentic.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                      <XCircle className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                      <p className="font-bold text-destructive">Credential Not Found</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {result.message || 'This ID does not match any issued certificate or badge.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </MainLayout>
  );
}
