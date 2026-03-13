# Poetry Please Link Guide

This guide explains how to build direct links into the new app at `https://poetryplease.org`.

## Base URLs

- Desktop app: `https://poetryplease.org/app`
- Auto-detect entry: `https://poetryplease.org/`

The auto-detect entry preserves link parameters, so both of these work:

- `https://poetryplease.org/app?type=EXC`
- `https://poetryplease.org/?type=EXC`

## Supported Parameters

- `item`
  Sends a user to a specific piece of content first.
- `type`
  Filters content by content type.
- `catalog`
  Filters content by release catalog.
- `author`
  Filters content by author.
- `book`
  Filters content by book.

These parameters can be combined.

## Behavior

- If `item` is provided, the app tries to show that item first.
- After loading the first item, the app keeps serving more content that matches the active filters.
- Existing in-app controls still work after landing from a link.
- The URL updates as filters change in the app.

## Important Notes

- Parameter values should be URL-encoded.
- `author` matching is exact against the stored author string.
- Some authors may appear under slightly different names in different content collections.
  Example: `Hailey Tran` and `Hailey M. Tran` currently behave like different author filters.
- If a parameter combination has no matching content, the app will show no matching items.

## Single-Parameter Examples

### Specific item

- `https://poetryplease.org/app?item=AEO-EXC-APOCRYPHA-1`
- `https://poetryplease.org/app?item=AEO%20-%20INT%20-%20hi-10.jpg`
- `https://poetryplease.org/app?item=Andrea%20Gibson%20-%20After%20the%20Breakup.mp4`

### Content type

- `https://poetryplease.org/app?type=EXC`
- `https://poetryplease.org/app?type=INT`
- `https://poetryplease.org/app?type=VV`

### Catalog

- `https://poetryplease.org/app?catalog=Fall%202025`
- `https://poetryplease.org/app?catalog=Fall%202021`
- `https://poetryplease.org/app?catalog=Write%20Bloody%20Books`

### Author

- `https://poetryplease.org/app?author=Andrea%20Gibson`
- `https://poetryplease.org/app?author=Hailey%20Tran`
- `https://poetryplease.org/app?author=Hailey%20M.%20Tran`

### Book

- `https://poetryplease.org/app?book=Apocrypha`
- `https://poetryplease.org/app?book=Cause%20of%20Death%20and%20Other%20Ordinary%20Things`

## Combined Examples

### Author + type

- `https://poetryplease.org/app?author=Andrea%20Gibson&type=VV`
- `https://poetryplease.org/app?author=Hailey%20M.%20Tran&type=EXC`

### Catalog + type

- `https://poetryplease.org/app?catalog=Fall%202025&type=INT`
- `https://poetryplease.org/app?catalog=Fall%202025&type=EXC`

### Author + catalog

- `https://poetryplease.org/app?author=Andrea%20Gibson&catalog=Fall%202021`
- `https://poetryplease.org/app?author=Hailey%20Tran&catalog=Fall%202025`

### Author + book

- `https://poetryplease.org/app?author=Hailey%20M.%20Tran&book=Apocrypha`

### Item + type

- `https://poetryplease.org/app?item=AEO-EXC-APOCRYPHA-1&type=EXC`
- `https://poetryplease.org/app?item=Andrea%20Gibson%20-%20After%20the%20Breakup.mp4&type=VV`

### Item + catalog

- `https://poetryplease.org/app?item=AEO%20-%20INT%20-%20hi-10.jpg&catalog=Fall%202025`

### Item + author

- `https://poetryplease.org/app?item=Andrea%20Gibson%20-%20After%20the%20Breakup.mp4&author=Andrea%20Gibson`

### Item + author + type

- `https://poetryplease.org/app?item=Andrea%20Gibson%20-%20After%20the%20Breakup.mp4&author=Andrea%20Gibson&type=VV`
- `https://poetryplease.org/app?item=AEO-EXC-APOCRYPHA-1&author=Hailey%20M.%20Tran&type=EXC`

### Item + catalog + type

- `https://poetryplease.org/app?item=AEO%20-%20INT%20-%20hi-10.jpg&catalog=Fall%202025&type=INT`

## How To Build Links

### Link to a specific item

Use:

`https://poetryplease.org/app?item=CONTENT_ID`

### Link to a vertical of content

Use one or more of:

- `type=...`
- `catalog=...`
- `author=...`
- `book=...`

Example:

`https://poetryplease.org/app?author=Andrea%20Gibson&type=VV`

### Link to a specific item inside a vertical

Use `item` plus any other filters:

`https://poetryplease.org/app?item=CONTENT_ID&author=...&type=...&catalog=...`

## Current Sample Content IDs

- `AEO-EXC-APOCRYPHA-1`
- `AEO-EXC-CANNIBALISM-IS-SEXY-1`
- `AEO - INT - hi-10.jpg`
- `Andrea Gibson - After the Breakup.mp4`

