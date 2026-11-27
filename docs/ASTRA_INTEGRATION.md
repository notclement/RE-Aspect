# RE:Aspect views

Extract at the app root. Import the components and types from `#lib/views/index.ts`. The parent supplies the canvas height and the existing light-model outputs. Both plan components support `bind:grid` and expose `zoomBy(f)`, `getScale()` and `reset()` through `bind:this`.

Use `three@0.187.0` as the runtime dependency and `@types/three@0.187.0` as a development dependency for strict TypeScript. Both WebGL views load the same minimal three.js entry on mount. The top-down view uses Canvas 2D. The module uses the existing `#lib` alias and supplied helper files directly.

## Rendering

Pass a new unit object when replacing the layout. Time changes repaint the clipped floor mask and update the lighting uniforms and furniture tint texture. All walls and furniture share one opaque mesh. Glass and window beams render separately. Theme changes recolour cached geometry. The backing buffer is capped on large displays.

Walk uses room polygons from the windows where available. For rooms with labels only, it estimates area from the nearest label on a sampled floor grid. It starts at a collision-free point near the selected room label, facing the window with the highest estimated incident light. Glass is closed, hinged passages are open and rugs are traversable.

## Verification

A client-only SvelteKit 3.4.1 static build passed with Svelte 5.59.2, Vite 8.4.0, adapter-static 4.0.1 and TypeScript 6.0.3. Strict svelte-check returned zero errors and zero warnings.

| Production code | Gzipped bytes |
| --- | ---: |
| TopDownView including shared helpers | 7,595 |
| Plan3DView including the shared 3D engine | 11,856 |
| WalkView including the shared 3D engine | 11,719 |
| Plan3DView and WalkView combined, counting shared code once | 12,225 |
| Shared lazy three.js chunk | 140,345 |

Sizes are sums of independently gzipped minified JS and CSS chunks from a Vite multi-entry build. They exclude the existing Svelte/Vite runtime. The single three.js chunk is reported separately. Bundle grouping and compression can vary in the host build.

The supplied Dakota One JSON ran in headless Chromium with SwiftShader on Linux. The touch test used a 390 × 550 CSS-pixel view at DPR 2 and 30 time changes per view. The table gives CPU time inside the view's animation callback, including render submission. Some plan updates coalesced. GPU completion and the host's upstream light calculations are outside this timing.

| View | Median scrub | 95th percentile | Maximum observed | Max WebGL draw calls/frame |
| --- | ---: | ---: | ---: | ---: |
| TopDownView | 0.4 ms | 1.2 ms | 1.6 ms | 0 |
| Plan3DView | 1.4 ms | 3.0 ms | 4.4 ms | 6 |
| WalkView | 1.0 ms | 2.4 ms | 7.5 ms | 5 |

In that run the first 3D render callback finished 208 ms after the three.js resource transfer ended. The top-down session requested no three.js chunk. All views recorded zero idle and off-screen frames during the observation windows. Scrubbing recorded zero WebGL geometry-buffer uploads. Smoke checks covered pinch, joystick movement, keyboard walking, Escape, view switching, night, a triangular unit with empty arrays, and collision against a wall, doorway, rotated item and outline.

**Physical-phone FPS and peak GPU memory are unmeasured.** A Snapdragon 7-class device was unavailable. The on-device first-frame, sustained frame-rate, full scrub-time and GPU-memory budgets still need hardware verification.
