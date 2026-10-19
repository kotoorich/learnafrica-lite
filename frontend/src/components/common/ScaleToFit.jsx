/**
 * ScaleToFit — renders its children at one fixed, well-designed intrinsic
 * size, then visually scales the whole thing down (or up) to exactly fit
 * whatever width the container actually has. This is the same technique
 * slide/presentation viewers use: nothing reflows, nothing clips, no text
 * gets responsively resized and risks overflowing its box, the whole
 * composition just scales as one image would, so it looks identically
 * proportioned on a phone and a desktop, just smaller or larger.
 */
import { useEffect, useRef, useState, useLayoutEffect } from 'react';

export function ScaleToFit({ designWidth, designHeight, children, className = '' }) {
  const outerRef = useRef(null);
  const [scale, setScale] = useState(null); // null = not measured yet

  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const compute = () => {
      const availableWidth = el.offsetWidth;
      if (availableWidth > 0) setScale(availableWidth / designWidth);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [designWidth]);

  return (
    <div
      ref={outerRef}
      className={className}
      style={{ width: '100%', height: scale ? designHeight * scale : designHeight, position: 'relative', overflow: 'hidden' }}
    >
      {/* Nothing renders until the real scale is known, avoiding a brief
          unscaled flash of the full-size design before measurement runs. */}
      {scale !== null && (
        <div
          style={{
            width: designWidth,
            height: designHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
