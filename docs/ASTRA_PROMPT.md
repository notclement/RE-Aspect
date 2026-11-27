# Prompt for Astra — RE:Aspect view module (Top down · 3D plan · Walk)

Copy everything below the line into Astra. Attach the files from `reference/` (in the same zip as this prompt).

---

You are building the **view module** of RE:Aspect, an existing web app that shows how sunlight moves through an apartment during the day (Singapore first). The rest of the app is already built. Your job is three visual views of one unit. The code must drop into the existing codebase **without edits on our side**, so follow the contract below exactly.

## 0. TOP PRIORITY: speed and efficiency

Speed beats looks. If a visual effect costs frame time, load time or battery, leave it out. The app runs mostly on **mid-range phones**, often on mobile data. Hard budgets (we will measure them):

| Budget | Limit |
|---|---|
| **TopDownView** | **No three.js, no WebGL.** Plain SVG (or Canvas 2D). Its own code ≤ **25 KB gzipped**. |
| **Plan3DView + WalkView** | Share **one** lazily loaded three.js chunk. Their own code (excluding three) ≤ **40 KB gzipped**. Import only what you use (`three/src/...` named imports or a minimal re-export) so the three chunk is as small as possible. |
| First frame after the chunk loads | ≤ **300 ms** on a mid-range phone (Snapdragon 7-class, 2022). |
| While dragging / walking | Steady **60 fps** (≤ 16 ms per frame). Never below 30 fps. |
| While scrubbing the time slider | ≤ **8 ms** per update: only update lighting (a floor light texture / uniforms / light direction). **Never rebuild geometry** when only the sun changes. |
| Draw calls | ≤ **60** per frame for a typical unit: merge all static walls into one mesh per material, use instancing or merged geometry for furniture. |
| GPU memory | ≤ **80 MB**. Textures ≤ 1024 px, generated once and reused. |
| Idle | **0 frames** rendered when nothing changes (render on demand only). Stop completely when the tab is hidden or the view is off-screen (`visibilitychange` + `IntersectionObserver`). |

Also:
- `WebGLRenderer({ antialias: devicePixelRatio < 2, powerPreference: 'low-power' })`, pixel ratio capped at **min(devicePixelRatio, 2)** (1.5 on low-end phones if fps drops).
- **No real-time shadow maps by default.** Use our precomputed sunlit-floor `patches` and `furniture.shadows` as a floor light/shadow texture (or decal geometry). An optional soft directional shadow is allowed only if it stays within the budgets above.
- No post-processing passes (no SSAO, bloom or SSR). Fake ambient occlusion with vertex colours or a baked gradient.
- No per-frame allocations (reuse vectors and matrices), and no layout reads in the render loop.
- Build geometry once per `unit` change. Cache it and dispose of it on destroy.
- Keep the code small: no helper libraries, no loaders, no GLTF, no fonts. Simple procedural low-poly furniture.

## 1. Tech stack (fixed — do not change)

- **SvelteKit 3 + Svelte 5 runes** (`$props`, `$state`, `$derived`, `$effect`, snippets; no Svelte 4 syntax: no `export let`, no `$:`, no `on:click` — use `onclick`), **TypeScript**, Vite 8, `@sveltejs/adapter-static`, client-only (`ssr = false`).
- Import alias for our library is **`#lib/...` with explicit extensions**, e.g. `import { sunPatches } from '#lib/light.ts'`, `import type { Unit } from '#lib/sample-unit.ts'`, `import Foo from './Foo.svelte'`.
- One new runtime dependency is allowed: **`three`** (for 3D plan and Walk only — never in TopDownView). Import it **dynamically inside `onMount`** (`const THREE = await import('three')`) so it never enters the first page load. No other dependencies, no CDN, no network requests, no external fonts, images or textures (generate textures procedurally or inline tiny SVG/data URLs).
- Must not touch `window`/`document` at import time (only in `onMount`/`$effect`).

## 2. What to deliver

A zip named **`re-aspect-views.zip`** containing exactly:

```
src/lib/views/
  TopDownView.svelte
  Plan3DView.svelte
  WalkView.svelte
  index.ts              ← re-exports the three components + shared types
  (any helpers you need, all inside src/lib/views/, e.g. geometry.ts, materials.ts)
INTEGRATION.md          ← short notes: anything we must know, the `three` version you used
```

Do **not** create or modify anything outside `src/lib/views/`. Do not create routes, stores or global CSS.

## 3. Data you receive (read `reference/sample-unit.ts` for the exact types)

All lengths are **centimetres**, in plan coordinates: **+x = east, +y = south** when `unit.bearing = 0`. `unit.bearing` is the degrees the plan is turned from true north (usually 0 — our plans are traced north-up).

```ts
interface Unit {
  id: string; name: string; unitNo: string; level: number;
  ceiling: number;            // cm, floor to ceiling (e.g. 260)
  sizeSqft: number; lat: number; lon: number;
  bearing: number;
  outline: [number, number][];            // unit boundary polygon (outer walls drawn on its edges)
  walls: { a: [number,number]; b: [number,number]; t: number }[];   // ALL walls incl. outline edges; t = thickness cm
  windows: Opening[];                     // glass from sill (cm) to head (cm), normal points outward
  rooms: { name: string; x: number; y: number }[];                  // label positions
  items: Item[];                          // furniture: kind, x, y (top-left), w (x), d (y), h, color, r (corner radius), rot (deg clockwise about its centre)
  doors?: { a; b; glass: boolean; flip: number }[];                 // hinged door, or full-height sliding glass if glass
  balcony?: { x; y; w; d };
}
```

Helpers you may import (don't copy them): `itemCorners(item)`, `itemTransform(item)`, `doorGeom(door)` from `#lib/sample-unit.ts`.

**Sun**: `sun = { azimuth, altitude }` in degrees — azimuth clockwise from **true north**, altitude above the horizon. In plan coordinates the direction **towards the sun** is
`az = (azimuth − unit.bearing)·π/180 → s = [sin az, −cos az]` (horizontal), elevation = altitude. Light travels the opposite way.

**Lighting already computed for you** (from `#lib/light.ts` — use these so all three views agree with each other and with our numbers):
- `patches: Patch[]` — sunlit floor polygons (`points`), each with `intensity` 0..1 and a `clip` polygon. Light already stops at walls.
- `furniture: FurnitureLight` — `shadows` (floor shadows of furniture) and `lit` (indexes of `unit.items` in direct sun).
- `dark: number` — 0 = day … 1 = night (use it to darken the scene at night).
- Also available if useful: `windowRays(unit, azimuth, altitude)`, `lightRays(...)`, `sunPatches(...)`, `smooth(x)`.

In 3D / Walk you may use a real directional light + shadow map **as long as it matches** the `patches` (same direction/elevation; walls block light; light enters only through windows and glass doors).

## 4. Component contracts (props and methods must match exactly)

### TopDownView.svelte and Plan3DView.svelte
```ts
let {
  unit, sun, patches, dark, furniture,
  showSun = false,          // draw a small sun marker showing where the sun is
  grid = $bindable(true)    // dotted background grid on/off
}: {
  unit: Unit; sun: { azimuth: number; altitude: number }; patches: Patch[];
  dark: number; furniture: FurnitureLight; showSun?: boolean; grid?: boolean;
} = $props();

export function zoomBy(f: number): void;   // our +/− buttons call this (f = 1.2 or 1/1.2)
export function getScale(): number;        // current zoom, 1 = fit (we show it as %)
export function reset(): void;             // back to the default view
```
- Fill the parent box (`width:100%; height:100%`); the parent sets the height (user can resize it).
- **Gestures (natural, never inverted)**: one-finger/mouse drag = pan (top down) / orbit (3D: drag left → model turns left; drag up/down → tilt, clamped so you never go under the floor). **Two-finger pinch = zoom, damped** (zoom changes at about half the finger-distance ratio, clamped 0.7×–2.5×). **No mouse-wheel zoom** (wheel/trackpad scroll pans in top down; ctrl+wheel must be `preventDefault()`-ed and ignored). Apply `touch-action: none` to your own canvas only.
- 3D plan look: a cut-away architectural model (walls ≈ 230 cm tall scaled, no ceiling, solid walls, windows as glass above a solid sill, doors as openings), perspective camera that orbits, default 3/4 view from the south-west. Show the sun patches on the floor, furniture shadows, and soft light beams coming in through the windows.
- Top down look: flat plan, north up, walls dark, floor warm wood, windows as glass lines, door swings drawn, room names, sun patches warm and soft-edged, furniture shadows, sunbeams outside the unit pointing in the light direction that stop at the outer wall.

### WalkView.svelte
```ts
let { unit, sun, patches, dark, furniture, eyeLevelCm, walkSpeed, lookSensitivity, onexit }: {
  unit: Unit; sun: { azimuth: number; altitude: number }; patches: Patch[]; dark: number;
  furniture: FurnitureLight;
  eyeLevelCm: number;      // camera height (user's height − 12 cm, e.g. 169)
  walkSpeed: number;       // metres per second (default 1.3)
  lookSensitivity: number; // 1 = default, range 0.3–3
  onexit?: () => void;     // called when the user leaves walk mode (Esc on PC)
} = $props();
```
- First person at `eyeLevelCm`, inside the unit, starting in the largest room facing its brightest window. Collide with walls and furniture (can't walk through them). Ceiling visible at `unit.ceiling` when looking up.
- **PC**: WASD / arrow keys to move, mouse to look (pointer lock on click), **Esc exits** (release pointer lock and call `onexit`).
- **Phone / tablet**: left thumb = virtual joystick to move, drag anywhere else = look. **No pinch zoom in Walk.**
- Natural (non-inverted) look direction.

### All three
- **Sunlight updates live** when `sun` / `patches` / `dark` change (the user scrubs a time slider below your view; it must stay smooth). Follow the budgets in section 0: render on demand, update lighting only, never rebuild geometry on a sun change.
- Clean up everything in `onDestroy` (dispose geometries, materials, renderer, listeners) — users switch views often.
- Work with incomplete data: no walls, no items, no doors, no balcony, 3-point outlines, odd angles (walls are not always axis-aligned).
- Colours come from these CSS variables (they change with our light/dark themes): `--floor`, `--floor-line`, `--wall`, `--wall-top`, `--glass`, `--balcony`, `--ochre` (sun), `--forest` (accent), `--muted`, `--text`, `--surface`. Read them with `getComputedStyle` on mount and when they change; fall back to: floor `#e9dfcb`, wall `#3a4139`, wall top `#59625a`, glass `#9fb8b9`, sun `#F6C453`.
- Furniture: simple, tasteful low-poly shapes per `kind` (sofa, bed, table, chair, counter, console, wardrobe, rug, plant, desk, bath) using `item.color`, `w`, `d`, `h`, `rot`. Mark items in `furniture.lit` subtly (they are in direct sun).
- Night (`dark` → 1): darken towards a cool blue-grey; no sun patches when the sun is down.
- Accessibility: the root element has `role="application"` and an `aria-label` describing the view and its controls.
- No `console.log` left in, no `any` where a type exists, strict TypeScript must pass `svelte-check` with zero errors.

## 5. Quality bar

Speed first (section 0), then looks: a calm, clean architectural model (real-estate brochure feel): soft baked shading, warm sunlight, no harsh outlines, no clutter. When in doubt, choose the cheaper option.

In INTEGRATION.md, report the gzipped size of each view's code and of the three.js chunk, plus the fps you measured on a phone.

## 6. Test fixture

`reference/sample-unit.json` is a real unit (HDB 3-room, Singapore) in exactly the `Unit` shape. Use it to test. `reference/PlanView.svelte` is our current (basic) top-down + 3D view — use it to see how the props are used today; you are replacing it. `reference/light.ts`, `reference/sun.ts` and `reference/sample-unit.ts` are the library files you import from — **do not modify or copy them**, import them via `#lib/...`.

When done, zip the files as described in section 2.
