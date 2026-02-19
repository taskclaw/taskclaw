# TaskClaw UI/UX Design System

> The definitive reference for frontend engineers and designers building TaskClaw interfaces. This document covers design tokens, component patterns, layout principles, accessibility standards, and dark/light theme specifications.

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Design Tokens](#design-tokens)
3. [Layout System](#layout-system)
4. [Component Patterns](#component-patterns)
5. [Dark & Light Theme Specifications](#dark--light-theme-specifications)
6. [Glassmorphism System](#glassmorphism-system)
7. [Motion & Animation](#motion--animation)
8. [Iconography](#iconography)
9. [Accessibility Standards](#accessibility-standards)
10. [Responsive Design](#responsive-design)
11. [Common Patterns & Anti-Patterns](#common-patterns--anti-patterns)

---

## Design Philosophy

### Core Principles

| Principle               | Description                                                                    |
|-------------------------|--------------------------------------------------------------------------------|
| **Dark-first**          | Design for dark mode first, then adapt to light. Most users will use dark.     |
| **Glassmorphism**       | Frosted glass effects with subtle transparency create depth and hierarchy.     |
| **Density over whitespace** | Task management UIs need information density. Don't over-space things.   |
| **Instant feedback**    | Every interaction should have visible feedback within 100ms.                   |
| **Progressive disclosure** | Show essential info first, reveal details on interaction.                   |
| **Accessibility always** | WCAG 2.1 AA compliance is not optional. Design for it from the start.        |

### Visual Identity Keywords

**Tech-forward** - **Warm precision** - **Productive calm** - **Controlled energy**

The UI should feel like a premium dev tool — dark, focused, and efficient — but warmed by the coral/red brand accent and the playful Clawster personality.

---

## Design Tokens

### Spacing Scale

Based on a 4px base unit. Use these values consistently for all spacing.

| Token          | Value  | Usage                                              |
|----------------|--------|-----------------------------------------------------|
| `space-0`      | 0px    | Reset                                               |
| `space-0.5`    | 2px    | Hairline gaps                                        |
| `space-1`      | 4px    | Tight internal padding (badges, chips)               |
| `space-1.5`    | 6px    | Icon-to-text gaps                                    |
| `space-2`      | 8px    | Default internal padding, small gaps                 |
| `space-3`      | 12px   | Card internal padding, list item spacing             |
| `space-4`      | 16px   | Standard padding, section gaps                       |
| `space-5`      | 20px   | Medium section spacing                               |
| `space-6`      | 24px   | Card padding, component spacing                      |
| `space-8`      | 32px   | Section padding                                      |
| `space-10`     | 40px   | Large section gaps                                   |
| `space-12`     | 48px   | Page section spacing                                 |
| `space-16`     | 64px   | Major section spacing (marketing)                    |
| `space-20`     | 80px   | Hero/CTA section spacing                             |
| `space-24`     | 96px   | Maximum section spacing (marketing)                  |

### Border Radius

| Token           | Value  | Usage                                     |
|-----------------|--------|-------------------------------------------|
| `radius-sm`     | 4px    | Badges, chips, small elements             |
| `radius-md`     | 8px    | Buttons, inputs, small cards              |
| `radius-lg`     | 12px   | Cards, modals, dropdowns                  |
| `radius-xl`     | 16px   | Large cards, sections (default: `--radius: 1rem`) |
| `radius-2xl`    | 24px   | Marketing hero cards, CTAs                |
| `radius-full`   | 9999px | Avatars, pills, circular elements         |

### Shadow System

| Token             | Value                                                          | Usage                    |
|-------------------|----------------------------------------------------------------|--------------------------|
| `shadow-sm`       | `0 1px 2px rgba(0,0,0,0.05)`                                  | Subtle elevation         |
| `shadow-md`       | `0 4px 6px -1px rgba(0,0,0,0.1)`                              | Cards, dropdowns         |
| `shadow-lg`       | `0 10px 15px -3px rgba(0,0,0,0.1)`                            | Modals, popovers         |
| `shadow-glow-sm`  | `0 0 15px rgba(139,92,246,0.15)`                               | Subtle brand glow        |
| `shadow-glow-md`  | `0 0 30px rgba(139,92,246,0.2)`                                | Medium brand glow        |
| `shadow-glow-lg`  | `0 0 60px rgba(139,92,246,0.25)`                               | Hero/CTA brand glow      |
| `shadow-claw`     | `0 0 20px rgba(230,59,59,0.15)`                                | Claw Red accent glow     |

### Z-Index Scale

| Token        | Value  | Usage                                       |
|--------------|--------|----------------------------------------------|
| `z-base`     | 0      | Default stacking                             |
| `z-elevated` | 10     | Cards above content                          |
| `z-dropdown` | 20     | Dropdowns, select menus                      |
| `z-sticky`   | 30     | Sticky headers, sidebars                     |
| `z-overlay`  | 40     | Overlay backgrounds                          |
| `z-modal`    | 50     | Modals, dialogs                              |
| `z-popover`  | 60     | Popovers, tooltips                           |
| `z-toast`    | 70     | Toast notifications                          |
| `z-max`      | 100    | Maximum priority (rare)                      |

---

## Layout System

### Page Structure

```
┌─────────────────────────────────────────────────┐
│ Sidebar (240px fixed, collapsible to 64px)      │
│ ┌─────────────────────────────────────────────┐ │
│ │ Header / Topbar (h-14, sticky)              │ │
│ │ ┌─────────────────────────────────────────┐ │ │
│ │ │                                         │ │ │
│ │ │ Main Content Area                       │ │ │
│ │ │ (flex-1, overflow-y-auto, min-h-0)     │ │ │
│ │ │                                         │ │ │
│ │ └─────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Critical Flexbox Rules

These rules prevent the most common layout bugs in the dashboard:

```css
/* CRITICAL: Every flex parent in a scrollable chain needs min-h-0 */
.flex-parent { display: flex; flex-direction: column; min-height: 0; }

/* CRITICAL: Use h-screen, NOT min-h-screen for viewport-locked layouts */
.app-root { height: 100vh; /* NOT min-height: 100vh */ }

/* CRITICAL: Scrollable flex children need both */
.scrollable-child { flex: 1; overflow-y: auto; min-height: 0; }
```

### Grid System

| Layout          | Grid                          | Usage                        |
|-----------------|-------------------------------|------------------------------|
| Kanban board    | Horizontal scroll, fixed columns (280-320px) | Main task view     |
| Feature grid    | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` | Feature cards, settings |
| Form layouts    | Single column, max-w-lg       | Settings, forms              |
| Marketing       | `max-w-7xl mx-auto`          | Landing page sections        |
| Dashboard       | Full width with sidebar       | App interior                 |

### Kanban Column Layout

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Column Header    │  │ Column Header    │  │ Column Header    │
│ (sticky top)     │  │ (sticky top)     │  │ (sticky top)     │
├──────────────────┤  ├──────────────────┤  ├──────────────────┤
│ ┌──────────────┐ │  │ ┌──────────────┐ │  │ ┌──────────────┐ │
│ │ Task Card    │ │  │ │ Task Card    │ │  │ │ Task Card    │ │
│ └──────────────┘ │  │ └──────────────┘ │  │ └──────────────┘ │
│ ┌──────────────┐ │  │ ┌──────────────┐ │  │                  │
│ │ Task Card    │ │  │ │ Task Card    │ │  │                  │
│ └──────────────┘ │  │ └──────────────┘ │  │                  │
│                  │  │                  │  │                  │
│  (scroll area)   │  │  (scroll area)   │  │  (drop zone)     │
└──────────────────┘  └──────────────────┘  └──────────────────┘
     280-320px             280-320px             280-320px
```

- Column width: 280-320px (configurable)
- Gap between columns: 16px
- Card gap: 8px
- Column header: Sticky, includes count badge
- Horizontal scroll on overflow

---

## Component Patterns

### Buttons

| Variant         | Usage                          | Style                                        |
|-----------------|--------------------------------|----------------------------------------------|
| **Primary**     | Main CTAs, submit actions      | Brand gradient background, white text         |
| **Secondary**   | Secondary actions              | Transparent with border, foreground text      |
| **Ghost**       | Tertiary actions, icon buttons | No background, subtle hover                  |
| **Destructive** | Delete, remove actions         | Red background or red text with confirmation  |
| **Outline**     | Alternative secondary          | Border only, transparent background           |

**Button sizing:**

| Size    | Height | Padding (x) | Font Size  | Border Radius |
|---------|--------|-------------|------------|---------------|
| `sm`    | 32px   | 12px        | 14px       | 8px           |
| `md`    | 40px   | 16px        | 14px       | 8px           |
| `lg`    | 48px   | 24px        | 16px       | 12px          |

**Button states:**
- **Default:** Normal appearance
- **Hover:** Slight brightness increase or background shift
- **Active/Pressed:** Slight scale-down (0.98) or darker shade
- **Disabled:** 50% opacity, no pointer events
- **Loading:** Replace text with spinner, maintain button width

### Cards

All cards in the dashboard use glassmorphism. See [Glassmorphism System](#glassmorphism-system).

**Task Card anatomy:**
```
┌──────────────────────────────────┐
│ [Source Icon] Title              │  ← font-medium, truncate
│ Category Badge  Priority Badge   │  ← flex gap-1
│ [AI Skill indicator if assigned] │  ← text-xs, muted
│──────────────────────────────────│
│ Due date · Assignee avatar       │  ← text-xs, muted-foreground
└──────────────────────────────────┘
```

### Form Inputs

| State       | Border Color                         | Background                 |
|-------------|--------------------------------------|----------------------------|
| Default     | `border` (CSS variable)              | `input` (CSS variable)     |
| Focus       | `ring` (CSS variable) + ring offset  | Same                       |
| Error       | `destructive` (CSS variable)         | Subtle red tint            |
| Disabled    | `border` at 50% opacity             | Muted background           |

**Input sizing:** Match button heights (sm: 32px, md: 40px, lg: 48px)

### Modals / Dialogs

- Overlay: `bg-black/50` with `backdrop-blur-sm`
- Content: Glass card style with `max-w-lg` default
- Always include close button (top-right) and keyboard dismiss (Escape)
- Animate in: fade + scale from 0.95 to 1
- Center vertically on desktop, bottom-sheet on mobile

### Toast Notifications

| Type      | Icon  | Accent Color   | Duration |
|-----------|-------|----------------|----------|
| Success   | Check | Green (#22C55E) | 3 seconds |
| Error     | X     | Red (#EF4444)   | 5 seconds |
| Warning   | Alert | Amber (#F59E0B) | 4 seconds |
| Info      | Info  | Blue (#3B82F6)  | 3 seconds |

Position: Bottom-right of viewport. Stack vertically with 8px gap.

---

## Dark & Light Theme Specifications

### CSS Variable Mapping

All theme colors are defined as CSS custom properties in HSL format. Components use these variables — never hardcode colors.

#### Dark Theme (Primary)

```css
:root .dark {
  --background:        222.2 84% 4.9%;     /* #030711 */
  --foreground:        210 40% 98%;         /* #F8FAFC */
  --card:              222.2 84% 4.9%;      /* #030711 */
  --card-foreground:   210 40% 98%;         /* #F8FAFC */
  --primary:           210 40% 98%;         /* #F8FAFC */
  --primary-foreground:222.2 47.4% 11.2%;  /* #0F172A */
  --secondary:         217.2 32.6% 17.5%;  /* #1E293B */
  --muted:             217.2 32.6% 17.5%;  /* #1E293B */
  --muted-foreground:  215 20.2% 65.1%;    /* #94A3B8 */
  --accent:            217.2 32.6% 17.5%;  /* #1E293B */
  --border:            217.2 32.6% 17.5%;  /* #1E293B */
  --destructive:       0 62.8% 30.6%;      /* #7F1D1D */
  --ring:              212.7 26.8% 83.9%;   /* #CBD5E1 */

  /* Brand extensions */
  --brand-purple:      266 100% 64%;        /* #A855F7 */
  --brand-blue:        217 100% 64%;        /* #3B82F6 */
  --claw-red:          0 76% 57%;           /* #E63B3B */
  --claw-coral:        5 85% 63%;           /* #F06050 */
}
```

#### Light Theme

```css
:root {
  --background:        0 0% 100%;           /* #FFFFFF */
  --foreground:        222.2 84% 4.9%;      /* #030711 */
  --card:              0 0% 100%;           /* #FFFFFF */
  --card-foreground:   222.2 84% 4.9%;      /* #030711 */
  --primary:           222.2 47.4% 11.2%;   /* #0F172A */
  --primary-foreground:210 40% 98%;         /* #F8FAFC */
  --secondary:         210 40% 96.1%;       /* #F1F5F9 */
  --muted:             210 40% 96.1%;       /* #F1F5F9 */
  --muted-foreground:  215.4 16.3% 46.9%;  /* #64748B */
  --accent:            210 40% 96.1%;       /* #F1F5F9 */
  --border:            214.3 31.8% 91.4%;   /* #E2E8F0 */
  --destructive:       0 84.2% 60.2%;       /* #EF4444 */
  --ring:              222.2 84% 4.9%;      /* #030711 */

  /* Brand extensions (same in both themes) */
  --brand-purple:      266 100% 64%;        /* #A855F7 */
  --brand-blue:        217 100% 64%;        /* #3B82F6 */
  --claw-red:          0 76% 57%;           /* #E63B3B */
  --claw-coral:        5 85% 63%;           /* #F06050 */
}
```

### Theme Switching Rules

1. **Always use CSS variables** — never hardcode hex values for theme-dependent colors
2. **Brand colors** (`brand-purple`, `brand-blue`, `claw-red`, `claw-coral`) stay consistent across themes
3. **Dark mode class:** Applied via `class="dark"` on `<html>` element (Tailwind class strategy)
4. **Prefer dark-first:** When writing conditional classes, write `dark:` overrides rather than light overrides
5. **Images/logos:** Swap between dark and light variants based on theme

---

## Glassmorphism System

Glassmorphism is the signature visual treatment for TaskClaw's UI.

### Glass Tiers

| Tier       | Background           | Border              | Blur           | Usage                     |
|------------|----------------------|---------------------|----------------|---------------------------|
| **Glass-1** | `bg-white/5`        | `border-white/10`   | `backdrop-blur-sm` | Subtle backgrounds     |
| **Glass-2** | `bg-white/10`       | `border-white/10`   | `backdrop-blur-md` | Cards, dropdowns       |
| **Glass-3** | `bg-white/15`       | `border-white/15`   | `backdrop-blur-lg` | Modals, focused panels |

### Glass Card Component (Tailwind)

```html
<!-- Dark mode glass card -->
<div class="bg-white/5 dark:bg-white/5 border border-white/10
            backdrop-blur-lg rounded-xl p-6
            hover:bg-white/10 transition-colors">
  <!-- Content -->
</div>

<!-- Light mode equivalent -->
<div class="bg-white/80 border border-black/5
            backdrop-blur-lg rounded-xl p-6 shadow-sm
            hover:bg-white/90 transition-colors">
  <!-- Content -->
</div>
```

### Glass Rules

1. **Never stack** more than 2 layers of blur — performance degrades exponentially
2. **Glass backgrounds** need a colored backdrop to look good (solid bg underneath)
3. **Light mode glass** uses white with higher opacity + subtle shadow instead of blur
4. **Text on glass** must meet contrast requirements — add extra opacity to glass backgrounds if text is hard to read
5. **Interactive glass cards** should change opacity on hover (`bg-white/5` to `bg-white/10`)

---

## Motion & Animation

### Transition Defaults

| Property     | Duration  | Easing                              | Usage                    |
|-------------|-----------|--------------------------------------|--------------------------|
| Color       | 150ms     | `ease-in-out`                        | Hover states, focus      |
| Transform   | 200ms     | `cubic-bezier(0.4, 0, 0.2, 1)`      | Scale, position changes  |
| Opacity     | 200ms     | `ease-in-out`                        | Fade in/out              |
| Layout      | 300ms     | `cubic-bezier(0.4, 0, 0.2, 1)`      | Expand/collapse, reorder |

### Animation Patterns

| Pattern              | Implementation                    | Usage                            |
|----------------------|-----------------------------------|----------------------------------|
| **Fade in**          | Opacity 0 → 1, 200ms             | Elements appearing               |
| **Slide up**         | translateY(8px) → 0, 300ms       | Cards, list items entering       |
| **Scale in**         | scale(0.95) → 1, 200ms           | Modals, dropdowns opening        |
| **Drag feedback**    | scale(1.02), shadow increase      | Kanban card being dragged        |
| **Pulse glow**       | Box-shadow opacity oscillation    | AI running indicator             |
| **Skeleton loading** | Background shimmer animation      | Content loading states           |

### Animation Rules

1. **Respect `prefers-reduced-motion`** — disable animations when user preference is set
2. **Never animate layout properties** (width, height, margin) — use transform instead
3. **Stagger delays** for lists: 50ms per item, max 300ms total
4. **No bounce easing** in the dashboard — save playful animations for marketing pages
5. **Loading states** should appear after 200ms delay (don't flash for fast loads)

---

## Iconography

### Icon Library

**Primary:** Lucide React (`lucide-react`)

Lucide is already used throughout the project. Do not introduce additional icon libraries.

### Icon Sizing

| Context         | Size  | Tailwind Class |
|-----------------|-------|----------------|
| Inline text     | 16px  | `h-4 w-4`     |
| Default         | 20px  | `h-5 w-5`     |
| Button with text| 16px  | `h-4 w-4`     |
| Button icon-only| 20px  | `h-5 w-5`     |
| Feature card    | 24px  | `h-6 w-6`     |
| Hero/marketing  | 32px  | `h-8 w-8`     |
| Empty state     | 48px  | `h-12 w-12`   |

### Icon Color Rules

| Context                | Color                                           |
|------------------------|-------------------------------------------------|
| Navigation (active)    | `text-foreground`                               |
| Navigation (inactive)  | `text-muted-foreground`                         |
| Feature icons          | Contextual accent color (blue, purple, green)   |
| Destructive actions    | `text-destructive`                              |
| Status indicators      | Semantic color (green=done, amber=progress, red=blocked) |

### Custom Icons

When Lucide doesn't have what you need:
1. First check if a combination of existing icons works
2. If custom icon is needed: 24x24 viewbox, 1.5px stroke, rounded caps and joins
3. Export as SVG component, matching Lucide's API: `<IconName size={24} className="..." />`

---

## Accessibility Standards

### WCAG 2.1 AA Requirements

| Requirement                    | Standard                                          |
|--------------------------------|---------------------------------------------------|
| Text contrast (normal)         | 4.5:1 against background                         |
| Text contrast (large/bold)     | 3:1 against background                           |
| Interactive element contrast   | 3:1 against adjacent colors                      |
| Focus indicator                | Visible focus ring on all interactive elements     |
| Keyboard navigation            | All features accessible via keyboard              |
| Screen reader support          | Semantic HTML, ARIA labels where needed            |
| Touch targets                  | Minimum 44x44px for mobile                        |
| Reduced motion                 | Respect `prefers-reduced-motion`                  |

### Focus Indicators

```css
/* Default focus ring */
.focus-visible:ring-2 .ring-ring .ring-offset-2 .ring-offset-background

/* This translates to: */
outline: 2px solid hsl(var(--ring));
outline-offset: 2px;
```

- **Never remove** default focus indicators without providing a custom one
- Focus rings must be visible in both dark and light modes
- Use `focus-visible` (not `focus`) to avoid showing rings on mouse click

### Keyboard Navigation

| Key            | Action                                          |
|----------------|--------------------------------------------------|
| `Tab`          | Move to next focusable element                   |
| `Shift+Tab`    | Move to previous focusable element               |
| `Enter/Space`  | Activate buttons, toggle checkboxes              |
| `Escape`       | Close modals, dropdowns, popovers                |
| `Arrow keys`   | Navigate within lists, menus, radio groups        |
| `Home/End`     | Jump to first/last item in a list                |

### Semantic HTML Requirements

- Use `<button>` for actions, `<a>` for navigation — never `<div onClick>`
- Use heading hierarchy correctly (H1 → H2 → H3, no skipping)
- Use `<nav>`, `<main>`, `<aside>`, `<footer>` landmark elements
- Tables need `<thead>`, `<th scope>`, and `<caption>`
- Forms need associated `<label>` elements or `aria-label`
- Loading states: `aria-busy="true"` and `aria-live="polite"` for dynamic content

---

## Responsive Design

### Breakpoints

| Breakpoint | Width    | Tailwind | Target                    |
|------------|----------|----------|---------------------------|
| `xs`       | 0px      | (default) | Mobile phones            |
| `sm`       | 640px    | `sm:`    | Large phones, small tablets |
| `md`       | 768px    | `md:`    | Tablets                   |
| `lg`       | 1024px   | `lg:`    | Small laptops              |
| `xl`       | 1280px   | `xl:`    | Desktop                   |
| `2xl`      | 1536px   | `2xl:`   | Large desktop              |

### Responsive Behavior

| Component              | Mobile (< 768px)         | Tablet (768-1024px)     | Desktop (> 1024px)     |
|------------------------|--------------------------|--------------------------|------------------------|
| Sidebar                | Hidden (hamburger menu)  | Collapsed (icons only)   | Full (240px)           |
| Kanban board           | Single column, swipe     | 2-3 columns visible      | All columns visible    |
| Task card              | Full width               | Fixed width (280px)      | Fixed width (280-320px)|
| Navigation             | Bottom bar or hamburger  | Side collapsed           | Side full              |
| Typography scale       | -1 step from desktop     | Same as desktop          | Full scale             |
| Marketing sections     | Single column, stacked   | 2-column grid            | 3-column grid          |

### Mobile-First Rules

1. **Write mobile styles first**, then add `sm:`, `md:`, `lg:` overrides
2. **Touch targets:** Minimum 44x44px on mobile
3. **Horizontal scroll:** Only allowed for Kanban board and data tables — nowhere else
4. **Font size:** Never go below 14px on mobile for body text
5. **Modals:** Convert to full-screen or bottom-sheet on mobile
6. **Images:** Use `srcset` and responsive widths

---

## Common Patterns & Anti-Patterns

### Do (Patterns)

| Pattern                              | Why                                                     |
|--------------------------------------|---------------------------------------------------------|
| Use CSS variables for all colors     | Enables theme switching and consistency                  |
| `min-h-0` on flex parents            | Prevents flex overflow bugs (see Past Bugs in MEMORY)   |
| `h-screen` for viewport layouts      | `min-h-screen` causes scroll issues in flex              |
| Skeleton loading for async content   | Better UX than spinners for content-heavy pages          |
| Truncate long text with `truncate`   | Prevents layout breakage in cards and lists              |
| Use `transition-colors` on hover     | Smooth, performant theme transitions                    |
| Group related form fields visually   | Reduces cognitive load                                  |
| Show empty states with illustration  | Use Clawster mascot for friendly empty states            |

### Don't (Anti-Patterns)

| Anti-Pattern                          | Why                                                    |
|---------------------------------------|--------------------------------------------------------|
| Hardcode hex colors                   | Breaks theme switching                                 |
| Use `min-h-screen` in flex layouts    | Causes scroll freeze bug                               |
| Nest more than 2 blur layers          | Severe performance degradation                         |
| Use `!important`                      | Specificity wars — fix the cascade instead             |
| Animate `width`, `height`, `margin`   | Triggers layout reflow — use transform                 |
| Put icons without labels              | Accessibility failure — always add `aria-label` or text |
| Use `<div>` as a button              | No keyboard access, no screen reader announcement      |
| Rely on color alone for meaning       | Colorblind users can't distinguish — add icons/text    |
| Mix Tailwind with inline styles       | Inconsistent, hard to maintain                         |

---

*Last updated: February 2026*

**Related documents:**
- [Brand Guidelines](./brand-guidelines.md)
- [Social Media Guide](./social-media-guide.md)
- [SEO & Content Strategy](./seo-content-strategy.md)
