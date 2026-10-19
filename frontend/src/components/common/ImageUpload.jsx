import { useState, useRef } from 'react';
import { Upload, X, CheckCircle2, Loader2, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Uploads to backend which either saves locally (dev) or to Supabase Storage (prod)
const API_BASE = import.meta.env.VITE_API_URL || '';

export function ImageUpload({ value, onChange, accept = 'image/*', maxSizeMB = 5 }) {
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState('');
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setError('');
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`Image too large (max ${maxSizeMB}MB)`); return;
    }
    setUploading(true);
    try {
      const token = sessionStorage.getItem('auth_token');
      const form  = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/api/upload/thumbnail`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      // URL may be relative (/uploads/...) or absolute (Supabase CDN)
      const url = data.url.startsWith('http') ? data.url : `${API_BASE}${data.url}`;
      onChange(url);
    } catch (e) {
      setError(e.message);
    }
    setUploading(false);
  };

  return (
    <div className="space-y-2">
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all cursor-pointer',
          value ? 'border-primary/40 bg-primary/5 p-3' : 'border-border hover:border-primary/50 bg-muted/20 p-8',
          uploading && 'opacity-60 pointer-events-none'
        )}>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          onChange={e => handleFile(e.target.files?.[0])}
        />
        {value ? (
          <div className="relative w-full">
            <img src={value} alt="Uploaded" className="w-full max-h-40 object-cover rounded-lg" />
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange(''); }}
              className="absolute top-1.5 right-1.5 bg-destructive text-white rounded-full p-1 hover:opacity-90 transition-opacity">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Uploading…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-semibold text-muted-foreground">Click to upload or drag & drop</p>
            <p className="text-xs text-muted-foreground/60">PNG, JPG, WEBP up to {maxSizeMB}MB</p>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {value && !uploading && (
        <p className="text-xs text-success flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5" /> Image uploaded
        </p>
      )}
    </div>
  );
}
