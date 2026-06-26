# Poetry Please Scoring Reference

## Current Vote Weights

- `like` = `+1`
- `moved me` = `+2`
- `meh` = `0`
- `dislike` = `-1`

## Current Raw Score

Raw score is:

`score = likes + (movedMe * 2) - dislikes`

For `FP` full-poem records, Poetry Please also adds one derivative-content point for each matching derivative content item tied to the same author, book, and poem title:

- `EXC` excerpt
- `QI` quote image
- `INT` interior/photo item
- `VV` uploaded/native video
- `YT` YouTube video

So for full poems:

`score = likes + (movedMe * 2) - dislikes + fpDerivativePoints`

For all other content types, raw score remains:

`score = likes + (movedMe * 2) - dislikes`

This is useful for measuring total accumulated positive response, but it has an important weakness:

- `meh` adds no score
- so a piece with many `meh` votes can tie a piece with fewer, stronger positive votes

Example:

- Piece A: `3 likes` -> `score = 3`, `totalVotes = 3`
- Piece B: `3 likes + 10 meh` -> `score = 3`, `totalVotes = 13`

These tie on raw score, even though audience response quality is very different.

## Recommended Export Metrics

For exports, keep the current raw score and add quality metrics beside it.

### 1. Raw Score

`rawScore = likes + (movedMe * 2) - dislikes`

For `FP`, raw score includes `fpDerivativePoints`, one point per matching derivative content item.

Use for:

- total enthusiasm
- cumulative response

### 2. Score Per Vote

`scorePerVote = rawScore / totalVotes`

Use for:

- average response quality
- comparing pieces with different vote totals

This is the most important missing metric.

### 3. Moved Me Rate

`movedMeRate = movedMe / totalVotes`

Use for:

- emotional intensity
- identifying work that deeply resonates, not just mildly pleases

### 4. Like Rate

`likeRate = likes / totalVotes`

Use for:

- broad positive appeal

### 5. Meh Rate

`mehRate = meh / totalVotes`

Use for:

- identifying pieces that feel neutral, flat, or less urgent

### 6. Dislike Rate

`dislikeRate = dislikes / totalVotes`

Use for:

- identifying friction or rejection

## Recommended Ranking Philosophy

Do not rely on only one metric.

### Raw Score Alone

Good for:

- total popularity

Weakness:

- favors exposure and total volume
- does not distinguish neutral engagement from strong enthusiasm

### Score Per Vote Alone

Good for:

- measuring average audience response

Weakness:

- overvalues tiny sample sizes

Example:

- a piece with `1 moved me` and no other votes looks incredible on ratio
- but that is not enough data to trust

## Recommended Feed Logic

For feed guidance, use a blended signal:

### Quality

Driven by:

- `scorePerVote`
- `movedMeRate`

### Confidence

Driven by:

- `totalVotes`

This should prevent tiny-sample items from dominating.

### Soft Suppression

Driven by:

- high `mehRate`
- high `dislikeRate`

This should push weaker items back without removing them entirely.

## Recommended Practical Rule

For the live feed:

- foreground items with strong `scorePerVote`
- give extra lift to high `movedMeRate`
- reduce visibility for high `mehRate`
- keep occasional exploration slots so muted items still appear sometimes

## Adopted Feed Formula

We are starting with this concrete formula:

- `confidence = min(1, totalVotes / 10)`
- `feedScore = (scorePerVote * 0.9 + movedMeRate * 1.2 - mehRate * 0.3 - dislikeRate * 0.85) * (0.35 + 0.65 * confidence)`

Where:

- `scorePerVote = rawScore / totalVotes`
- `movedMeRate = movedMe / totalVotes`
- `mehRate = meh / totalVotes`
- `dislikeRate = dislikes / totalVotes`

Interpretation:

- `scorePerVote` measures average response quality
- `movedMeRate` adds extra lift for strong resonance
- `mehRate` softens rank for flat/neutral response
- `dislikeRate` penalizes stronger rejection
- `confidence` prevents tiny-sample items from dominating

## Feed Buckets

The feed should not be one flat sorted list. It should group items into buckets and then interleave them.

### Confirmation

Use when:

- `totalVotes === 1`
- `movedMe === 1`

Meaning:

- a promising item with a strong early signal
- not yet proven enough to treat like a normal boosted item
- should be shown again soon to gather confirming votes

This is a review-priority bucket, not a permanent score boost.

### Boosted

Use when:

- `feedScore >= 0.55`

Meaning:

- clearly strong average response
- especially resonant or consistently positive work

### Standard

Use when:

- `feedScore` is between boosted and muted thresholds

Meaning:

- normal eligible content
- still visible and important in the mix

### Muted

Use when:

- `feedScore <= 0.05`

Meaning:

- meh-heavy, weakly received, or mixed-response work
- still included occasionally for exploration

## Interleaving Pattern

The queue should interleave buckets instead of just sorting everything by feed score.

Recommended starting pattern:

- boosted
- confirmation
- standard
- boosted every other cycle
- standard
- muted every fourth cycle

This keeps:

- single-`moved me` items from getting stranded at one vote
- strong work visible
- normal work present
- muted work accessible but less dominant

## Admin Debug Signals

For admins, the tool should expose the following per-item signals:

- `rawScore`
- `scorePerVote`
- `movedMeRate`
- `mehRate`
- `dislikeRate`
- `confidence`
- `needsConfirmation`
- `feedScore`
- `bucket`
- interleaving / placement reason

## YouTube External Signals

YouTube performance should stay separate from internal Poetry Please voting.

Internal votes remain the primary editorial signal.

YouTube metrics are a secondary audience signal for `YT` items only.

Store:

- `youtubeId`
- `uploadTime`
- `socialViews`
- `socialLikes`
- `socialComments`
- `socialDislikes`
- `socialSyncSource`
- `socialLastSyncedAt`

### External Signal Formula

For `YT` items, derive:

- `engagementRate = (socialLikes + socialComments * 2) / max(socialViews, 1)`
- `reachScore = log10(max(socialViews, 1))`
- `externalSignalScore = engagementRate * 1000 + reachScore`

Interpretation:

- `engagementRate` measures response quality, not just reach
- comments count more heavily than likes
- `reachScore` gives modest credit for proven audience size
- `externalSignalScore` is not a replacement for internal scoring

### Weighting Rule

Use `externalSignalScore` only as a secondary factor:

- internal `feedScore` stays primary
- `externalSignalScore` acts as a tie-breaker
- `externalSignalScore` can lightly boost low-vote `YT` items
- `externalSignalScore` should not override clearly weak internal performance

Recommended first-pass use:

- if `totalVotes >= 3`, sort `YT` by internal `feedScore` first
- if `totalVotes < 3`, allow `externalSignalScore` to influence placement inside the current bucket
- never blend external metrics into non-`YT` content

This keeps the system compatible with the current model:

- internal votes = editorial quality signal
- YouTube metrics = external audience signal
- serving can still improve for public users and team review without flattening the two together

## Recommended Export Columns

Keep:

- `score`
- `totalVotes`

Add:

- `scorePerVote`
- `movedMeRate`
- `likeRate`
- `mehRate`
- `dislikeRate`
- `externalSignalScore` for `YT` only
- `socialViews`
- `socialLikes`
- `socialComments`
- `socialDislikes`

## Suggested Direction

### Export

Use both:

- raw score
- ratio-based metrics

### Feed

Use a blended ranking signal, not raw score alone.

That gives Poetry Please a ranking model that values:

- strong positive response
- emotional resonance
- confidence from enough votes

without making high-volume or low-sample items dominate unfairly.
