import { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/common/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/common/Card';
import { Loader2, Save, CheckCircle2, XCircle, Bell, Shield, Palette, GraduationCap, AlertTriangle, Trash2 } from 'lucide-react';
import DeleteAccountSection from '../../components/delete/DeleteAccountSection';
import UpdatePasswordSection from '../../components/updatepassword/UpdatePasswordSection';
import { cn } from '../../lib/utils';

const SettingRow = ({ label, desc, children, icon: Icon }) => (
  <div className="flex items-center justify-between py-4 group transition-all">
    <div className="flex items-start gap-3">
      {Icon && <Icon className="h-5 w-5 mt-0.5 text-muted-foreground group-hover:text-primary transition-colors" />}
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
    <div className="flex-shrink-0 ml-4">{children}</div>
  </div>
);

const Switch = ({ checked, onChange, disabled }) => (
  <button
    onClick={onChange}
    disabled={disabled}
    className={cn(
      'relative inline-flex h-5 w-9 items-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50',
      checked ? 'bg-primary' : 'bg-input'
    )}
  >
    <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
      checked ? 'translate-x-5' : 'translate-x-1')} />
  </button>
);

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { isInstructorMode, user, updateUser } = useAuth();

  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showDeleteVerification, setShowDeleteVerification] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [status, setStatus] = useState({ type: null, message: '' });

  const [settings, setSettings] = useState({
    notifications: { email: true, push: false, updates: true },
    privacy: { twoFactor: false },
    instructor: { payout: true, messages: true }
  });

  // Hydrate from user context
  useEffect(() => {
    if (user?.settings) {
      setSettings({
        notifications: user.settings.notifications || { email: true, push: false, updates: true },
        privacy: user.settings.privacy || { twoFactor: false },
        instructor: user.settings.instructor || { payout: true, messages: true }
      });
      setHasChanges(false);
    }
  }, [user]);

  const handleToggle = (category, key) => {
    if (status.type) setStatus({ type: null, message: '' });
    setSettings(prev => ({
      ...prev,
      [category]: { ...prev[category], [key]: !prev[category][key] }
    }));
    setHasChanges(true);
  };

  const saveSettings = async () => {
    setIsSaving(true);
    setStatus({ type: null, message: '' });
    try {
      await updateUser({ settings });
      setStatus({ type: 'success', message: 'Settings saved successfully!' });
      setHasChanges(false);
    } catch (err) {
      setStatus({ type: 'error', message: 'Failed to save settings. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 sm:px-6">
      <header className="flex flex-col sm:flex-row justify-between items-start md:items-center gap-4 mb-10">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Settings</h1>
          <p className="text-muted-foreground text-sm">
            Personalize your experience as a {isInstructorMode ? 'Instructor' : 'Student'}.
          </p>
        </div>
        {hasChanges && (
          <Button onClick={saveSettings} disabled={isSaving} className="w-full sm:w-auto shadow-sm">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        )}
      </header>

      {status.type && (
        <div className={cn('mb-6 flex items-center gap-3 p-4 rounded-xl border',
          status.type === 'success'
            ? 'bg-green-500/5 border-green-500/20 text-green-600 dark:text-green-400'
            : 'bg-destructive/5 border-destructive/20 text-destructive'
        )}>
          {status.type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
          <span className="text-sm font-semibold">{status.message}</span>
        </div>
      )}

      <div className="grid gap-8">
        {/* Appearance */}
        <Card className="overflow-hidden border-border/60">
          <CardHeader className="bg-muted/30">
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Appearance</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <SettingRow label="Dark Mode" desc={`Switch to ${theme === 'dark' ? 'light' : 'dark'} interface`}>
              <Switch checked={theme === 'dark'} onChange={toggleTheme} />
            </SettingRow>
          </CardContent>
        </Card>

        {/* Instructor preferences */}
        {isInstructorMode && (
          <Card className="border-primary/20">
            <CardHeader className="bg-primary/5">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Instructor Preferences</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="divide-y divide-border/40">
              <SettingRow label="Revenue Alerts" desc="Email notifications for payouts" icon={Bell}>
                <Switch checked={settings.instructor.payout} onChange={() => handleToggle('instructor', 'payout')} />
              </SettingRow>
              <SettingRow label="Direct Messages" desc="Allow students to reach out to you" icon={Bell}>
                <Switch checked={settings.instructor.messages} onChange={() => handleToggle('instructor', 'messages')} />
              </SettingRow>
            </CardContent>
          </Card>
        )}

        {/* Notifications */}
        <Card className="border-border/60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Notifications</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-border/40">
            <SettingRow label="Email Communications" desc={user?.email || 'Updates to your primary inbox'} icon={Bell}>
              <Switch checked={settings.notifications.email} onChange={() => handleToggle('notifications', 'email')} />
            </SettingRow>
            <SettingRow label="Push Notifications" desc="Real-time alerts via browser" icon={Bell}>
              <Switch checked={settings.notifications.push} onChange={() => handleToggle('notifications', 'push')} />
            </SettingRow>
            <SettingRow label="Course Updates" desc="News about your enrolled courses" icon={Bell}>
              <Switch checked={settings.notifications.updates} onChange={() => handleToggle('notifications', 'updates')} />
            </SettingRow>
          </CardContent>
        </Card>

        {/* Security */}
        <Card className="border-border/60 overflow-hidden">
          <CardHeader className={`${showPasswordForm ? 'hidden sm:block' : 'block'} border-b border-border/40`}>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Privacy & Security</CardTitle>
            </div>
          </CardHeader>
          <CardContent className={cn('w-full transition-all duration-300', showPasswordForm ? 'p-0 sm:p-6' : 'p-6')}>
            {!showPasswordForm ? (
              <div className="flex md:flex-row flex-col md:items-start md:justify-between gap-5">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Account Password</p>
                  <p className="text-sm text-muted-foreground">Change your password to keep your account secure</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowPasswordForm(true)}>Update Password</Button>
              </div>
            ) : (
              <UpdatePasswordSection
                onCancel={() => setShowPasswordForm(false)}
                onSuccess={(msg) => {
                  setShowPasswordForm(false);
                  setStatus({ type: 'success', message: msg });
                }}
              />
            )}
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <div className="pt-6 mt-6 border-t border-destructive/20 w-full overflow-hidden">
          {!showDeleteVerification ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 rounded-2xl bg-destructive/5 border border-destructive/10 gap-6">
              <div className="space-y-1">
                <h3 className="text-md md:text-lg font-bold text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Danger Zone
                </h3>
                <p className="text-sm text-muted-foreground">
                  Permanently delete your LearnAfrica account and all associated data.
                </p>
              </div>
              <Button
                variant="ghost" size="sm"
                onClick={() => setShowDeleteVerification(true)}
                className="w-full sm:w-auto text-destructive bg-destructive/10 hover:bg-destructive hover:text-white transition-colors shadow-sm"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Account
              </Button>
            </div>
          ) : (
            <div className="w-full max-w-full overflow-hidden">
              <DeleteAccountSection
                userEmail={user?.email || ''}
                onCancel={() => setShowDeleteVerification(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
