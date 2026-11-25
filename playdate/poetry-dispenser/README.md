# Poetry Dispenser (Playdate demo)

Turn the crank one full turn and the machine drops a capsule with a short
public-domain poem in it. React and it learns what to hand out next.

| Input | Reaction |
| --- | --- |
| Up | moved |
| A | like |
| B | meh |
| Down | dislike |
| Crank (or hold Left/Right in the Simulator) | turn the handle; scrolls a long poem |

Reactions are saved on the device (`playdate.datastore`, file `reactions`) and
use the same scoring as the web pool (`scripts/dispenser-pool/pool-lib.js`):
a poem's starting score is blended with its reactions as if the starting
score were 8 reactions.

## Poems

`source/poems.json` is generated. Don't edit it by hand:

```
node scripts/dispenser-pool/build-pool.js      # imports/dispenser-pool/pool.json
node scripts/dispenser-pool/build-playdate.js  # playdate/poetry-dispenser/source/poems.json
```

The export keeps poems that are cleared as US public domain, fit one
Playdate screen (46 columns x 11 rows), aren't tagged dark, and read easily,
best first, up to 150.

## Build

Needs the Playdate SDK (https://play.date/dev/). From this folder:

```
pdc source PoetryDispenser.pdx
open PoetryDispenser.pdx   # runs in the Playdate Simulator
```

Sideload the `.pdx` to a device from https://play.date/account/sideload/.
