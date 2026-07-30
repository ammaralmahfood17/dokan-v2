# Design System: دكان (Dokan)

## Overview
Gulf hospitality multi-tenant restaurant SaaS — Arabic RTL-first, dark mode primary.

## Color Palette

### Light Mode
| Role | Hex | CSS Variable |
|------|-----|-------------|
| Primary | `#4338CA` | `--color-primary` |
| Primary Hover | `#3730A3` | `--color-primary-hover` |
| Primary Tint | `#EEF2FF` | `--color-primary-tint` |
| Background | `#F8FAFC` | `--color-bg` |
| Surface (Cards) | `#FFFFFF` | `--color-surface` |
| Border | `#E2E8F0` | `--color-border` |
| Text Primary | `#0F172A` | `--color-text` |
| Text Secondary | `#64748B` | `--color-text-secondary` |
| Text Muted | `#94A3B8` | `--color-text-muted` |
| Success | `#0D9488` | `--color-success` |
| Warning | `#D97706` | `--color-warn` |
| Danger | `#DC2626` | `--color-danger` |
| Accent (Gold) | `#D4AF37` | `--color-accent` |

### Dark Mode (`.dark` class)
| Role | Hex | CSS Variable |
|------|-----|-------------|
| Primary | `#6366F1` | `--color-primary` |
| Primary Hover | `#818CF8` | `--color-primary-hover` |
| Primary Tint | `#1E1B4B` | `--color-primary-tint` |
| Background | `#0F0F17` | `--color-bg` |
| Surface | `#1A1A26` | `--color-surface` |
| Border | `#2E2E3F` | `--color-border` |
| Text Primary | `#F1F5F9` | `--color-text` |
| Text Secondary | `#94A3B8` | `--color-text-secondary` |
| Text Muted | `#64748B` | `--color-text-muted` |
| Danger Hover | `#EF4444` | `--color-danger-hover` |

## Typography
| Usage | Font | Weight | Variable |
|-------|------|--------|----------|
| UI / Navigation | **Cairo** | 400 / 600 / 700 | `--font-cairo` |
| Headings | **Tajawal** | 500 / 700 / 800 | `--font-tajawal` |
| Body | **Noto Sans Arabic** | 400 / 500 / 600 | `--font-noto` |

## Spacing (rem)
| Token | Value |
|-------|-------|
| `--space-1` | 0.25rem (4px) |
| `--space-2` | 0.5rem (8px) |
| `--space-3` | 0.75rem (12px) |
| `--space-4` | 1rem (16px) |
| `--space-6` | 1.5rem (24px) |
| `--space-8` | 2rem (32px) |

## Border Radius
| Token | Value |
|-------|-------|
| `--radius-sm` | 6px |
| `--radius-md` | 8px |
| `--radius-lg` | 10px |
| `--radius-xl` | 14px |

## Shadows
| Token | Light | Dark |
|-------|-------|------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | `0 1px 2px rgba(0,0,0,0.3)` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | `0 4px 12px rgba(0,0,0,0.4)` |
| `--shadow-lg` | `0 8px 30px rgba(0,0,0,0.12)` | `0 8px 30px rgba(0,0,0,0.5)` |
| `--shadow-xl` | `0 20px 60px rgba(0,0,0,0.15)` | `0 20px 60px rgba(0,0,0,0.6)` |

## Design Principles
1. **RTL-first** — `dir="rtl"`, logical CSS properties, mirror all margins/paddings
2. **Dark mode default** — Gulf user base prefers dark UIs
3. **Indigo primary** — Modern SaaS feel, pairs with Gold accents
4. **Smooth transitions** — All interactive states have `0.18–0.2s ease` transitions
5. **Generous whitespace** — `16px` minimum gap, `24px` section spacing
6. **Card-based layout** — Elevated cards with consistent `--radius-xl` and `--shadow-md`
