import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Newspaper } from 'lucide-react';
import { Card, CardContent } from '@/components/common/Card';
import { API_BASE } from '@/lib/api';
import { setSeo } from '@/lib/seo';

/** Public blog index. */
export default function BlogPage() {
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSeo({
      title: 'Blog',
      description: 'Articles, guides and updates from LearnAfrica.',
      path: '/blog',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        name: 'LearnAfrica Blog',
      },
    });
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/blog`);
        const data = await res.json().catch(() => ({}));
        setPosts(data.posts || []);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return (
    <div className="container max-w-4xl mx-auto px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Newspaper className="h-7 w-7 text-primary" /> Blog
        </h1>
        <p className="text-muted-foreground mt-2">Articles, guides and updates from LearnAfrica.</p>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading posts…
        </div>
      ) : posts.length === 0 ? (
        <p className="text-muted-foreground">No posts published yet.</p>
      ) : (
        <div className="space-y-4">
          {posts.map((p) => (
            <Link key={p.id} to={`/blog/${p.slug}`} className="block">
              <Card className="hover:shadow-lg transition-shadow">
                <CardContent className="p-5 flex gap-4">
                  {p.cover && (
                    <img src={p.cover} alt="" className="h-24 w-36 rounded-lg object-cover bg-muted shrink-0 hidden sm:block" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}
                      {p.author_name ? ` · ${p.author_name}` : ''}
                    </p>
                    <h2 className="text-lg font-semibold mt-1">{p.title}</h2>
                    {p.excerpt && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{p.excerpt}</p>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
