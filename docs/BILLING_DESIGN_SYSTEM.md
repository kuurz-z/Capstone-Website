# Billing Design System — UI/UX Redesign Plan

This document explains how to redesign the Electricity and Water billing admin interface to be **minimalist**, **professional**, and **user-friendly**. It covers the design principles, exact token mapping, visual specifications, layout changes, and component-level rules that both tabs must follow.

Written: April 1, 2026.

---

## The Core Problem with the Current Design

Both tabs were built independently and have no shared design language:

| Area | Electricity Tab | Water Tab | Problem |
|---|---|---|---|
| **Accent color** | Blue `#3b82f6` | Teal `#0f766e` | Neither matches the brand (`#FF8C42` orange + `#0A1628` navy) |
| **Border radius** | `8px–12px` mixed | `10px–16px` mixed | Inconsistent rounding |
| **Font sizes** | `0.68rem`–`1.1rem` ad-hoc | `0.76rem`–`1.1rem` ad-hoc | No clear scale |
| **Hardcoded colors** | `#92400e`, `#fbbf24`, `#15803d` etc. | `#102542`, `#d8e1ea`, `#52606d` etc. | Doesn't use `index.css` tokens |
| **Shadow** | None used | `box-shadow: 0 12px 30px rgba(...)` heavy | Inconsistent depth |
| **Draft Bills section** | Amber gradient background `#fffbeb` | — | Too visually loud |
| **Room sidebar** | Functional but plain | Cards with heavy shadows | Feels heavy |

---

## Design Principles

### 1. Minimal Chrome
Remove decorative backgrounds. Sections should feel like they belong on the same white canvas, separated by hairline dividers — not by cards-inside-cards.

> **Rule:** Surface backgrounds should only appear on the sidebar (#f8fafc) and within interactive inputs. Everything else is plain white.

### 2. Brand-Correct Tokens
Both tabs must exclusively use the tokens defined in `index.css`:

```
Background hierarchy:
  --surface-page     #F8FAFC  ← page/sidebar
  --surface-card     #FFFFFF  ← panels / table
  --surface-muted    #f1f5f9  ← subtle insets
  --surface-hover    #f1f5f9  ← row hover

Text hierarchy:
  --text-heading     #0A1628  ← titles, table th, important values
  --text-body        #1e293b  ← body copy, td values
  --text-secondary   #4b5563  ← labels, muted metadata
  --text-muted       #6b7280  ← placeholders, count badges

Borders:
  --border-card      #e5e7eb  ← outer container borders
  --border-subtle    #f1f5f9  ← dividers between rows, inner separators
  --border-divider   #e5e7eb  ← section separators

Accent (brand):
  --color-accent         #FF8C42  ← primary call-to-action buttons
  --color-accent-hover   #E0752E
  --color-accent-light   #FFE0C2
  --color-accent-subtle  #FFF4EB
  --color-primary        #0A1628  ← nav, room selected state
  --color-primary-hover  #1E3A5F

Semantic:
  --color-success        #059669   --color-success-bg   #ecfdf5
  --color-warning        #D97706   --color-warning-bg   #fffbeb
  --color-danger         #DC2626   --color-danger-bg    #fef2f2
  --color-info           #2563EB   --color-info-bg      #EFF6FF
```

### 3. Consistent Type Scale
Use a disciplined 4-level type scale. No other font sizes allowed.

| Role | Size | Weight | Token |
|---|---|---|---|
| **Page title / Room name** | `0.95rem` | `700` | `--text-heading` |
| **Section title / Column header** | `0.78rem` | `600` | `--text-secondary`, uppercase |
| **Body / Table cell value** | `0.84rem` | `400–500` | `--text-body` |
| **Label / Badge / Count** | `0.72rem` | `500` | `--text-muted` |

### 4. Consistent Radius Scale
Use only: `6px` (inputs, badges), `8px` (buttons, table wrapper), `10px` (panels, sidebar cards), `12px` (the outer shell).

### 5. One Accent, Two Roles
- **Brand orange** (`--color-accent`): primary CTA buttons only — "New Billing Period", "Finalize Water Cycle", "Send Bills".
- **Navy** (`--color-primary`): active/selected room in the sidebar.
- **No blue** unless it's a semantic info color (`--color-info`, `#2563EB`).

---

## Layout — Unified Two-Column Shell

Both tabs share one layout structure: a narrow room sidebar on the left + a main content area on the right. The shell container should look the same in both tabs.

```
┌─────────────────────────────────────────────────────────────┐
│  [Shell]  border: 1px var(--border-card), radius: 12px      │
│           background: var(--surface-page)                   │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────────────────────┐ │
│  │ [Sidebar] 240px  │  │ [Main Content]                   │ │
│  │ bg: #f8fafc      │  │ bg: white                        │ │
│  │ border-right: 1px│  │                                  │ │
│  │ var(--border-card│  │                                  │ │
│  └──────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Sidebar rules:**
- Room list items are plain button rows (no card borders inside the sidebar).
- Hover state: `background: var(--surface-hover)`, rounded corners `6px`.
- Active state: **left border accent** (`border-left: 3px solid var(--color-primary)`) + background `var(--color-accent-subtle)`.
- Status badge: pill, `0.7rem`, no heavy background — just color-coded text.

**Main content rules:**
- `padding: 24px`.
- Sections separated by hairline dividers (`border-top: 1px solid var(--border-subtle)`), not by full card containers.
- The only full card container is the form panel (New Billing Period / Enter Final Reading).

---

## Component Specifications

### Buttons

Only three button styles. No amber/teal/custom colors.

| Variant | Use | Style |
|---|---|---|
| **Primary** | "New Billing Period", "Send Bills", "Finalize Water Cycle" | `bg: var(--color-accent)` `#FF8C42`, white text, radius `8px` |
| **Outline** | "View Result", "Save Draft", secondary actions | `border: 1px var(--border-card)`, `color: var(--text-body)`, transparent bg |
| **Ghost** | Cancel, Reset, "Back to list" links | No border, `color: var(--text-secondary)`, subtle hover bg |

Button size:
- Standard: `padding: 8px 14px`, `font-size: 0.84rem`
- Small (in-table): `padding: 4px 10px`, `font-size: 0.76rem`

**Remove the amber "Send" button.** Replace with the standard primary (orange) button.

### Status Chips

3 electricity period statuses + 2 water statuses. Each gets a distinct semantic color from the token set.

| Status | Background | Text |
|---|---|---|
| `open` (electricity) | `var(--color-warning-bg)` `#fffbeb` + pulsing amber dot | `var(--color-warning-text)` `#92400e` |
| `closed` | `var(--color-success-bg)` `#ecfdf5` | `var(--color-success-text)` `#065f46` |
| `revised` | `var(--color-info-bg)` `#EFF6FF` | `var(--color-info-text)` `#1E40AF` |
| `draft` (water) | `var(--color-warning-bg)` | `var(--color-warning-text)` |
| `finalized` (water) | `var(--color-success-bg)` | `var(--color-success-text)` |

The `open` pill gets a pulsing dot using `@keyframes`:
```css
@keyframes billing-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}
.bill-status--open::before {
  content: "";
  display: inline-block;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--color-warning);
  margin-right: 5px;
  animation: billing-pulse 1.8s ease-in-out infinite;
}
```

### Form Panel (New Period / Water Entry)

The inline form panel should feel like a light drawer, not a card-in-card.

- Background: `var(--surface-card)` white
- Border: `1px solid var(--border-card)`
- Border-radius: `10px`
- Left accent strip: `border-left: 3px solid var(--color-accent)` — helps the eye find the active form instantly
- Panel header: `font-size: 0.84rem`, `font-weight: 600`, `color: var(--text-heading)`
- Input labels: `0.75rem`, `var(--text-secondary)`
- Inputs: `border-radius: 6px`, `border: 1px solid var(--border-card)`, focus ring `box-shadow: 0 0 0 2px var(--color-accent-light)`

### Tables

Both tabs' tables follow one pattern:

- Outer wrapper border: `1px solid var(--border-card)`, `border-radius: 8px`, `overflow: hidden`
- `th`: `background: var(--surface-page)`, `font-size: 0.72rem`, uppercase, `color: var(--text-secondary)`, `padding: 8px 14px`
- `td`: `font-size: 0.84rem`, `color: var(--text-body)`, `padding: 10px 14px`
- Row divider: `border-bottom: 1px solid var(--border-subtle)`
- Last row: no border bottom
- Row hover: `background: var(--surface-hover)` `#f1f5f9`
- Selected row: `background: var(--color-accent-subtle)` `#FFF4EB` (brand accent, not blue)
- Open period row: `background: var(--color-warning-bg)` `#fffbeb` (standard warning, not custom green)

### The Draft Bills Panel

Currently: amber gradient card `linear-gradient(135deg, #fffbeb, #fff7e6)` with an amber border. This is too loud.

After redesign:
- Same white surface as the table above it
- A single `border-left: 3px solid var(--color-warning)` accent on the left edge of the section
- Section title: `font-weight: 700`, `color: var(--text-heading)` with a small orange dot badge for bill count
- "Send Bills" becomes a standard **primary orange button** (same as all other primaries)

### The Water Summary Bar

Currently: `linear-gradient(135deg, #f8fbff 0%, #edf7ff 100%)` — blue palette entirely.

After redesign:
- Background: `var(--surface-muted)` `#f1f5f9`
- Border: `1px solid var(--border-card)`
- Border-radius: `8px`
- Values: `font-size: 1rem`, `font-weight: 700`, `color: var(--text-heading)`
- Labels: `0.72rem`, `var(--text-secondary)`, uppercase

---

## Sidebar — Room List Redesign

### Before
```
┌─────────────────────┐
│ eb-room (border     │
│         transparent)│
│                     │
│ GD-Room 101  [Open] │
│ 1200 kWh            │
└─────────────────────┘
```

### After
```
─────────────────────────── ← hairline divider between rooms
 ▌ GD-Room 101   • Active       ← left accent strip on selected
   1200 kWh
───────────────────────────
 GD-Room 102   No Period
───────────────────────────
```

Each room button:
- No card border on inactive items
- `padding: 10px 16px`
- Row-style (full width) with hairline bottom dividers
- Active: `border-left: 3px solid var(--color-primary)`, `background: var(--color-accent-subtle)`
- Status text replaces the badge pill — plain text `font-size: 0.72rem`, color-coded

---

## Specific Changes Per File

### `ElectricityBillingTab.css`

| Old | New |
|---|---|
| `--accent: #3b82f6` fallbacks | Replace with `var(--color-accent)` and `var(--color-primary)` |
| `.eb-btn--primary: #3b82f6` | `var(--color-accent)` + hover `var(--color-accent-hover)` |
| `.eb-btn--send: #f59e0b` | Remove. Merge into `.eb-btn--primary` |
| `.eb-row--open td: #f0fdf4` (green) | `var(--color-warning-bg)` `#fffbeb` |
| `.eb-status-pill--open: #dcfce7 / #15803d` (green) | Amber + pulsing dot (see above) |
| `.eb-status-pill--closed: #e0f2fe / #0369a1` (blue) | `var(--color-success-bg)` + `var(--color-success-text)` |
| `.eb-section--draft: linear-gradient amber` | White surface + left accent strip |
| `.eb-room--active: blue box-shadow` | `border-left: 3px solid var(--color-primary)` + accent-subtle bg |
| `.eb-result: #f9fafb bg` | White bg, lighter border |
| All `0.68rem` / `0.7rem` sizes | Consolidate to `0.72rem` |
| All `0.8rem` / `0.82rem` / `0.84rem` mixed | Consolidate to `0.84rem` |
| `border-radius: 12px` on shell | Keep at `12px` (already correct) |
| `border-radius: 10px` on panels | Keep |
| `border-radius: 8px` buttons | Keep |

### `WaterBillingTab.css`

| Old | New |
|---|---|
| `.wb-btn--primary: #0f766e` (teal) | `var(--color-accent)` orange |
| `.wb-room-list / .wb-panel: box-shadow: 0 12px 30px` | Use `var(--shadow-md)` only |
| `.wb-room-card: border 14px radius` | `10px` |
| `.wb-cycle-banner: #f8fbff / #dbeafe` (blue tones) | `var(--surface-muted)` + `var(--border-card)` |
| `.wb-summary: linear-gradient blue` | `var(--surface-muted)` flat |
| `.wb-status--draft: #fff7ed / #c2410c` | `var(--color-warning-bg)` / `var(--color-warning-text)` |
| `.wb-note: #eff6ff / #bfdbfe` (blue info) | `var(--color-info-bg)` / `--color-info` |
| Hardcoded `#102542`, `#52606d` etc. | Replace with `var(--text-heading)`, `var(--text-secondary)` |
| `.wb-layout: grid-template-columns: 280px 1fr` | Align with electricity: `240px 1fr` |
| `.wb-room-card:hover / .is-active: #eff6ff border` | `var(--color-accent-subtle)` + `border-left: 3px solid var(--color-primary)` |

---

## Unification Rule — What Both Tabs Must Share

After the redesign, both tabs should be able to use a **shared billing shell** CSS file (`BillingShell.css`) with the common rules, while each tab's own CSS only adds tab-specific rules.

**Shared (move to `BillingShell.css`):**
- Shell layout grid `.billing-layout`
- Sidebar `.billing-sidebar`, `.billing-sidebar__header`, `.billing-sidebar__list`
- Room button `.billing-room`, `.billing-room--active`
- Status chips `.billing-status-pill` and its variants
- Button variants `.billing-btn--primary`, `.billing-btn--outline`, `.billing-btn--ghost`, `.billing-btn--sm`
- Table wrapper `.billing-table-wrap`, `.billing-table`, `.billing-table th/td`
- Form panel `.billing-panel`
- Section divider rules

**Tab-specific (stay in each file):**
- `ElectricityBillingTab.css`: result/segment detail styles, billing period row states
- `WaterBillingTab.css`: water cycle banner, summary grid

---

## Execution Order

| Step | Task | Files |
|---|---|---|
| 1 | Audit and list every hardcoded color in both CSS files | Both CSS files |
| 2 | Create `BillingShell.css` with shared design tokens and components | New file |
| 3 | Rewrite `ElectricityBillingTab.css` using only brand tokens | `ElectricityBillingTab.css` |
| 4 | Rewrite `WaterBillingTab.css` using only brand tokens | `WaterBillingTab.css` |
| 5 | Update JSX className refs where class names change | Both JSX files |
| 6 | Add pulsing dot animation for `open` status | `BillingShell.css` |
| 7 | Remove the amber send-button variant, unify into primary | `ElectricityBillingTab.jsx` + CSS |
| 8 | Test both tabs in light mode and dark mode | Browser |

---

## Visual Before / After Summary

| Element | Before | After |
|---|---|---|
| CTA buttons | Blue (electricity) / Teal (water) | Brand orange `#FF8C42` everywhere |
| Active room | Blue ring | Navy left strip + orange-tinted bg |
| Open period row | Light green `#f0fdf4` | Warm amber `#fffbeb` |
| Open status pill | Green `#dcfce7` | Amber + pulsing dot |
| Closed status pill | Blue `#e0f2fe` | Green `#ecfdf5` — feels "done" |
| Draft bills panel | Amber gradient card | White + left orange accent strip |
| Water summary bar | Blue gradient | Neutral `#f1f5f9` flat |
| Water action button | Teal | Brand orange |
| Box shadows | Heavy on water cards | Thin `var(--shadow-sm)` only |
| Font sizes | 8+ different sizes | 4-level scale only |

---

## Verification Checklist

- [ ] No hardcoded hex colors remain in either CSS file (use grep to confirm)
- [ ] All buttons use exactly one of three variants (primary/outline/ghost)
- [ ] The `open` period status has a pulsing dot animation
- [ ] Selected room in sidebar uses navy left strip + accent-subtle background
- [ ] Water cycle banner and electricity draft section both look cohesive with the rest of the page
- [ ] Both tabs look identical in structure (same sidebar padding, same table spacing)
- [ ] Dark mode: both tabs adapt correctly via `html[data-theme="dark"]` overrides in `index.css`
- [ ] No blue-tinted colors remain in the Water tab
- [ ] The "Send Bills" button is now the standard primary orange
