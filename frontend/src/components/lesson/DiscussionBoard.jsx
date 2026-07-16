import { useState, useEffect, useCallback } from 'react';
import { ThumbsUp, Reply, Trash2, Pin, Send, Loader2, MessageSquare, ChevronDown, ChevronUp, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { API_BASE } from '@/lib/api';

const api = async (url, opts = {}) => {
  const token = sessionStorage.getItem('auth_token');
  const res = await fetch(`${API_BASE}${url}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
  return d;
};

const timeAgo = (str) => {
  if (!str) return '';
  const diff = (Date.now() - new Date(str).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const Avatar = ({ name, role, size = 'sm' }) => {
  const s = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  const colors = {
    instructor: 'bg-primary/10 text-primary border-primary/30',
    admin:      'bg-destructive/10 text-destructive border-destructive/30',
    superadmin: 'bg-destructive/10 text-destructive border-destructive/30',
    student:    'bg-muted text-muted-foreground border-border',
  };
  return (
    <div className={cn('flex items-center justify-center rounded-full border-2 font-bold shrink-0', s, colors[role] || colors.student)}>
      {(name || 'U')[0].toUpperCase()}
    </div>
  );
};

function ReplyBox({ onSubmit, onCancel, isLoading }) {
  const [text, setText] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText('');
  };
  return (
    <form onSubmit={submit} className="ml-11 mt-3 space-y-2">
      <textarea value={text} onChange={e => setText(e.target.value)}
        placeholder="Write a reply…" rows={2}
        className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-primary/20" />
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={!text.trim() || isLoading}
          className="flex items-center gap-1.5 text-xs font-bold bg-primary text-primary-foreground px-4 py-1.5 rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-colors">
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          Reply
        </button>
      </div>
    </form>
  );
}

function DiscussionPost({ post, courseId, lessonId, user, onDelete, onReply }) {
  const [showReplies, setShowReplies]   = useState(false);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyLoading, setReplyLoading] = useState(false);
  const [upvotes, setUpvotes]           = useState(post.upvotes || 0);
  const [upvoted, setUpvoted]           = useState(false);
  const [localReplies, setLocalReplies] = useState(post.replies || []);

  const isInstructor = ['instructor','admin','superadmin'].includes(post.user_role);

  const handleUpvote = async () => {
    if (upvoted) return;
    try {
      const d = await api(`/api/courses/${courseId}/lessons/${lessonId}/discussions/${post.id}/upvote`, { method:'POST' });
      setUpvotes(d.upvotes); setUpvoted(true);
    } catch {}
  };

  const handleReply = async (text) => {
    setReplyLoading(true);
    const reply = await onReply(post.id, text);
    if (reply) { setLocalReplies(prev => [...prev, reply]); setShowReplies(true); }
    setReplyLoading(false);
    setShowReplyBox(false);
  };

  const canDelete = post.user_id === user?.id || ['admin','superadmin','instructor'].includes(user?.role);

  return (
    <div className={cn('rounded-xl border p-4 transition-all', post.is_pinned ? 'border-primary/30 bg-primary/5' : 'border-border bg-card')}>
      {post.is_pinned && (
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-primary uppercase tracking-widest mb-3">
          <Pin className="h-3 w-3" /> Pinned
        </div>
      )}
      <div className="flex gap-3">
        <Avatar name={post.user_name} role={post.user_role} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-bold text-sm">{post.user_name}</span>
            {isInstructor && (
              <span className="flex items-center gap-0.5 text-[9px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full uppercase">
                <GraduationCap className="h-2.5 w-2.5" />
                {post.user_role === 'instructor' ? 'Instructor' : 'Staff'}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">{timeAgo(post.created_at)}</span>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">{post.content}</p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button onClick={handleUpvote}
              className={cn('flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1 transition-all',
                upvoted ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
              <ThumbsUp className="h-3.5 w-3.5" />
              {upvotes > 0 && <span>{upvotes}</span>}
              <span>{upvoted ? 'Liked' : 'Like'}</span>
            </button>
            {user && (
              <button onClick={() => setShowReplyBox(!showReplyBox)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:bg-muted rounded-lg px-2.5 py-1 transition-all">
                <Reply className="h-3.5 w-3.5" /> Reply
              </button>
            )}
            {localReplies.length > 0 && (
              <button onClick={() => setShowReplies(!showReplies)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showReplies ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {localReplies.length} {localReplies.length === 1 ? 'reply' : 'replies'}
              </button>
            )}
            {canDelete && (
              <button onClick={() => onDelete(post.id)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto">
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
          {showReplyBox && <ReplyBox onSubmit={handleReply} onCancel={() => setShowReplyBox(false)} isLoading={replyLoading} />}
          {showReplies && localReplies.length > 0 && (
            <div className="mt-4 space-y-3 border-l-2 border-border pl-4">
              {localReplies.map(reply => (
                <div key={reply.id} className="flex gap-3">
                  <Avatar name={reply.user_name} role={reply.user_role} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-sm">{reply.user_name}</span>
                      {['instructor','admin','superadmin'].includes(reply.user_role) && (
                        <span className="text-[9px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full uppercase">
                          {reply.user_role === 'instructor' ? 'Instructor' : 'Staff'}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">{timeAgo(reply.created_at)}</span>
                    </div>
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{reply.content}</p>
                    {(reply.user_id === user?.id || ['admin','superadmin','instructor'].includes(user?.role)) && (
                      <button onClick={() => onDelete(reply.id)}
                        className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DiscussionBoard({ courseId, lessonId }) {
  const { user, isAuthenticated } = useAuth();
  const [posts, setPosts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [text, setText]       = useState('');
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    if (!courseId || !lessonId) return;
    setLoading(true);
    try {
      const d = await api(`/api/courses/${courseId}/lessons/${lessonId}/discussions`);
      setPosts(d.discussions || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [courseId, lessonId]);

  useEffect(() => { load(); }, [load]);

  const handlePost = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setPosting(true); setError('');
    try {
      const d = await api(`/api/courses/${courseId}/lessons/${lessonId}/discussions`, {
        method: 'POST', body: JSON.stringify({ content: text.trim() }),
      });
      setPosts(prev => [{ ...d.discussion, replies: [] }, ...prev]);
      setText('');
    } catch (e) { setError(e.message); }
    setPosting(false);
  };

  const handleReply = async (parentId, content) => {
    try {
      const d = await api(`/api/courses/${courseId}/lessons/${lessonId}/discussions`, {
        method: 'POST', body: JSON.stringify({ content, parent_id: parentId }),
      });
      return d.discussion;
    } catch (e) { setError(e.message); return null; }
  };

  const handleDelete = async (postId) => {
    try {
      await api(`/api/courses/${courseId}/lessons/${lessonId}/discussions/${postId}`, { method:'DELETE' });
      setPosts(prev => prev
        .filter(p => p.id !== postId)
        .map(p => ({ ...p, replies: (p.replies || []).filter(r => r.id !== postId) }))
      );
    } catch (e) { setError(e.message); }
  };

  const totalCount = posts.length + posts.reduce((a, p) => a + (p.replies?.length || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Discussion
          {totalCount > 0 && <span className="text-sm font-normal text-muted-foreground ml-1">({totalCount})</span>}
        </h3>
      </div>

      {isAuthenticated ? (
        <form onSubmit={handlePost} className="space-y-3">
          <div className="flex gap-3">
            <Avatar name={user?.name} role={user?.role} size="md" />
            <textarea value={text} onChange={e => setText(e.target.value)}
              placeholder="Ask a question or share your thoughts about this lesson…"
              rows={3} maxLength={2000}
              className="flex-1 rounded-xl border border-input bg-background px-4 py-3 text-sm resize-none outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
          </div>
          {error && <p className="text-xs text-destructive ml-11">{error}</p>}
          <div className="flex items-center justify-between ml-11">
            <span className="text-xs text-muted-foreground">{text.length}/2000</span>
            <button type="submit" disabled={!text.trim() || posting}
              className="flex items-center gap-2 bg-primary text-primary-foreground font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-50 hover:bg-primary/90 transition-all active:scale-95">
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Post
            </button>
          </div>
        </form>
      ) : (
        <div className="p-5 rounded-xl bg-muted/30 border border-border text-center">
          <p className="text-sm text-muted-foreground">
            <a href="/login" className="text-primary font-semibold hover:underline">Log in</a> and enroll in this course to join the discussion.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary/50" /></div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-xl">
          <MessageSquare className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-semibold text-sm">No discussions yet</p>
          <p className="text-xs text-muted-foreground mt-1">Be the first to ask a question!</p>
        </div>
      ) : (
        <div className="space-y-4 max-h-[700px] overflow-y-auto pr-2">
          {posts.map(post => (
            <DiscussionPost key={post.id} post={post} courseId={courseId} lessonId={lessonId}
              user={user} onDelete={handleDelete} onReply={handleReply} />
          ))}
        </div>
      )}
    </div>
  );
}
