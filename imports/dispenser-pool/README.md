# Poetry Dispenser public-domain pool

Short classic poems for the Poetry Dispenser (web toy, slips, Playdate).
Nothing here is served to Poetry Please visitors.

| File | What it is |
| --- | --- |
| `poetrydb-short-2026-11-24.json` | Raw snapshot: every PoetryDB poem of 1 to 16 lines, plus author pages (death year, notable poems). |
| `pool.json` | Built pool: cleaned text, size and mood tags, rights record, starting score. Best first. |

Rebuild with `node scripts/dispenser-pool/build-pool.js`, then
`node scripts/dispenser-pool/build-playdate.js` for the Playdate set.
`tests/dispenser-pool.test.js` fails if either output is stale.

## Rights

Every poem records `rights.status`, `rights.basis` and `rights.source`.
US public domain in 2026 covers works published before 1931. PoetryDB gives
author death years, so an author who died before 1931 passes
(`public-domain-us`). Poets whose work was largely printed after death
(Dickinson, Hopkins, Owen, Edward Thomas) are marked
`public-domain-us-check-posthumous`; their first editions are still pre-1931
but should be confirmed per poem. The Playdate set only uses
`public-domain-us`. Credit PoetryDB (CC BY 4.0) for the curation.

## Sizes

| Key | Fits |
| --- | --- |
| `slip3` | at most 3 lines, 42 columns |
| `slip5` | at most 5 lines, 42 columns |
| `playdate` | 46 columns x 11 rows (400x240 screen) |
| `phone` | 36 columns x 26 rows |

`size` is the smallest one a poem fits; `fits` lists them all.

## "Best"

There is no world ranking, so each poem starts from stand-ins and then the
machine's own reactions take over:

- starting score = 0.40 notable (on the author's notable-poems list) + 0.20
  author standing + 0.15 easy reading + 0.25 mood fit (nature, cozy and
  thoughtful up; dark down, per Sam on 25 Nov)
- reactions: moved 1, like 2/3, meh 1/3, dislike 0, blended in as if the
  starting score were 8 reactions

## To add when Project Gutenberg is back up (down for maintenance 24 Nov)

- Emily Dickinson (Poems, Series 1 to 3, 1890 to 1896); PoetryDB's
  line-count lookup missed her short poems
- Adelaide Crapsey, *Verse* (1915), cinquains for 5-line slips
- Pre-1931 haiku translations: Basil Hall Chamberlain (1902), William N.
  Porter, *A Year of Japanese Epigrams* (1911), Yone Noguchi (1920), Curtis
  Hidden Page (1923); for 3-line slips
- Stephen Crane, *The Black Riders* (1895) in full; Sara Teasdale and Carl
  Sandburg (pre-1931 books); Tagore, *Stray Birds* (1916)
- Anthology counts as a stronger "best" signal: how many of Palgrave's
  *Golden Treasury*, the *Oxford Book of English Verse* (1900) and
  Untermeyer's *Modern American Poetry* (1921) include each poem
