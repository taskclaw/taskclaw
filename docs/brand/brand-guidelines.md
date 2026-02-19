# TaskClaw Brand Guidelines

> The definitive guide to TaskClaw's visual identity, voice, and brand expression.
> Every team member, contributor, and partner should reference this document before creating any branded material.

---

## Table of Contents

1. [Brand Overview](#brand-overview)
2. [Brand Story & Mission](#brand-story--mission)
3. [Logo System](#logo-system)
4. [Color Palette](#color-palette)
5. [Typography](#typography)
6. [Brand Voice & Tone](#brand-voice--tone)
7. [Messaging Framework](#messaging-framework)
8. [Imagery & Illustration Style](#imagery--illustration-style)
9. [Do's and Don'ts](#dos-and-donts)

---

## Brand Overview

**Brand Name:** TaskClaw
**Tagline:** Where tasks begin themselves.
**Category:** Open-source AI task orchestration platform
**Audience:** Developers, productivity enthusiasts, small-to-mid teams, open-source contributors

TaskClaw is an open-source task orchestration hub that syncs tasks from multiple tools (Notion, ClickUp, and more) into a unified Kanban board, then uses AI — powered by your own infrastructure — to actually start and execute work.

### Brand Essence

> **Grip your tasks. Let AI do the heavy lifting.**

TaskClaw exists at the intersection of **task management** and **AI execution**. We don't just organize — we ship.

### Brand Personality Attributes

| Attribute       | Description                                                    |
|-----------------|----------------------------------------------------------------|
| **Bold**        | We speak directly. No fluff, no corporate jargon.              |
| **Playful**     | Our lobster mascot sets the tone — approachable and memorable. |
| **Empowering**  | We put users in control of their tools and infrastructure.     |
| **Technical**   | We respect our audience's intelligence — no dumbing down.      |
| **Open**        | Transparent, community-driven, open-source at heart.           |

---

## Brand Story & Mission

### The Problem We Solve

Modern knowledge workers are drowning in fragmented tools. Personal tasks live in Notion, work tasks in ClickUp, side projects in Trello — and the brain is the only "integration" between them. Worse, powerful AI assistants exist but require manual prompting every single time, with no persistent context or automation.

### Our Mission

**To eliminate the gap between "I know what to do" and "It's done."**

TaskClaw unifies task management across all your tools and lets AI — running on YOUR infrastructure — pick up tasks, load the right skills and context, and deliver results. You just review.

### Brand Promise

TaskClaw transforms you from a **manager of to-do lists** into a **shipper of outcomes**.

---

## Logo System

### The Mascot: Clawster

Our mascot is a friendly, cartoon-style red lobster — "Clawster." The lobster represents grip, precision, and the ability to handle multiple things at once. It's holding a task card in its claw, with a Kanban board visible behind it, visually communicating what TaskClaw does at a glance.

### Logo Variants

| Variant        | File                         | Usage                                       |
|----------------|------------------------------|---------------------------------------------|
| **Dark Mode**  | `taskclaw_logo_dark.png`     | Dark backgrounds, marketing on dark themes  |
| **Light Mode** | `taskclaw_logo_light.png`    | Light backgrounds, print, documentation     |

Logo files are located at: `docs/integrations/new-visual-identity/`

### Logo Usage Rules

1. **Minimum clear space:** Maintain padding equal to the height of the "T" in TASKCLAW on all sides
2. **Minimum size:** Never render the logo smaller than 120px wide on screen or 30mm in print
3. **Do not** rotate, stretch, recolor, add shadows, or place on busy backgrounds without sufficient contrast
4. **Do not** separate the mascot from the wordmark unless using the mascot as an avatar/favicon
5. **The mascot alone** may be used for social media avatars, favicons, and app icons
6. **The wordmark alone** ("TASKCLAW" text) may be used in UI headers where space is limited

### Logo on Backgrounds

- On dark backgrounds (#0A0A0B to #1A1028): Use the **dark variant**
- On light backgrounds (#FFFFFF to #F5F5F5): Use the **light variant**
- On colored backgrounds: Ensure a minimum contrast ratio of 4.5:1
- Never place the logo on a background that competes with the red/coral mascot colors

---

## Color Palette

### Primary Colors

These colors are derived directly from the TaskClaw logo and define our core identity.

| Color              | Hex       | HSL                | RGB              | Usage                                    |
|--------------------|-----------|--------------------|------------------|------------------------------------------|
| **Claw Red**       | `#E63B3B` | `0° 76% 57%`      | `230, 59, 59`    | Primary brand color, CTAs, accents       |
| **Lobster Coral**  | `#F06050` | `5° 85% 63%`      | `240, 96, 80`    | Secondary accent, highlights, hover      |
| **Shell Red**      | `#C42D2D` | `0° 63% 47%`      | `196, 45, 45`    | Deep accent, pressed states, emphasis    |

### Dark Theme Colors

| Color                | Hex       | HSL                 | Usage                                    |
|----------------------|-----------|---------------------|------------------------------------------|
| **Midnight**         | `#0A0A0B` | `240° 5% 3%`       | Primary background                       |
| **Dark Surface**     | `#111114` | `240° 8% 7%`       | Cards, elevated surfaces                 |
| **Dark Elevated**    | `#1A1A1F` | `240° 8% 11%`      | Hover states, secondary surfaces         |
| **Circuit Navy**     | `#0D1525` | `218° 49% 10%`     | Dark accent from logo background         |
| **Border Subtle**    | `#FFFFFF1A` | `0° 0% 100% / 10%` | Glassmorphism borders                  |

### Light Theme Colors

| Color                | Hex       | HSL                 | Usage                                    |
|----------------------|-----------|---------------------|------------------------------------------|
| **White**            | `#FFFFFF` | `0° 0% 100%`       | Primary background                       |
| **Light Surface**    | `#F8F8F8` | `0° 0% 97%`        | Cards, sections                          |
| **Light Muted**      | `#F1F5F9` | `210° 40% 96%`     | Secondary backgrounds                   |
| **Border Light**     | `#E2E8F0` | `214° 32% 91%`     | Borders, dividers                        |

### Accent / Gradient Colors

These are used for special UI elements, the gradient system, and feature highlights.

| Color              | Hex       | Usage                                        |
|--------------------|-----------|----------------------------------------------|
| **Brand Purple**   | `#A855F7` | Gradient start, premium features             |
| **Brand Blue**     | `#3B82F6` | Gradient end, interactive elements           |
| **Hero Glow**      | `#8B5CF6` | Background glow effects                      |
| **Success Green**  | `#22C55E` | Success states, completion, "Done" column    |
| **Warning Amber**  | `#F59E0B` | Warnings, "In Progress" indicators           |
| **Info Blue**      | `#3B82F6` | Information, links, "AI Running" states      |

### Gradient Definitions

| Gradient Name          | Definition                                          | Usage                          |
|------------------------|-----------------------------------------------------|--------------------------------|
| **Brand Gradient**     | `linear-gradient(to right, #A855F7, #3B82F6)`      | Primary CTAs, hero elements    |
| **Claw Gradient**      | `linear-gradient(135deg, #E63B3B, #F06050)`         | Logo-aligned accents, badges   |
| **Dark Glow**          | `radial-gradient(ellipse, #8B5CF620, transparent)`  | Background ambient glow        |
| **Card Hover**         | `linear-gradient(to bottom, #FFFFFF10, #FFFFFF05)`  | Glass card hover states        |

### Color Accessibility

- All text must meet **WCAG 2.1 AA** minimum contrast ratio of **4.5:1** against its background
- Interactive elements must have a contrast ratio of at least **3:1** against adjacent colors
- Never use Claw Red (`#E63B3B`) as body text on dark backgrounds — use it for headings, icons, and accents only
- For body text on dark: use `#F8FAFC` (foreground) or `#94A3B8` (muted)
- For body text on light: use `#0F172A` (foreground) or `#64748B` (muted)

---

## Typography

### Font Stack

| Usage            | Font Family       | Fallback Stack                                    |
|------------------|-------------------|---------------------------------------------------|
| **Primary**      | Inter             | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` |
| **Monospace**    | JetBrains Mono    | `"Fira Code", "SF Mono", Consolas, monospace`     |

**Inter** is our primary typeface for all brand communications. It's a clean, modern sans-serif optimized for screen readability. Open-source and available on Google Fonts.

### Type Scale

| Element              | Size                        | Weight     | Letter Spacing | Line Height |
|----------------------|-----------------------------|------------|----------------|-------------|
| **Display / Hero**   | 4xl-7xl (responsive)        | Bold (700) | Tight (-0.025em) | Tight (1.1) |
| **H1 / Page Title**  | 3xl-5xl (responsive)        | Bold (700) | Tight (-0.025em) | Tight (1.15) |
| **H2 / Section**     | 3xl-4xl (responsive)        | Bold (700) | Normal         | Normal (1.3) |
| **H3 / Card Title**  | xl (20px)                   | Bold (700) | Normal         | Normal (1.4) |
| **Body**             | base (16px)                 | Regular (400) | Normal      | Relaxed (1.6) |
| **Body Small**       | sm (14px)                   | Regular (400) | Normal      | Normal (1.5) |
| **Caption / Label**  | xs (12px)                   | Medium (500) | Wide (0.05em) | Normal (1.4) |
| **Button**           | sm-lg (responsive)          | Semibold (600) | Normal     | Normal (1)   |

### Typography Rules

1. **Headings** always use `font-bold` (700) with `tracking-tight`
2. **Body text** uses `font-normal` (400) — never bold for paragraphs
3. **Buttons and labels** use `font-semibold` (600)
4. **Code and technical content** uses the monospace stack
5. **Never use ALL CAPS** in body text — reserve uppercase for labels, badges, and the logo wordmark only
6. **Maximum line length** for body text: 65-75 characters (use `max-w-2xl` or `max-w-3xl`)

---

## Brand Voice & Tone

### Voice (Consistent — Who We Are)

TaskClaw's voice is **direct, empowering, and technical-yet-approachable**. We speak like a sharp engineer friend who also happens to be great at explaining things.

| Principle              | What it means                                                   | Example                                                  |
|------------------------|-----------------------------------------------------------------|----------------------------------------------------------|
| **Direct**             | Lead with the point. No filler, no preamble.                    | "Stop organizing tasks. Start finishing them."            |
| **Action-oriented**    | Frame everything as outcomes, not features.                     | "Your AI picks it up and delivers." (not "AI integration feature") |
| **Empathetic**         | Acknowledge real pain before offering solutions.                | "You know what to do. You have the list. But..."         |
| **Technically honest** | Don't oversimplify to the point of being inaccurate.            | "AI runs on your own OpenClaw VPS."                      |
| **Playful confidence** | Be bold without being arrogant. Inject personality.             | "Your task manager is a glorified to-do list."            |
| **Community-first**    | We're open-source. Speak as equals, not a company selling.      | "Built by the community, for the community."              |

### Tone (Variable — Adapts to Context)

| Context                 | Tone Adjustment                                                           |
|-------------------------|---------------------------------------------------------------------------|
| **Landing page**        | Bold, confident, slightly provocative. Hook fast.                         |
| **Documentation**       | Clear, precise, helpful. Be concise — engineers hate fluff.               |
| **Social media**        | Casual, witty, community-oriented. Use memes and dev humor sparingly.     |
| **GitHub / OSS**        | Collaborative, grateful, transparent. Thank contributors by name.         |
| **Error messages**      | Helpful, not cute. Explain what happened and what to do next.             |
| **Release notes**       | Excited but factual. Lead with what's new, then how to use it.            |
| **Support / Discord**   | Patient, friendly, solutions-focused. No blame, just fixes.              |

### Language Patterns to Use

- **Imperative commands:** "Connect. Configure. Ship."
- **Contrast framing:** "Not just organize — execute."
- **Rhythmic repetition:** "Your tools. Your AI. Your infrastructure."
- **Short punchy sentences** followed by longer explanatory ones
- **Active voice** always: "TaskClaw syncs your tasks" (not "Tasks are synced by TaskClaw")
- **Present tense** for immediacy: "Your AI picks it up" (not "Your AI will pick it up")

### Words We Use vs. Words We Avoid

| Use                          | Avoid                                  |
|------------------------------|----------------------------------------|
| Ship, deliver, execute       | Leverage, synergize, optimize          |
| Build, create, connect       | Utilize, implement, deploy (in marketing) |
| Open-source, transparent     | Free, freemium, no-cost                |
| Your infrastructure          | Cloud, SaaS, hosted                    |
| Pick up, handle, grip        | Process, manage, facilitate            |
| Community, contributors      | Users, customers (in OSS context)      |
| Scattered to shipped         | End-to-end workflow optimization       |

---

## Messaging Framework

### Elevator Pitch (10 seconds)

> TaskClaw is an open-source task hub that syncs all your tools into one board and uses AI to actually start your work — on your own infrastructure.

### Short Description (30 seconds)

> TaskClaw syncs tasks from Notion, ClickUp, and more into a single Kanban board. Assign AI skills and knowledge bases to task categories, then drag a task to "AI Running" — your connected OpenClaw instance picks it up, executes with the right context, and delivers. Open-source, self-hosted, privacy-first.

### Positioning Statement

> **For** developers and teams **who** are tired of managing tasks across fragmented tools,
> **TaskClaw is** an open-source AI task orchestration platform
> **that** unifies all your task sources into one board and uses AI to start and execute work automatically.
> **Unlike** traditional task managers that just hold lists,
> **TaskClaw** actually gets things done — on your own infrastructure, with your own AI.

### Core Value Propositions

| Pillar                    | One-liner                                                        | Supporting Message                                                    |
|---------------------------|------------------------------------------------------------------|-----------------------------------------------------------------------|
| **Unified Board**         | One board. All your tasks.                                       | Sync Notion, ClickUp, and more. No more switching between apps.       |
| **AI Execution**          | AI doesn't just suggest — it delivers.                           | Pre-configured skills and knowledge databases. Zero manual prompting. |
| **Your Infrastructure**   | Your data. Your AI. Your rules.                                  | Self-hosted OpenClaw. Nothing passes through our servers.             |
| **Open Source**           | Built in the open. Owned by the community.                       | MIT-licensed. Fork it, extend it, make it yours.                      |
| **Smart Defaults**        | Configure once. Execute forever.                                 | Skills per category. Knowledge bases per task. AI that remembers.     |

### Key Differentiators

1. **Not a SaaS** — Self-hosted, open-source, you own everything
2. **Not just a board** — AI actually executes tasks, not just organizes them
3. **Not another AI wrapper** — Pre-configured skills + knowledge = zero prompt engineering
4. **Not a walled garden** — Two-way sync with the tools you already use

---

## Imagery & Illustration Style

### Photography & Visuals

TaskClaw primarily uses **illustrations and UI screenshots** rather than stock photography. When visuals are needed:

1. **Dark-first design:** Most marketing visuals use a dark theme with glowing accents
2. **Glassmorphism:** Cards and UI elements use frosted glass effects (blur + transparency)
3. **Circuit/tech patterns:** Subtle circuit board patterns in backgrounds (as seen in the dark logo)
4. **Neon glow:** Accent elements use soft glowing edges (purple/blue gradient glow)
5. **Kanban always visible:** Product shots should show the Kanban board — it's our core visual metaphor

### Illustration Guidelines

- **Style:** Cartoon/character illustration (matching Clawster mascot)
- **Color palette:** Stay within brand reds, with dark/navy backgrounds for drama
- **Mood:** Friendly but tech-savvy — not corporate, not childish
- **Mascot usage:** Clawster can be used in various poses:
  - Holding/moving task cards (primary pose)
  - Giving thumbs-up/claw-up (success states)
  - Wearing headphones (documentation/guides)
  - With a hard hat (deployment/DevOps content)

### Icon Style

- **Type:** Lucide icons (already used in the product)
- **Weight:** Regular (1.5px stroke)
- **Size:** 16px (small), 20px (default), 24px (large)
- **Color:** Match the context — use accent colors for feature icons, muted for UI chrome

---

## Do's and Don'ts

### Do

- Use the mascot to make technical content more approachable
- Lead with pain points before solutions in all marketing
- Emphasize self-hosted / privacy-first positioning
- Celebrate open-source contributors publicly
- Use dark theme as the default in screenshots and marketing materials
- Keep copy concise — if you can say it in fewer words, do it
- Use the brand gradient (purple-to-blue) for primary CTAs

### Don't

- Don't call TaskClaw a "SaaS" or "platform-as-a-service"
- Don't use the mascot in offensive, political, or controversial contexts
- Don't use stock photos of people in meetings — that's not our vibe
- Don't use comic sans, papyrus, or any font outside the brand type system
- Don't add drop shadows to the logo
- Don't use Claw Red as a background color for large areas — it's an accent
- Don't describe AI capabilities with hype words like "revolutionary" or "magical"
- Don't promise specific AI output quality — AI is a tool, results depend on configuration

---

*Last updated: February 2026*
*Maintained by the TaskClaw core team. For questions, reach out at hello@onset.dev*

**Related documents:**
- [Social Media Guide](./social-media-guide.md)
- [SEO & Content Strategy](./seo-content-strategy.md)
- [UI/UX Design System](./ui-ux-design-system.md)
