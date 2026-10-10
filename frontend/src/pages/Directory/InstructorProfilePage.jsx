import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MapPin, Globe, BookOpen, Users, Loader2, ChevronLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { API_BASE } from '@/lib/api';
import { setSeo } from '@/lib/seo';
import { formatPrice } from '@/lib/money';

/**
 * Public instructor profile. Shows the instructor's bio and published courses.
 * Unauthenticated and indexable.
 */
export default function InstructorProfilePage() {
  const { instructorId } = useParams();
  const [instructor, setInstructor] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/instructors/${instructorId}`);
        if (!res.ok) throw new Error(res.status === 404 ? 'Instructor not found' : 'Failed to load instructor');
        const data = await res.json();
        const inst = data.instructor;
        setInstructor(inst);
        setSeo({
          title: `${inst.name} — Instructor`,
          description:
            inst.bio ||
            `Courses taught by ${inst.name} on LearnAfrica.`,
          path: `/instructors/${inst.id}`,
          image: inst.avatar,
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'Person',
            name: inst.name,
            description: inst.bio || undefined,
            image: inst.avatar || undefined,
            jobTitle: inst.instructor_title || undefined,
          },
        });
      } catch (e) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [instructorId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…
      </div>
    );
  }
  if (error || !instructor) {
    return (
      <div className="container max-w-3xl mx-auto px-4 py-24 text-center">
        <p className="text-lg font-semibold">{error || 'Instructor not found'}</p>
        <Button variant="outline" className="mt-4" onClick={() => window.history.back()}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Go back
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto px-4 py-10">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 mb-10">
        <img
          src={instructor.avatar || '/placeholder-user.jpg'}
          alt={instructor.name}
          className="h-28 w-28 rounded-full object-cover bg-muted"
        />
        <div className="text-center sm:text-left">
          <h1 className="text-3xl font-bold">{instructor.name}</h1>
          {(instructor.instructor_title || instructor.instructor_field) && (
            <p className="text-primary font-medium mt-1">
              {instructor.instructor_title || instructor.instructor_field}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-4 justify-center sm:justify-start text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <BookOpen className="h-4 w-4" /> {instructor.course_count} courses
            </span>
            {instructor.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" /> {instructor.location}
              </span>
            )}
            {instructor.website && (
              <a
                href={instructor.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <Globe className="h-4 w-4" /> Website
              </a>
            )}
          </div>
          {instructor.bio && (
            <p className="mt-4 text-muted-foreground max-w-2xl whitespace-pre-line">{instructor.bio}</p>
          )}
        </div>
      </div>

      <h2 className="text-xl font-semibold mb-4">Courses by {instructor.name}</h2>
      {instructor.courses.length === 0 ? (
        <p className="text-muted-foreground">No published courses yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {instructor.courses.map((c) => (
            <Link key={c.id} to={`/courses/${c.id}`} className="block">
              <Card className="h-full hover:shadow-lg transition-shadow">
                <CardContent className="p-5">
                  <p className="font-semibold line-clamp-2">{c.title}</p>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{c.description}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {c.student_count}
                    </span>
                    <span className="font-medium text-foreground">
                      {c.is_free ? 'Free' : formatPrice(c.price)}
                    </span>
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
