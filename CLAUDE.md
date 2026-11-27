# RE:Aspect — notes for Claude

Full requirements: `docs/REQUIREMENTS.md` (read it before changing behaviour).

## Stack
- **SvelteKit 3 + Svelte 5 runes**, TypeScript, Vite 8, `@sveltejs/adapter-static`.
  - Kit 3 specifics: the config lives in `vite.config.ts` (no `svelte.config.js`); the lib alias is `#lib/...` (not `$lib`). Imports use explicit extensions (`#lib/validate.ts`, `./Foo.svelte`).
  - Env vars are declared in `src/env.ts` via `defineEnvVars` and imported from `$app/env/public`.
  - The service worker uses `$app/service-worker`, `$app/manifest` and `$app/env`.
- `ssr = false`, `prerender = true` (root `+layout.ts`): every route is a static client-side shell for Cloudflare Pages.
- Supabase (auth, Postgres, edge functions) is loaded lazily (`src/lib/supabase.ts`). Without env vars the app runs in **preview mode** (local data, no sign-in).

## Backend files
- `supabase/migrations/*.sql` — run in order in the Supabase SQL editor (test first, live on promotion).
- `supabase/functions/process-project` — AI tracing; `supabase/functions/detect-north` — suggests the floor plan's north rotation from the photos (daily limit via `ai_daily_take`); `supabase/functions/geocode` — address search (OneMap via `ONEMAP_EMAIL`/`ONEMAP_PASSWORD` secrets, else the app falls back to OpenStreetMap from the browser). Deployed via the dashboard editor; Verify JWT with legacy secret OFF — they check the user themselves.

## Rules
- Keep the first load tiny (< 120 KB gz). Lazy-load heavy things (Supabase, maps, 3D, modules) with `Spinner`.
- Every user input goes through `src/lib/validate.ts`; repeat the checks server-side.
- Plan limits live in `src/lib/config/plans.ts` (UI mirror) and **must** be enforced server-side. `FREE_LAUNCH` gives everyone Pro for now.
- Never commit secrets. Only *publishable* keys go into public env vars. The AI key and Supabase secret key live in Supabase secrets.
- Touch targets ≥ 44 px, inputs ≥ 16 px font (stops iOS zoom). **No browser page zoom anywhere** (`touch-action: pan-x pan-y` globally + `src/lib/no-zoom.ts`). Only canvases where you manipulate things (Top down, 3D plan, Studio, the rotate/align-north screens) have their own **gentle two-finger pinch zoom** (damped to ~half speed, clamped) plus + / − buttons; Walk has no pinch.
- Light and dark mode via CSS variables in `src/app.css` (`[data-theme='dark']`).
- Natural gestures only (no inverted controls). The time slider stays visible in Sun View, 3D and Walk.

## Commands
- `npm run dev`: local dev at http://localhost:5173
- `npm run check`: type check (`npx tsc -p tsconfig.service-worker.json --noEmit` for the service worker)
- `npm run build`: static build into `build/`
