import { cn } from '@/lib/utils'
import { Button } from './Button'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  actionLabel,
  className
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className
      )}
    >
      {Icon && (
        <div className="mb-4 rounded-full bg-muted p-4">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="mt-2 text-sm text-muted-foreground max-w-sm">
          {description}
        </p>
      )}
      {action && actionLabel && (
        <Button onClick={action} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
