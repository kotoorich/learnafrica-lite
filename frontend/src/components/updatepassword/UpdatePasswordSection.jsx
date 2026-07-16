import { useState } from 'react';
import { Button } from '../../components/common/Button';
import { Loader2, ShieldCheck, Eye, EyeOff, Lock, X } from 'lucide-react';
import { API_BASE } from '@/lib/api';

export default function UpdatePasswordSection({ onCancel, onSuccess }) {
  const [showPasswords, setShowPasswords] = useState(false);
  const [formData, setFormData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (formData.newPassword !== formData.confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    if (formData.newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    setIsUpdating(true);
    try {
      const token = sessionStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/users/change-password`,  {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: 'Bearer ' + token })
        },
        body: JSON.stringify({
          current_password: formData.currentPassword,
          new_password: formData.newPassword
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Password update failed');
      if (onSuccess) onSuccess('Your password has been updated successfully.');
    } catch (err) {
      setError(err.message || 'Update failed. Please check your current password.');
    } finally {
      setIsUpdating(false);
    }
  };

  const isFormValid =
    formData.currentPassword &&
    formData.newPassword.length >= 6 &&
    formData.newPassword === formData.confirmPassword;

  return (
    <div className="mt-0 md:mt-4 p-6 rounded-2xl bg-background border border-border/50 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/10 rounded-xl">
            <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-500" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">Update Password</h3>
            <p className="text-xs text-muted-foreground">Ensure your account stays secure.</p>
          </div>
        </div>
        <button onClick={onCancel} className="p-1 rounded-md hover:bg-muted text-muted-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleUpdate} className="space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground ml-1">Current Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
            <input type={showPasswords ? 'text' : 'password'} name="currentPassword" required
              value={formData.currentPassword} onChange={handleInputChange}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-border bg-muted/5 text-sm focus:ring-1 focus:ring-green-500/30 focus:border-green-500/50 outline-none transition-all"
              placeholder="••••••••" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground ml-1">New Password</label>
            <input type={showPasswords ? 'text' : 'password'} name="newPassword" required
              value={formData.newPassword} onChange={handleInputChange}
              className="w-full px-4 py-2 rounded-xl border border-border bg-muted/5 text-sm focus:ring-1 focus:ring-green-500/30 focus:border-green-500/50 outline-none transition-all"
              placeholder="Min 6 characters" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground ml-1">Confirm New Password</label>
            <input type={showPasswords ? 'text' : 'password'} name="confirmPassword" required
              value={formData.confirmPassword} onChange={handleInputChange}
              className={`w-full px-4 py-2 rounded-xl border bg-muted/5 text-sm outline-none transition-all focus:ring-1 ${
                formData.confirmPassword && formData.newPassword !== formData.confirmPassword
                  ? 'border-destructive focus:ring-destructive/20'
                  : 'border-border focus:ring-green-500/30 focus:border-green-500/50'
              }`}
              placeholder="••••••••" />
          </div>
        </div>

        {error && <p className="text-xs text-destructive font-medium ml-1">{error}</p>}

        <div className="flex flex-col sm:flex-row items-center justify-between pt-2 gap-4">
          <button type="button" onClick={() => setShowPasswords(!showPasswords)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showPasswords ? 'Hide' : 'Show'} passwords
          </button>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button type="button" onClick={onCancel} disabled={isUpdating}
              className="flex-1 sm:flex-none px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <Button type="submit" disabled={isUpdating || !isFormValid}
              className="flex-1 sm:flex-none min-w-[140px] py-2 rounded-xl text-sm font-medium bg-green-600 text-white hover:bg-green-700 active:bg-green-800 disabled:opacity-50">
              {isUpdating ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Saving...</> : 'Update Password'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
