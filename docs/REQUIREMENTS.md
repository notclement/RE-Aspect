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
- **Organised by unit** (approved mockup, 27 Nov): top bar with ☰ menu + breadcrumb (Units / Sun study). A unit page shows the serif unit name, a segmented control **Top down (default) · 3D plan · Walk**, the canvas (dotted grid, north arrow, − 100% + # zoom/grid control), the **Sun timeline** card (Auto sun · date · 12 AM–12 AM slider · time pill) and collapsible *Study details* / *Sun info*.
- Palette: warm paper `#F7F6F1`, forest green `#2F4A3B` (primary), ochre `#B07A2A` (sun/time), serif titles.
- Very clean; everything secondary is tucked behind tabs.
- The **time slider is always visible** in Sun View, 3D and Walkthrough.
- **Auto-play** runs through the full day in ~25 s, with the unit going dark → light as time passes. Night plays faster (Settings → Sun view, 1–5×, default **2.5×**), eased across sunrise/sunset.
- Sun timeline has an **ⓘ Sun info** button opening a sheet (bottom sheet on phones) with the full sun position, daylight length, location and data sources; the old Sun info panel under the plan is gone. On phones the timeline is compact (time + small arc + icon Auto sun button).
- The Sun timeline card includes a **sun position** panel: big time + "Morning/Afternoon sunlight", the day's sun-path arc (sunrise → sunset) with the sun marked, altitude, azimuth, rise/set.
- **Account menu on the avatar** (top right): name, email, current role, Profile, Settings, Sign out; admins also get **View the app as** (Free / Pro / Agency member / Agency Lead / Admin). Settings has no profile card. The ☰ menu holds only Projects (+ signed-in name, Sign out).
- **Profile → Usage**: projects used of included (bar), extra-project price, AI re-runs per function (0 used until the AI tools ship), plan + Pro expiry / lifetime.
- **Project details**: Name, Unit, Type (dropdown: HDB, EC, Condo, Landed terrace/semi-D/bungalow, Cluster, Shophouse, Commercial, Other), Address, Description, Notes, Size. Saved to the `projects` table (migration 0003) so they follow the account.
- **Admin panel** (`/admin`, avatar menu → Admin panel): **View the app as** switcher (moved from Settings); tabs **Users** / **AI keys**.
  - Users: stats (Users = all active, On Pro, All projects); live search (no button); filters **All** (everyone except disabled, default) · Pro · Free · **Full** (everyone) · Disabled; tags Active (green) / Disabled (grey); your own row shows the role you're currently viewing as. Tap a user for joined/last sign-in, projects, Pro grants (**1 month** adds to remaining time / **lifetime** / remove) and **Disable / Re-enable** (blocks sign-in too; admins and yourself can't be disabled).
  - AI keys: add keys for OpenAI / Anthropic / Google / **DeepSeek** (deepseek-flash, reads images) / Other; stored encrypted in **Supabase Vault**, browser only sees the last 4 characters; choose the **active** key; delete. Edge functions read it via `active_ai_key()` (service role only).
- **Profile photo**: Profile → Add/Change photo; centre-cropped and shrunk to a 128 px WebP (≈3–8 KB, max 16 KB) in the browser before upload; shown in the avatar circle and admin list.
- Account menu closes on any tap outside it or Escape.
- Phase 1 (New project wizard + Studio): see `docs/PHASE1.md`. Studio has **no sun preview**; keep everything lightweight and snappy on phones and desktops.
- New project steps: **Photos → Details → Floor plan → Review**; every step shows **Next**, only Review shows **Create project**.
- Floor plan step: AI (`detect-north` edge function, max 30 checks per user per day) looks at **all** the photos together (up to 15) plus the address / unit / floor — north arrows, the unit's position on a site plan, streets and landmarks on a location map, views out of the windows, shadows as weak evidence — and **pre-turns the plan** with a confidence level (high / medium / low) and its evidence ("Based on the N images provided …"). It gives a best estimate even without a north arrow. The user can adjust or just tap Next. Manual turns are never overridden (an Apply button appears instead).
- New project photos: one big drag-and-drop area (tap to choose on phones). Placeholders are generic (never a real project). Unit number can be just "125" — combined with the floor level as #05-125.
- Address search goes through the `geocode` edge function: OneMap when `ONEMAP_EMAIL`/`ONEMAP_PASSWORD` secrets are set (OneMap now requires a login token), otherwise OpenStreetMap searched from the user's browser (Nominatim blocks cloud servers). Searches on a full postal code, Enter or the Search button (no search-as-you-type).
- Studio: **Rotate plan** goes back to re-rotate the floor plan (from the original photo kept on the device; clears a traced outline/walls/windows, keeps furniture). **Done** with no furniture asks "Add furniture?" and highlights the Furniture tool.
- Profile: one header card (photo with camera badge, **Display name** with ✏️ inline edit — no permanent Save button, email, role and plan badges) and one compact **Usage** card.
- **Deleting projects**: owners can delete their own projects from the trash button on each project card or next to Edit in Studio on the project page (confirmation; deleted on the server first, then the device's floor-plan photo). Demo projects can't be deleted.
- **No two-finger / pinch / page zoom anywhere** (any page, incl. Studio and Sun view): global `touch-action: pan-x pan-y`, `user-scalable=no`, and `src/lib/no-zoom.ts` blocks iOS gesture events, multi-touch moves and ctrl+wheel. Zoom only with the + / − buttons (Sun view 70–250%; Studio has its own + / −). Two-finger trackpad scroll pans the Studio canvas.
- Studio **furniture rotates to any angle**: drag the round handle above the selected piece (1° steps, soft snap to 0/90/180/270), ±15° buttons, or type the exact angle in Size. Rotation is used everywhere (top-down, 3D layers, thumbnails, sun shadows, "in direct sun").
- Studio **Door** tool: tap any wall (outside or inside) to add a 90 cm door; drag its ends; **Hinged** (drawn with its swing, **Flip** cycles hinge side/direction) or **Glass** (full-height sliding glass — on an outside wall it lets the sun in from the floor up, like a window with no sill).
- Profile photo: after choosing a photo the user drags/pinches a **square** to pick the part to use; only that square is shrunk and uploaded.
- Demo 1 is **Dakota One** (Blk 88B Jalan Satu, HDB 3-room Type-2B, traced from HDB's plan; orientation assumed south-facing windows).
- Projects page counts the open projects (demos included) and hides "Set up your first project" when any exist.
- Project cards show a **thumbnail of the actual plan** with today's sunniest-hour light.
- Display name is asked only once (first sign-in with no name); returning sign-ins go straight to Projects.
- **Themes** (Settings → Theme), each with its own colours, corner shapes and type: Match device, Basic light, Basic dark, Japandi & Wabi-Sabi, Scandinavian, Modern Contemporary, Industrial (dark), Eclectic & Peranakan, Resort / Tropical. Defined in `src/themes.css` + `src/lib/config/themes.ts`.
- **Settings sync to the account** (`profiles.settings` jsonb, migration 0002): theme, units, clock, sun marker, night speed, walkthrough settings follow the user to any device. Values are validated/clamped on read.
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


## Agency (27 Nov 2026)
- **Only an admin makes someone an Agency Lead** (Admin → user → Agency → name + paid seats). Members = seats + 1 (lead on top); shared pool = ceil(seats × 10 × 1.25 / 10) × 10 projects. Admin can change seats/name or remove the agency.
- **My agency** page (account menu, between Profile and Settings) for leads and members.
  - Lead: rename; **invite QR** (one reusable code per agency, copy link / share / save image; "Make a new QR code" stops old QRs); **approve / decline** join requests (blocked when seats are full); team list with each member's projects; remove a member.
  - Members: see everyone in the team (photo, name, role, projects used) and the shared quota; leave the agency.
- **Joining**: scan → `/join?code=…` → sign in (the code survives sign-in) → "Ask to join" → Pending until the lead approves. One agency per person.
- Active members use the agency pool and Agency limits (5 AI re-runs per project). Projects made while in the agency belong to it: **when someone leaves or is removed, their agency projects move to the lead** (projects from before joining stay theirs).
- **Plans page** (`/upgrade`, linked from Profile): Free · RE:Aspect Pro S$50/month · Agency "Contact us for agency rates" (form → enquiry listed under Admin → Enquiries).
- Server: migration `0008_agency.sql` (all checks in security-definer functions; no direct table access).

## AI functions (27 Nov 2026)
- Edge functions need `grant select, update on public.projects to service_role` (new Supabase projects don't grant it) — in 0008.
- On failure the functions return `provider` + `detail` (key-like strings redacted); the app shows the detail to admins only. OpenAI-compatible providers (OpenAI, DeepSeek) retry once without JSON mode on a 400/422.
- Studio **Auto-trace** (floating chip on the canvas, needs the floor-plan photo on this device): re-traces outline/walls/windows/rooms with the AI, keeps placed furniture, undoable, uses one of the project's AI re-runs.
- **Admins have unlimited AI** (per-project re-runs and daily checks like north detection; still counted) — migration 0009. Profile shows **∞×** AI re-runs for admins (the role's real number when previewing another role).
- **AI limits (0010)**: re-runs per project **Free 5 · Pro 25 · Agency 25 · Admin ∞** (the free launch doesn't raise Free's AI limit). Safety cap: **40 AI runs per person per day** across all projects (admins exempt); north checks keep their own 30/day.
- **AI tracing is walls-only and fast** (27 Nov): fastest model per provider (Claude Haiku 5.5 · GPT-5.6 Luna · Gemini 3.5 Flash-Lite · DeepSeek Flash; override with `*_TRACE_MODEL` secrets), floor plan sent at 1400 px, no interior photos, 55 s limit. It returns outline, walls and room names; Studio then opens in **Window** mode with "Walls traced. Now tap the outside walls to add windows." North detection's Gemini default moved to `gemini-3.5-flash` (2.5 Flash was retired).
- **New project: every field is required** (address, name, unit, floor, type, size, ceiling).
- **Placeholders**: "Type here…" everywhere (search boxes say "Search…"), faded (muted at 45% opacity) so they never look like real values.
- **Light stops at walls**: sun patches and window rays (top-down and 3D) are traced in 24 slices across each window and cut where an interior or exterior wall stands, so light never passes through walls.
- Studio **Erase** tool: drag along an inside wall to erase only that part (tap = 90 cm gap), e.g. to open a kitchen entrance; the pieces either side stay. Outside walls can't be erased (use Door). Undoable.
- Sun view: the **outside sun arrows run right up to the outer walls**, including notches of L-shaped units (shadow mask = outline + each outer wall swept away from the sun, not a convex hull).
- Erase works **across junctions**: every inside wall on the same line loses the dragged stretch; gap ends snap onto a crossing wall within 30 cm; leftover stubs < 30 cm are removed; a crossing wall poking ≤ 45 cm past the erased stretch is trimmed back to the line.
- Studio keyboard (PC): **Ctrl/⌘+Z** undo, **Ctrl+Y** or **Shift+Ctrl/⌘+Z** redo (ignored while typing in a field).
- **3D plan walls are solid**: each wall is two upright faces + a top (not stacked slices); windows = solid sill + glass to the head; doors = opening with a lintel (glass doors = glass).
- **Demo projects are read-only for everyone (admins included)** and never count toward any quota (own projects, agency pool, admin counts). They always sit in their own "Demo projects" section on Projects; the unit page shows "Demo project · read-only" instead of Edit/Delete. Server: migration 0011 (blocks demo rows, drops the old per-user demo copies, admin counts exclude demos).

## Plans after the launch (27 Nov 2026)
- **Free launch removed.** Limits follow the real plan: projects **Free 1 · Pro 10 · Agency pool · Admin ∞**; AI re-runs per project Free 5 · Pro 25 · Agency 25 · Admin ∞ (40 AI runs per person per day). Server: `effective_plan()` in migration 0012.
- **New sign-ups until 1 Feb 2027 (SGT) get 3 months of Pro** (`handle_new_user`); existing Free users got the same 3 months once when 0012 ran.
- **Admin promo** (Admin → Promo): give everyone Pro for 1–90 days with a message. The server treats everyone as Pro while it runs and reverts by itself. Each user sees the message once as a banner under the top bar; afterwards a **gift button (top right, next to the avatar)** reopens it. Admins can end it early.
- **Upgrade prompts (A + B + D)**: (A) hitting a limit (New project at the project limit, server "limit reached", AI re-runs / daily limit in Studio) opens an upgrade sheet — Upgrade to Pro / Not now; (B) usage meter on Projects and Profile (amber when ≥ 80 % or full, "Get more with Pro" for Free users); (D) **"Upgrade to Pro ✦"** first in the account menu for Free users (hidden for Pro, agency, admins). Option C (PRO badges on Pro features) is parked for the funnel/marketing stage.
- **Pinch zoom (27 Nov, replaces "no two-finger zoom")**: page zoom stays blocked everywhere, but the canvases where you manipulate things have their own gentle two-finger pinch zoom (half the finger speed, clamped) and trackpad pinch: Top down (70–250 %), 3D plan, Studio, and the align-north screens (New project floor-plan step, Rotate plan: 1–3×, drag to look around once zoomed). Walk has no pinch.
- **Astra brief**: `docs/ASTRA_PROMPT.md` (+ reference files) specifies the drop-in view module `src/lib/views/` (TopDownView, Plan3DView, WalkView) with exact props/methods so Astra's zip integrates without changes.
- **Sun timeline shows the peak sun inside the home**: under the sun's arc, a warm band shows how much direct sun lands indoors through the day (sunlit floor area × strength, from the same patches as the plan, so walls count); a line marks the peak, and the chip "Most sun inside 4:17 PM" ("Peak inside" on phones) jumps the timeline there. "No direct sun inside on this day" when none.
- Sun timeline: **touching the slider (drag, tap, arrow keys) or jumping to the peak stops Auto sun** — it stays manual until Auto sun is pressed again.
- **Promos can be deleted** (Admin → Promo → All promos): every promo is listed (running / scheduled / ended) with Delete; deleting the running one ends it immediately (everyone back on their own plan, banner and gift button disappear). Migration 0013.
- **"View the app as" lives only in the Admin panel** (removed from the profile-photo menu). The "Viewing as … · Back to admin" strip still shows while previewing.
- **Back from photo-menu pages** (Profile, Settings, My agency, Plans, Admin, Join) returns to the page you were on before opening the menu (a project, Studio, …), skipping other menu pages in between, and it still works after a reload (remembered per tab). Other sub-pages (New project, Studio, Rotate) keep normal back.
