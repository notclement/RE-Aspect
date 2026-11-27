# RE:Aspect brand (kit v1, applied 28 Nov 2026)

- **Logo:** `src/lib/components/Logo.svelte` (outlined lockup, no web font). Only two variants:
  colour on light themes and reversed (paper) on dark themes, switched by `--logo-mark` / `--logo-text` in `src/themes.css`.
  Every theme uses one of these two. `kind="mark"` gives the symbol alone (min 20 px).
- **Colours:** Paper for most of the screen, Forest for actions, Ink for body text.
  `--morning` / `--afternoon` / `--daylight` are only for sunlight and time of day. Sky only for glass.
  Use `--ochre-ink` for ochre **text** (it passes 4.5:1); `--ochre` is for fills and icons.
- **Messaging:** `BRAND.tagline` speaks to agents and designers (our customers);
  `BRAND.buyerLine` ("See the light before you move in.") is for buyers on shared pages and link previews.
- **Link preview:** `static/og/reaspect-share.jpg` (1200×630). Source: `share-image-source.svg`
  (headline set in Source Serif 4 SemiBold). The absolute URL comes from `SITE_ORIGIN`, set per branch in `vite.config.ts`.
- **Icons:** share uses the standard box-and-arrow symbol (the kit's arrow-out glyph reads as "log out").
- **On hold:** the AI room illustration; web-font loading (system fallbacks for now).
