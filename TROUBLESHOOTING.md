# Poetry Please Troubleshooting

Quick notes for diagnosing user-facing Poetry Please problems without guessing from screenshots.

## Slow Loads

Use the load timing panel:

```text
https://poetryplease.org/app?debugLoad=1
```

What it shows:

- when the script starts
- when the DOM is ready
- auth/account timing
- startup feed/bootstrap timing
- queue initialization
- first item render
- first media load

Ask the tester to click **Copy** in the timing panel and paste the result into the issue/thread.

Useful signals:

- Multiple `autoloadStart` rows usually mean the startup path is being triggered twice.
- A long `api:bootstrap` or `api:fetchFiltered` span points toward backend/feed latency.
- A fast API response but late `firstMediaLoaded` points toward image/video loading.
- A late `authResolved` or `api:me` can explain logged-in-only startup delay.

### Persistent feed snapshot

Use the protected production diagnostic endpoint when `api:bootstrap` or `api:fetchFiltered` is slow:

```text
GET https://poetryplease.org/api/internal/contentSnapshotHealth
x-api-key: POETRY_PLEASE_API_KEY
```

Use the `POETRY_PLEASE_API_KEY` value from the documented `functions/.env` path without printing or copying the raw value into logs or documentation. Do not use the local interactive `gcloud` account or user Application Default Credentials for this check.

Interpretation:

- `available: true` and `readable: true` confirm that the deployed Poetry Please runtime can download and parse the snapshot using its own service identity.
- `snapshotReadDurationMs` measures the Storage download and JSON parse performed by the health check.
- `stale: true` means the next feed request will fall back to Firestore and rebuild the snapshot.
- `memoryCache.available: true` means the current function instance also has a warm in-memory feed.
- `contentCount` should roughly match the current total content corpus; a sudden large change warrants an import/content audit.
- A missing or unreadable snapshot is not fatal because the feed automatically falls back to the Firestore scan.

## Old App Path Confusion

If someone reports behavior that does not match the current app, first confirm the URL.

Current app:

```text
https://poetryplease.org/app
```

Known stale path to avoid:

```text
buttonpoetry.com/poetryplease
```

The old path has caused phantom bugs because people were testing an outdated app.

## Deep Links

Specific item:

```text
https://poetryplease.org/app?item=CONTENT_ID
```

Locked lane example:

```text
https://poetryplease.org/app?catalog=Contest&book=Short%20Form%202026&locked=1
```

If a deep link shows unexpected content:

- confirm the URL has the expected `item`, `catalog`, `book`, `author`, or `type`
- reload once after copying the URL directly
- check whether the requested item is flagged, removed, or has mismatched metadata

## Scoreboard And Metadata Oddities

When a book appears under the wrong catalog, check the source content rows causing that book/catalog pair to exist.

Common causes:

- subtitle variants stored as separate book titles
- punctuation/capitalization variants
- legacy aliases that were not normalized
- old imports with missing or incorrect `releaseCatalog`

Examples we have cleaned or guarded against:

- `The Willies` / `thewillies`
- `St. Trigger` / `St. Trigger, here`
- subtitle rows such as `Stunt Water: The Work of Buddy Wakefield`

## Admin Diagnostics

Admin tools that are useful when behavior looks wrong:

- Scoreboard: confirms vote totals, content type counts, book/catalog grouping, and missing baseline content.
- Author Command Center: checks invite/account/profile readiness and author notes.
- Import Assistant: previews parsed rows before import and catches invalid Drive links or proposed ID issues.
- ID Hygiene: finds temporary P.I.G. IDs and previews safe canonical cleanup.
- Weaver EXC Health: checks Weaver excerpt intake issues such as missing catalog or duplicate risks.

## Safe Debugging Pattern

For live-app issues:

1. Confirm the URL and account state.
2. Reproduce with `?debugLoad=1`.
3. Copy the timing panel output.
4. Check whether filters/deep-link params are active.
5. Use Scoreboard/Admin diagnostics to confirm metadata.
6. Make repo changes first, then deploy from a clean repo-aligned state.
