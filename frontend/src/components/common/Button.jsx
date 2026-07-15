import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const variants = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  link: 'text-primary underline-offset-4 hover:underline'
};

const sizes = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 py-2',
  lg: 'h-11 px-8 text-lg',
  icon: 'h-10 w-10'
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  isLoading = false,
  loading = false,
  ...rest
}) {
  // Strip any other non-DOM props so React stops complaining
  const { isLoading: _il, loading: _l, ...domProps } = rest;
  const showLoading = isLoading || loading;

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || showLoading}
      {...domProps}
    >
      {showLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}
