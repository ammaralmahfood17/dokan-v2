'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

/**
 * Modal with focus trap, ESC to close, and backdrop click.
 * A11Y: traps focus inside modal, closes on Escape, animates from bottom on mobile.
 */
export function Modal({ title, children, onClose }: ModalProps) {
  const trapRef = useRef<HTMLDivElement>(null);

  // Focus trap: keep Tab within modal
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const el = trapRef.current;
      if (!el) return;
      const focusable = el.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    },
    [onClose]
  );

  // Auto-focus first text input only on initial mount
  useEffect(() => {
    const el = trapRef.current;
    if (!el) return;

    const firstInput = el.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea'
    );
    if (firstInput) {
      requestAnimationFrame(() => firstInput.focus());
    }
  }, []);

  // Keydown listener + body scroll prevention
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    const pageEl =
      (trapRef.current?.closest('.page') as HTMLElement | null) ||
      (document.querySelector('.page') as HTMLElement | null);
    const scrollTarget = pageEl || document.body;
    const prevOverflow = scrollTarget.style.overflow;
    scrollTarget.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      scrollTarget.style.overflow = prevOverflow;
    };
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={trapRef}
        className="max-h-dvh w-full max-w-md overflow-y-auto rounded-b-none bg-[var(--color-surface)] sm:max-h-[85vh] sm:rounded-[10px] animate-slide-up pb-safe-bottom"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h3 className="text-sm font-bold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
