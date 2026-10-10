import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, ChevronLeft } from 'lucide-react';
import { API_BASE } from '@/lib/api';
import { setSeo } from '@/lib/seo';
import { sanitizeHtml } from '@/lib/sanitizeHtml';

/** Public blog post view. Body is sanitised before rendering. */
export default function BlogPostPage() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/blog/${slug}`);
        if (!res.ok) throw new Error(res.status === 404 ? 'Post not found' : 'Failed to load post');
        const data = await res.json();
        setPost(data.post);
        setSeo({
          title: data.post.title,
          description: data.post.excerpt || undefined,
          path: `/blog/${data.post.slug}`,
          image: data.post.cover,
          type: 'article',
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: data.post.title,
            description: data.post.excerpt || undefined,
            image: data.post.cover || undefined,
            author: data.post.author_name ? { '@type': 'Person', name: data.post.author_name } : undefined,
            datePublished: data.post.created_at || undefined,
          },
        });
      } catch (e) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [slug]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
      </div>
    );
  }
  if (error || !post) {
    return (
      <div className="container max-w-3xl mx-auto px-4 py-24 text-center">
        <p className="text-lg font-semibold">{error || 'Post not found'}</p>
        <Link
          to="/blog"
          className="inline-flex items-center gap-1 mt-4 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-4 w-4" /> Back to blog
        </Link>
      </div>
    );
  }

  return (
    <article className="container max-w-3xl mx-auto px-4 py-10">
      <Link to="/blog" className="text-sm text-primary hover:underline flex items-center gap-1 mb-6">
        <ChevronLeft className="h-4 w-4" /> Back to blog
      </Link>
      <h1 className="text-3xl font-bold">{post.title}</h1>
      <p className="text-sm text-muted-foreground mt-2">
        {post.created_at ? new Date(post.created_at).toLocaleDateString() : ''}
        {post.author_name ? ` · ${post.author_name}` : ''}
      </p>
      {post.cover && (
        <img src={post.cover} alt="" className="w-full rounded-xl mt-6 bg-muted" />
      )}
      <div
        className="prose prose-sm dark:prose-invert max-w-none mt-6"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.body || '') }}
      />
    </article>
  );
}
