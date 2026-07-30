# Design System: دكان (Dokan)

## Overview
Gulf hospitality multi-tenant restaurant SaaS — Arabic RTL-first, dark mode primary.

## Color Palette

### Light Mode
| Role | Hex | CSS Variable |
|------|-----|-------------|
| Primary | `#1B5E20` | `--color-primary` |
| Primary Hover | `#2E7D32` | `--color-primary-hover` |
| Primary Tint | `#E8F5E9` | `--color-primary-tint` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#2D3436` | `--color-secondary` |
| Accent | `#D4AF37` | `--color-accent` |
| Accent Hover | `#C9A032` | `--color-accent-hover` |
| Background | `#F5F0E8` | `--color-bg` |
| Foreground | `#1C1A17` | `--color-fg` |
| Card | `#FFFFFF` | `--color-card` |
| Card Border | `#E8E0D0` | `--color-card-border` |
| Muted | `#EDEEF0` | `--color-muted` |
| Muted Foreground | `#7A7268` | `--color-muted-fg` |
| Border | `#E0DCD4` | `--color-border` |
| Ring | `#1B5E20` | `--color-ring` |
| Destructive | `#DC2626` | `--color-destructive` |
| Success | `#16A34A` | `--color-success` |
| Warning | `#D97706` | `--color-warning` |
| Info | `#2563EB` | `--color-info` |
| Sand | `#F5F0E8` | `--color-sand` |

### Dark Mode
| Role | Hex | CSS Variable |
|------|-----|-------------|
| Primary | `#4CAF50` | `--color-primary` |
| Primary Hover | `#66BB6A` | `--color-primary-hover` |
| Primary Tint | `#1B3D1E` | `--color-primary-tint` |
| Accent | `#D4AF37` | `--color-accent` |
| Accent Hover | `#E0C04A` | `--color-accent-hover` |
| Background Deep | `#0A0A0F` | `--color-bg-deep` |
| Background | `#0F0F15` | `--color-bg` |
| Card | `#1A1A24` | `--color-card` |
| Card Border | `#2A2A38` | `--color-card-border` |
| Card Hover | `#222230` | `--color-card-hover` |
| Foreground | `#EDEDEF` | `--color-fg` |
| Muted | `#8A8F98` | `--color-muted` |
| Muted Foreground | `#6B7280` | `--color-muted-fg` |
| Border | `#2A2A3A` | `--color-border` |
| Ring | `#4CAF50` | `--color-ring` |

## Typography
| Property | Value | CSS Variable |
|----------|-------|-------------|
| Font heading | Tajawal (Arabic), Inter (English) | `--font-heading` |
| Font body | Noto Sans Arabic (Arabic), Inter (English) | `--font-body` |
| Font mono | JetBrains Mono | `--font-mono` |
| Base size | 16px | |
| Body scale | 0.875rem (14px) | |
| Heading 1 | 1.75rem (28px) bold | |
| Heading 2 | 1.375rem (22px) bold | |
| Heading 3 | 1.125rem (18px) bold | |
| Small | 0.75rem (12px) | |
| Line-height | 1.5 body / 1.3 headings | |

## Spacing
| Token | Value |
|-------|-------|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--space-8` | 32px |
| `--space-10` | 40px |
| `--space-12` | 48px |
| `--space-16` | 64px |

## Border Radius
| Token | Value |
|-------|-------|
| `--radius-sm` | 4px |
| `--radius-md` | 8px |
| `--radius-lg` | 12px |
| `--radius-xl` | 16px |
| `--radius-full` | 9999px |

## Shadows (Dark Mode)
| Token | Value |
|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.5)` |
| `--shadow-xl` | `0 16px 40px rgba(0,0,0,0.6)` |
| `--shadow-accent` | `0 0 20px rgba(212,175,55,0.15)` |

## Effects
- Smooth transitions: 200ms cubic-bezier(0.16,1,0.3,1)
- Card hover: translateY(-2px) + shadow increase
- Button hover: brightness(1.1) + subtle scale(1.02)
- Focus ring: 3px solid var(--color-ring) with 2px offset
- Reduced motion: respect prefers-reduced-motion

## UI Pattern Rules
- RTL-first: dir="rtl" on html, logical CSS properties
- Cards: rounded-xl (16px), background var(--color-card), border var(--color-card-border)
- Buttons: rounded-lg (12px), padding 10px 20px, font-weight 600
- Inputs: rounded-lg (12px), padding 10px 14px, border var(--color-border)
- Page max-width: 1400px, centered, padding 24px on desktop / 16px mobile
- Cursor pointer on all clickables
- No emoji as icons → use Lucide/Heroicons SVG
- Hover states: 150-300ms transition
- Button active: scale(0.97)
