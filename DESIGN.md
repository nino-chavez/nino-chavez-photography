---
# Nino Chavez Gallery — photography.ninochavez.co
# Canonical source. `src/app.css` is the runtime artifact.
schemaVersion: 1
name: Nino Chavez Gallery
tagline: Professional volleyball action sports photography
mode: dark

colors:
  palettes:
    charcoal:
      "50":  "#f8f8f9"
      "100": "#efeff1"
      "200": "#dcdde0"
      "300": "#c0c2c8"
      "400": "#9fa2ab"
      "500": "#808593"
      "600": "#67697a"
      "700": "#525463"
      "800": "#454654"
      "900": "#3b3c48"
      "950": "#18181b"
    gold:
      "50":  "#fefce8"
      "100": "#fef9c3"
      "200": "#fef08a"
      "300": "#fde047"
      "400": "#facc15"
      "500": "#eab308"
      "600": "#ca8a04"
      "700": "#a16207"
      "800": "#854d0e"
      "900": "#713f12"
      "950": "#422006"
    # Emotion palette — used exclusively for photo filter categorization,
    # NOT for UI surfaces. Each hue maps to an emotional quality of an
    # action-sports moment.
    emotion:
      triumph:       "#FFD700"
      intensity:     "#FF4500"
      focus:         "#4169E1"
      determination: "#8B008B"
      excitement:    "#FF69B4"
      serenity:      "#20B2AA"

  surfaces:
    background: "{colors.palettes.charcoal.950}"
    card:       "{colors.palettes.charcoal.900}"
    cardHover:  "{colors.palettes.charcoal.800}"
    cardBorder: "{colors.palettes.charcoal.800}"
    elevated:   "{colors.palettes.charcoal.900}"
    secondary:  "{colors.palettes.charcoal.800}"
    overlay:    "rgba(0, 0, 0, 0.8)"
    overlayLight: "rgba(0, 0, 0, 0.5)"

  text:
    primary:   "{colors.palettes.charcoal.50}"
    secondary: "{colors.palettes.charcoal.300}"
    muted:     "{colors.palettes.charcoal.400}"
    accent:    "{colors.palettes.gold.500}"
    accentHover: "{colors.palettes.gold.400}"

  borders:
    default: "{colors.palettes.charcoal.800}"
    strong:  "{colors.palettes.charcoal.700}"

  interactive:
    hoverBg:      "{colors.palettes.charcoal.800}"
    activeBg:     "{colors.palettes.charcoal.700}"
    focusRing:    "{colors.palettes.gold.500}"
    focusOffset:  "{colors.palettes.charcoal.950}"

  status:
    success: { bg: "#22c55e20", text: "#4ade80", border: "#22c55e40" }
    error:   { bg: "#ef444420", text: "#f87171", border: "#ef444440" }
    warning: { bg: "#f59e0b20", text: "#fbbf24", border: "#f59e0b40" }

typography:
  fonts:
    body:
      family: "Inter Variable"
      fallbacks: [system-ui, "-apple-system", sans-serif]
      selfHosted: true
    display:
      family: Montserrat
      fallbacks: [system-ui, sans-serif]
      weights: [300, 700]
      selfHosted: true
      note: "Self-hosted at /fonts/montserrat-latin.woff2 — replaces Google Fonts CDN"

  # Gallery pages strictly cap at text-xl to preserve chrome budget.
  # Display scale (3xl+) is for About/Contact/Landing/Marketing ONLY.
  scale:
    core:
      xs:   "0.75rem"
      sm:   "0.875rem"
      base: "1rem"
      lg:   "1.125rem"
      xl:   "1.25rem"
    display:
      "3xl": "1.875rem"
      "4xl": "2.25rem"
      "5xl": "3rem"
      "6xl": "3.75rem"
      "7xl": "4.5rem"
      "8xl": "6rem"

components:
  button:
    primary:
      bg:    "{colors.palettes.gold.500}"
      text:  "{colors.palettes.charcoal.950}"
      hover: "{colors.palettes.gold.400}"
    secondary:
      bg:    "{colors.palettes.charcoal.800}"
      text:  "{colors.palettes.charcoal.200}"
      hover: "{colors.palettes.charcoal.700}"
  filter:
    bg:          "{colors.palettes.charcoal.800}"
    text:        "{colors.palettes.charcoal.300}"
    border:      "{colors.palettes.charcoal.700}"
    activeBg:    "{colors.palettes.gold.500}"
    activeText:  "{colors.palettes.charcoal.950}"
    activeBorder: "{colors.palettes.gold.400}"
  card:
    bg:     "{colors.palettes.charcoal.900}"
    border: "{colors.palettes.charcoal.800}"
  skeleton:
    base:      "{colors.palettes.charcoal.900}"
    highlight: "{colors.palettes.charcoal.800}"

motion:
  # View Transitions API on navigation
  duration:
    viewTransitionRoot: 0.3s
    viewTransitionMain: 0.2s      # faster for main content swap
  easing:
    out: "cubic-bezier(0.4, 0, 0.2, 1)"
  reducedMotion: true              # honor prefers-reduced-motion strictly

---

# Nino Chavez Gallery — Design System

## Overview

Gallery site hosting professional volleyball action-sports photography at scale (~20,000 photos). The design system has one uncompromising constraint: **the chrome must never compete with the photographs**. Dark background, minimal UI, small type, gold used sparingly as the single accent. The photography is the product; everything else recedes.

## Colors

### Charcoal + Gold

Two palettes, period. **Charcoal** is the neutral ramp for every text, surface, border, and chrome decision. **Gold** is the single accent — reserved for the focus ring, the primary CTA (which is rare on a gallery site), and the filter-active state. Everything else is charcoal.

### Emotion Palette

`{colors.palettes.emotion.*}` is an **exception to the "one accent" rule**. These six hues map to emotional qualities of action-sports photographs (triumph, intensity, focus, determination, excitement, serenity) and are used exclusively in the filter/tag UI when categorizing photos. They **must not** appear on UI chrome, cards, buttons, or surfaces — only on emotion-tagged filter chips and corresponding photo-meta overlays.

## Typography

**Montserrat (self-hosted)** for display — weights 300 and 700 only. Hosted at `/fonts/montserrat-latin.woff2` to avoid Google Fonts CDN (performance + privacy).

**Inter Variable** for body. System font stack fallback.

### Chrome Budget

The **critical rule** of this system: gallery pages (`/explore`, `/albums`, `/collections`, lightbox) must cap at `{typography.scale.core.xl}` (1.25rem / 20px). The display scale (`3xl` through `8xl`) is explicitly **forbidden** on gallery surfaces. Display sizes exist for About, Contact, Landing, and Marketing pages only. Violating this rule pulls attention from the photography.

## Surfaces & Depth

The entire app is built on six charcoal values:

- `{colors.surfaces.background}` — charcoal-950, the canvas.
- `{colors.surfaces.card}` — charcoal-900, photo cards and meta panels.
- `{colors.surfaces.cardHover}` — charcoal-800, hover state.
- `{colors.surfaces.elevated}` — charcoal-900, modals and dropdowns.
- `{colors.surfaces.overlay}` — 80% black, lightbox backdrop.

**No shadows.** This is a dark-mode design with black backgrounds; shadows disappear visually and only add rendering cost. Elevation is expressed through lightness (900 → 800 → 700) and the hairline-width border.

## Motion

View Transitions API (CSS) drives navigation — 300ms root, 200ms for main content. `prefers-reduced-motion` is **strictly respected**: `!important` overrides force all animation/transition to 0.01ms and disable smooth scroll. No exception — the audience includes motion-sensitive users browsing sports photography.

## Interaction

- **Focus ring** — `{colors.interactive.focusRing}` (gold-500), 2px, offset 2px against charcoal-950. The gold is the only saturated color on a typical gallery page, so the focus ring is always unmistakable.
- **Custom scrollbar** — 12px, charcoal-950 track, charcoal-700 thumb, **gold-500 on thumb hover**. Small moment of brand identity.
- **View transitions** — enable declaratively via `view-transition-name` on content containers.

## Do's and Don'ts

**Do**
- Reference tokens by path in all component CSS. Raw hex is a lint violation.
- Cap gallery page type at `{typography.scale.core.xl}` — the chrome budget is sacred.
- Use emotion palette only on emotion filter UI. Nowhere else.
- Use `{colors.palettes.gold.500}` exclusively for focus ring, filter-active, primary CTA, and the scrollbar-thumb hover.

**Don't**
- Introduce shadows. Dark + black = shadows are invisible and wasteful.
- Use display sizes on gallery pages. Ever.
- Add a second accent palette. Charcoal + gold is the entire identity.
- Bypass `prefers-reduced-motion` — even for hero animations on About/Landing.

---

*Derived from `src/app.css` (v2 token system). Treat DESIGN.md as canonical; treat `src/app.css` as the runtime artifact. Keep in sync.*
