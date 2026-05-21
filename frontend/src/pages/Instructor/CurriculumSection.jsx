import { useState, useRef } from 'react';
import {
  BookOpen, Layout, X, ChevronRight, Plus, GripVertical, Video,
  HelpCircle, Link as LinkIcon, Trash2, ChevronDown, ChevronUp,
  Award, Download, CheckCircle2, Circle, Upload, Loader2,
  FileText, File, Image as ImgIcon, Archive, Flag,
  Type, ToggleLeft, AlignLeft
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card, CardHeader, CardContent } from '@/components/common/Card';
import { Switch } from '@/components/common/Switch';
import { cn } from '@/lib/utils';

// ── Video URL input (replaces upload) ────────────────────────────────────
function VideoUrlInput({ currentUrl, onChanged }) {
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <LinkIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          value={currentUrl || ''}
          onChange={e => onChanged(e.target.value)}
          className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary transition-all"
          placeholder="https://youtube.com/watch?v=… or any video link"
        />
      </div>
      {currentUrl && (currentUrl.includes('youtube') || currentUrl.includes('youtu.be')) && (
        <div className="rounded-xl overflow-hidden border border-border aspect-video">
          <iframe
            src={currentUrl.replace('watch?v=','embed/').replace('youtu.be/','www.youtube.com/embed/')}
            className="w-full h-full"
            allowFullScreen
            title="Video preview"
          />
        </div>
      )}
      {currentUrl && !currentUrl.includes('youtube') && !currentUrl.includes('youtu.be') && (
        <div className="rounded-xl overflow-hidden border border-border bg-slate-950">
          <video src={currentUrl} controls className="w-full max-h-48" preload="metadata" />
        </div>
      )}
    </div>
  );
}

// ── Course Resources Manager ────────────────────────────────────────────────
function CourseResourcesManager({ resources = [], onChange }) {
  const [urlInput,   setUrlInput]   = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [dragOver,   setDragOver]   = useState(false);
  const inputRef = useRef(null);

  const extToType = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (['pdf'].includes(ext))              return 'pdf';
    if (['doc','docx'].includes(ext))       return 'doc';
    if (['ppt','pptx'].includes(ext))       return 'ppt';
    if (['xls','xlsx','csv'].includes(ext)) return 'spreadsheet';
    if (['zip','rar','7z'].includes(ext))   return 'archive';
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return 'image';
    if (['mp4','mov','webm','avi'].includes(ext)) return 'video';
    return ext || 'file';
  };

  const fileIcon = (type) => {
    const cls = "h-4 w-4 shrink-0";
    if (type === 'pdf')        return <FileText className={`${cls} text-red-500`} />;
    if (type === 'doc')        return <FileText className={`${cls} text-blue-500`} />;
    if (type === 'image')      return <ImgIcon  className={`${cls} text-purple-500`} />;
    if (type === 'archive')    return <Archive  className={`${cls} text-yellow-500`} />;
    if (type === 'link')       return <LinkIcon className={`${cls} text-primary`} />;
    return <File className={`${cls} text-muted-foreground`} />;
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024)        return `${bytes} B`;
    if (bytes < 1048576)     return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1048576).toFixed(1)} MB`;
  };

  const addFile = (file) => {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      alert('File too large — max 50MB per resource');
      return;
    }
    onChange([...resources, {
      id:        `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      title:     file.name,
      url:       URL.createObjectURL(file),
      file_type: extToType(file.name),
      file_size: formatSize(file.size),
      _file:     file,
      _pending:  true,
    }]);
    // Reset input so same file can be re-added if removed
    if (inputRef.current) inputRef.current.value = '';
  };

  const addLink = () => {
    if (!titleInput.trim() || !urlInput.trim()) return;
    onChange([...resources, {
      id:        `tmp_${Date.now()}`,
      title:     titleInput.trim(),
      url:       urlInput.trim(),
      file_type: 'link',
      file_size: '',
    }]);
    setTitleInput(''); setUrlInput('');
  };

  const remove = (id) => onChange(resources.filter(r => r.id !== id));

  return (
    <div className="space-y-4">

      {/* Uploaded list */}
      {resources.length > 0 ? (
        <div className="space-y-2">
          {resources.map(r => (
            <div key={r.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-background border border-border hover:border-primary/30 transition-colors group">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                {fileIcon(r.file_type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate leading-tight">{r.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">{r.file_type}</span>
                  {r.file_size && <span className="text-[10px] text-muted-foreground">· {r.file_size}</span>}
                  {r._pending && <span className="text-[10px] text-warning font-semibold">· pending save</span>}
                </div>
              </div>
              <button type="button" onClick={() => remove(r.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1 rounded">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">
          No resources added yet. Upload files or add links below.
        </p>
      )}

      {/* Drop zone / file picker */}
      <input ref={inputRef} type="file" className="hidden"
        multiple
        onChange={e => { Array.from(e.target.files).forEach(addFile); }} />
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false);
          Array.from(e.dataTransfer.files).forEach(addFile);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-dashed cursor-pointer transition-all',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/20'
        )}>
        <Upload className={cn('h-6 w-6 transition-colors', dragOver ? 'text-primary' : 'text-muted-foreground')} />
        <div className="text-center">
          <p className="text-xs font-semibold">Click to upload or drag &amp; drop</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">PDF, DOC, ZIP, images… max 50MB each · multiple files ok</p>
        </div>
      </div>

      {/* Link adder */}
      <details className="group">
        <summary className="text-xs font-semibold text-primary cursor-pointer list-none flex items-center gap-1 hover:underline select-none">
          <LinkIcon className="h-3.5 w-3.5" /> Add an external link instead
        </summary>
        <div className="mt-3 p-3 bg-muted/20 rounded-xl border border-border space-y-2">
          <input value={titleInput} onChange={e => setTitleInput(e.target.value)}
            placeholder="Resource title  e.g. Lecture Slides"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary" />
          <div className="flex gap-2">
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
              placeholder="https://… or Google Drive link"
              onKeyDown={e => e.key === 'Enter' && addLink()}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary" />
            <button type="button" onClick={addLink}
              className="px-4 py-2 bg-primary text-primary-foreground text-xs rounded-lg hover:bg-primary/90 transition-colors font-semibold">
              Add
            </button>
          </div>
        </div>
      </details>
    </div>
  );
}

// ── Question Type Selector ──────────────────────────────────────────────────
const Q_TYPES = [
  { value: 'mcq',        label: 'MCQ',           icon: Type,       desc: 'Multiple choice' },
  { value: 'true_false', label: 'True / False',  icon: ToggleLeft, desc: '2 options' },
  { value: 'fill_blank', label: 'Fill in Blank', icon: AlignLeft,  desc: 'Type the answer' },
];

function QuizEditor({ item, onUpdate }) {
  const questions = item.questions || [];

  const addQuestion = (qType = 'mcq') => {
    const base = { id: `q_${Date.now()}`, text: '', correctAnswer: 0, question_type: qType };
    if (qType === 'mcq')        return onUpdate({ questions: [...questions, { ...base, options: ['', '', '', ''] }] });
    if (qType === 'true_false') return onUpdate({ questions: [...questions, { ...base, options: ['True', 'False'] }] });
    if (qType === 'fill_blank') return onUpdate({ questions: [...questions, { ...base, options: [''] }] });
  };

  const updateQ = (qId, data) =>
    onUpdate({ questions: questions.map(q => q.id === qId ? { ...q, ...data } : q) });

  const removeQ = (qId) =>
    onUpdate({ questions: questions.filter(q => q.id !== qId) });

  return (
    <div className="space-y-4">
      {questions.map((q, qIdx) => {
        const qType = q.question_type || 'mcq';
        return (
          <div key={q.id} className="rounded-xl border border-border bg-background overflow-hidden">
            {/* Question header */}
            <div className="flex items-center justify-between px-4 py-3 bg-muted/20 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-primary uppercase">Q{qIdx + 1}</span>
                {/* Type selector */}
                <div className="flex rounded-lg border border-border overflow-hidden">
                  {Q_TYPES.map(t => (
                    <button key={t.value} type="button"
                      onClick={() => {
                        const opts = t.value === 'true_false' ? ['True','False']
                                   : t.value === 'fill_blank' ? ['']
                                   : ['','','',''];
                        updateQ(q.id, { question_type: t.value, options: opts, correctAnswer: 0 });
                      }}
                      className={cn(
                        'px-2.5 py-1 text-[10px] font-bold transition-colors flex items-center gap-1',
                        qType === t.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background text-muted-foreground hover:bg-muted'
                      )}>
                      <t.icon className="h-3 w-3" />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => removeQ(q.id)}
                className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* Question text */}
              <input value={q.text} onChange={e => updateQ(q.id, { text: e.target.value })}
                placeholder={qType === 'fill_blank'
                  ? 'e.g. The capital of Ghana is ___'
                  : 'Enter your question…'}
                className="w-full bg-muted/10 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary" />

              {/* ── MCQ options ── */}
              {qType === 'mcq' && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">
                    Options — click ○ to mark correct
                  </p>
                  {(q.options || ['','','','']).map((opt, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-2">
                      <button type="button" onClick={() => updateQ(q.id, { correctAnswer: oIdx })}>
                        {q.correctAnswer === oIdx
                          ? <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                          : <Circle className="h-5 w-5 text-muted-foreground/30 shrink-0" />}
                      </button>
                      <input value={opt}
                        onChange={e => {
                          const o = [...(q.options || [])];
                          o[oIdx] = e.target.value;
                          updateQ(q.id, { options: o });
                        }}
                        placeholder={`Option ${oIdx + 1}`}
                        className="flex-1 bg-muted/10 border border-border rounded-lg px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                  ))}
                </div>
              )}

              {/* ── True / False ── */}
              {qType === 'true_false' && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">
                    Click to mark correct answer
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {['True', 'False'].map((label, oIdx) => (
                      <button key={oIdx} type="button"
                        onClick={() => updateQ(q.id, { correctAnswer: oIdx, options: ['True','False'] })}
                        className={cn(
                          'py-3 rounded-xl border-2 text-sm font-bold transition-all',
                          q.correctAnswer === oIdx
                            ? 'border-success bg-success/10 text-success'
                            : 'border-border text-muted-foreground hover:border-primary/40'
                        )}>
                        {oIdx === 0 ? '✓ True' : '✗ False'}
                        {q.correctAnswer === oIdx && <span className="ml-2 text-[10px]">(correct)</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Fill in blank ── */}
              {qType === 'fill_blank' && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">
                    Correct answer (what student must type)
                  </p>
                  <input
                    value={(q.options || [''])[0]}
                    onChange={e => updateQ(q.id, { options: [e.target.value], correctAnswer: 0 })}
                    placeholder="e.g. Accra"
                    className="w-full bg-success/5 border border-success/30 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-success" />
                  <p className="text-[10px] text-muted-foreground">
                    Students must type this exactly (not case-sensitive).
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Add question buttons */}
      <div className="grid grid-cols-3 gap-2">
        {Q_TYPES.map(t => (
          <button key={t.value} type="button" onClick={() => addQuestion(t.value)}
            className="flex flex-col items-center gap-1 p-3 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/20 text-xs font-semibold transition-all cursor-pointer text-muted-foreground">
            <t.icon className="h-4 w-4 text-primary" />
            <span>+ {t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}


// ── Per-Lesson Resources Editor ───────────────────────────────────────────
function LessonResourcesEditor({ resources = [], onChange }) {
  const [titleInput, setTitleInput] = useState('');
  const [urlInput,   setUrlInput]   = useState('');
  const inputRef = useRef(null);

  const fileIcon = (type) => {
    if (type === 'pdf')  return <FileText className="h-4 w-4 text-red-500 shrink-0" />;
    if (type === 'image') return <ImgIcon  className="h-4 w-4 text-blue-500 shrink-0" />;
    if (type === 'archive') return <Archive className="h-4 w-4 text-yellow-500 shrink-0" />;
    return <File className="h-4 w-4 text-muted-foreground shrink-0" />;
  };

  const addLink = () => {
    if (!titleInput.trim() || !urlInput.trim()) return;
    onChange([...resources, {
      id: `tmp_${Date.now()}`, title: titleInput.trim(),
      url: urlInput.trim(), file_type: 'link',
    }]);
    setTitleInput(''); setUrlInput('');
  };

  const handleFile = (file) => {
    if (!file) return;
    if (file.size > 50*1024*1024) { alert('Max 50MB'); return; }
    onChange([...resources, {
      id: `tmp_${Date.now()}`, title: file.name,
      url: URL.createObjectURL(file),
      file_type: file.name.split('.').pop().toLowerCase(),
      _file: file, _pending: true,
    }]);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-2">
      <input ref={inputRef} type="file" className="hidden"
        onChange={e => handleFile(e.target.files[0])} />

      {resources.length > 0 && (
        <div className="space-y-1.5">
          {resources.map(r => (
            <div key={r.id} className="flex items-center gap-2 p-2 rounded-lg bg-background border border-border/60 group">
              {fileIcon(r.file_type)}
              <span className="text-xs flex-1 truncate">{r.title}</span>
              <button type="button" onClick={() => onChange(resources.filter(x => x.id !== r.id))}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={() => inputRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/10 text-xs font-medium transition-all cursor-pointer text-muted-foreground">
        <Upload className="h-3.5 w-3.5" /> Upload file (PDF, DOC, ZIP…)
      </button>

      <div className="flex gap-2">
        <input value={titleInput} onChange={e => setTitleInput(e.target.value)}
          placeholder="Link title"
          className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary" />
        <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
          placeholder="https://…"
          onKeyDown={e => e.key==='Enter' && addLink()}
          className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary" />
        <button type="button" onClick={addLink}
          className="px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-lg hover:bg-primary/90 transition-colors shrink-0">
          Add
        </button>
      </div>
    </div>
  );
}

// ── Lesson Item Editor ──────────────────────────────────────────────────────
function CurriculumItemEditor({ item, index, onUpdate, onRemove, hasResources = false }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className={cn('rounded-xl border overflow-hidden shadow-sm transition-all',
      item.is_final ? 'border-warning/40 bg-warning/5' : 'border-border/50 bg-background')}>
      <div className="flex items-center gap-3 p-3 cursor-pointer select-none group"
        onClick={() => setIsOpen(!isOpen)}>
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/20 group-hover:text-muted-foreground/40 shrink-0" />
        <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center border text-[10px] font-bold shrink-0',
          item.is_final
            ? 'bg-warning/20 border-warning/40 text-warning'
            : item.type === 'quiz'
            ? 'bg-orange-500/10 border-orange-500/20 text-orange-500'
            : 'bg-primary/10 border-primary/20 text-primary')}>
          {item.is_final ? <Flag className="h-3.5 w-3.5" />
           : item.type === 'quiz' ? <HelpCircle className="h-3.5 w-3.5" />
           : <Video className="h-3.5 w-3.5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate">
              {item.title || (item.type === 'quiz' ? 'New Quiz' : 'New Lesson')}
            </p>
            {item.is_final && (
              <span className="text-[9px] font-bold bg-warning/20 text-warning px-1.5 py-0.5 rounded-full uppercase shrink-0">
                Final Exam
              </span>
            )}
          </div>
          <span className={cn('text-[9px] font-black uppercase px-1.5 py-0.5 rounded mt-0.5 inline-block',
            item.type === 'quiz' ? 'bg-orange-500/10 text-orange-500' : 'bg-primary/10 text-primary')}>
            {item.type}
          </span>
        </div>
        {isOpen
          ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </div>

      {isOpen && (
        <div className="p-4 bg-muted/5 border-t border-border space-y-4">
          {/* Title */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Title</label>
            <input value={item.title || ''}
              onChange={e => onUpdate({ title: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              placeholder={item.type === 'quiz' ? 'Quiz title…' : 'Lesson title…'} />
          </div>

          {item.type === 'video' && (
            <>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Video URL</label>
                <VideoUrlInput currentUrl={item.videoUrl || ''} onChanged={(url) => onUpdate({ videoUrl: url })} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Lesson Notes</label>
                <textarea value={item.content || ''}
                  onChange={e => onUpdate({ content: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs outline-none min-h-[60px] resize-none"
                  placeholder="Add lesson notes…" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Duration</label>
                <input value={item.duration || ''}
                  onChange={e => onUpdate({ duration: e.target.value })}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs outline-none"
                  placeholder="e.g. 15 min" />
              </div>
              {hasResources && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                    <Download className="h-3 w-3" /> Lesson Resources
                    <span className="font-normal normal-case text-muted-foreground/60">(files students can download)</span>
                  </label>
                  <LessonResourcesEditor
                    resources={item.resources || []}
                    onChange={res => onUpdate({ resources: res })}
                  />
                </div>
              )}
            </>
          )}

          {item.type === 'quiz' && (
            <>
              {/* Final exam toggle */}
              <div className={cn('flex items-center justify-between p-3 rounded-xl border transition-all',
                item.is_final ? 'bg-warning/10 border-warning/40' : 'bg-background border-border')}>
                <div className="flex items-center gap-2">
                  <Flag className={cn('h-4 w-4', item.is_final ? 'text-warning' : 'text-muted-foreground')} />
                  <div>
                    <p className="text-xs font-bold">Mark as Final Exam</p>
                    <p className="text-[10px] text-muted-foreground">Only the final exam generates a certificate</p>
                  </div>
                </div>
                <Switch checked={!!item.is_final}
                  onChange={val => onUpdate({ is_final: val })} />
              </div>
              {/* Quiz questions */}
              <QuizEditor item={item} onUpdate={onUpdate} />
            </>
          )}

          <div className="pt-2 flex justify-end">
            <Button variant="ghost" size="sm" onClick={onRemove}
              className="text-xs text-destructive hover:bg-destructive/10">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-muted/5 border border-border p-3 rounded-xl flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[9px] uppercase font-bold text-muted-foreground">{label}</p>
        <p className="text-sm font-bold">{value}</p>
      </div>
    </div>
  );
}

// ── Perk Toggle ─────────────────────────────────────────────────────────────
function PerkToggle({ icon: Icon, label, description, checked, onChange, highlight }) {
  return (
    <div className={cn(
      'flex items-center justify-between p-3.5 rounded-xl border transition-all',
      checked && highlight ? 'bg-primary/5 border-primary/30' : 'bg-background border-border'
    )}>
      <div className="flex items-center gap-3">
        <Icon className={cn('h-4 w-4', checked ? 'text-primary' : 'text-muted-foreground')} />
        <div>
          <p className={cn('text-xs font-bold uppercase', checked ? 'text-foreground' : 'text-muted-foreground')}>
            {label}
          </p>
          {description && <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      <Switch checked={!!checked} onChange={v => typeof onChange === 'function' && onChange(v)} />
    </div>
  );
}

// ── Main Export ──────────────────────────────────────────────────────────────
export function CurriculumSection({
  sections = [],
  coursePerks = { hasCertificate: false, lifetimeAccess: true, hasResources: false },
  updateCoursePerks = () => {},
  courseResources = [],
  updateCourseResources = () => {},
  addSection = () => {},
  addLesson = () => {},
  removeSection = () => {},
  updateSectionTitle = () => {},
  updateLesson = () => {},
  removeLesson = () => {},
  onBack = () => {},
  onNext = () => {},
}) {
  const perks = coursePerks || {};
  const totalLessons = sections.reduce((a, s) => a + (s.lessons?.length || 0), 0);
  const videoCount   = sections.reduce((a, s) => a + (s.lessons?.filter(l => l.type === 'video').length || 0), 0);
  const hasExam = sections.some(s => s.lessons?.some(l => l.is_final));

  return (
    <div className="space-y-5 pb-20">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={BookOpen} label="Lessons"  value={totalLessons} />
        <StatCard icon={Video}    label="Videos"   value={videoCount} />
        <StatCard icon={Layout}   label="Sections" value={sections.length} />
      </div>

      {/* Final exam warning */}
      {perks.hasCertificate && !hasExam && totalLessons > 0 && (
        <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/30 rounded-xl text-xs text-warning">
          <Flag className="h-4 w-4 shrink-0 mt-0.5" />
          <p><strong>Certificate perk is ON</strong> — add a Quiz lesson and toggle "Mark as Final Exam" so students can earn a certificate.</p>
        </div>
      )}

      {/* Sections */}
      {sections.map((section, index) => (
        <Card key={section.id} className="border-border shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/10 p-4 flex flex-row items-center justify-between">
            <div className="flex flex-col flex-1">
              <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Section {index + 1}</span>
              <input value={section.title || ''}
                onChange={e => updateSectionTitle(section.id, e.target.value)}
                className="bg-transparent border-none text-sm font-bold focus:ring-0 p-0 w-full outline-none"
                placeholder="e.g. Module 1: Introduction" />
            </div>
            <Button variant="ghost" size="sm" onClick={() => removeSection(section.id)}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive ml-2 shrink-0">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {(section.lessons || []).map((item, iIdx) => (
              <CurriculumItemEditor key={item.id} item={item} index={iIdx}
                onUpdate={data => updateLesson(section.id, item.id, data)}
                onRemove={() => removeLesson(section.id, item.id)}
                hasResources={!!perks.hasResources} />
            ))}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => addLesson(section.id, 'video')}
                className="border-dashed border-primary/20 bg-primary/5 hover:bg-primary/10 text-xs h-10">
                <Plus className="h-3.5 w-3.5 mr-1.5 text-primary" /> Video Lesson
              </Button>
              <Button variant="outline" size="sm" onClick={() => addLesson(section.id, 'quiz')}
                className="border-dashed border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 text-xs h-10">
                <HelpCircle className="h-3.5 w-3.5 mr-1.5 text-orange-500" /> Quiz Lesson
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Add Section button */}
      <Button variant="outline" onClick={addSection}
        className="w-full h-12 border-2 border-dashed hover:border-primary/40 hover:bg-primary/5 text-xs font-bold uppercase">
        <Layout className="h-4 w-4 mr-2" /> Add New Section
      </Button>

      {/* ── Course Perks ── */}
      <Card className="overflow-hidden border-primary/20">
        <div className="p-4 bg-primary/5 border-b border-primary/10">
          <h3 className="text-sm font-bold">Course Perks</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Toggle on the perks this course offers to students.
          </p>
        </div>
        <div className="p-4 space-y-3">
          <PerkToggle
            icon={Award}
            label="Certificate of Completion"
            description="Students earn a certificate after passing the final exam"
            checked={!!perks.hasCertificate}
            onChange={v => updateCoursePerks({ ...perks, hasCertificate: v })}
            highlight
          />
          <PerkToggle
            icon={BookOpen}
            label="Lifetime Access"
            description="Students keep access forever (toggle OFF for 1-year access)"
            checked={!!perks.lifetimeAccess}
            onChange={v => updateCoursePerks({ ...perks, lifetimeAccess: v })}
            highlight
          />
          <PerkToggle
            icon={Download}
            label="Downloadable Resources"
            description="Students can download the course resources you upload"
            checked={!!perks.hasResources}
            onChange={v => updateCoursePerks({ ...perks, hasResources: v })}
            highlight
          />
        </div>
      </Card>

      {/* Navigation */}
      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border">
        <Button variant="ghost" onClick={onBack} className="flex-1 h-12 text-xs font-bold uppercase">
          ← Back to Basics
        </Button>
        <Button onClick={onNext} className="flex-1 h-12 text-xs font-bold uppercase tracking-widest">
          Next: Pricing <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
