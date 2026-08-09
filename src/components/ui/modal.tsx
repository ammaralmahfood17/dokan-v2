'use client';

import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/shadcn/dialog';
import { cn } from '@/lib/utils';

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Optional: constrains max width like the old `max-w-md` container */
  className?: string;
}

/**
 * Modal — thin compatibility layer over shadcn/ui Dialog (Phase 1b).
 *
 * Same API as the old custom Modal (`title` / `children` / `onClose`) so
 * every existing call-site keeps working unchanged, while the root is now
 * Radix Dialog: built-in focus trap, ESC-to-close, backdrop click, body
 * scroll lock and enter/exit animations.
 *
 * Dokan surface identity is preserved via the CSS bridge (bg-card = white,
 * radius-lg, border) — see globals.css shadcn variables.
 */
export function Modal({ title, children, onClose, className }: ModalProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={cn(
          'max-h-[85vh] overflow-y-auto pb-safe-bottom',
          className
        )}
      >
        <DialogHeader className="text-start border-b border-[var(--color-border)] pb-3">
          <DialogTitle className="text-sm font-bold">{title}</DialogTitle>
        </DialogHeader>
        <div className="p-4 sm:p-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}