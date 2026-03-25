# Poetry Please Scoring Reference

## Current Vote Weights

- `like` = `+1`
- `moved me` = `+2`
- `meh` = `0`
- `dislike` = `-1`

## Current Raw Score

Raw score is:

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
- standard
- boosted every other cycle
- standard
- muted every fourth cycle

This keeps:

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
- `feedScore`
- `bucket`
- interleaving / placement reason

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
