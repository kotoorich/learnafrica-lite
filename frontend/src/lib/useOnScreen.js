import { useEffect, useRef, useState } from 'react';

/**
 * IntersectionObserver hook — returns [ref, isVisible].
 * Once the element becomes visible, isVisible stays true (no toggling on scroll away).
 *
 * Usage:
 *   const [ref, visible] = useOnScreen({ threshold: 0.15 });
 *   <div ref={ref} className={visible ? 'opacity-100' : 'opacity-0'}>...
 */
export function useOnScreen({ threshold = 0.1, rootMargin = '0px' } = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    // Reduced-motion users: mark visible immediately, no observer needed
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold, rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, visible]);

  return [ref, visible];
}

/**
 * Number count-up hook — animates from 0 to target when `active` is true.
 * Respects prefers-reduced-motion (snaps to final value instantly).
 */
export function useCountUp(target, active, duration = 1600) {
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;

    // Reduced motion: snap immediately
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }

    const start = performance.now();
    let raf;
    const tick = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic for a satisfying deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [active, target, duration]);

  return value;
}
