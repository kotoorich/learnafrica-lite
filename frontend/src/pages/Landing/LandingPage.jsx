import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, Users, Award, Play, CheckCircle, CheckCircle2, ArrowRight, Star,
  Zap, Target, TrendingUp, MessageSquare, Send, Trash2, Loader2,
  ShieldCheck, Search, XCircle, Quote, ChevronLeft, ChevronRight,
  Heart, Reply, MoreHorizontal, Edit2, Check, X, ChevronDown, ChevronUp,
  LayoutDashboard, PlusCircle, BarChart2, Receipt, Trophy, Wallet, Ticket, Settings
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api';
import { courseThumbnail } from '@/lib/courseThumbnail';
import { useOnScreen, useCountUp } from '@/lib/useOnScreen';

// ── Mini course card for landing ──────────────────────────────────────────
const CourseCard = ({ course }) => (
  <Card className="overflow-hidden transition-shadow duration-300 group flex flex-col h-full bg-card hover:shadow-lg cursor-pointer">
    <Link to={`/courses/${course.id}`}>
      <div className="relative aspect-video overflow-hidden bg-muted">
        <img src={courseThumbnail(course)} alt={course.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        {course.is_free && (
          <span className="absolute top-2 left-2 text-[10px] font-bold bg-success text-white px-2 py-0.5 rounded-full">Free</span>
        )}
      </div>
    </Link>
    <div className="p-4 flex flex-col flex-1">
      <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">{course.category}</p>
      <Link to={`/courses/${course.id}`}>
        <h3 className="font-bold text-sm line-clamp-2 hover:text-primary transition-colors">{course.title}</h3>
      </Link>
      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 flex-1">{course.description}</p>
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Star className="h-3 w-3 fill-warning text-warning" />
          {course.rating || '4.8'}
        </div>
        <div className="flex items-center gap-1"><Users className="h-3 w-3" />{course.enrollments || 0}</div>
        <span className="font-bold text-foreground">{course.is_free ? 'Free' : `$${course.price}`}</span>
      </div>
    </div>
  </Card>
);

// ── Verify Credential ─────────────────────────────────────────────────────
function VerifySection() {
  const [credId,   setCredId]   = useState('');
  const [result,   setResult]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [sectionRef, sectionVisible] = useOnScreen({ threshold: 0.2 });

  const handleVerify = async (e) => {
    e.preventDefault();
    // Aggressive client-side normalization: strip ALL whitespace anywhere in the ID
    // (users often paste with tabs, newlines, or extra spaces). Uppercase for
    // case-insensitive match. Backend does the same and also tolerates hyphens
    // being dropped/added.
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
    <section id="verify-section" ref={sectionRef} className="py-16 sm:py-20 bg-gradient-to-b from-background to-muted/20 border-t border-border">
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
    </section>
  );
}

// ── Testimonials Carousel ─────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote: "LearnAfrica Lite transformed my career. The courses are well-structured and the instructors are amazing. I went from zero coding knowledge to landing my dream job in just 6 months!",
    name:  "Adaeze Nwankwo",
    role:  "Software Developer",
    company: "TechAfrica Inc.",
    initial: "A",
    rating: 5,
    color: "from-primary to-primary/70",
  },
  {
    quote: "The Python for Data Science course was exactly what I needed. The hands-on projects and real-world examples made learning so much easier and more enjoyable than I expected.",
    name:  "Kofi Asante",
    role:  "Data Analyst",
    company: "DataHub Ghana",
    initial: "K",
    rating: 5,
    color: "from-accent to-accent/70",
  },
  {
    quote: "I love how the platform makes learning accessible and engaging. The UI/UX course helped me transition from graphic design to product design seamlessly.",
    name:  "Fatou Mbaye",
    role:  "UX Designer",
    company: "DesignLab Senegal",
    initial: "F",
    rating: 5,
    color: "from-purple-500 to-purple-400",
  },
  {
    quote: "The Cybersecurity course gave me the confidence to switch careers. The structured curriculum and real-world scenarios prepared me for everything I face at work today.",
    name:  "Emeka Okafor",
    role:  "Security Analyst",
    company: "NetGuard Lagos",
    initial: "E",
    rating: 5,
    color: "from-emerald-500 to-emerald-400",
  },
  {
    quote: "As a working mother, I needed flexible learning. LearnAfrica Lite let me study at my own pace and I earned my Digital Marketing certificate without disrupting my family life.",
    name:  "Amina Diallo",
    role:  "Digital Marketing Lead",
    company: "BrandKinetics Dakar",
    initial: "A",
    rating: 5,
    color: "from-rose-500 to-rose-400",
  },
];

function TestimonialsSection() {
  const [current,   setCurrent]   = useState(0);
  const [animating, setAnimating] = useState(false);
  const [direction, setDirection] = useState('next'); // 'next' | 'prev'
  const [paused,    setPaused]    = useState(false);
  const timerRef = useRef(null);

  // Separate, small auto-advancing strip of real community photos. Kept
  // deliberately independent from the named quote carousel below so no
  // photo is ever implied to belong to a specific named testimonial-giver.
  const COMMUNITY_PHOTOS = ['/carousel-collab.jpg', '/carousel-library.webp', '/carousel-lab.webp'];
  const [photoIdx, setPhotoIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhotoIdx(i => (i + 1) % COMMUNITY_PHOTOS.length), 4000);
    return () => clearInterval(id);
  }, []);

  const go = useCallback((idx, dir) => {
    if (animating) return;
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => {
      setCurrent(idx);
      setAnimating(false);
    }, 350);
  }, [animating]);

  const next = useCallback(() => go((current + 1) % TESTIMONIALS.length, 'next'), [current, go]);
  const prev = useCallback(() => go((current - 1 + TESTIMONIALS.length) % TESTIMONIALS.length, 'prev'), [current, go]);

  // Auto-advance every 5 seconds
  useEffect(() => {
    if (paused) return;
    timerRef.current = setInterval(next, 5000);
    return () => clearInterval(timerRef.current);
  }, [next, paused]);

  const t = TESTIMONIALS[current];

  return (
    <section className="py-16 sm:py-24 bg-gradient-to-b from-muted/30 to-background overflow-hidden">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 rounded-full bg-warning/10 px-4 py-1.5 text-sm font-semibold text-warning mb-4">
            <Star className="h-4 w-4 fill-warning" /> Learner Stories
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold">What Our Learners Say</h2>
          <p className="text-muted-foreground mt-3 text-base sm:text-lg">
            Join thousands of satisfied learners transforming their careers.
          </p>
        </div>

        {/* Real community photos — a separate visual strip, intentionally
            not attached to any single named quote below. */}
        <div className="max-w-md mx-auto mb-12 sm:mb-16 rounded-2xl overflow-hidden shadow-lg aspect-[16/9] relative">
          {COMMUNITY_PHOTOS.map((src, i) => (
            <img
              key={src}
              src={src}
              alt="Real students learning with LearnAfrica"
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
              style={{ opacity: i === photoIdx ? 1 : 0 }}
            />
          ))}
        </div>

        {/* Carousel */}
        <div className="relative max-w-4xl mx-auto"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}>

          {/* Card */}
          <div style={{
            opacity: animating ? 0 : 1,
            transition: 'opacity 0.4s ease',
          }}>
            <Card className="relative p-8 sm:p-12 overflow-hidden border-2 border-border/60 bg-card shadow-xl">
              {/* Decorative gradient blob */}
              <div className={cn(
                'absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl opacity-10 bg-gradient-to-br',
                t.color
              )} />
              <div className={cn(
                'absolute -bottom-16 -left-16 h-48 w-48 rounded-full blur-3xl opacity-10 bg-gradient-to-br',
                t.color
              )} />

              {/* Quote icon */}
              <div className={cn(
                'inline-flex h-12 w-12 items-center justify-center rounded-2xl mb-6 bg-gradient-to-br text-white',
                t.color
              )}>
                <Quote className="h-6 w-6" />
              </div>

              {/* Stars */}
              <div className="flex gap-1 mb-5">
                {[...Array(t.rating)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-warning text-warning" />
                ))}
              </div>

              {/* Quote text */}
              <blockquote className="text-lg sm:text-xl text-foreground font-medium leading-relaxed mb-8 relative z-10">
                "{t.quote}"
              </blockquote>

              {/* Author */}
              <div className="flex items-center gap-4">
                <div className={cn(
                  'h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0 bg-gradient-to-br',
                  t.color
                )}>
                  {t.initial}
                </div>
                <div>
                  <p className="font-bold text-foreground">{t.name}</p>
                  <p className="text-sm text-muted-foreground">{t.role} at <span className="text-primary font-medium">{t.company}</span></p>
                </div>
              </div>
            </Card>
          </div>

          {/* Prev / Next arrows */}
          <button onClick={prev}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 sm:-translate-x-6 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-background border-2 border-border shadow-lg hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all z-10">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={next}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 sm:translate-x-6 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-background border-2 border-border shadow-lg hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all z-10">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Dot indicators */}
        <div className="flex items-center justify-center gap-2 mt-8">
          {TESTIMONIALS.map((_, i) => (
            <button key={i} onClick={() => go(i, i > current ? 'next' : 'prev')}
              className={cn(
                'rounded-full transition-all duration-300',
                i === current
                  ? 'bg-primary w-8 h-2.5'
                  : 'bg-muted-foreground/30 hover:bg-muted-foreground/50 w-2.5 h-2.5'
              )} />
          ))}
        </div>


      </div>
    </section>
  );
}

// ── Community Discussion — TikTok-style ──────────────────────────────────
const COLORS = ['bg-primary','bg-accent','bg-purple-500','bg-emerald-500','bg-rose-500','bg-amber-500','bg-sky-500','bg-indigo-500'];
function avatarColor(name) {
  let h = 0; for (let i=0;i<(name||'U').length;i++) h+=name.charCodeAt(i);
  return COLORS[h%COLORS.length];
}
function timeAgo(s) {
  const sec = Math.floor((Date.now()-new Date(s))/1000);
  if(sec<60) return 'just now';
  if(sec<3600) return `${Math.floor(sec/60)}m`;
  if(sec<86400) return `${Math.floor(sec/3600)}h`;
  if(sec<604800) return `${Math.floor(sec/86400)}d`;
  return new Date(s).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
}
function canEdit(createdAt) {
  return Date.now()-new Date(createdAt)<24*60*60*1000;
}

// Single comment card (recursive for replies)
function CommentCard({ comment, user, isAuthenticated, onDelete, onEdit, onLike, onReply, depth=0 }) {
  const [showReplies,  setShowReplies]  = useState(depth===0 && (comment.reply_count||0)>0);
  const [replying,     setReplying]     = useState(false);
  const [replyText,    setReplyText]    = useState('');
  const [editing,      setEditing]      = useState(false);
  const [editText,     setEditText]     = useState(comment.content);
  const [likes,        setLikes]        = useState(comment.likes_count||0);
  const [liked,        setLiked]        = useState(comment.liked_by_me||false);
  const [saving,       setSaving]       = useState(false);
  const [showMenu,     setShowMenu]     = useState(false);
  const [postingReply, setPostingReply] = useState(false);
  const menuRef   = useRef(null);
  const replyRef  = useRef(null);

  const isOwner = user?.id === comment.user_id;
  const isAdmin = ['admin','superadmin'].includes(user?.role);
  const editAllowed = isOwner && canEdit(comment.created_at);

  useEffect(() => {
    const h = (e) => { if(menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    setLikes(comment.likes_count||0);
    setLiked(comment.liked_by_me||false);
  }, [comment.likes_count, comment.liked_by_me]);

  const handleLike = async () => {
    if(!isAuthenticated) return;
    const prev = liked;
    setLiked(!liked); setLikes(l=>liked?l-1:l+1);
    try { await onLike(comment.id); }
    catch { setLiked(prev); setLikes(l=>prev?l+1:l-1); }
  };

  const handleEdit = async () => {
    if(!editText.trim()) return;
    setSaving(true);
    try { await onEdit(comment.id, editText.trim()); setEditing(false); }
    catch(e) { alert(e.message); }
    setSaving(false);
  };

  const handleReply = async () => {
    if(!replyText.trim()) return;
    setPostingReply(true);
    try {
      await onReply(comment.id, replyText.trim());
      setReplyText(''); setReplying(false); setShowReplies(true);
    } catch(e) { alert(e.message); }
    setPostingReply(false);
  };

  return (
    <div className={cn('flex gap-2.5 sm:gap-3 group animate-in fade-in slide-in-from-bottom-1 duration-200',
      depth>0 && 'ml-8 sm:ml-10 mt-2 relative before:absolute before:left-[-16px] before:top-0 before:h-full before:w-px before:bg-border/50')}>
      {/* Avatar */}
      <div className={cn('h-8 w-8 sm:h-9 sm:w-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 mt-0.5',
        avatarColor(comment.user_name))}>
        {(comment.user_name||'U')[0].toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        {/* Bubble */}
        <div className="bg-card border border-border/60 rounded-2xl rounded-tl-sm px-3.5 py-2.5 relative">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="font-semibold text-xs text-foreground">{comment.user_name}</span>
              {comment.edited_at && (
                <span className="text-[9px] text-muted-foreground italic">(edited)</span>
              )}
              <span className="text-[10px] text-muted-foreground">{timeAgo(comment.created_at)}</span>
            </div>
            {/* Menu */}
            {(isOwner||isAdmin) && (
              <div className="relative shrink-0" ref={menuRef}>
                <button onClick={()=>setShowMenu(s=>!s)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-muted transition-all">
                  <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-6 z-50 w-36 rounded-xl bg-card border border-border shadow-xl py-1 animate-in fade-in zoom-in-95 duration-150">
                    {editAllowed && (
                      <button onClick={()=>{setEditing(true);setShowMenu(false);}}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-muted transition-colors text-foreground">
                        <Edit2 className="h-3.5 w-3.5 text-primary" /> Edit
                      </button>
                    )}
                    {(isOwner||isAdmin) && (
                      <button onClick={()=>{onDelete(comment.id);setShowMenu(false);}}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-muted transition-colors text-destructive">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Content or Edit */}
          {editing ? (
            <div className="space-y-2">
              <textarea value={editText} onChange={e=>setEditText(e.target.value)}
                maxLength={500} rows={2}
                className="w-full text-sm bg-muted/30 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary resize-none border border-border" />
              <div className="flex gap-2">
                <button onClick={handleEdit} disabled={saving}
                  className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded-full text-xs font-medium hover:bg-primary/90 transition-colors">
                  {saving?<Loader2 className="h-3 w-3 animate-spin"/>:<Check className="h-3 w-3"/>} Save
                </button>
                <button onClick={()=>{setEditing(false);setEditText(comment.content);}}
                  className="flex items-center gap-1 px-3 py-1 bg-muted text-muted-foreground rounded-full text-xs hover:bg-muted/80 transition-colors">
                  <X className="h-3 w-3"/> Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-foreground/90 leading-relaxed break-words">{comment.content}</p>
          )}
        </div>

        {/* Action row */}
        <div className="flex items-center gap-4 mt-1.5 ml-1">
          {/* Like */}
          <button onClick={handleLike}
            className={cn('flex items-center gap-1 text-xs font-semibold transition-all active:scale-90',
              liked?'text-rose-500':'text-muted-foreground hover:text-rose-500',
              !isAuthenticated&&'opacity-50 cursor-default')}>
            <Heart className={cn('h-3.5 w-3.5 transition-all', liked&&'fill-rose-500 scale-110')} />
            {likes>0&&<span>{likes}</span>}
          </button>

          {/* Reply */}
          {isAuthenticated && depth===0 && (
            <button onClick={()=>{setReplying(r=>!r);setTimeout(()=>replyRef.current?.focus(),50);}}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors">
              <Reply className="h-3.5 w-3.5" /> Reply
            </button>
          )}

          {/* Show/hide replies */}
          {(comment.replies||[]).length>0 && (
            <button onClick={()=>setShowReplies(s=>!s)}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
              {showReplies?<ChevronUp className="h-3 w-3"/>:<ChevronDown className="h-3 w-3"/>}
              {showReplies?'Hide':'View'} {(comment.replies||[]).length} {(comment.replies||[]).length===1?'reply':'replies'}
            </button>
          )}
        </div>

        {/* Reply composer */}
        {replying && (
          <div className="flex gap-2 mt-2 ml-1 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className={cn('h-7 w-7 rounded-full flex items-center justify-center text-white font-bold text-[10px] shrink-0',
              avatarColor(user?.name))}>
              {(user?.name||'U')[0].toUpperCase()}
            </div>
            <div className="flex-1 flex gap-2">
              <input ref={replyRef} value={replyText}
                onChange={e=>setReplyText(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleReply();}}}
                placeholder={`Reply to ${comment.user_name}…`}
                maxLength={300}
                className="flex-1 h-8 rounded-full border border-input bg-background px-3 text-xs outline-none focus:ring-1 focus:ring-primary" />
              <button onClick={handleReply} disabled={postingReply||!replyText.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0">
                {postingReply?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        )}

        {/* Nested replies */}
        {showReplies && (comment.replies||[]).length>0 && (
          <div className="mt-2 space-y-2">
            {(comment.replies||[]).map(reply=>(
              <CommentCard key={reply.id} comment={reply} user={user}
                isAuthenticated={isAuthenticated}
                onDelete={onDelete} onEdit={onEdit} onLike={onLike}
                onReply={onReply} depth={depth+1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentsSection({ user, isAuthenticated }) {
  const [comments,    setComments]   = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [text,        setText]       = useState('');
  const [posting,     setPosting]    = useState(false);
  const [error,       setError]      = useState('');
  const textareaRef   = useRef(null);
  const { socket }    = useAuth?.() || {};

  const token = () => sessionStorage.getItem('auth_token');
  const headers = (json=true) => ({
    ...(json?{'Content-Type':'application/json'}:{}),
    ...(token()?{Authorization:`Bearer ${token()}`}:{})
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/homepage/comments`);
      const d = await r.json();
      setComments(d.comments||[]);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(()=>{ load(); }, [load]);

  // Real-time SocketIO listeners
  useEffect(() => {
    const s = window.__learnafricaSocket;
    if (!s) return;
    const onNew = (comment) => {
      if (!comment.parent_id) {
        // Dedupe: skip if a comment with this id is already in the list
        // (the poster added it optimistically after their POST)
        setComments(prev => prev.some(c => c.id === comment.id) ? prev : [comment, ...prev]);
      } else {
        setComments(prev => prev.map(c =>
          c.id === comment.parent_id
            ? {
                ...c,
                replies: (c.replies || []).some(r => r.id === comment.id)
                  ? c.replies
                  : [...(c.replies||[]), comment],
                reply_count: (c.reply_count||0)+1
              }
            : c
        ));
      }
    };
    const onEdit = (updated) => {
      setComments(prev => prev.map(c => {
        if(c.id===updated.id) return {...c, content:updated.content, edited_at:updated.edited_at};
        return {...c, replies:(c.replies||[]).map(r=>r.id===updated.id?{...r,content:updated.content,edited_at:updated.edited_at}:r)};
      }));
    };
    const onDelete = ({id}) => {
      setComments(prev => prev
        .filter(c=>c.id!==id)
        .map(c=>({...c, replies:(c.replies||[]).filter(r=>r.id!==id)}))
      );
    };
    const onLike = ({id, likes_count}) => {
      setComments(prev => prev.map(c => {
        if(c.id===id) return {...c, likes_count};
        return {...c, replies:(c.replies||[]).map(r=>r.id===id?{...r,likes_count}:r)};
      }));
    };
    s.on('new_homepage_comment', onNew);
    s.on('edit_homepage_comment', onEdit);
    s.on('delete_homepage_comment', onDelete);
    s.on('like_homepage_comment', onLike);
    return () => {
      s.off('new_homepage_comment', onNew);
      s.off('edit_homepage_comment', onEdit);
      s.off('delete_homepage_comment', onDelete);
      s.off('like_homepage_comment', onLike);
    };
  }, []);

  const post = async (e) => {
    e.preventDefault();
    if(!text.trim()) return;
    setPosting(true); setError('');
    try {
      const r = await fetch(`${API_BASE}/api/homepage/comments`,  {
        method:'POST', headers:headers(),
        body: JSON.stringify({content:text.trim()})
      });
      const d = await r.json();
      if(!r.ok) throw new Error(d.error||'Failed');
      // Dedupe: only add if this comment isn't already in the list
      // (the socket 'new_homepage_comment' event may have already added it)
      setComments(prev => prev.some(c => c.id === d.comment.id) ? prev : [d.comment, ...prev]);
      setText('');
      if(textareaRef.current) textareaRef.current.style.height='auto';
    } catch(e){ setError(e.message); }
    setPosting(false);
  };

  const handleDelete = async (id) => {
    try {
      await fetch(`${API_BASE}/api/homepage/comments/${id}`, {method:'DELETE',headers:headers(false)});
      setComments(prev=>prev
        .filter(c=>c.id!==id)
        .map(c=>({...c,replies:(c.replies||[]).filter(r=>r.id!==id)}))
      );
    } catch {}
  };

  const handleEdit = async (id, content) => {
    const r = await fetch(`${API_BASE}/api/homepage/comments/${id}`, {
      method:'PUT', headers:headers(),
      body:JSON.stringify({content})
    });
    const d = await r.json();
    if(!r.ok) throw new Error(d.error||'Failed');
    setComments(prev=>prev.map(c=>{
      if(c.id===id) return {...c,content:d.comment.content,edited_at:d.comment.edited_at};
      return {...c,replies:(c.replies||[]).map(rp=>rp.id===id?{...rp,content:d.comment.content,edited_at:d.comment.edited_at}:rp)};
    }));
  };

  const handleLike = async (id) => {
    const r = await fetch(`${API_BASE}/api/homepage/comments/${id}/like`, {method:'POST',headers:headers(false)});
    const d = await r.json();
    if(!r.ok) throw new Error(d.error||'Failed');
    setComments(prev=>prev.map(c=>{
      if(c.id===id) return {...c,likes_count:d.likes_count,liked_by_me:d.liked};
      return {...c,replies:(c.replies||[]).map(rp=>rp.id===id?{...rp,likes_count:d.likes_count,liked_by_me:d.liked}:rp)};
    }));
  };

  const handleReply = async (parentId, content) => {
    const r = await fetch(`${API_BASE}/api/homepage/comments`, {
      method:'POST', headers:headers(),
      body:JSON.stringify({content, parent_id:parentId})
    });
    const d = await r.json();
    if(!r.ok) throw new Error(d.error||'Failed');
    // Dedupe: only add if this reply isn't already there (socket may have delivered it first)
    setComments(prev=>prev.map(c=> {
      if (c.id !== parentId) return c;
      if ((c.replies || []).some(r => r.id === d.comment.id)) return c;
      return {...c, replies:[...(c.replies||[]),d.comment], reply_count:(c.reply_count||0)+1};
    }));
  };

  const grow = (e) => {
    setText(e.target.value);
    e.target.style.height='auto';
    e.target.style.height=Math.min(e.target.scrollHeight,140)+'px';
  };

  const totalCount = comments.reduce((a,c)=>a+1+(c.replies||[]).length,0);

  return (
    <section id="comments-section" className="py-14 sm:py-20 bg-muted/10 border-t border-border">
      <div className="container mx-auto px-4 max-w-2xl">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-semibold text-primary mb-3">
            <MessageSquare className="h-4 w-4" /> Community Discussion
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold">Join the Conversation</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Share your thoughts and connect with fellow learners.
          </p>
        </div>

        {/* Composer */}
        {isAuthenticated ? (
          <form onSubmit={post} className="mb-6">
            <div className="flex gap-2.5 items-start">
              <div className={cn('h-9 w-9 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0',
                avatarColor(user?.name))}>
                {(user?.name||'U')[0].toUpperCase()}
              </div>
              <div className="flex-1 rounded-2xl border border-input bg-card shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-primary transition-all">
                <textarea ref={textareaRef} value={text} onChange={grow}
                  placeholder={`What's on your mind, ${user?.name?.split(' ')[0]||'learner'}?`}
                  maxLength={500} rows={1}
                  className="w-full px-4 pt-3 pb-1 text-sm bg-transparent resize-none outline-none placeholder:text-muted-foreground/60" />
                <div className="flex items-center justify-between px-4 pb-3 pt-1">
                  <span className={cn('text-[10px]',text.length>450?'text-warning font-medium':'text-muted-foreground')}>
                    {text.length}/500
                  </span>
                  <div className="flex items-center gap-2">
                    {error&&<p className="text-xs text-destructive">{error}</p>}
                    <Button type="submit" size="sm" disabled={posting||!text.trim()}
                      className="gap-1.5 rounded-full h-8 px-4">
                      {posting?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Send className="h-3.5 w-3.5"/>}
                      Post
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </form>
        ) : (
          <div className="mb-6 p-5 rounded-2xl bg-card border border-border text-center shadow-sm">
            <MessageSquare className="h-8 w-8 text-primary/50 mx-auto mb-2" />
            <p className="font-semibold text-sm text-foreground mb-1">Join the discussion</p>
            <p className="text-muted-foreground text-xs mb-4">Log in to comment, reply, and like.</p>
            <div className="flex items-center justify-center gap-3">
              <Link to="/login"><Button size="sm" variant="outline">Log In</Button></Link>
              <Link to="/signup"><Button size="sm">Sign Up Free</Button></Link>
            </div>
          </div>
        )}

        {/* Count */}
        {!loading && totalCount>0 && (
          <p className="text-xs text-muted-foreground font-medium mb-4 flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5" />
            {totalCount} comment{totalCount!==1?'s':''}
          </p>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
          </div>
        ) : comments.length===0 ? (
          <div className="text-center py-12 rounded-2xl border-2 border-dashed border-border/50">
            <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
            <p className="font-medium text-muted-foreground">No comments yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Be the first to share your thoughts!</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2 scroll-smooth"
               style={{ scrollbarWidth: 'thin' }}>
            {comments.map(c=>(
              <CommentCard key={c.id} comment={c} user={user}
                isAuthenticated={isAuthenticated}
                onDelete={handleDelete} onEdit={handleEdit}
                onLike={handleLike} onReply={handleReply}
                depth={0} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Static data ────────────────────────────────────────────────────────────
const features = [
  { icon: BookOpen, title: 'Expert-Led Courses',  description: 'Learn from industry professionals with real-world experience.' },
  { icon: Zap,      title: 'Learn at Your Pace',  description: 'Access courses anytime, anywhere on any device.' },
  { icon: Target,   title: 'Practical Projects',  description: 'Build real projects that strengthen your portfolio.' },
  { icon: Award,    title: 'Earn Certificates',   description: 'Get recognised certificates upon course completion.' },
];

// ── Stats section with count-up animation ────────────────────────────────
function AnimatedStatsSection({ stats }) {
  const [ref, visible] = useOnScreen({ threshold: 0.3 });
  return (
    <section ref={ref} className="py-12 border-y border-border bg-card">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <AnimatedStat key={s.label} stat={s} active={visible} delay={i * 100} />
          ))}
        </div>
      </div>
    </section>
  );
}

function AnimatedStat({ stat, active, delay }) {
  // Try to extract a numeric portion so we can count up. Strip commas.
  const raw = String(stat.value).replace(/,/g, '');
  const numMatch = raw.match(/^([\d.]+)/);
  const target = numMatch ? parseFloat(numMatch[1]) : 0;
  const suffix = numMatch ? raw.slice(numMatch[1].length) : raw;
  const count = useCountUp(target, active, 1600);
  // Non-numeric values ("Free", "Verifiable") are shown as-is.
  const display = !numMatch
    ? raw
    : Number.isInteger(target) ? Math.round(count).toLocaleString() : count.toFixed(1);

  return (
    <div
      className={cn(
        'text-center transition-all duration-700 ease-out',
        active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <p className="text-2xl sm:text-3xl font-bold text-primary tabular-nums">
        {display}{numMatch ? suffix : ''}
      </p>
      <p className="text-sm text-muted-foreground">{stat.label}</p>
    </div>
  );
}

// ── Features section with scroll reveal + hover-lift ────────────────────
function AnimatedFeaturesSection({ features }) {
  const [ref, visible] = useOnScreen({ threshold: 0.15 });
  return (
    <section ref={ref} className="py-20">
      <div className="container mx-auto px-4">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 items-center">
          {/* Real photo — a genuine campus moment, replacing what used to
              be a plain centered heading with nothing visual beside it. */}
          <div
            className={cn(
              'transition-all duration-700 order-2 lg:order-1',
              visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-6'
            )}
          >
            <img
              src="/feature-student.jpg"
              alt="A LearnAfrica student on campus"
              loading="lazy"
              className="rounded-2xl shadow-xl w-full h-auto object-cover aspect-[4/3]"
            />
          </div>

          <div className="order-1 lg:order-2">
            <div
              className={cn(
                'max-w-xl transition-all duration-700 mb-8',
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
              )}
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary mb-3">Why LearnAfrica</p>
              <h2 className="text-3xl font-bold tracking-tight">Built for how Africa learns</h2>
              <p className="mt-3 text-muted-foreground">
                Practical, mobile-first and made by people who understand the context.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {features.map((f, i) => (
                <Card
                  key={f.title}
                  className={cn(
                    'p-6 border-border/60 transition-all',
                    visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
                  )}
                  style={{
                    transitionDuration: '700ms',
                    transitionDelay: `${100 + i * 120}ms`,
                  }}
                >
                  <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-base mb-1.5">{f.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── How It Works section with staggered scroll reveal ────────────────────
function AnimatedHowItWorksSection({ isAuthenticated }) {
  const [ref, visible] = useOnScreen({ threshold: 0.15 });
  const steps = [
    {
      step: '01',
      icon: Users,
      title: 'Create Your Account',
      description: 'Sign up for free in seconds. No credit card needed to explore hundreds of courses.',
      color: 'text-primary bg-primary/10 border-primary/20',
    },
    {
      step: '02',
      icon: BookOpen,
      title: 'Choose a Course',
      description: 'Browse courses by category, difficulty, or instructor. Filter by free or paid.',
      color: 'text-primary bg-primary/10 border-primary/20',
    },
    {
      step: '03',
      icon: Play,
      title: 'Learn at Your Pace',
      description: 'Watch video lessons, take notes, join discussions, and complete quizzes on your schedule.',
      color: 'text-primary bg-primary/10 border-primary/20',
    },
    {
      step: '04',
      icon: Award,
      title: 'Earn Your Certificate',
      description: 'Pass the final exam and download a verifiable certificate to share with employers.',
      color: 'text-primary bg-primary/10 border-primary/20',
    },
  ];

  return (
    <section ref={ref} className="py-16 sm:py-20 bg-muted/20 border-b border-border">
      <div className="container mx-auto px-4">
        <div
          className={cn(
            'max-w-2xl mx-auto text-center mb-14 transition-all duration-700',
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          )}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-primary mb-4">
            <Zap className="h-3.5 w-3.5" /> Simple Process
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">How It Works</h2>
          <p className="text-muted-foreground mt-3 text-base sm:text-lg">
            Start learning in minutes — no complicated setup, just progress.
          </p>
        </div>

        <div className="relative">
          <div className="hidden lg:block absolute top-8 left-1/2 -translate-x-1/2 w-[calc(100%-220px)] h-0.5 bg-gradient-to-r from-transparent via-border to-transparent" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((item, i) => (
              <div
                key={i}
                className={cn(
                  'relative flex flex-col items-center text-center group transition-all duration-700',
                  visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                )}
                style={{ transitionDelay: `${200 + i * 150}ms` }}
              >
                <div className="relative mb-6">
                  <div className={`flex h-16 w-16 items-center justify-center rounded-2xl border-2 bg-background transition-shadow duration-300 group-hover:shadow-md ${item.color}`}>
                    <item.icon className="h-7 w-7" />
                  </div>
                  <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-black">
                    {item.step}
                  </span>
                </div>
                <h3 className="font-bold text-base mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>

        {!isAuthenticated && (
          <div
            className={cn(
              'text-center mt-12 transition-all duration-700',
              visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            )}
            style={{ transitionDelay: '900ms' }}
          >
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link to="/signup">
                <Button size="lg" className="gap-2 px-8">
                  Get Started Free <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline" className="gap-2 px-8">
                  Log In
                </Button>
              </Link>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Already have an account? Log in to continue where you left off.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Main LandingPage ────────────────────────────────────────────────────────
function heroFor(user, isAuthenticated) {
  if (!isAuthenticated) {
    return {
      badge: 'Built in Ghana, for learners across Africa',
      title: <>Learn skills that open doors, <span className="text-primary">right here in Africa</span></>,
      text: 'Practical courses from people who understand your world. Learn on your phone at your own pace, earn a certificate anyone can verify, and grow with a community that cheers you on.',
      primary: { to: '/signup', label: 'Get Started Free' },
      secondary: [
        { to: '/courses', label: 'Browse Courses', icon: Play },
        { to: '/login', label: 'Login' },
      ],
    };
  }
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (user?.name || '').trim().split(/\s+/)[0] || 'friend';
  const title = <>Welcome back, <span className="text-primary">{firstName}</span></>;
  const badge = `${greeting}! Great to see you again`;
  const role = user?.role;

  if (['admin', 'superadmin'].includes(role)) {
    return {
      badge, title,
      text: 'Thanks for keeping LearnAfrica running. Review applications, look after courses and keep an eye on how learners are doing.',
      primary: { to: '/admin', label: 'Open Admin Panel' },
      secondary: [{ to: '/instructor/courses', label: 'Manage Courses' }],
      actions: [
        { to: '/admin', label: 'Admin Panel', desc: 'Users, applications & stats', icon: LayoutDashboard },
        { to: '/instructor/courses', label: 'Manage Courses', desc: 'Create and edit courses', icon: BookOpen },
        { to: '/receipts', label: 'Receipts', desc: 'Payment history', icon: Receipt },
        { to: '/settings', label: 'Settings', desc: 'Account preferences', icon: Settings },
      ],
    };
  }
  if (role === 'instructor' && ['pending', 'rejected'].includes(user?.instructor_status)) {
    return {
      badge, title,
      text: "Your instructor application is with our team. Make sure your payout method is saved on your Profile; we'll let you know as soon as you're approved.",
      primary: { to: '/instructor', label: 'View Application Status' },
      secondary: [{ to: '/profile', label: 'Add Payout Method' }],
      actions: [
        { to: '/instructor', label: 'Application Status', desc: 'See where things stand', icon: LayoutDashboard },
        { to: '/profile', label: 'Payout Method', desc: 'Required before approval', icon: Wallet },
        { to: '/settings', label: 'Settings', desc: 'Account preferences', icon: Settings },
      ],
    };
  }
  if (role === 'instructor') {
    return {
      badge, title,
      text: 'Your students are learning from you right now. See how your courses are doing, or share something new today.',
      primary: { to: '/instructor', label: 'Go to My Dashboard' },
      secondary: [{ to: '/instructor/courses/create', label: 'Create a Course', icon: PlusCircle }],
      actions: [
        { to: '/instructor/courses', label: 'My Courses', desc: 'Edit and publish', icon: BookOpen },
        { to: '/instructor/analytics', label: 'Analytics', desc: 'Students & progress', icon: BarChart2 },
        { to: '/instructor/coupons', label: 'Coupons', desc: 'Discounts for students', icon: Ticket },
        { to: '/instructor/receipts', label: 'Earnings', desc: 'Receipts & payouts', icon: Wallet },
      ],
    };
  }
  return {
    badge, title,
    text: 'Pick up where you left off, or discover something new to learn today. Every lesson brings you closer to your goal.',
    primary: { to: '/dashboard', label: 'Continue Learning' },
    secondary: [{ to: '/courses', label: 'Explore Courses', icon: Play }],
    actions: [
      { to: '/dashboard', label: 'My Learning', desc: 'Your courses & progress', icon: LayoutDashboard },
      { to: '/courses', label: 'Explore Courses', desc: 'Find your next skill', icon: Search },
      { to: '/dashboard/leaderboard', label: 'Leaderboard', desc: 'See how you rank', icon: Trophy },
      { to: '/receipts', label: 'Receipts', desc: 'Your purchases', icon: Receipt },
    ],
  };
}

function QuickActions({ actions }) {
  return (
    <section className="py-10 border-b border-border bg-muted/20">
      <div className="container mx-auto px-4">
        <h2 className="text-lg font-semibold mb-4">Jump back in</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {actions.map(({ to, label, desc, icon: Icon }) => (
            <Link key={label} to={to}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 sm:p-4 hover-lift transition-colors hover:border-primary/40">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold group-hover:text-primary">{label}</span>
                <span className="block text-xs text-muted-foreground leading-snug">{desc}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingPage() {
  const { user, courses, isAuthenticated } = useAuth();

  // Live counters for the stats strip. Falls back to sensible defaults while
  // loading, and hides the strip entirely if the admin disabled it.
  const [homeStats, setHomeStats] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/homepage/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setHomeStats(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Course browsing is for visitors and students only.
  const canBrowse = !isAuthenticated || user?.role === 'student';
  const hero = heroFor(user, isAuthenticated);
  const displayCourses = canBrowse ? courses.filter(c => !c.isEnrolled).slice(0, 3) : [];
  const statsOn = homeStats?.enabled !== false;
  // Admin-set marketing numbers (fall back to the real course count while loading).
  const statCourseCount = statsOn ? (homeStats?.courses ?? courses.length) : courses.length;
  const stats = [
    { value: `${statCourseCount}+`,          label: 'Courses'      },
    { value: `${homeStats?.students ?? 0}+`, label: 'Students'     },
    { value: `${homeStats?.instructors ?? 0}+`, label: 'Instructors' },
    { value: 'Verifiable',                   label: 'Certificates' },
  ];

  return (
    <div className="flex flex-col">

      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-muted/40 via-background to-background">
        {/* Decorative gradient blobs */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute top-40 -left-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        </div>

        <div className="container mx-auto px-4 relative py-14 sm:py-20 lg:py-24">
          <div className={cn(
            'grid items-center gap-12',
            !isAuthenticated && 'lg:grid-cols-2 lg:gap-16'
          )}>
            {/* ── Text column ── */}
            <div className={cn(!isAuthenticated ? 'max-w-xl' : 'max-w-2xl')}>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-4 py-1.5 text-sm font-medium text-muted-foreground">
                <Zap className="h-4 w-4 text-primary" /> {hero.badge}
              </div>
              <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                {hero.title}
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
                {hero.text}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to={hero.primary.to}>
                  <Button size="lg" className="gap-2">{hero.primary.label} <ArrowRight className="h-5 w-5" /></Button>
                </Link>
                {hero.secondary.map(({ to, label, icon: Icon }) => (
                  <Link key={to} to={to}>
                    <Button variant="outline" size="lg" className="gap-2 bg-background/70">{Icon && <Icon className="h-5 w-5" />}{label}</Button>
                  </Link>
                ))}
              </div>
              <div className="mt-10 flex items-center gap-4">
                <div className="flex -space-x-3">
                  {['/student1.jpg','/student2.jpg','/student3.jpg','/student4.jpg','/student5.jpg'].map((src, i) => (
                    <img key={i} src={src} alt="" loading="lazy"
                      className="h-10 w-10 rounded-full border-2 border-background object-cover" />
                  ))}
                </div>
                <div>
                  <div className="flex gap-0.5">{[...Array(5)].map((_,i) => <Star key={i} className="h-4 w-4 fill-warning text-warning" />)}</div>
                  <p className="text-sm text-muted-foreground">Trusted by learners across Africa</p>
                </div>
              </div>
            </div>

            {/* ── Visual column (marketing hero only) ── */}
            {!isAuthenticated && (
              <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
                <div className="relative rounded-3xl overflow-hidden shadow-2xl ring-1 ring-border/60 aspect-[4/3]">
                  <img
                    src="/tech-skills.jpg"
                    alt="A LearnAfrica student building real technical skills"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                </div>

                {/* Floating: live learners */}
                <div className="absolute -left-3 sm:-left-6 bottom-6 flex items-center gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur px-4 py-3 shadow-xl">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </span>
                  <div>
                    <p className="text-sm font-bold leading-none">{statCourseCount}+ courses</p>
                    <p className="text-xs text-muted-foreground mt-1">across Africa</p>
                  </div>
                </div>

                {/* Floating: verifiable certificate */}
                <div className="absolute -right-2 sm:-right-5 top-6 flex items-center gap-3 rounded-2xl border border-border bg-card/95 backdrop-blur px-4 py-3 shadow-xl">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
                    <ShieldCheck className="h-5 w-5 text-success" />
                  </span>
                  <div>
                    <p className="text-sm font-bold leading-none">Verifiable</p>
                    <p className="text-xs text-muted-foreground mt-1">certificates</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {hero.actions && <QuickActions actions={hero.actions} />}

      {/* ── How It Works — sits directly under the hero so the journey reads
             as one continuous story ── */}
      {canBrowse && <AnimatedHowItWorksSection isAuthenticated={isAuthenticated} />}

      {/* ── Stats ── */}
      {statsOn && <AnimatedStatsSection stats={stats} />}

      {/* ── Features ── */}
      <AnimatedFeaturesSection features={features} />

      {/* ── Popular Courses ── */}
      {displayCourses.length > 0 && (
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary mb-3">Start learning</p>
                <h2 className="text-3xl font-bold tracking-tight">Popular Courses</h2>
                <p className="text-muted-foreground mt-2">Pick a course and begin today.</p>
              </div>
              <Link to="/courses">
                <Button variant="outline">View All <ArrowRight className="h-4 w-4 ml-2" /></Button>
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {displayCourses.map(c => <CourseCard key={c.id} course={c} />)}
            </div>
          </div>
        </section>
      )}

      {/* ── Testimonials Carousel ── */}
      <TestimonialsSection />

      {/* ── Verify ── */}
      <VerifySection />

      {/* ── Community Discussion (only for logged-in users) ── */}
      {isAuthenticated && <CommentsSection user={user} isAuthenticated={isAuthenticated} />}

      {/* ── CTA (last section on the page) ── */}
      {!isAuthenticated && <AnimatedFinalCTA />}

    </div>
  );
}

// ── Final CTA with animated background flourishes ─────────────────────────
function AnimatedFinalCTA() {
  const [ref, visible] = useOnScreen({ threshold: 0.2 });
  return (
    <section ref={ref} className="py-20">
      <div className="container mx-auto px-4">
        <Card className={cn(
          "relative overflow-hidden bg-primary p-12 text-center transition-opacity duration-700",
          visible ? 'opacity-100' : 'opacity-0'
        )}>
          <div className="relative">
            <h2 className="text-3xl font-bold text-primary-foreground mb-4">Ready to Start Learning?</h2>
            <p className="text-primary-foreground/80 mb-8">Join our growing community of African learners today.</p>
            <div className="flex gap-4 justify-center flex-wrap">
              <Link to="/signup"><Button size="lg" variant="secondary">Create Free Account</Button></Link>
              <Link to="/courses"><Button size="lg" variant="outline" className="bg-transparent border-2 border-white text-white hover:bg-white hover:text-primary transition-colors">Explore Courses</Button></Link>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
