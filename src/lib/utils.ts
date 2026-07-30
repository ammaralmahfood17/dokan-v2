import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a URL-safe slug from Arabic or English text.
 * Improved version:
 * - Better Arabic transliteration
 * - Removes common filler words for nicer slugs (مقهى, cafe, store, etc.)
 * - Shorter output
 * - Falls back to short random
 */
export function generateSlug(input: string): string {
  const arabicToLatin: Record<string, string> = {
    ا: 'a', أ: 'a', إ: 'i', آ: 'a', ب: 'b', ت: 't', ث: 'th',
    ج: 'j', ح: 'h', خ: 'kh', د: 'd', ذ: 'dh', ر: 'r', ز: 'z',
    س: 's', ش: 'sh', ص: 's', ض: 'd', ط: 't', ظ: 'z', ع: 'a',
    غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n',
    ه: 'h', و: 'w', ي: 'y', ى: 'a', ة: 'h', ء: '', ئ: 'y', ؤ: 'w',
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  };

  let s = (input || '').trim().toLowerCase();

  // Remove common filler words for cleaner slugs
  s = s.replace(/\b(cafe|coffee|shop|store|متجر|مقهى|مطعم|restaurant|café)\b/gi, '');

  s = s
    .split('')
    .map((ch) => arabicToLatin[ch] ?? ch)
    .join('');

  s = s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  if (!s) {
    s = `store-${Math.random().toString(36).slice(2, 8)}`;
  }

  return s.slice(0, 40);
}

/**
 * Suggest a unique slug by appending -1, -2... against a list of existing slugs.
 * Lightweight helper for better default suggestions.
 */
export function ensureUniqueSlug(base: string, existing: string[] = []): string {
  let candidate = generateSlug(base);
  if (!existing.includes(candidate)) return candidate;

  let i = 1;
  while (existing.includes(`${candidate}-${i}`)) {
    i++;
  }
  return `${candidate}-${i}`;
}

/** Round money to 3 decimal places (BHD standard). Returns 0 for non-finite. */
export function money(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/** True when value is a valid finite money amount (>= 0) */
export function isValidMoney(value: unknown): value is number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0;
}

/** Format money for display with currency code */
export function formatMoney(value: number, currency = 'BHD'): string {
  const n = Number.isFinite(value) ? money(value) : 0;
  const decimals = ['BHD', 'KWD'].includes(currency) ? 3 : 2;
  return `${n.toFixed(decimals)} ${currency}`;
}

/** Build public menu URL path */
export function menuPath(projectSlug: string, tableSlug: string): string {
  return `/${projectSlug}/menu/${tableSlug}`;
}

/** Default table slug from table number */
export function tableSlugFromNumber(number: number): string {
  return `table-${number}`;
}

/** Generate a random QR secret token */
export function generateQrToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

/** Reserved slugs that cannot be used as project slugs */
export const RESERVED_SLUGS = new Set([
  'api',
  'login',
  'register',
  'onboarding',
  'dashboard',
  'admin',
  'auth',
  'kitchen',
  'pos',
  'settings',
  'products',
  'tables',
  'orders',
  'menu',
  'public',
  'assets',
  'icons',
]);
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}
