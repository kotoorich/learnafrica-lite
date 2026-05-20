import { Link } from 'react-router-dom';
import { Clock, Users, Star, Play } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { cn } from '@/lib/utils';

const difficultyColors = {
  Beginner: 'success',
  Intermediate: 'warning',
  Advanced: 'destructive',
};

export default function CourseCard({ course, enrolled = false, searchQuery = '' }) {
  const title = course.title;
  const description = course.description;
  const thumbnail = course.thumbnail || '/placeholder.jpg';
  const difficulty = course.difficulty;
  const category = course.category;
  const duration = course.duration;
  const enrollments = course.enrollments || 0;
  const rating = course.rating || 4.5;
  const instructor = course.instructor_name;
  const instructorAvatar = course.instructor_avatar || '/placeholder-user.jpg';
  const isFree = course.is_free === 1 || course.is_free === true;
  const price = course.price || 0;
  const progress = course.progress || 0;

  return (
    <Card className="overflow-hidden transition-all duration-300 group flex flex-col h-full bg-card hover:shadow-xl hover:scale-[1.02] cursor-pointer">
      <div className="relative aspect-video overflow-hidden bg-muted shrink-0">
        <img
          src={thumbnail}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        {isFree && (
          <Badge className="absolute left-3 top-3" variant="success">
            Free
          </Badge>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
            <Play className="h-5 w-5 ml-0.5" />
          </div>
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={difficultyColors[difficulty] || 'secondary'} className="text-[10px] px-2">
              {difficulty}
            </Badge>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {category}
            </span>
          </div>

          <Link to={`/courses/${course.id}`} className="block">
            <h3 className="font-bold text-base leading-tight transition-colors duration-300 line-clamp-2 min-h-[2.5rem] group-hover:text-primary">
              {title}
            </h3>
          </Link>

          <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
            {description}
          </p>

          <div className="flex items-center gap-2 pt-1">
            <div className="h-6 w-6 overflow-hidden rounded-full bg-muted border border-border/50">
              <img src={instructorAvatar} alt={instructor} className="h-full w-full object-cover" />
            </div>
            <span className="text-xs font-medium text-foreground/80">{instructor}</span>
          </div>

          <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground pt-1">
            <div className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <span>{duration}</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              <span>{enrollments.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-warning text-warning" />
              <span>{rating}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border/40 space-y-3">
          <div className="min-h-[20px]">
            {enrolled && progress > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="text-primary">{progress}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full transition-all duration-500',
                      progress === 100 ? 'bg-success' : 'bg-primary'
                    )}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <Link to={`/courses/${course.id}`} className="block">
            <Button
              className="w-full font-bold text-xs h-10 shadow-sm transition-all active:scale-95"
              variant={enrolled ? 'outline' : 'primary'}
            >
              {enrolled
                ? progress === 100
                  ? 'Review Course'
                  : 'Continue Learning'
                : isFree
                ? 'Start Free Course'
                : `Enroll - $${price}`}
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}