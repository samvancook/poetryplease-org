# Chapbook winner review lane — 29 October 2026

## Scope

A normal team review lane, using verified book-level attributes, starts with full poems and supports existing QI/INT/EXC/FPI content. Book and contest-year filters intersect with the selected content type. Existing ranking and voted-item exclusions remain in force; no new voting model or vote migration. The contest year is distinct from the publication/release year.

Desktop: https://poetryplease.org/app?bookGroup=chapbook-winners&type=FP

Primary Swipe: https://poetryplease.org/m?bookGroup=chapbook-winners&type=FP

Team filters now show Content, Book group, Book and (for this group) Contest year. Release catalog, event, queue mode and FP length are under More filters. Copy review link excludes item IDs and invitation tokens. No reviewer assignments or emails were sent.

## Verified winners

The official shop tag includes runners-up and omits Bound, so it was not treated as a winner list by itself. The 2016 announcement explicitly confirms both Bound and Sadness Workshop.

| Contest year | Book | Author | Official source |
| --- | --- | --- | --- |
| 2025 | BLACK BOX FLIGHT RECORDER | Aishatu Ado | [Button Poetry](https://buttonpoetry.com/product/black-box-flight-recorder/) |
| 2024 | Glandscapes | Mickie Kennedy | [Button Poetry](https://buttonpoetry.com/product/glandscapes/) |
| 2023 | Smut Psalm | Josh Tvrdy | [Button Poetry](https://buttonpoetry.com/product/smut-psalm/) |
| 2022 | We, The Spirits | Edythe Rodriguez | [Button Poetry](https://buttonpoetry.com/product/we-the-spirits/) |
| 2021 | I'd Rather Be Destroyed | Zach Goldberg | [Button Poetry](https://buttonpoetry.com/product/id-rather-be-destroyed/) |
| 2020 | Hated for the Gods | Sean Patrick Mulroy | [Button Poetry](https://buttonpoetry.com/product/hated-for-the-gods/) |
| 2019 | Born in a Second Language | Akosua Zimba Afiriyie-Hwedie | [Button Poetry](https://buttonpoetry.com/product/born-in-a-second-language/) |
| 2018 | Keep This To Yourself | Kerrin McCadden | [Button Poetry](https://buttonpoetry.com/product/keep-this-to-yourself/) |
| 2017 | Fortunately | Nava EtShalom | [Button Poetry](https://buttonpoetry.com/product/fortunately/) |
| 2016 | Bound | Claire Schwartz | [Button Poetry](https://buttonpoetry.com/tag/chapbook-contest/) |
| 2016 | Sadness Workshop | Stevie Edwards | [Button Poetry](https://buttonpoetry.com/tag/chapbook-contest/) |
| 2015 | St. Trigger | Aaron Coleman | [Button Poetry](https://buttonpoetry.com/product/st-trigger/) |
| 2014 | Black Movie | Danez Smith | [Button Poetry](https://buttonpoetry.com/product/black-movie/) |
| 2013 | Highway or Belief | J. Scott Brownlee | [Button Poetry](https://buttonpoetry.com/product/highway-or-belief/) |
| 2012 | Me, Aunt Jemima and the nailgun | Aziza Barnes | [Button Poetry](https://buttonpoetry.com/product/me-aunt-jemima-and-the-nailgun/) |

15 winning books, with FP content present in the pre-release live inventory. Raw inventory counts are not eligible-review counts because flags, hidden/retired items and each account’s votes also affect the queue. Both True, Coin Laundry at Midnight and good luck in the real world are recorded as 2024 runners-up and excluded.

## Integrity and follow-up

Book attributes are resolved against normalized canonical author + book, not title alone. Legacy assets labelled Hated for the Gods, Sadness Workshop and Me, Aunt Jemima and the nailgun include other authors; these do not enter the group. Poetry Please owns a separate source-verified metadata audit. No content, permanent keys, canonical IDs or votes are changed by this feature.

The metadata registry and existing feed endpoints are reused. No new deployment workflow, auth scopes or startup logic. Approved release remains existing .github/workflows/firebase.yml after a passing PR merges to main.

## Validation

- 32 focused book-group/feed/Swipe/routing tests pass, including vote exclusions, year/book/type intersections, wrong-author and runner-up exclusion, counters and nonstaff FP restrictions.
- Existing workflow local test commands: 126 tests pass, including multi-card payload preservation and Explorer.
- JavaScript syntax and git diff whitespace checks pass.
- Production release and live verification receipt will be added after deployment.
