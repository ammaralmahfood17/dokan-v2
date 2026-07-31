'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Registers the Service Worker on first app load (any page — public menu or dashboard).
 * Also surfaces a "تحديث متوفر" toast when a new SW version is waiting,
 * letting the user apply it via postMessage SKIP_WAITING (handled in sw.js).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const onNewWorker = (reg: ServiceWorkerRegistration) => {
      const showUpdateToast = () => {
        toast('🔄 تحديث متوفر', {
          description: 'نسخة جديدة من دكان جاهزة',
          action: {
            label: 'تحديث الآن',
            onClick: () => {
              reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
              window.location.reload();
            },
          },
        });
      };

      // If a new SW is already waiting (e.g. update found during previous session)
      if (reg.waiting) showUpdateToast();

      // Listen for new SW installing
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // A new version is ready — prompt the user
            showUpdateToast();
          }
        });
      });
    };

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => onNewWorker(reg))
      .catch(() => {}); // silent — PWA is progressive enhancement
  }, []);

  return null;
}
