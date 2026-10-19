import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

/**
 * LearnAfrica logo. Automatically picks the right variant for the current theme:
 *  - Light theme: /logo-light.png (green globe with dark cap) — no background needed
 *  - Dark theme:  /logo-dark.png  (silver/white globe with white cap) — wrapped in a
 *                                  white circular background so the darker details
 *                                  inside the logo remain visible.
 */
export default function Logo({ size = 40, className = '', alt = 'LearnAfrica' }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const src = isDark ? '/logo-dark.png' : '/logo-light.png';
  return (
    <div
      className={cn(
        'relative flex items-center justify-center shrink-0',
        isDark ? 'rounded-full bg-white' : '',
        className
      )}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        className="object-contain"
        style={{
          width:  isDark ? Math.round(size * 0.86) : size,
          height: isDark ? Math.round(size * 0.86) : size,
        }}
      />
    </div>
  );
}
