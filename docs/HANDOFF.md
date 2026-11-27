# RE:Aspect — handoff (28 Nov 2026)

Read `CLAUDE.md` and `docs/REQUIREMENTS.md` first. This file is the current state of play: what is live where, what is in flight, and the rules for working on the project.

## How we work

- **Repo:** `notclement/RE-Aspect`, branch `dev`. Every change goes to `dev` and the test site first.
- **Test site:** https://re-aspect-dev.clement-392.workers.dev (Cloudflare deploys `dev` in about 90 s).
- **Production:** merge `dev` → `main` only when Clement says "push to prod".
- After every change, send Clement the test link with each change labelled and explained in plain words.
- **Supabase:**
  - Test project: `kyupdztsvwegaelrkyfd`. All migrations and function deploys happen here first.
  - Live project: `juyjbwdmmntoqegzhkyi`. Do not touch it until "push to prod".
  - Migrations are run in the SQL editor.
  - Edge functions are deployed from the dashboard Code page with "Verify JWT with legacy secret" OFF.
  - The deploy confirm dialog moves around, so find its button with the browser tool's `find`; don't use fixed coordinates.
- **Security:**
  - Never commit secrets. AI keys live only in Supabase secrets.
  - Clement enters all passwords, keys and credentials himself.
  - Don't merge Cloudflare's automatic PR that renames `wrangler.jsonc`.
- **Local checks:**
  - `npm run check` (type check).
  - `REA_PREVIEW=1 npm run build` then `npx vite preview --port 4173`, and screenshot with Playwright on phone (390×844) and desktop (1280×900).
- **Skills:** `pro-ui-ux-designer` and `interior-layout-expert` are saved; use them for screen and layout work.

## Waiting for "push to prod"

1. Run migrations **0002–0015** on live, in order.
2. Deploy the edge functions to live: `process-project`, `geocode`, `detect-north`. All three need "Verify JWT with legacy secret" OFF.
3. Set the AI keys in the live Supabase secrets (Clement does this).
4. Merge `dev` → `main`.

## Recently shipped to `dev`

All of these are documented in `docs/REQUIREMENTS.md`:

- **Shared page `/s`, rebuilt for the buyer:**
  - Always light theme.
  - Opens on today's brightest moment.
  - Verdict plus Sun score.
  - Agent contact card with name, photo and agency (migration **0015**, already run on test).
  - One-tap WhatsApp replies: Book a viewing, I'm interested, Ask a question.
  - Sticky reply bar on phones.
- **New settings defaults:** height 175 cm, walk speed 1.8 m/s, look sensitivity 1.5×, night speed 5× (range 1–10×).
- **New project:** unit size in sq ft (default) or m².
- **Earlier on `dev`:**
  - Astra's views.
  - New demo flats (HDB 3-, 4- and 5-room).
  - AI tracing that adds doors and furniture.
  - Themes, Sun score chip, share links, and the timeline / layout clean-up.

## Brand guide (for Astra)

- `RE-Aspect-brand-guide.pdf` (7 pages) was sent to Clement in chat. It is not in the repo.
- **Palette:**
  - Forest `#2F4A3B`
  - Paper `#F7F6F1`
  - Ink `#1F2A24`
  - Ochre `#B07A2A`
  - Sunlight runs from morning `#F2D048` to afternoon `#F08020`. These two colours mean sunlight only.
- **Type:** Source Serif 4 for headings, Inter for UI.
- **Logo:** window + dotted sun arc + light patch. The colon in the name is two suns.
- **Assets requested from Astra:** logo files, PWA icons (1024 / 512 / 192 / 180 / favicon), link preview 1200×630, website hero 2400×1600, feature illustrations 1200×900, empty states, demo flat covers, social templates.
- **Applied on `dev` by another session:**
  - Brand kit v1 (`5f46d83`): Logo component, favicons and app icons, og:image, brand colour tokens, Source Serif 4, contrast fixes. Notes in `docs/brand/README.md`.
  - The room illustration (`a75e513`…`7fb2bb8`): landing page, sign-in, empty projects, processing screen and the app's link preview.
  - Check those before redoing any brand work.

## In flight: north detection (`supabase/functions/detect-north`)

**Clement's instruction:** do **not** merge the north detection work into `dev` until it is robust (>90 %) and he approves.

- The code is on its own branch, **`wip/north-detection`** (based on `dev`):
  - `supabase/functions/detect-north/index.ts`: the version deployed to the **test** Supabase (SHA-1 `32610f83…`).
  - `tools/north-test/`: the test scripts. See their `README.md`.
- `dev` and production still have the older detect-north.

### Taking over

1. **Get the code:** `git fetch && git checkout wip/north-detection`. Keep it up to date with `git merge origin/dev` (or rebase).
2. **Type check:** `deno check supabase/functions/detect-north/index.ts`. Deno also installs from npm: `npm i deno`, then `npx deno check …`.
3. **Deploy to the test project only** (`kyupdztsvwegaelrkyfd` → Edge Functions → detect-north → Code):
   1. Paste or replace the code.
   2. Click "Deploy updates", then the confirm dialog's "Deploy updates".
   3. Keep "Verify JWT with legacy secret" OFF.
   4. To be sure the dashboard holds exactly the branch file, compare a SHA-1 of the editor text (`monaco.editor.getModels()[0].getValue()`) with `sha1sum` of the file.
4. **Run the tests:**
   1. Unzip Clement's `hdb-test-set.zip` (never commit it).
   2. Put an admin session token from the test site in `token.txt`. It lasts about 1 h; the steps are in the tools README.
   3. Then run:
      ```
      cd tools/north-test
      pip install --break-system-packages pillow numpy scipy opencv-python-headless
      NORTH_SET=../../hdb-test-set SUPABASE_PUBLISHABLE_KEY=… CONC=2 python3 run.py x2
      ```
      Admins have no daily limit. Keep `CONC` at 2–3, since 6 at once hits the CPU limit.
5. **Check doubtful answers by eye:** `python3 lay.py 00:168,263` draws the plan on the site at those angles, with the front door in red.
6. **Add new test sets:** add the answer to `GT` in `run.py` (and the door pixel to `DOOR` in `lay.py`).
7. **Ship when ready:** once a full run is >90 % across all sets, tell Clement with the numbers. Only after his OK: merge into `dev`, add an entry to `docs/REQUIREMENTS.md`, and send the test link. Live Supabase only on "push to prod".
8. **Tuning knobs in `index.ts`:**
   - `PROMPT_FIND` / `PROMPT_READ` / `PROMPT_CHOOSE`.
   - `pixelTilt`: window radius `32 / 1400` × image size, 4× upscale.
   - The vote weights in step 3: choice 1, runner-up 0.5, door reading +1, ties to the door.
   - `planTiles` size: 380 px tiles. Bigger didn't help Dakota.

### How it works now

1. **Find:** the AI finds the site plan, the stack label (from the unit number, e.g. #07-125 → stack 125) and the north arrow.
2. **Read:** a zoomed crop around the label (with a red ring) is read 3× in parallel. Each reading gives the unit centre → main door on the floor plan and on the site plan.
3. **Tilt:** the block's tilt is measured **from the site plan's pixels** (edge directions modulo 90° around the label and around each reading's label / unit centre; median). This is within about 5° on every test case; the AI's own tilt reading was up to 35° out.
4. **Choose:** the floor plan is drawn in the 4 possible orientations (tilt + 0 / 90 / 180 / 270°) as separate images. **4 readings** each see them in a different order and vote on which matches the stack's outline with the front door facing its corridor.
   - Scoring: first choice = 1 point, second choice = 0.5, the door reading's candidate = +1, ties go to the door reading.
5. **Cost and limits:**
   - About 30–60 s and 8 AI calls per detection.
   - Admins have no daily limit (`ai_daily_take`); everyone else gets 30 a day.
   - The server's CPU time limit is hit if about 6 detections run at once. At 2 at a time there have been no failures.

### Test set and results

- **Test set:** Clement's `hdb-test-set.zip`, 8 HDB cases (00 Dakota One, 01 Ulu Pandan Glades, 02 Redhill Peaks, 03 Kim Keat Crest, 04 Tampines Bliss, 05 Alexandra Vista, 06 Farrer Park Fields, 07 Sembawang Deck).
- **Expected rotation** (degrees clockwise to turn the plan north-up). Checked by laying each floor plan over its stack on the site plan; none needs mirroring.

| Case | 00 | 01 | 02 | 03 | 04 | 05 | 06 | 07 |
|---|---|---|---|---|---|---|---|---|
| Expected | 168 | 293 | 0 | 0 | 0 | 190 | 125 | 205 |

- A pass is within ±15°.

| Version | Result |
|---|---|
| Before this test set | 5/8 |
| Current version, last full run | **14/16 (88 %)** |

- Cases 01–07: 14/14 on the last run.
- Across all recorded runs where the tilt was right, the current scoring gets 82/89 (92 %).

### Remaining failures, and next ideas

- **Dakota One (00), about 1 in 4 passes.** Readings pick 263° instead of 168°. The front door sits at the bottom-right corner, in the **bottom** wall (horizontal threshold, door swings up, gate swings down); the AI reads it as the right / top wall. It's a thin line drawing and the site plan is low resolution (1280 px).
  - Tried and rejected: wording about corner doors (made Dakota worse) and bigger orientation images (no change).
  - Next idea: draw a marker on the front door (from the step-2 reading) on each of the 4 orientation images.
- **Farrer Park (06), about 1 in 6 fails.** Step 1 sometimes puts the stack label about 30 px off, on a neighbouring block, so the tilt measured is that block's.
  - Next idea: send site plans to the server at about 2000 px instead of 1400 (client: `shrinkPhoto(…, 1400, …)` in `src/routes/new/+page.svelte`), or add a check that the label is really in the crop.
- Clement is generating more test sets. Re-run all of them after any change.

### Testing tools (copies in `tools/north-test/` on the branch)

- `/tmp/hs/run.py [cases] [xN]`: calls the test function with the admin `debug` flag. `CONC=2` sets parallelism. It prints pass/fail, candidates and scores.
  - It needs Clement's session token in `/tmp/nt/tok.txt` (read from the test site's localStorage while signed in; it lasts about 1 h). Never show the token to anyone.
- `/tmp/hs/gt.py`, `ov.py`, `lay.py`: answer key by shape matching, and overlays of the floor plan on the site plan with the front door marked.
- `/tmp/is/`: Deno (installed from npm) for `deno check`, plus benchmarks of the image steps.
