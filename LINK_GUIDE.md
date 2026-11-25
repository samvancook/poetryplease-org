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

## Where Each Link Opens (by device)

The Drive copy of this guide is "Creating deep links for poetry please // Link Guide":
https://docs.google.com/document/d/1hiY1oB500Ly8FW9RY-m5GF_LVXcEfz0VOPGrMdXyE1I/edit

Routing below was read in code (`public/detect.html`, the mobile guard near the top of `public/app.js`, `classicMobileTarget` in `public/mobile-entry.js`) opened live on 24 November 2026 in a staff browser session, and rechecked the same day as a new signed-out visitor on a phone and on desktop (see **Checking links before a change** below).

- `/` sends phones to `/m` and desktops to `/app`, keeping the query.
- `/app` on a phone moves to `/m?…&view=mobile`.
- `/m` is primary Swipe. Only these links stay in Swipe: `item` on its own; the chapbook-winners group (`bookGroup=chapbook-winners`, optional `contestYear`, `book`, `type`); contest winner reading (`catalog=Contest&event=…&type=QI&locked=1&reading=1`); staff author preview (`author=…&authorPreview=1`). UTM and ad-click tags don't affect this.
- Any other lane parameter on `/m` (`book`, `author`, `type`, `catalog`, or `item` combined with one of them) sends the phone to classic mobile, `/m-classic`, which applies the lane as described above.

| Link | Phone | Desktop |
| --- | --- | --- |
| `/?item=ID`, or the Share link `/app?item=ID` | Swipe: the item, then the normal Swipe feed (PR #479; before it, Swipe stopped after the item) | `/app`: the item, then the normal feed |
| `/?item=ID&book=BOOK&locked=1` | Classic mobile: the item, then that book | `/app`: the item, then that book |
| `/app?book=BOOK` | Classic mobile, book lane | `/app`, book lane |
| `/app?author=NAME&locked=1` | Classic mobile, author lane | `/app`, author lane |
| `/?type=EXC` | Classic mobile, type lane | `/app`, type lane |
| `/app?catalog=Contest&book=Short%20Form%202026&locked=1` | Classic mobile, locked contest lane | `/app`, locked contest lane |
| `/?bookGroup=chapbook-winners&type=QI` | Swipe, chapbook-winners lane | `/app`, chapbook-winners lane |
| `/m?catalog=Contest&event=…&type=QI&locked=1&reading=1` | Swipe, contest winners reading | not rechecked |

With `locked=1` the reader stays in the lane until it runs out. The app then offers **Show me more poems!** and returns them to the normal feed.

Book embeds (`/embed?book=BOOK`): tapping a piece opens `/app?item=ID&book=BOOK&catalog=CATALOG&locked=1`, and **Explore collection** opens `/app?book=BOOK&catalog=CATALOG&locked=1` (both read in `public/embed.html`). On a phone both land in classic mobile. Checked live on 24 November 2026: `?item=EMAI-FP-NOW-I-ONLY&book=Excuse Me As I Kiss The Sky&locked=1` on a phone showed the poem first, then 270 cards all from that book (staff skips, which record no votes); the end screen reads "You've reached the end of this book-only set" with **Show me more poems!**, which opened the normal feed. Any change to phone routing for `book`/`locked` links changes where every embed tap lands, so recheck each row of the table above before shipping one.

## Checking links before a change

Run this before shipping anything that touches entry routing (`detect.html`, `mobile-entry.js`, the mobile guard in `app.js`), the Swipe or classic feeds, lanes, `locked`, or the embeds.

1. In GitHub, open Actions, then **Startup probe**, then **Run workflow**, and pick the branch with the change. The **Anonymous deep-link checks** step runs `scripts/link-probe.mjs` against the live site. It opens each link below as a new signed-out visitor on an iPhone 13 profile and on a 1280px desktop window. It never votes or skips.
2. For each link it prints where the link landed, the first card, whether a login screen or welcome prompt showed, the buy-the-book link, and what the lane serves next. It ends with `No problems found.` or a count of problems, and the step fails when there are any.
3. Compare the output with the table here. A row that lands somewhere new is a change to every place that uses that link, including the book embeds on buttonpoetry.com. Get Sam's OK for it by name before merging.
4. Check by hand whatever the probe can't do: a real phone, and reading a locked lane through to its natural end.

What the probe counts as a problem: the linked item isn't the first card; a login screen shows; a link with UTM tags loses them on the buy-the-book link; a book or author lane serves cards from outside the lane; a locked lane's **Show me more poems!** doesn't open the normal feed; a Swipe link to a single item stops after that item.

Baseline, signed-out, 24 November 2026 (Startup probe run 45441534580), same on phone and desktop unless noted:

| Link | Phone lands on | Desktop lands on | Result |
| --- | --- | --- | --- |
| `/?item=EMAI-FP-NOW-I-ONLY&book=Excuse Me As I Kiss The Sky&locked=1&utm_…` (Rudy SMS) | Classic mobile | `/app` | Poem first, next 120 cards all from the book, buy link keeps the UTM tags, end screen and **Show me more poems!** open the normal feed |
| `/m?item=EMAI-FP-NOW-I-ONLY` | Swipe | Swipe | Poem, then stops: "You're viewing a linked item." PR #479 changes this |
| `/app?item=EMAI-FP-NOW-I-ONLY` (Share) | Swipe | `/app` | Phone: same stop as the row above. Desktop: poem, then the normal feed |
| `/app?book=Excuse Me As I Kiss The Sky` | Classic mobile | `/app` | Book lane, 120 cards from the book |
| `/app?item=…&book=…&catalog=Fall 2023&locked=1` (embed tap) | Classic mobile | `/app` | Poem first, then the book |
| `/app?author=Rudy Francisco&locked=1` | Classic mobile | `/app` | Rudy across his three books |
| `/app?catalog=Contest&book=Short Form 2026&locked=1` | Classic mobile | `/app` | Short Form 2026 entries only |
| `/?bookGroup=chapbook-winners&type=QI` | Swipe | `/app` | Winners lane, more cards load on scroll |
| `/posts-swipe?catalog=Contest&event=…&type=QI&locked=1&reading=1` | Swipe | Swipe | Nine winners, then "You've reached the end of the winners collection." |

No login screen or welcome prompt showed on any of them.

Links the app makes itself: Share on a post card copies `https://poetryplease.org/app?item=ID`. Explorer, Scoreboard, admin pages and author repair emails link `/app?item=ID`. Author pages and admin flag lists link `/?item=ID`. Swipe's "Open in single-item view" links `/m-classic?item=ID` plus the active lane.

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


## Campaign Tracking (UTM)

Add UTM parameters to every link you post or email so Google Analytics can tell which post, email, or campaign sent the traffic. Without them, spikes from a social post or newsletter show up as Direct or Unassigned.

This follows Button Poetry's link tagging convention, approved 2026-10-29 and shared by buttonpoetry.com and the Social Warehouse:
https://docs.google.com/document/d/1OUgIw8kLc6hGA7zGJZ69AVZM7ORHblglIT5deJCZYeg/edit

All values are lowercase, with words joined by hyphens and no spaces. GA treats `Facebook` and `facebook` as different sources.

- `utm_source`: where the click happened. One of `facebook`, `instagram`, `tiktok`, `youtube`, `tumblr`, `threads`, `x`, `mailchimp`, `linkinbio`, or a partner name (for example `ibpa`).
- `utm_medium`: the kind of placement. `social` (organic posts and bios), `paid_social` (paid ads), `email` (newsletters and e-blasts), or `referral` (partner and author sites).
- `utm_campaign`: why the link exists, as `yyyy-mm_slug`, for example `2026-11_pages-launch`. Newsletter sends use the send date: `2026-10-19_great-poems-33`.
- `utm_content`: which post, ad, or email block.
  - Organic social and Tumblr: the calendar's link ID for that post, for example `ccc-7f3a9c21`.
  - Paid Meta ads: `{{ad.id}}` in the ad's URL parameters field.
  - Email: the block name, for example `hero`, `poem-1`, `shop-button`.
  - Bio links: `bio`.

Google Ads links don't need UTMs; auto-tagging handles them.

Examples:

- Newsletter: `https://poetryplease.org/app?item=AEO-EXC-APOCRYPHA-1&utm_source=mailchimp&utm_medium=email&utm_campaign=2026-10-19_great-poems-33&utm_content=poem-1`
- Facebook post: `https://poetryplease.org/?type=EXC&utm_source=facebook&utm_medium=social&utm_campaign=2026-11_pages-launch&utm_content=ccc-7f3a9c21`
- Instagram bio: `https://poetryplease.org/?utm_source=instagram&utm_medium=social&utm_campaign=2026-11_pages-launch&utm_content=bio`

The auto-detect entry keeps these parameters when it redirects to `/app` or `/m`. Links with `utm_medium=email` (or Mailchimp's `mc_cid`) skip the login prompt for email visitors.

## Chapbook contest winners — deep links and public embed

- Staff FP review: `https://poetryplease.org/app?bookGroup=chapbook-winners&type=FP`
- Staff FP review in Swipe: `https://poetryplease.org/m?bookGroup=chapbook-winners&type=FP`
- Public QI reading: `https://poetryplease.org/?bookGroup=chapbook-winners&type=QI`
- Public embed: `https://poetryplease.org/embed?bookGroup=chapbook-winners&type=QI`
- Optional `contestYear=2024` or `book=Glandscapes` narrows either link.

The public embed ranks eligible content from confirmed winners only and rotates its pool. It excludes author-excluded, flagged/broken, review-only and FP records; it is not a staff voting queue. Click-through keeps the group/year/book selection and selected item in the normal desktop or primary mobile viewer. Author-only accounts retain their own review scope.

```html
<iframe src="https://poetryplease.org/embed?bookGroup=chapbook-winners&amp;type=QI"
  title="Button Poetry chapbook contest winners" width="100%" height="700"
  style="display:block;border:0;max-width:640px;margin:0 auto;"
  loading="lazy" allow="fullscreen" allowfullscreen></iframe>
```

700px is an adjustable starting height, not automatic parent-page sizing. Existing individual-book and short-form contest embeds remain available.
