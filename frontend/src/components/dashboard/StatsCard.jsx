import { BookOpen, Award, Trophy, Zap, Star, TrendingUp, Users, BarChart2 } from 'lucide-react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Card } from '../common/Card';
import { cn } from '../../lib/utils';

const ICON_MAP = { BookOpen, Award, Trophy, Zap, Star, TrendingUp, Users, BarChart2 };

export default function StatsCard({ title, value, icon, trend, trendValue, className }) {
  const isPositive = trend === 'up';

  // Accept either a string name ("BookOpen") or a real component
  const Icon = typeof icon === 'string' ? ICON_MAP[icon] : icon;

  return (
    <Card className={cn('p-6 border-border/50 shadow-sm', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-semibold text-foreground tracking-tight">{value}</p>
          {trend && trendValue && (
            <div className={cn('flex items-center gap-1 text-xs font-medium', isPositive ? 'text-emerald-600' : 'text-destructive')}>
              {isPositive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
              <span>{trendValue}</span>
            </div>
          )}
          {!trend && trendValue && (
            <p className="text-xs text-muted-foreground">{trendValue}</p>
          )}
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
          {Icon ? <Icon className="h-6 w-6" /> : null}
        </div>
      </div>
    </Card>
  );
}
