# RE:Aspect — Requirements (v0.3, 27 Nov 2026)

**Product:** RE:Aspect · **Core feature (main selling point):** DayTrace — sunlight through a unit's interior
**Paid tier:** RE:Aspect Pro · **Developer:** Clement — https://www.linkedin.com/in/clementsg
**Repo:** `notclement/RE-Aspect` (GitHub can't use `:` in names)

---

## 1. Product
- Browser web app (installable PWA) for **real-estate agents** and **interior designers**.
- Shows how sunlight moves through a unit's interior for any date and time.
- RE:Aspect is a **modular platform**: DayTrace is the core; other modules are value-adds.
- **Singapore first**, other countries later. All prices in **SGD**.
- Runs on phone, tablet and PC; must feel native: fast, no bloat, **no double-tap zoom**.
- Heavy features load on demand behind a small loading spinner.

## 2. Views
- **Login / sign-up**: Google (Apple later; it needs a paid Apple developer account). Sign-up asks for the user's **name**, which is used on as many pages as makes sense.
- **Projects** (home): list of units.
- **Anchor** (setup): upload, enter details, AI traces and best-fits, align on the map, confirm north.
- **Sun View**: top-down plan with sun patches.
- **3D view**: normal perspective orbit/rotate (**not** axonometric/isometric).
- **Walkthrough**: first-person 3D.
- **Studio**: floor plan and furniture editor.
- Settings, Profile, Upgrade/Plans, Referral, Agency (Lead), Admin.

## 3. UI / UX
- **Organised by unit** (approved mockup, 27 Nov): top bar with ☰ menu + breadcrumb (Units / Sun study). A unit page shows the serif unit name, a segmented control **3D plan · Top down · Walk**, the canvas (dotted grid, north arrow, − 100% + # zoom/grid control), the **Sun timeline** card (Auto sun · date · 12 AM–12 AM slider · time pill) and collapsible *Study details* / *Sun info*.
- Palette: warm paper `#F7F6F1`, forest green `#2F4A3B` (primary), ochre `#B07A2A` (sun/time), serif titles.
- Very clean; everything secondary is tucked behind tabs.
- The **time slider is always visible** in Sun View, 3D and Walkthrough.
- **Auto-play** runs through the full day in ~25 s, with the unit going dark → light as time passes.
- **Light and dark mode**, remembered in the browser.
- Hidden **"Sun Info"** tab for technical data (azimuth, altitude, …), showing live data only when opened. The main screen focuses on which walls get sun and how the sun falls on furniture.
- Settings explains **Add to Home Screen**: one-tap install on Android/desktop, a short guide on iPhone (Share → Add to Home Screen).
- Developer credit area with Clement's name and LinkedIn.
- Accuracy disclaimer: results are estimates.

## 4. Controls
- **Natural gestures, no inversion**: swipe left → view turns left; swipe right → view turns right.
- Touch walkthrough: left-thumb joystick to walk, drag on the right side to look.
- PC walkthrough: **WASD** to move, **mouse** to look, **Esc** to exit. Exiting zooms back to the previous view with no page change.
- Looking up shows the **ceiling** at the user-entered ceiling height.
- The user sets their **own height** in Settings (e.g. 181 cm); the camera sits at real eye level, ≈ 12 cm below their height.
- The user can see their own body when looking down. Settings: body height, walk speed, look sensitivity.

## 5. Setup / upload (Anchor)
- Recommend users provide as much as possible: developer floor plan, Google Maps / satellite images, unit number, developer stack/site plan, square footage.
- AI traces walls, doors and windows and scales them to the stated size.
- AI detects **balconies/overhangs**; it asks the user only if one is found (no extra step for units without one).
- Users fix AI errors manually in Studio (doors, windows, wall lines).
- Uploads are converted to **our own compact format**; the originals are **deleted**.
- **All inputs sanitised/validated** — see `src/lib/validate.ts`. Example: an SG unit number is `#18-04`, with an optional trailing letter, and length limits apply. The server repeats every check.

## 6. Sun model (v1)
- Sun position is calculated from location, date and time.
- Each unit is treated as **standalone**: no neighbouring buildings and no blockage at any floor level.

## 7. Furniture
- Fully customisable dimensions, including unusual sizes and height. Visible in top-down, 3D and walkthrough.

## 8. 3D module (to be built by Astra)
- **Astra** (OpenAI-based) builds the whole 3D rendering module for a professional look; everything else is built by Claude.
- Contract: the app sends unit data (walls, windows, doors, ceiling height, furniture, sun direction/time, user height, settings); the module renders it and handles orbit and walkthrough. Models are in GLB format.
- The prompt/spec for Astra will be written later.

## 9. Tiers (enforced server-side; mirrored in `src/lib/config/plans.ts`)
| | Free | RE:Aspect Pro | Agency |
|---|---|---|---|
| Price | $0 | $50 SGD / month | Custom quote |
| Units | 1 | 10; each extra unit is a **one-off** $5 SGD | seats × 10 × **1.25**, rounded **up** to the nearest 10 (10 seats → 130) |
| AI runs per function per unit | 1 | 3 | 5 |
| Import | ✗ | ✓ | ✓ |
| Export / share (QR) | ✓ | ✓ | ✓ |
| Modules (Feng Shui / BaZi) | ✗ | ✓ | ✓ |
| Members | 1 | 1 | paid seats **+ Lead** (10 seats → 11 members) |

- **Launch period: everything is free** (everyone is treated as Pro). Limits are built in from day one; Stripe payments get switched on later, with test mode first.
- **AI runs only on the admin's key.** Users never add their own key.
- Agency Lead: a gold, special-feeling dashboard showing members, usage and their units.

## 10. QR codes (no "add user" buttons)
- Referrals and team invites happen **only** via QR codes, each tied to its function.
- Team QR: one fixed code per team. It can expire by time or by number of joins. Members can join and leave; once it has expired, the Lead must reinstate it before anyone new can join.
- Referral: both sides get 1 month of Pro free.

## 11. Sharing / export
- Nothing is downloaded to the user's device; everything stays in the browser or our cloud.
- Export/share = a QR code or link pointing to the unit on our backend.
  - Shared views open **without an account**, read-only, with a working slider.
  - A **translucent logo** sits in the top-left corner.
  - Share links can't be guessed and can be revoked.
- **Sun Report**: an image-style card per unit that agents can screenshot for listings.

## 12. Privacy
- **BaZi birth dates/times are stored only in the user's browser**, and users are told this.
- PDPA-compliant privacy notice. Uploaders confirm they have the right to upload plans.

## 13. Admin
- See all users and projects, with owner and thumbnail. Grant Pro (1 month / lifetime) and Agency Lead.
- A single admin AI key (Claude / OpenAI / DeepSeek), with a **monthly AI spend cap**.
- **Server Status** tab: as many stats as possible (storage, bandwidth, AI usage/cost, users, units…), filterable and reorderable.

## 14. Tech
- **Frontend:** SvelteKit (static/SPA) on Cloudflare Pages, with every branch getting a test preview URL.
- **Backend:** Supabase on the free tier at first, with separate `re-aspect-test` and `re-aspect-live` projects.
- Saved units are tiny (~1–5 KB of vector data). All retrieved data is cached. Offline/cached mode is view-only.
- Feedback button + crash reporting before real-user testing.

## 15. Phases
0. **Foundations**: accounts, app shell, PWA, theme, Google sign-in, name capture. *(in progress)*
1. **Core DayTrace**: Anchor wizard, AI trace, manual fixes, Sun View, slider + auto-play, Sun Info, admin basics, AI spend cap.
2. **Share & sell**: QR share/export, Sun Report image, custom furniture, balcony prompt, feedback/errors, Server Status.
3. **3D**: Astra module contract and integration — orbit, walkthrough, eye level, ceiling.
4. **Teams & payments**: Agency + Lead dashboard, team QR, referral QR, Stripe, terms/disclaimer/PDPA, trademark.
5. **Modules**: Feng Shui & BaZi; then west-sun heat warning, air-con cost, cross-ventilation, furniture fit, amenities.

## Module ideas (later)
West-sun heat warning · air-con cost estimate · cross-ventilation · furniture fit check · nearby MRT / schools / amenities.
