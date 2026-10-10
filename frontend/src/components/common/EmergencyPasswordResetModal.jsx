/**
 * EmergencyPasswordResetModal — a deliberate, multi-step control for resetting
 * an instructor's password in exceptional circumstances.
 *
 * Steps: identify & explain -> acknowledge -> re-authenticate -> set password.
 * The administrator types the new password; the old one is never revealed. The
 * backend enforces every rule and is superadmin-only, so this UI is a guided
 * front-end over a guarded endpoint, never the source of truth.
 */
import { useState } from 'react';
import { AlertTriangle, Loader2, ShieldAlert, X } from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { cn } from '@/lib/utils';

const STEPS = ['Identify', 'Reason', 'Confirm', 'New password'];

export default function EmergencyPasswordResetModal({ instructor, onClose, onDone }) {
  const [step, setStep] = useState(0);
  const [reason, setReason] = useState('');
  const [incident, setIncident] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [ack, setAck] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canAdvance = () => {
    if (step === 0) return true;
    if (step === 1) return reason.trim().length >= 10 && incident.trim().length >= 20;
    if (step === 2) return confirmText === 'RESET' && ack === true && adminPassword.length > 0;
    return newPassword.length >= 8 && newPassword === confirmPassword;
  };

  const submit = async () => {
    setError('');
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const token = sessionStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/api/admin/instructors/${instructor.id}/emergency-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          reason, incident, confirm: confirmText, acknowledged: ack,
          admin_password: adminPassword, new_password: newPassword, confirm_password: confirmPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Reset failed');
      onDone?.(data.message || 'Password reset complete.');
    } catch (e) {
      setError(e.message || 'Reset failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-card border border-border shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-bold">Emergency Password Reset</h2>
              <p className="text-xs text-muted-foreground">{instructor.name} · {instructor.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex gap-1 px-5 pt-4">
          {STEPS.map((s, i) => (
            <div key={s} className={cn('flex-1 text-center text-[10px] font-bold uppercase py-1 rounded',
              i === step ? 'bg-destructive/10 text-destructive' : i < step ? 'text-success' : 'text-muted-foreground')}>
              {s}
            </div>
          ))}
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 text-xs text-destructive flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Strictly for exceptional situations — unlawful conduct or a serious threat to
              LearnAfrica. Not for routine administration. This is recorded in the audit log.
            </span>
          </div>

          {step === 0 && (
            <div className="space-y-3 text-sm">
              <p className="font-semibold">You are about to reset the password for:</p>
              <div className="rounded-lg border border-border p-3">
                <p><span className="text-muted-foreground">Name:</span> <strong>{instructor.name}</strong></p>
                <p><span className="text-muted-foreground">Email:</span> {instructor.email}</p>
                <p><span className="text-muted-foreground">Status:</span> {instructor.instructor_status || '—'}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                The instructor's current password cannot be recovered — you will set a new one.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs font-semibold">Reason for the intervention</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                  placeholder="Why is this action necessary? (at least 10 characters)"
                  className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold">Describe the incident</label>
                <textarea value={incident} onChange={e => setIncident(e.target.value)} rows={3}
                  placeholder="What happened? (at least 20 characters)"
                  className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 text-sm">
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-1" />
                <span>I confirm this action is necessary and I am authorised to perform it.</span>
              </label>
              <div>
                <label className="text-xs font-semibold">Type RESET to confirm</label>
                <input value={confirmText} onChange={e => setConfirmText(e.target.value)}
                  placeholder="RESET" className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold">Your administrator password</label>
                <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)}
                  placeholder="Re-enter your own password" className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-xs font-semibold">Instructor name</label>
                <input value={instructor.name} readOnly className="mt-1 w-full rounded-lg border border-border bg-muted p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold">Registered email</label>
                <input value={instructor.email} readOnly className="mt-1 w-full rounded-lg border border-border bg-muted p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold">New password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold">Confirm new password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
              </div>
              <p className="text-xs text-muted-foreground">
                On success the old password stops working immediately and any active sessions
                for this instructor are signed out.
              </p>
            </div>
          )}

          {error && <div className="rounded-lg bg-destructive/10 text-destructive text-sm p-2">{error}</div>}

          <div className="flex justify-between gap-2 pt-1">
            <Button variant="outline" onClick={() => step === 0 ? onClose() : setStep(s => s - 1)} disabled={busy}>
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={!canAdvance()}>Continue</Button>
            ) : (
              <Button onClick={submit} disabled={busy || !canAdvance()} variant="destructive">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reset Password'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
