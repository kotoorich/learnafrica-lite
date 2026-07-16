import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

/**
 * LearnAfrica logo. Automatically picks the right variant for the current theme:
 *  - Light theme: /logo-light.png (green globe with dark cap)
 *  - Dark theme:  /logo-dark.png  (silver/white globe with white cap)
 *
 * Usage:
 *   <Logo />                   // default 36px
 *   <Logo size={48} />
 *   <Logo className="shadow-lg rounded-xl" />
 */
export default function Logo({ size = 36, className = '', alt = 'LearnAfrica' }) {
  const { theme } = useTheme();
  const src = theme === 'dark' ? '/logo-dark.png' : '/logo-light.png';
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={cn('object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}
