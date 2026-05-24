import { Card } from '../common/Card';
import { cn } from '../../lib/utils';
import * as Icons from 'lucide-react';

const colorMap = {
  orange: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
  yellow: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  purple: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  red: 'text-red-500 bg-red-500/10 border-red-500/20',
  blue: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  amber: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  emerald: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
};

export default function BadgeCard({ badge }) {
  const IconComponent = Icons[badge.iconName] || Icons.Award;

  const progressPercent = Math.min(
    ((badge.currentProgress || 0) / badge.goal) * 100,
    100
  );

  const colorStyles = badge.earned 
    ? colorMap[badge.color] || 'text-primary bg-primary/10' 
    : 'bg-muted/30 text-muted-foreground grayscale opacity-60';

  return (
    <Card
      className={cn(
        'p-6 text-center transition-all duration-300 border hover:shadow-lg group flex flex-col justify-between min-h-[220px]',
        badge.earned ? 'bg-card border-white/5' : 'bg-muted/20 border-transparent'
      )}
    >
      <div className="flex flex-col items-center gap-3">
        {/* Icon Container with extra bottom margin for breath */}
        <div
          className={cn(
            'flex h-16 w-16 items-center justify-center rounded-full transition-transform group-hover:scale-110 mb-2',
            colorStyles
          )}
        >
          <IconComponent size={32} strokeWidth={2.5} />
        </div>
        
        {/* Text Content with improved line-height */}
        <div className="space-y-2">
          <h4 className="font-bold text-sm text-foreground tracking-tight">
            {badge.title}
          </h4>
          <p className="text-[10px] leading-relaxed text-muted-foreground line-clamp-2 h-8 px-2">
            {badge.description}
          </p>
        </div>
      </div>

      {/* Spacing container for the bottom action/progress area */}
      <div className="mt-6 pt-2">
        {badge.earned ? (
          <div className="flex justify-center">
             <span className={cn(
               "text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border transition-colors",
               colorStyles
             )}>
              {badge.earnedDate || 'Unlocked'}
            </span>
          </div>
        ) : (
          <div className="w-full space-y-3">
            {/* Perfectly aligned Progress and Stats */}
            <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.15em]">
              <span className={badge.currentProgress > 0 ? "text-primary" : "text-muted-foreground"}>
                Progress
              </span>
              <span className={badge.currentProgress > 0 ? "text-primary" : "text-muted-foreground"}>
                {badge.currentProgress || 0} / {badge.goal}
              </span>
            </div>
            
            {/* Progress Bar Container */}
            <div className="h-1.5 w-full bg-secondary/30 rounded-full overflow-hidden border border-white/5 p-[1px]">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-1000 ease-in-out",
                  badge.currentProgress > 0 ? "bg-primary shadow-[0_0_8px_rgba(var(--primary),0.4)]" : "bg-transparent"
                )} 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}