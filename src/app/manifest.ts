import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'دكان',
    short_name: 'دكان',
    description: 'إدارة طلبات المطاعم والمقاهي',
    start_url: '/',
    display: 'standalone',
    background_color: '#F3F2ED',
    theme_color: '#0F5E56',
    orientation: 'any',
    lang: 'ar',
    dir: 'rtl',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    // Rich install UI: shown by Chrome/Edge in the install dialog
    screenshots: [
      {
        src: '/screenshots/light.png',
        sizes: '750x1334',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'دكان — لوحة التحكم',
      },
    ],
  };
}
