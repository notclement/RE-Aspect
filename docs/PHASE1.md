# Phase 1 — New project + Studio

> **Status (27 Nov 2026):** first version built and on `dev`: wizard, Studio, real projects, AI function deployed on the test project, migration 0005. Decisions from review: **no live sun preview in Studio** (sun view stays on the project page); speed first on phones and desktops; OneMap for addresses; manual trace fallback; new windows default ⅔ glass; floor plan rotated so the unit's north points up.

Goal: a user goes from a handful of photos to an accurate, editable DayTrace sun view of their own unit, fast, on a phone.

## Flow at a glance

```
New project (wizard)                         Server (edge function)                Studio
1 Photos ≤15 ─┐                                                                    ┌─ windows (position + glass height)
2 Details     ├─ resize in browser ─► private bucket ─► AI trace + furniture ─► plan ┤─ furniture (add / move / resize)
3 Floor plan  │   (≤2048 px, EXIF off)   (temp only)     using the admin's       JSON ├─ live sun preview
  pick + north┘                                         active AI key       photos  └─ autosave · reopen any time
                                                                            deleted
```

## 1. New project wizard (`/new`, replaces the Anchor placeholder)

| Step | What the user does | Notes |
|---|---|---|
| **Photos** | Add up to **15** photos (camera or gallery): floor plan, site plan/maps, interior shots. | Each photo is downscaled in the browser (long side ≤ 2048 px, ~300 KB WebP/JPEG) before upload; re-encoding strips EXIF/GPS. Thumbnails shown in a grid; remove with ✕. Count shown as "7 / 15". |
| **Details** | Name, unit no., Type (HDB / EC / Condo / Landed / …), address, level, size (sq ft). | Size sets the plan's scale. Address → coordinates via **OneMap** (Singapore government geocoder, free). Ceiling height defaults by type (HDB 2.6 m, condo 2.8 m), editable later. Same validators as today, repeated server-side. |
| **Floor plan** | Tap the one photo that is the floor plan, then **rotate it so north points up** (90° buttons + fine-turn slider ±45°, north arrow overlay). | Tip shown: use the north arrow on the site plan / location map. Rotation is saved, so the traced plan is north-up (bearing 0) and sun maths needs no further input. |
| **Processing** | Wait screen with progress ("Tracing walls… Finding windows… Placing furniture…"). | Can leave the page; the project card shows *Processing*, then *Ready*. |

Then the user lands in **Studio** to check and fix the result.

## 2. Processing (Supabase edge function `process-project`)

0. Photos are sent **in the request body only** (never written to storage), so there is nothing left to delete afterwards.
1. Reads the admin's **active AI key** (`active_ai_key()`, service role only — Admin → AI keys).
2. **Trace** the rotated floor plan → walls, windows, doors, rooms, in cm (scale from size in sq ft + plan dimensions when printed).
3. **Furnish** from interior shots (if any) → furniture list with approximate sizes, assigned to rooms. No interior shots → a sensible default layout per room type.
4. Saves the result as the project's **plan** (our own compact JSON — the same `Unit` shape the sun engine already uses).
5. **Deletes every uploaded photo** (storage objects + temp rows). A scheduled sweep also deletes anything older than 24 h as a safety net. Only the distilled plan is kept.
6. Counts the AI run against the plan's per-function limit (Free 1 / Pro 3 / Agency 5 re-runs), enforced in the database.

## 3. Studio (`/studio?id=…`) — open after processing, or any time via *Edit in Studio*

Mobile-first: one plan canvas, a slim tool bar at the bottom, big touch targets, everything undoable.

| Tool | Interaction |
|---|---|
| **Select / move** | Tap anything to select; drag to move; pinch/drag the canvas to pan/zoom (same natural gestures as the sun view). |
| **Windows** | Tap a wall to add a window; drag its two end handles to size it. **Glass height: ⅓ · ½ · ⅔** (three chips only — the rest of the wall below is solid). Delete from the selection bar. |
| **Furniture** | Palette with presets (bed single/queen/king, sofa 2/3-seat, dining table, desk, wardrobe, TV console, counter, plant, rug). Drag to place, rotate 90°, exact size in cm and height via a small sheet. Custom sizes allowed. |
| **Rooms** | Rename room labels (Living, Bedroom 2…). |
| **Undo / redo · autosave** | Every change autosaves (debounced) to the project; no Save button needed. |

Later in Studio (not Phase 1 unless trivial): wall nudging, doors, balcony/ledge depth, ceiling height per room.

## 4. Data model (migration 0005)

`projects` gains: `plan jsonb` (≤ 200 KB, validated shape), `status` (`draft · processing · ready · failed`), `level`, `size_sqft`, `ceiling_cm`, `lat`, `lon`.
New: `ai_runs (project, function, count)` for the re-run limits; private storage bucket `uploads` with per-user folder policies.

## 5. Speed & efficiency

- Wizard and Studio are separate lazy-loaded chunks; the first load stays under the 120 KB budget.
- Images are shrunk in the browser before upload (≈10× less data); uploads run in parallel, max 3 at a time.
- Studio edits a single SVG with one transform; no per-frame allocations; sun preview reuses the existing engine (already ~60 fps at 4× CPU throttle).
- Plans are small JSON (~10–30 KB), cached locally for instant reopen.

## 6. Build order

1. Migration 0005 + storage bucket and policies.
2. Wizard steps 1–3 (works end-to-end with a "manual trace" fallback if no AI key is set).
3. Studio: select/move, windows with ⅓ · ½ · ⅔, furniture palette, autosave, undo.
4. Edge function `process-project`: trace + furniture + photo deletion.
5. Real projects listed alongside demos; plan limits; *Edit in Studio* on the project page.

## Assumptions (tell me if any are wrong)

- Address → location through **OneMap** (Singapore only for now).
- If AI tracing fails or no key is set, the user can still trace walls by hand in Studio (simple: tap corners).
- Glass height options apply per window (default ⅔, matching today's demos).
