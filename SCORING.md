# Poetry Please Scoring

## Direct content votes

Standard content and full poems use the direct vote score:

- Like: +1
- Moved Me: +2
- Dislike: -1
- Meh: 0

Author-account adjustments remain part of the direct score where applicable. An author's dislike excludes the item through the existing author-review rules.

## Full-poem score

The poem-centered Scoreboard calculates:

```text
FP total = direct FP score
         + connected-content asset bonus
         + derivative vote bonus
```

### Connected-content asset bonus

Each active or canonically renamed EXC, QI, INT, VV, or YT item matched to the poem adds one point.

- Maximum: 10 points
- Flagged, quarantined, missing, or deleted items do not contribute.

### Derivative vote bonus

Derivative votes contribute through a deliberately limited confidence rule:

1. Keep active or canonically renamed connected items.
2. Require at least two votes on an item.
3. Treat negative connected scores as zero for this upranking bonus.
4. Take the three highest eligible connected scores.
5. Add 25% of their combined score, rounded to the nearest whole point.
6. Cap the result at 6 points.

Example:

```text
Direct FP score: 12
Connected-content asset bonus: 3
Top eligible connected scores: 8 + 5 + 3 = 16
Derivative vote bonus: round(16 x 0.25) = 4
FP total: 19
```

The full connected-content score remains visible as diagnostic information under **How scored**.

## Ranking effects

- Poems rank by FP total after flagged and quarantined poems are excluded.
- A poem needs at least three direct FP votes to qualify for book scoring.
- Books rank by the sum of their top ten qualifying poem totals.
- Ties break by the direct FP average of those same poems, then qualifying-poem count, then title.
- Books with fewer than five qualifying poems are labeled **Provisional**.
- The Books view shows the top-ten direct score, asset bonus, and derivative-vote bonus separately.
- Ranked FP exports and downstream consumers of the poem-score endpoint receive the updated totals.
- The normal Poetry Please feed does not currently use poem-level totals to decide serving order.
- Explicit filter lanes continue to preserve their server-provided order.

Connecting poem-level totals to the main serving algorithm requires a separate rollout and validation step.
