import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, Users, Award, Play, CheckCircle, CheckCircle2, ArrowRight, Star,
  Zap, Target, TrendingUp, MessageSquare, Send, Trash2, Loader2,
  ShieldCheck, Search, XCircle, Quote, ChevronLeft, ChevronRight,
  Heart, Reply, MoreHorizontal, Edit2, Check, X, ChevronDown, ChevronUp
} from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api';
import { Suspense } from 'react'
import { CourseCardSkeleton } from '@/components/common/LoadingSkeleton'
import CourseCard from '@/components/course/CourseCard';

// ── Verify Credential ─────────────────────────────────────────────────────
export default function VerifySection() {
  const [credId, setCredId] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // --- TYPEWRITER EFFECT STATE ---
  const [placeholder, setPlaceholder] = useState('');
  const [textIndex, setTextIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  // The pool of moving example strings you want to show
  const placeholders = [
    "e.g. LA-CERT-ABCD-1A2B3C",
    "e.g. LA-BADGE-FIRS-4D5E6F",
    "Enter a Certificate ID...",
    "Enter an Achievement Badge ID..."
  ];

  // --- TYPEWRITER ENGINE ---
  useEffect(() => {
    const currentFullText = placeholders[textIndex];
    let timer;

    if (!isDeleting && charIndex < currentFullText.length) {
      // Typing phase: add a character
      timer = setTimeout(() => {
        setPlaceholder((prev) => prev + currentFullText[charIndex]);
        setCharIndex((prev) => prev + 1);
      }, 100); // Speed of typing (ms per letter)
    } else if (isDeleting && charIndex > 0) {
      // Deleting phase: slice off a character
      timer = setTimeout(() => {
        setPlaceholder((prev) => prev.slice(0, -1));
        setCharIndex((prev) => prev - 1);
      }, 40); // Speed of erasing (ms per letter)
    } else if (!isDeleting && charIndex === currentFullText.length) {
      // End of string reached: pause before starting to delete
      timer = setTimeout(() => setIsDeleting(true), 2000); // Pause time at full sentence
    } else if (isDeleting && charIndex === 0) {
      // String fully erased: move to the next item in the array
      setIsDeleting(false);
      setTextIndex((prev) => (prev + 1) % placeholders.length);
    }

    return () => clearTimeout(timer);
  }, [charIndex, isDeleting, textIndex]);


  const handleVerify = async (e) => {
    e.preventDefault();
    if (!credId.trim()) return;
    setLoading(true); 
    setResult(null); 
    setSearched(false);
    try {
      const res = await fetch(`${API_BASE}/api/verify?id=${encodeURIComponent(credId.trim())}`);
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ valid: false, message: 'Verification service unavailable.' });
    }
    setLoading(false); 
    setSearched(true);
  };

  const fmt = (s) => {
    if (!s) return '—';
    try { 
      return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); 
    } catch { 
      return s; 
    }
  };

  return (
    <section id="verify-section" className="py-16 sm:py-24 bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 max-w-2xl">
        
        {/* Header Section */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-4">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Verify a Credential</h2>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base max-w-md mx-auto">
            Enter an official certificate or badge ID below to verify its regulatory authenticity.
          </p>
        </div>

        {/* Reconstructed Centered Form Layout */}
        <form onSubmit={handleVerify} className="flex flex-col items-center gap-4 mb-8">
          <input 
            type="text" 
            value={credId}
            onChange={e => { setCredId(e.target.value); setSearched(false); setResult(null); }}
            placeholder={placeholder} // <-- Injected the moving state here
            className="w-full h-12 rounded-xl border border-input bg-background px-4 text-sm text-center focus:ring-2 focus:ring-primary outline-none transition-all placeholder:text-muted-foreground/40 font-medium" 
          />
          
          <Button 
            type="submit" 
            disabled={loading || !credId.trim()} 
            className="w-full sm:w-auto min-w-[160px] h-12 px-6 rounded-xl gap-2 shadow-sm font-medium transition-transform active:scale-[0.98]"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span>Verify Credential</span>
          </Button>
        </form>

        {/* Verification Report Display Card */}
        {searched && result && (
          <div className={cn(
            'rounded-2xl border p-6 shadow-sm transition-all animate-in fade-in slide-in-from-bottom-3 duration-3xl',
            result.valid ? 'bg-success/5 border-success/20' : 'bg-destructive/5 border-destructive/20'
          )}>
            {result.valid ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="font-bold text-success text-sm sm:text-base">
                      Valid {result.type === 'certificate' ? 'Certificate' : 'Badge'} Verified
                    </p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5 tracking-wider">{result.id}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border/60">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Holder</p>
                    <p className="font-semibold text-sm mt-0.5">{result.holder}</p>
                  </div>
                  {result.type === 'certificate' && (
                    <>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Course</p>
                        <p className="font-semibold text-sm mt-0.5">{result.course}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Instructor</p>
                        <p className="font-semibold text-sm mt-0.5">{result.instructor}</p>
                      </div>
                    </>
                  )}
                  {result.type === 'badge' && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Achievement</p>
                      <p className="font-semibold text-sm mt-0.5">{result.badge}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Issued On</p>
                    <p className="font-semibold text-sm mt-0.5">{fmt(result.issued_at)}</p>
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground pt-2 border-t border-border/40 italic">
                  This validation payload confirms the token was securely signed and registered by LearnAfrica Lite.
                </p>
              </div>
            ) : (
              <div className="flex gap-4 items-start">
                <div className="h-10 w-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                  <XCircle className="h-5 w-5 text-destructive" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-destructive text-sm sm:text-base">Signature Lookup Failed</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {result.message || 'This credential key is unknown or missing from the distribution register.'}
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
          <h2 className="text-3xl font-bold sm:text-4xl mb-4">What Our Learners Say</h2>
          <p className="text-muted-foreground mt-3 text-base sm:text-lg">
            Join thousands of satisfied learners transforming their careers.
          </p>
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
            <Card className="relative p-8 sm:p-12 overflow-hidden border-2 border-border/60 bg-card shadow-md">
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
              

              {/* Stars */}
              <div className="flex gap-1 mb-5">
                {[...Array(t.rating)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-warning text-warning" />
                ))}
              </div>

              {/* Quote text */}
              <blockquote className="text-muted-foreground mb-6 flex-grow text-sm md:text-lg leading-relaxed">
                "{t.quote}"
              </blockquote>

              {/* Author */}
              <div className="flex items-center gap-4">
                <div className={cn(
                  'h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0 bg-gradient-to-br',
                  t.color
                )}>
                  {t.initial}
                </div>
                <div>
                  <p className="font-bold text-sm truncate md:text-lg">{t.name}</p>
                  <p className="text-xs md:text-sm text-muted-foreground truncate">{t.role} at <span className="text-primary font-medium">{t.company}</span></p>
                </div>
              </div>
            </Card>
          </div>

          {/* Prev / Next arrows */}
          {/* <button onClick={prev}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 sm:-translate-x-6 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-background border-2 border-border shadow-lg hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all z-10">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={next}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 sm:translate-x-6 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-background border-2 border-border shadow-lg hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all z-10">
            <ChevronRight className="h-5 w-5" />
          </button> */}

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
        setComments(prev => [comment, ...prev]);
      } else {
        setComments(prev => prev.map(c =>
          c.id === comment.parent_id
            ? { ...c, replies: [...(c.replies||[]), comment], reply_count: (c.reply_count||0)+1 }
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
      setComments(prev=>[d.comment,...prev]);
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
    setComments(prev=>prev.map(c=>
      c.id===parentId
        ? {...c, replies:[...(c.replies||[]),d.comment], reply_count:(c.reply_count||0)+1}
        : c
    ));
  };

  const grow = (e) => {
    setText(e.target.value);
    e.target.style.height='auto';
    e.target.style.height=Math.min(e.target.scrollHeight,140)+'px';
  };

  const totalCount = comments.reduce((a,c)=>a+1+(c.replies||[]).length,0);

  return (
    <section id="comments-section" className="py-14 sm:py-20 bg-muted/10">
      <div className="container mx-auto px-4 max-w-2xl">

        {/* Header */}
        <div className="text-center mb-8">
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
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 scroll-smooth"
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

// ── Main LandingPage ────────────────────────────────────────────────────────
export function LandingPage() {
  const { user, courses, isAuthenticated } = useAuth();

  const displayCourses = courses.filter(c => !c.isEnrolled).slice(0, 3);

  const stats = [
    { value: '50K+',                      label: 'Active Learners' },
    { value: `${courses.length}+`,        label: 'Expert Courses'  },
    { value: '200+',                      label: 'Instructors'     },
    { value: '95%',                       label: 'Success Rate'    },
  ];

  return (
    <div className="flex flex-col">

      {/* ── Hero ── */}

      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background py-20 lg:py-32">
        <div className="container mx-auto px-4">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-8 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
                <Zap className="h-4 w-4" />
                New courses added weekly
              </div>
              
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-balance">
                Unlock Your Potential with{' '}
                <span className="text-primary">World-Class</span> Education
              </h1>
              
              <p className="text-lg text-muted-foreground max-w-lg text-pretty">
                Join thousands of learners across Africa gaining new skills, advancing their careers, and achieving their dreams with our expert-led online courses.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/signup">
                  <Button size="lg" className="w-full sm:w-auto">
                    Get Started Free
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/courses">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto">
                    <Play className="h-5 w-5" />
                    Browse Courses
                  </Button>
                </Link>
              </div>

                <div className="flex flex-col md:flex-row items-center md:items-start gap-6 pt-4 justify-center md:justify-start">                <div className="flex -space-x-3">
                {[
                  "/images/student1.jpg",
                  "/images/student2.jpg",
                  "/images/student3.jpg",
                  "/images/student4.jpg",
                  "/images/student5.jpg"
                ].map((src, i) => (
                  <div 
                    key={i} 
                    className="h-10 w-10 rounded-full border-2 border-background bg-muted overflow-hidden"
                  >
                    <img 
                      src={src} 
                      alt={`Student ${i + 1}`}
                      loading="lazy"
                      className="h-full w-full object-cover" 
                    />
                  </div>
                ))}
                </div>
                <div className = "flex flex-col items-center gap-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Star key={i} className="h-4 w-4 fill-warning text-warning" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground">Trusted by 50,000+ learners</p>
                </div>
              </div>
            </div>

            <div className="relative hidden lg:block">
              <div className="relative rounded-3xl bg-gradient-to-br from-primary/10 via-transparent to-accent/10 p-8 border border-border/50">
                <div className="grid grid-cols-2 gap-6">
                  <Card className="p-6 flex flex-col justify-between hover:shadow-lg transition-shadow duration-300 gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <TrendingUp className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-3xl text-foreground">85%</p>
                      <p className="text-sm font-medium text-muted-foreground">Career Growth</p>
                    </div>
                  </Card>

                  <Card className="p-6 flex flex-col justify-between hover:shadow-lg transition-shadow duration-300 gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-accent/10 flex items-center justify-center">
                      <Users className="h-6 w-6 text-accent" />
                    </div>
                    <div>
                      <p className="font-bold text-3xl text-foreground">50K+</p>
                      <p className="text-sm font-medium text-muted-foreground">Active Students</p>
                    </div>
                  </Card>

                  <Card className="p-6 flex flex-col justify-between hover:shadow-lg transition-shadow duration-300 gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                      <Award className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-bold text-3xl text-foreground">200+</p>
                      <p className="text-sm font-medium text-muted-foreground">Certificates</p>
                    </div>
                  </Card>

                  <Card className="p-6 flex flex-col justify-between hover:shadow-lg transition-shadow duration-300 gap-3">
                    <div className="h-12 w-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
                      <BookOpen className="h-6 w-6 text-orange-600" />
                    </div>
                    <div>
                      <p className="font-bold text-3xl text-foreground">500+</p>
                      <p className="text-sm font-medium text-muted-foreground">Lessons</p>
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
      </section>

      {/* ── Stats ── */}
      <section className="py-12 border-y border-border bg-card">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map(s => (
              <div key={s.label} className="text-center">
                <p className="text-3xl md:text-4xl font-bold text-primary">{s.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 lg:py-32">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">
              Why Choose LearnAfrica?
            </h2>
            <p className="text-muted-foreground text-lg">
              We provide everything you need to succeed in your learning journey
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {features.map(feature => {
              const Icon = feature.icon
              return (
                <Card key={feature.title} className="p-6 hover:shadow-lg transition-shadow">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">{feature.description}</p>
                </Card>
              )
            })}
          </div>
        </div>
      </section>


      {/* ── How It Works ── */}
      <section className="py-20 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl mb-4">
              How It Works
            </h2>
            <p className="text-muted-foreground text-lg">
              Start your learning journey in four simple steps
            </p>
          </div>

          {/* Steps */}
          <div className="relative">
            {/* Connecting line — desktop only */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 md:gap-8 gap-10 ">
              {[
                {
                  step: '01',
                  icon: Users,
                  title: 'Create Your Account',
                  description: 'Sign up for free in seconds. No credit card required to explore hundreds of courses.',
                  color: 'text-primary bg-primary/10 border-primary/20',
                },
                {
                  step: '02',
                  icon: BookOpen,
                  title: 'Choose a Course',
                  description: 'Filter courses by category, difficulty, or instructor and sort by free or paid.',
                  color: 'text-accent bg-accent/10 border-accent/20',
                },
                {
                  step: '03',
                  icon: Play,
                  title: 'Learn at Your Pace',
                  description: 'Join lessons, take notes and discussions, and complete quizzes on your schedule.',
                  color: 'text-emerald-600 bg-emerald-600/10 border-emerald-600/20',
                },
                {
                  step: '04',
                  icon: Award,
                  title: 'Earn Your Certificate',
                  description: 'Pass the final quiz and get certificate to share with employers.',
                  color: 'text-orange-600 bg-orange-600/10 border-orange-600/20',
                },
              ].map((item, i) => (
                <div key={i} className="relative flex flex-col items-center text-center group">
                  {/* Step number */}
                  <div className="relative mb-6">
                    <div className={`flex h-16 w-16 items-center justify-center rounded-md border-2 shadow-sm transition-transform duration-300 group-hover:scale-110 ${item.color}`}>
                      <item.icon className="h-6 w-6" />
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

          {/* CTA below steps */}
          <div className="text-center md:mt-20 mt-14">
            <Link to="/signup">
              <Button size="lg" className="gap-2 px-8">
                Get Started Free <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          </div>

        </div>
      </section>

      {/* ── Popular Courses ── */}


      {displayCourses.length > 0 &&(
        <section className="py-20 lg:py-32 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
            <div>
              <h2 className="text-3xl font-bold sm:text-4xl mb-2 text-foreground">
                Popular Courses
              </h2>
              <p className="text-muted-foreground">
                Explore our most enrolled courses
              </p>
            </div>
            
            <Link to="/courses" className="w-fit">
              <Button variant="outline" className="gap-2">
                View All Courses
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <Suspense 
              fallback={
                <>
                  {/* Providing unique keys to skeletons prevents the 'removeChild' DOM exception */}
                  {[1, 2, 3].map((id) => (
                    <CourseCardSkeleton key={`skeleton-${id}`} />
                  ))}
                </>
              }
            >
              {displayCourses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </Suspense>
          </div>
        </div>
      </section>
      )}

      

      {/* {displayCourses.length > 0 && (
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="flex justify-between items-center mb-12">
              <div>
                <h2 className="text-3xl font-bold">Popular Courses</h2>
                <p className="text-muted-foreground">Start learning today</p>
              </div>
              <Link to="/courses">
                <Button variant="outline">View All <ArrowRight className="h-4 w-4 ml-2" /></Button>
              </Link>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayCourses.map(c => <CourseCard key={c.id} course={c} />)}
            </div>
          </div>
        </section>
      )} */}

      {/* ── Testimonials Carousel ── */}
      <TestimonialsSection />

      {/* ── Verify ── */}
      <VerifySection />

      <section className="py-20 lg:py-32">
        <div className="container mx-auto px-4">
          <Card className="relative overflow-hidden bg-primary p-8 md:p-12 lg:p-16">
            <div className="relative z-10 max-w-2xl">
              <h2 className="text-3xl font-bold sm:text-4xl text-primary-foreground mb-4">
                Ready to Start Learning?
              </h2>
              <p className="text-primary-foreground/80 text-lg mb-8">
                Join our community of learners today and take the first step towards achieving your goals.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link to="/signup">
                  <Button size="lg" variant="secondary" className="w-full sm:w-auto font-semibold">
                    Create Free Account
                  </Button>
                </Link>
                <Link to="/courses">
                  <Button size="lg" variant="outline" className="w-full font-semibold sm:w-auto border-primary-foreground/30 text-primary hover:bg-primary-foreground/10">
                    Explore Courses
                  </Button>
                </Link>
              </div>
            </div>

            <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-primary-foreground/10" />
            <div className="absolute -bottom-20 right-40 h-40 w-40 rounded-full bg-accent/20" />
          </Card>
        </div>
      </section>

      {/* ── Community Discussion ── */}
      {isAuthenticated && ( 
      <CommentsSection user={user} isAuthenticated={isAuthenticated} />
      )}

    </div>
  );
}
