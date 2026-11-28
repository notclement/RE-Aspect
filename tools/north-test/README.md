# detect-north test tools

Python 3 with `pillow numpy scipy opencv-python-headless` (`pip install --break-system-packages …`).

| Script | What it does |
|---|---|
| `run.py [cases] [xN]` | Calls the deployed `detect-north` for each case (`debug: true`, admin only) and prints PASS/FAIL against the answer key (±15°), the 4 candidates, vote scores and pixel tilts. Saves raw replies to `$NORTH_OUT/res-*.json`. `CONC=2` = requests in parallel (6+ at once can hit the server's CPU limit). |
| `gt.py` | Answer-key helper: cuts the circled stack out of the site plan and the flat out of the floor plan and scores every rotation by overlap. Good at the full-size images only; check by eye with `lay.py`. |
| `tilt.py 08 15 16` | Block tilt (0–89°, clockwise) from the unit outlines around the ring (Hough lines), with the axes drawn on a zoom (`tilt.png`) to check by eye. Use `HF=1.3` for a tighter window when a linkway skews it. |
| `lay.py 01:283,301 06:125` | Lays the floor plan over its stack at the given angles (clockwise), front door as a red dot. The right angle has the outline matching and the door on the corridor. |

Environment:

- `NORTH_SET`: folder of case folders `NN_name/` with `1_site-plan.jpg`, `2_floor-plan-3room.jpg`, `answer_site-plan-stack-XXX-circled.jpg`, `case.json`. Clement's set: `hdb-test-set.zip`. It's HDB brochure material, so don't commit it.
- `NORTH_OUT`: output folder (default `north-test-out`).
- `NORTH_TOKEN_FILE`: file with the access token of an **admin** signed in on the test site. To get it, open the test site signed in, then in the console: `JSON.parse(localStorage[Object.keys(localStorage).find(k=>k.endsWith('auth-token'))]).access_token`. It lasts about 1 hour. Never commit or share it.
- `SUPABASE_PUBLISHABLE_KEY`: the test project's publishable key (same as `PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
- `NORTH_FN`: function URL (defaults to the test project).

`run.py` builds each request like the app does (floor plan ≤1536 px, other photos ≤1400 px, JPEG) and sends `Blk <block> <project>` as the address and `#<unit>` as the unit number.

New cases: add an entry to `GT` in `run.py` (and `DOOR` in `lay.py` for the door dot: the plan pixel of the main door).

## Answer key, set 2 (1024 px, 28 Nov 2026)

`gt.py` shape matching doesn't work at 1024 px (units are ~30 px across), so cases 08–18 were keyed by eye: block tilt from `tilt.py` (checked against 00–07: within ~2°, except 05), door side = the side where the stack meets its common corridor, then the plan's main door turned onto it.

| Case | 08 | 09 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 18 |
|---|---|---|---|---|---|---|---|---|---|---|
| Expected | 180 | 83? | 0 | 180? | 180 | 180 | 353 | 208 | 195 | 90 |

`?` = less sure (corridor side or outline unclear at this size); look again if the function disagrees.
Left out: **17 Rajah Summit** and **19 Toa Payoh Ascent** — their `2_floor-plan-3room.jpg` is a 4-ROOM plan.

Rechecked 28 Nov after the first Anthropic run, on 4–5× zooms: 08 (lift core is north of stack 130 → door north, 180),
10 (the narrow corridor runs *below* 206 → 0), 15 (block tilt ≈28° cw, corridor NE → 208), 16 (row turned ≈15–20° cw,
corridor above → 195). 09 kept at 83 (corridor ends at 576's bottom-left) but marked unsure.

### Run log
| Date | Key | Set | Score | Notes |
|---|---|---|---|---|
| 28 Nov 2026 | Anthropic (Sonnet 5.5) | 1024 px, 18 cases × 2 | **28/36 (78%)** with the corrected key (21/36 with the first key) | Old cases 00–07: 10/16 (14/16 on the larger images before). Misses: 06 flipped 180° ×2, 07 stack not found (estimate) ×2, 00 and 02 one run each, 09 ×2. ~35 s per check. |
| 28 Nov 2026 | Anthropic (Sonnet 5.5), find high / read low / choose medium | 1024 px, cases 00–15 × 4 turns (stopped at 63/72) | **45/61 real runs (74%)** | ~27 s per check (−23%). Turn 90°: 14/16 best; turn 0°: 9/16 worst. Misses: 07 stack never found (0/4), 06 flipped 180° (1/4), 09 (1/4), 03 and 08 (2/4). 2 runs lost to sign-in/network. |
