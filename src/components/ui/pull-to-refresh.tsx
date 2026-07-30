'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Pull-to-refresh wrapper.
 * Wrap any scrollable list to add pull-to-refresh gesture.
 * Fires onRefresh when pulled down past threshold (60px).
 */
export function PullToRefresh({
  onRefresh,
  children,
  disabled = false,
}: {
  onRefresh: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const startY = useRef(0);
  const pulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || disabled) return;

    const elNonNull = el; // narrowed for TypeScript closure

    function onTouchStart(e: TouchEvent) {
      if (elNonNull.scrollTop <= 0) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!pulling.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 60) {
        pulling.current = false;
        onRefresh();
      }
    }

    function onTouchEnd() {
      pulling.current = false;
    }

    elNonNull.addEventListener('touchstart', onTouchStart, { passive: true });
    elNonNull.addEventListener('touchmove', onTouchMove, { passive: true });
    elNonNull.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      elNonNull.removeEventListener('touchstart', onTouchStart);
      elNonNull.removeEventListener('touchmove', onTouchMove);
      elNonNull.removeEventListener('touchend', onTouchEnd);
    };
  }, [onRefresh, disabled]);

  return <div ref={containerRef}>{children}</div>;
}
