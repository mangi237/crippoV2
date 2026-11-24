---
name: Crippo Exchange
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#4a454e'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#7b757e'
  outline-variant: '#ccc4cf'
  surface-tint: '#6a5584'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#24123c'
  on-primary-container: '#907aac'
  inverse-primary: '#d5bcf2'
  secondary: '#6f30dc'
  on-secondary: '#ffffff'
  secondary-container: '#894ff7'
  on-secondary-container: '#fffbff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#002114'
  on-tertiary-container: '#069669'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#eddcff'
  primary-fixed-dim: '#d5bcf2'
  on-primary-fixed: '#24123c'
  on-primary-fixed-variant: '#513e6b'
  secondary-fixed: '#eaddff'
  secondary-fixed-dim: '#d2bcff'
  on-secondary-fixed: '#25005a'
  on-secondary-fixed-variant: '#5900c7'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 44px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  ticker-val:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-xs:
    fontFamily: Space Grotesk
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.06em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 1.5rem
  margin-desktop: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system powers an African creator stock exchange and cultural prediction market. The brand personality balances institutional financial rigor with the vibrant, forward-looking pulse of pan-African creative economies. It projects precision, liquidity, high liquidity confidence, and cultural relevance.

### Design Movement: Modern Minimalist Financial Terminal with African Prestige
The interface fuses the data density and precision of modern algorithmic trading terminals with a minimalist, high-contrast palette anchored in royal African purples and crisp negative space. It strictly rejects cluttered, archaic terminal cliches in favor of airy architectural whitespace, razor-sharp tabular micro-typography, and purposeful market signaling.

### Target Audience & Emotional Intent
- **Audience:** Digital-native African creators, diaspora retail investors, prediction market traders, and users transacting via mobile money (MTN MoMo, Orange Money CamPay).
- **Evoked Emotions:** Institutional trust, speed, cultural swagger, analytical clarity, and financial empowerment.

## Colors

The palette leverages pristine canvas whites against deep midnight obsidian-purple tones, delivering ultra-high contrast for dense predictive tickers and ledger calculations.

### Palette Architecture
- **Primary (`#1E0B36`):** Deep Imperial Midnight Purple. Anchors primary brand touchpoints, major display metrics, primary buttons, and navigational surfaces.
- **Secondary (`#6C2BD9`):** Royal Electric Violet. Reserved for cultural prediction market states, odds highlight bars, active tabs, and predictive confidence meters.
- **Mid-Tone Accent (`#4C1D95`):** Midnight Violet. Serves as hover states, active pill fills, and secondary focal elements.
- **Tertiary / Market Green (`#059669`):** Bullish indicators, share gains, verified order executions, and positive yield deltas.
- **Market Red (`#DC2626`):** Bearish markers, share drops, liquidation warnings, and negative delta states.
- **Neutral Surface / Canvas (`#FFFFFF` & `#F8F9FC`):** Pure clinical white surfaces flanked by soft slate (`#F8F9FC`) for nested card modules and order books.
- **Neutral Foreground (`#0F172A`):** Deep slate-black for primary copy, order depth volumes, and financial data tables.
- **Mobile Money Accents:**
  - MTN MoMo Accent: `#FFCC00` (Used strictly for deposit/gateway provider badges).
  - Orange Money Accent: `#FF7900` (Used strictly for deposit/gateway provider badges).

## Typography

Typography delivers institutional terminal precision paired with geometric dynamism. Space Grotesk commands display metrics, market badges, and tabular currency tickers, while Plus Jakarta Sans delivers ergonomic legibility for project descriptions, odds analysis, and administrative details.

### Tabular Formatting Rule
All financial indicators, percentage deltas, XAF / FCFA valuations, contract counters, and order books must enforce CSS `font-variant-numeric: tabular-nums lining-nums` or `font-feature-settings: "tnum" 1` to prevent visual jittering across active live ticker cycles.

## Layout & Spacing

The layout is built on a 12-column adaptive fluid grid engineered for responsive terminal split-views, rapid order processing, and mobile-first transactional agility.

### Structural Breakpoints
- **Mobile (< 768px):** 4-column layout, compact margins (`margin`), single-column vertically stacked order forms, swipeable ticker rails, and sticky bottom execution sheets.
- **Tablet (768px – 1023px):** 8-column layout, intermediate margin (`margin-tablet`), dual split cards for live market depth and creator metrics.
- **Desktop (≥ 1024px):** 12-column layout with expanded margin (`margin-desktop`) and gutters (`gutter-desktop`). Enables 3-pane trading displays: Left (Creator Index / Prediction Stream), Center (Real-time Candlestick & Trajectory Chart), Right (Order Execution, MoMo Deposit Ledger, Market Odds).

### Navigation & Header Isolation
Top headers and application navigation bars must remain completely borderless (`border-bottom: 0`). Separate navigation from workspace content purely through contrasting canvas backgrounds (`#FFFFFF` resting over `#F8F9FC`) or a minimal 2px soft ambient step rather than bounding rules.

## Elevation & Depth

Visual hierarchy relies on flat architectural planes, micro-tonal contrast, and subtle ambient atmospheric halos rather than heavy skeuomorphic drops.

### Elevation Hierarchy
- **Level 0 (Canvas Base):** Flat `#F8F9FC` for page workspace and data-heavy operational trays.
- **Level 1 (Card & Module Layer):** Pure `#FFFFFF` panels without hard borders, relying on high-contrast negative space and an ultra-diffused tint: `box-shadow: 0 1px 3px 0 rgba(30, 11, 54, 0.04), 0 1px 2px -1px rgba(30, 11, 54, 0.02)`.
- **Level 2 (Active Prediction & Terminal Focus):** Elevated order cards and selected market tiles utilize an ambient violet tinted shadow: `box-shadow: 0 10px 25px -5px rgba(108, 43, 217, 0.08), 0 8px 10px -6px rgba(30, 11, 54, 0.04)`.
- **Level 3 (Mobile Payment Modals & Overlays):** MTN MoMo / Orange Money slide-up sheets: `box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.18)`.

## Shapes

The interface embraces a refined, geometric architectural form (`roundedness: 1`). Radii stay tight and disciplined to preserve the high-density informational feeling of a professional trading terminal.

### Radius Assignments
- **Input Fields, Terminal Cells, Order Book Rows:** `0.25rem` (4px).
- **Cards, Prediction Market Panels, Chart Containers:** `0.5rem` (8px).
- **Modals, Floating MoMo Execution Sheets:** `0.75rem` (12px).
- **Cultural Badges, Status Dots, Market Odds Chips:** Full pill radius (`9999px`) to create clear contrast against structured, angular data tables.

## Components

### Buttons & Order Actions
- **Primary Buy / Long / Yes Button:** Solid `#059669` (Market Green) with white text, font `Space Grotesk`, medium weight, uppercase tracking. Hover shifts to `#047857`.
- **Primary Sell / Short / No Button:** Solid `#DC2626` (Market Red) with white text. Hover shifts to `#B91C1C`.
- **Predictive Action Button:** Deep `#1E0B36` surface, transitioning to `#4C1D95` on interaction.
- **Secondary / Quaternary Actions:** Ghost or outlined with transparent fills and hairline slate boundaries (`#E2E8F0`).

### Cultural & Category Badges
- High-chroma, condensed pill components (`label-xs`).
- Backgrounds utilize 10% opacity tints of the tag's signature color with solid 100% typography (e.g., Afrobeat category: background `rgba(108, 43, 217, 0.10)`, text `#6C2BD9`; Nollywood Film IPO: background `rgba(220, 38, 38, 0.10)`, text `#DC2626`).

### Currency Tickers & Valuation Displays
- Formatted as `[AMOUNT] XAF` or `[AMOUNT] FCFA` using tabular figures.
- Dynamic color indicators: Positive shifts feature a micro-green up indicator (`#059669`); negative shifts reflect market red (`#DC2626`).

### Input Fields & Terminal Sliders
- Minimal, clean fields set against `#FFFFFF` or `#F8F9FC`.
- Static states feature a faint outline (`#E2E8F0`); focused states transition seamlessly into a 1.5px border colored in Electric Violet (`#6C2BD9`) with no blur halo.
- Numeric inputs always feature embedded quick-stake shortcuts (`25%`, `50%`, `75%`, `MAX`).

### Mobile Money Quick-Pay Integration (MTN MoMo & CamPay)
- Dedicated, frictionless single-tap payment tiles.
- MTN MoMo: Clean white card featuring the distinct yellow badge and instant prompt indicator.
- Orange Money: Clean white card featuring the distinct Orange brand indicator and USSD confirmation step counter.