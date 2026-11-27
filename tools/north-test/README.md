# detect-north test tools

Python 3 with `pillow numpy scipy opencv-python-headless` (`pip install --break-system-packages …`).

| Script | What it does |
|---|---|
| `run.py [cases] [xN]` | Calls the deployed `detect-north` for each case (`debug: true`, admin only) and prints PASS/FAIL against the answer key (±15°), the 4 candidates, vote scores and pixel tilts. Saves raw replies to `$NORTH_OUT/res-*.json`. `CONC=2` = requests in parallel (6+ at once can hit the server's CPU limit). |
| `gt.py` | Answer-key helper: cuts the circled stack out of the site plan and the flat out of the floor plan and scores every rotation by overlap. Good at the full-size images only; check by eye with `lay.py`. |
| `lay.py 01:283,301 06:125` | Lays the floor plan over its stack at the given angles (clockwise), front door as a red dot. The right angle has the outline matching and the door on the corridor. |

Environment:

- `NORTH_SET`: folder of case folders `NN_name/` with `1_site-plan.jpg`, `2_floor-plan-3room.jpg`, `answer_site-plan-stack-XXX-circled.jpg`, `case.json`. Clement's set: `hdb-test-set.zip`. It's HDB brochure material, so don't commit it.
- `NORTH_OUT`: output folder (default `north-test-out`).
- `NORTH_TOKEN_FILE`: file with the access token of an **admin** signed in on the test site. To get it, open the test site signed in, then in the console: `JSON.parse(localStorage[Object.keys(localStorage).find(k=>k.endsWith('auth-token'))]).access_token`. It lasts about 1 hour. Never commit or share it.
- `SUPABASE_PUBLISHABLE_KEY`: the test project's publishable key (same as `PUBLIC_SUPABASE_PUBLISHABLE_KEY`).
- `NORTH_FN`: function URL (defaults to the test project).

`run.py` builds each request like the app does (floor plan ≤1536 px, other photos ≤1400 px, JPEG) and sends `Blk <block> <project>` as the address and `#<unit>` as the unit number.

New cases: add an entry to `GT` in `run.py` (and `DOOR` in `lay.py` for the door dot: the plan pixel of the main door).
