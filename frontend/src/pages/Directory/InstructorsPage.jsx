import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, BookOpen, Loader2, GraduationCap } from 'lucide-react';
import { Card, CardContent } from '@/components/common/Card';
import { API_BASE } from '@/lib/api';
import { setSeo } from '@/lib/seo';

/**
 * Public instructor directory. Unauthenticated, indexable.
 */
export default function InstructorsPage() {
  const [instructors, setInstructors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setSeo({
      title: 'Our Instructors',
      description:
        'Meet the instructors on LearnAfrica — experienced practitioners teaching ' +
        'technology, business and creative skills across Africa and beyond.',
      path: '/instructors',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'LearnAfrica Instructors',
      },
    });
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/instructors`);
        if (!res.ok) throw new Error('Failed to load instructors');
        const data = await res.json();
        setInstructors(data.instructors || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return (
    <div className="container max-w-6xl mx-auto px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <GraduationCap className="h-7 w-7 text-primary" /> Our Instructors
        </h1>
        <p className="text-muted-foreground mt-2">
          Learn directly from experienced practitioners.
        </p>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading instructors…
        </div>
      ) : error ? (
        <p className="text-destructive">{error}</p>
      ) : instructors.length === 0 ? (
        <p className="text-muted-foreground">No instructors to show yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {instructors.map((inst) => (
            <Link key={inst.id} to={`/instructors/${inst.id}`} className="block">
              <Card className="h-full hover:shadow-lg transition-shadow">
                <CardContent className="p-5 flex gap-4">
                  <img
                    src={inst.avatar || '/placeholder-user.jpg'}
                    alt={inst.name}
                    className="h-16 w-16 rounded-full object-cover bg-muted shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{inst.name}</p>
                    {(inst.instructor_title || inst.instructor_field) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {inst.instructor_title || inst.instructor_field}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3.5 w-3.5" /> {inst.course_count} courses
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {inst.student_count} students
                      </span>
                    </div>
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
