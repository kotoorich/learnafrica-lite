import { useState } from 'react';
import { Button } from '../../components/common/Button';
import { Loader2, AlertTriangle, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '@/lib/api';

export default function DeleteAccountSection({ userEmail, onCancel }) {
  const [confirmEmail, setConfirmEmail] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleDelete = async () => {
    if (confirmEmail !== userEmail) {
      setError('Email does not match.');
      return;
    }
    setIsDeleting(true);
    setError('');
    try {
      const token = sessionStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/users/account`,  {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: 'Bearer ' + token })
        },
        body: JSON.stringify({ email: confirmEmail })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Deletion failed');
      await logout();
      navigate('/');
    } catch (err) {
      setError(err.message || 'An error occurred. Please try again.');
      setIsDeleting(false);
    }
  };

  return (
    <div className="pt-6 mt-6 border-t border-destructive/20 animate-in fade-in zoom-in-95 duration-300">
      <div className="p-6 rounded-2xl bg-destructive/5 border-2 border-destructive/20">
        <div className="flex flex-col gap-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-destructive flex items-center gap-2">
                <AlertTriangle className="h-6 w-6" />
                Danger Zone
              </h3>
              <p className="text-sm text-muted-foreground max-w-lg">
                This will permanently delete all data associated with <strong>{userEmail}</strong>.
                This action cannot be undone.
              </p>
            </div>
            <button onClick={onCancel}
              className="p-1 hover:bg-destructive/10 rounded-full transition-colors text-destructive/60">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-end gap-4 bg-background/50 p-4 rounded-xl border border-destructive/10">
            <div className="flex-1 w-full">
              <label className="text-[10px] font-bold uppercase tracking-widest text-destructive/80">
                Type your email to confirm
              </label>
              <input
                type="email"
                placeholder={`Type "${userEmail}"`}
                value={confirmEmail}
                onChange={(e) => { setConfirmEmail(e.target.value); if (error) setError(''); }}
                className={`w-full mt-1.5 px-4 py-2.5 rounded-lg border bg-background text-sm outline-none transition-all focus:ring-2 ${
                  error ? 'border-destructive focus:ring-destructive/20' : 'border-border focus:ring-primary/20'
                }`}
              />
              {error && <p className="text-xs text-destructive font-semibold mt-1">{error}</p>}
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="destructive"
                disabled={confirmEmail !== userEmail || isDeleting}
                onClick={handleDelete}
                className="flex-1 sm:flex-none shadow-lg shadow-destructive/20 min-w-[140px]">
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
