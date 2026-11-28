# North test set 2 — HDB brochures (internal testing only)

Six 3-room stacks from HDB sales brochures (assets.hdb.gov.sg), none in set 1.
`expected_cw` in each case.json = compass direction the floor plan's top points to.
Keyed by matching the brochure's "Layout ideas" plan to the stack on the block plan,
then measuring the block's tilt on the site plan at 300 dpi (unit-colour mask + edge histogram).

| Case | Project | Stack | Layout vs block plan | Block tilt | Expected |
|---|---|---|---|---|---|
| 20 | Teban Heights | 425A #706 | 180° | +12.6° | 193 |
| 21 | Sembawang Brook | 437A #116 | 180° | −25.6° | 154 |
| 22 | Teban Breeze | 417B #921 | 180° | +13.9° | 194 |
| 23 | Tanglin Halt Cascadia | 75A #547 | same | −27.3° | 333 |
| 24 | Berlayar Residences | 208A #246 | 180° | +4.7° | 185 |
| 25 | Tenteram Vantage | 132B #667 (diagonal) | window side | — | 192 (±2) |
