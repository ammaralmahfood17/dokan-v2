'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Registers the Service Worker on first app load (any page — public menu or dashboard).
 *
 * M6: sw.js now calls skipWaiting() on install so a new version takes over as
 * soon as it's ready (no need to close all tabs). To avoid a disruptive
 * mid-order reload, we never reload automatically — instead we watch for
 * `controllerchange` (the new SW took over) and surface a toast asking the
 * user to reload when convenient.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // First install also fires controllerchange (the fresh SW takes control
    // via skipWaiting) — that's not an update, it's the very first install,
    // so no "update available" toast on a brand-new visitor.
    const alreadyControlled = Boolean(navigator.serviceWorker.controller);

    const showUpdateToast = () => {
      toast('🔄 تحديث متوفر', {
        description: 'نسخة جديدة من دكان جاهزة — أعد تحميل الصفحة للاستخدام',
        action: {
          label: 'إعادة تحميل',
          onClick: () => window.location.reload(),
        },
      });
    };

    // New SW took control (skipWaiting fired) — prompt, don't auto-reload.
    // Only listen once a controller already existed (i.e. this is a real
    // upgrade, not the first-ever install).
    if (alreadyControlled) {
      navigator.serviceWorker.addEventListener('controllerchange', showUpdateToast);
    }

    navigator.serviceWorker
      .register('/sw.js')
      .catch(() => {}); // silent — PWA is progressive enhancement

    return () => {
      if (alreadyControlled) {
        navigator.serviceWorker.removeEventListener('controllerchange', showUpdateToast);
      }
    };
  }, []);

  return null;
}
