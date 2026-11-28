# Poetry Dispenser public-domain pool

Short classic poems for the Poetry Dispenser (web toy, slips, Playdate).
Nothing here is served to Poetry Please visitors.

| File | What it is |
| --- | --- |
| `poetrydb-short-2026-11-24.json` | Raw snapshot: every PoetryDB poem of 1 to 16 lines, plus author pages (death year, notable poems). |
| `gutenberg-short.json` | Short poems pulled from 26 Project Gutenberg books (list and reasons in `scripts/dispenser-pool/fetch-gutenberg.js`). Refetch with `node scripts/dispenser-pool/fetch-gutenberg.js`. |
| `pdp-short.json` | Short poems by cleared poets from the public-domain-poetry.com collection (33,700 poems; GitHub copy `facjure/public-domain-poetry`, same site the Hugging Face "public-domain-poetry" set came from). Rebuild with `scripts/dispenser-pool/import-pdp.js`; who is cleared is in `scripts/dispenser-pool/pdp-authors.js`. |
| `pool.json` | Built pool: cleaned text, size and mood tags, rights record, starting score. Best first. |

Rebuild with `node scripts/dispenser-pool/build-pool.js`, then
`node scripts/dispenser-pool/build-playdate.js` for the Playdate set.
`tests/dispenser-pool.test.js` fails if either output is stale.

## Rights

Every poem records `rights.status`, `rights.basis` and `rights.source`.
Gutenberg poems are cleared by the book's publication year (all 1930 or
earlier; `published` and `collection` on each poem). Translations count only
when the translation itself is that old: Rumi (Nicholson, Whinfield and
others, 1907 selection), Hafez (Gertrude Bell, 1897), Japanese poems (1900
Colonial Press edition) and Tagore's own 1916 English.
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

## Sources added 28 Nov 2026

- Dickinson (1890 to 1896 series), Crapsey's cinquains (1915), Crane's
  *Black Riders* (1895), Tagore's *Stray Birds* (1916), Japanese poems (1900)
- Poets Sam asked about: Phillis Wheatley, Frances E. W. Harper, Alice
  Dunbar-Nelson, E. Pauline Johnson, Sarojini Naidu, and *The Book of
  American Negro Poetry* (1922: Georgia Douglas Johnson, Jessie Fauset,
  Anne Spencer, Dunbar-Nelson and others)
- Mary Oliver's line: per Wikipedia she named Whitman, Emerson, Shelley, Keats, Rumi and
  Hafez as favourites, and Millay was her early model. Millay (1917 to 1923
  books), Emerson, Rumi and Hafez are added; Whitman, Shelley and Keats were
  already in. Their own influences (Wordsworth, Shakespeare, Spenser,
  Milton, Burns, Coleridge, Herbert) are mostly already in from PoetryDB;
  *Lyrical Ballads* (1798) adds no short poems. Sara Teasdale and the
  Imagist anthologies (1915, 1916) fill out the short nature lyric.

## The full public-domain-poetry.com collection (28 Nov 2026)

The whole collection (33,743 poems, 557 poets) is kept outside the repo
because of its size, in the project files folder:
`poem-collections/public-domain-poetry-full-2026-11-28.jsonl.gz` (one poem
per line, each with `rights.status`) and
`poem-collections/public-domain-poetry-poets-2026-11-28.csv` (poet, poem
count, status).

It is not all public domain. It also holds living and recent poets (for
example Yehuda Amichai, Nizar Qabbani, A. R. Ammons) and translations with
no translator or date. The files have no dates, so a poet is `public-domain-us`
only if they wrote in English and died before 1931; everyone else is
`not-cleared`. 135 poets and 19,547 poems are cleared. Dickinson, Clare and
Owen are held back because some of their poems were first printed after 1930.

## Not added

- Mary Oliver, Sylvia Plath, Gwendolyn Brooks: still under copyright.
- E. E. Cummings (*Tulips and Chimneys*, 1923, and other pre-1931 books):
  public domain, but not on the Gutenberg mirror this uses. Next time.
- Angelina Weld Grimké, Gwendolyn Bennett, Helene Johnson: their pre-1931
  poems were in magazines and anthologies not on the mirror.
- Hafez (Bell) and Wordsworth: their poems here are all longer than 16
  lines.
- A stronger "best" signal from anthology counts (Golden Treasury, Oxford
  Book of English Verse 1900, Untermeyer 1921) is still to do.
