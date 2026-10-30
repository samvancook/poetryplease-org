# Explorer product-link audit and replacement roadmap

Audit date: 2026-10-30 (America/Chicago).

## Results

All 82 existing Bit.ly links were opened in Chrome. Ten reached their product page directly; 72 displayed a Bit.ly preview, whose exposed destination was then opened separately. All 82 landed on the expected product path. No dead or wrong-product links were found. This checks routing and visible product identity, not checkout or stock availability.

Eleven previews retain HTTP destinations; the product site upgrades those to HTTPS. The Rock Stars preview omits a trailing slash. The BEFORE & AFTER OUR BODIES short link uses an old product slug, which correctly redirects to the current product page. These existing links were preserved.

Seven pages are marked out of print or digital-only: me Aunt Jemima and the nailgun.; When the Ghosts Come Ashore; Transit; Highway or Belief; St. Trigger; A Guide to Undressing Your Monsters; Keep This To Yourself. These are working links; availability must be checked before promotion.

The legacy inventory has 107 products, 82 short links, and 25 products without short links. No new short links were created.

## Confirmed author metadata

- Today Means Amen: Sierra DeMulder. Source: https://buttonpoetry.com/product/today-means-amen/
- Guante Zine Bundle: Kyle Tran Myhre (Guante). Source: https://buttonpoetry.com/product/guante-zine-bundle/

## Deferred roadmap

- [ ] Assign the staff catalog for Today Means Amen.
- [ ] Assign the staff catalog for Guante Zine Bundle.

The user explicitly deferred both catalog assignments on 2026-10-30. Publication year is not being substituted for the operational catalog.

- [ ] Collect staff feedback using the checklist below.
- [ ] After staff acceptance, replace the old binder lookup with a link to Explorer.
- [ ] Consider showing product availability separately from link coverage.

## Five-minute staff acceptance checklist

Open https://poetryplease.org/explorer/?view=products

1. Find a familiar book by title and author; repeat using your assigned catalog.
2. Copy a short link and full shop link, paste each into the address bar, and confirm the correct product.
3. Search The Future and Helium; confirm the editions have separate products and links.
4. Find Today Means Amen or Guante Zine Bundle. Confirm it appears even without connected poems; its catalog is intentionally unassigned.
5. Switch to Content explorer and back. Check whether the filters and product links are understandable.
6. Send back the book title, filters or shared Explorer URL, expected result, and what happened for any problem.

Acceptance: staff can find and copy the right product link without the old tool, editions are distinguishable, and no blocking lookup gaps remain. The binder lookup stays available until this is confirmed.

## Per-link evidence

“Preview + landing” means the Bit.ly preview destination and the resulting shop page were both checked. Every row's final product path matched the full shop URL in public/explorer/product-links.json, after normal redirects.

| Product | Short link | Bit.ly destination observed | Method | Result |
| --- | --- | --- | --- | --- |
| peluda | http://bit.ly/melissapeluda | https://buttonpoetry.com/product/peluda/ | Direct landing | Pass |
| me Aunt Jemima and the nailgun. | http://bit.ly/azizabarnesbook | http://buttonpoetry.com/product/me-aunt-jemima-and-the-nailgun/ | Preview + landing | Pass |
| i shimmer sometimes, too | http://bit.ly/porshashimmer | https://buttonpoetry.com/product/i-shimmer-sometimes-too/ | Preview + landing | Pass |
| ex traction | https://bit.ly/coley-ex-traction | https://buttonpoetry.com/product/ex-traction/ | Preview + landing | Pass |
| black movie | http://bit.ly/blackmoviebook | http://buttonpoetry.com/product/black-movie/ | Preview + landing | Pass |
| before & after our bodies | https://bit.ly/self-portrait-book | https://buttonpoetry.com/product/self-portrait-before-and-after-my-body/ | Preview + landing | Pass |
| You Better Be Lightning | http://bit.ly/andreagibsonybbl | https://buttonpoetry.com/product/you-better-be-lightning/ | Preview + landing | Pass |
| Where I Dry the Flowers | https://bit.ly/whereidrytheflowers | https://buttonpoetry.com/product/where-i-dry-the-flowers/ | Preview + landing | Pass |
| When the Ghosts Come Ashore | http://bit.ly/jacquighosts | http://buttonpoetry.com/product/when-the-ghosts-come-ashore/ | Preview + landing | Pass |
| What I Learned From the Trees | http://bit.ly/lebowmantrees | https://buttonpoetry.com/product/what-i-learned-from-the-trees/ | Preview + landing | Pass |
| We, The Spirits | https://bit.ly/rodriguez-spirits | https://buttonpoetry.com/product/we-the-spirits/ | Preview + landing | Pass |
| We Were All Someone Else Yesterday | http://bit.ly/omaryesterday | https://buttonpoetry.com/product/we-were-all-someone-else-yesterday/ | Preview + landing | Pass |
| We Slept Here | http://bit.ly/weslepthere | http://buttonpoetry.com/product/we-slept-here/ | Preview + landing | Pass |
| Urbanshee | https://bit.ly/urbanshee | https://buttonpoetry.com/product/urbanshee/ | Direct landing | Pass |
| Transit | http://bit.ly/transitpoems | http://buttonpoetry.com/product/transit/ | Preview + landing | Pass |
| Toy Gun | https://bit.ly/coonantoygun | https://buttonpoetry.com/product/toy-gun/ | Preview + landing | Pass |
| Today Means Amen | http://bit.ly/todaymeansamenbook | https://buttonpoetry.com/product/today-means-amen/ | Direct landing | Pass |
| The Willies | http://bit.ly/thewillies | https://buttonpoetry.com/product/the-willies/ | Direct landing | Pass |
| The Rent EATS First | https://bit.ly/TheRentEATSFirst | https://buttonpoetry.com/product/the-rent-eats-first/ | Preview + landing | Pass |
| The Only Worlds We Know | http://bit.ly/michaelleeworlds | https://buttonpoetry.com/product/the-only-worlds-we-know/ | Preview + landing | Pass |
| The Future Limited Edition | https://bit.ly/thefuturelimitededition | https://buttonpoetry.com/product/the-future-limited-edition/ | Preview + landing | Pass |
| The Future | http://bit.ly/neilfuture | https://buttonpoetry.com/product/thefuture/ | Preview + landing | Pass |
| The Crown Ain't Worth Much | http://bit.ly/hanifcrown | http://buttonpoetry.com/product/the-crown-aint-worth-much/ | Preview + landing | Pass |
| If My Flowers Bloom | https://bit.ly/if-my-flowers-bloom | https://buttonpoetry.com/product/if-my-flowers-bloom/ | Preview + landing | Pass |
| If My Body Could Speak | http://bit.ly/blythespeak | https://buttonpoetry.com/product/if-my-body-could-speak/ | Preview + landing | Pass |
| I'll Fly Away | https://bit.ly/rudyflyaway | https://buttonpoetry.com/product/ill-fly-away/ | Preview + landing | Pass |
| I'd Rather Be Destroyed | https://bit.ly/IdRatherBeDestroyed | https://buttonpoetry.com/product/id-rather-be-destroyed/ | Preview + landing | Pass |
| How to Maintain Eye Contact | https://bit.ly/howtomaintaineyecontact | https://buttonpoetry.com/product/how-to-maintain-eye-contact/ | Preview + landing | Pass |
| Home.Girl.Hood. | https://bit.ly/HomeGirlHood | https://buttonpoetry.com/product/home-girl-hood/ | Preview + landing | Pass |
| Highway or Belief | http://bit.ly/highwayorbelief | http://buttonpoetry.com/product/highway-or-belief/ | Preview + landing | Pass |
| Helium (Alt Cover) | http://bit.ly/rudyheliumltd | https://buttonpoetry.com/product/helium-limited-edition/ | Direct landing | Pass |
| Helium | http://bit.ly/rudyfhelium | https://buttonpoetry.com/product/helium/ | Preview + landing | Pass |
| Hated for the Gods | https://bit.ly/hatedforthegods | https://buttonpoetry.com/product/hated-for-the-gods/ | Preview + landing | Pass |
| Guante Zine Bundle | https://bit.ly/guante-zine-bundle | https://buttonpoetry.com/product/guante-zine-bundle/ | Preview + landing | Pass |
| Fortunately | https://bit.ly/navafortunately | https://buttonpoetry.com/product/fortunately/ | Preview + landing | Pass |
| Forgive Yourself These Tiny Acts of Self-Destruction | http://bit.ly/jaredforgive | https://buttonpoetry.com/product/forgive-yourself/ | Preview + landing | Pass |
| Fat Girl Finishing School | http://bit.ly/FatGirlFinishingSchool | https://buttonpoetry.com/product/fat-girl-finishing-school/ | Preview + landing | Pass |
| Excuse Me As I Kiss The Sky | https://bit.ly/rudykissthesky | https://buttonpoetry.com/product/excuse-me-as-i-kiss-the-sky/ | Preview + landing | Pass |
| Even the Saints Audition | http://bit.ly/raychsaints | https://buttonpoetry.com/product/even-the-saints-audition/ | Preview + landing | Pass |
| Ephemera | https://bit.ly/sierraephemera | https://buttonpoetry.com/product/ephemera/ | Preview + landing | Pass |
| Depression & Other Magic Tricks | http://bit.ly/sabrinamagic | https://buttonpoetry.com/product/depression-other-magic-tricks/ | Preview + landing | Pass |
| Dear Azula, I Have a Crush on Danny Phantom | http://bit.ly/dearazula | https://buttonpoetry.com/product/dear-azula-i-have-a-crush-on-danny-phantom/ | Preview + landing | Pass |
| Dead Dad Jokes | https://bit.ly/deaddadjokes | https://buttonpoetry.com/product/dead-dad-jokes/ | Direct landing | Pass |
| Date & Time | http://bit.ly/philkayedate | https://buttonpoetry.com/product/date-time/ | Preview + landing | Pass |
| Crown Noble | https://bit.ly/crownnoble | https://buttonpoetry.com/product/crown-noble/ | Preview + landing | Pass |
| Cottonmouth | https://bit.ly/colemancottonmouth | https://buttonpoetry.com/product/cottonmouth/ | Preview + landing | Pass |
| Composition | https://bit.ly/wardcomposition | https://buttonpoetry.com/product/composition/ | Preview + landing | Pass |
| Butcher | http://bit.ly/tmillerbutcher | https://buttonpoetry.com/product/butcher/ | Preview + landing | Pass |
| Born in a Second Language | http://bit.ly/akosuaborn | https://buttonpoetry.com/product/born-in-a-second-language/ | Preview + landing | Pass |
| BloodFresh | https://bit.ly/bloodfresh | https://buttonpoetry.com/product/bloodfresh/ | Preview + landing | Pass |
| Birthright | http://bit.ly/georgebirthright | https://buttonpoetry.com/product/birthright/ | Preview + landing | Pass |
| Autopsy | http://bit.ly/donteautopsy | https://buttonpoetry.com/product/autopsy/ | Preview + landing | Pass |
| Ain't Never Not Been Black | https://bit.ly/javonaintnever | https://buttonpoetry.com/product/aint-never-not-been-black/ | Direct landing | Pass |
| Afterwards | http://bit.ly/myersafterwards | https://buttonpoetry.com/product/afterwards/ | Preview + landing | Pass |
| Tartarus | https://bit.ly/chapmantartarus | https://buttonpoetry.com/product/tartarus/ | Preview + landing | Pass |
| Sweet, Young, & Worried | https://bit.ly/sweetyoungworried | https://buttonpoetry.com/product/sweet-young-worried/ | Preview + landing | Pass |
| Swallowtail | http://bit.ly/brennaswallowtail | https://buttonpoetry.com/product/swallowtail/ | Preview + landing | Pass |
| Still Can't Do My Daughter's Hair | http://bit.ly/evansdaughter | https://buttonpoetry.com/product/still-cant-do-my-daughters-hair/ | Preview + landing | Pass |
| Staying Right Here | https://bit.ly/StayingRightHere | https://buttonpoetry.com/product/staying-right-here/ | Preview + landing | Pass |
| St. Trigger | http://bit.ly/StTrigger | http://buttonpoetry.com/product/st-trigger/ | Preview + landing | Pass |
| So, Stranger | https://bit.ly/sostranger | https://buttonpoetry.com/product/so-stranger/ | Preview + landing | Pass |
| Smut Psalm | https://bit.ly/smut-psalm | https://buttonpoetry.com/product/smut-psalm/ | Preview + landing | Pass |
| SINK | https://bit.ly/desireesink | https://buttonpoetry.com/product/sink/ | Preview + landing | Pass |
| Rock Stars | https://bit.ly/masonrockstars | https://buttonpoetry.com/product/rock-stars | Preview + landing | Pass |
| Revenge Body | http://bit.ly/wileyrevengebody | https://buttonpoetry.com/product/revenge-body/ | Preview + landing | Pass |
| Portrait of my Body as a Crime I'm Still Committing | https://bit.ly/WintersPortraitofmyBody | https://buttonpoetry.com/product/portrait-of-my-body-as-a-crime-im-still-committing/ | Preview + landing | Pass |
| Poetry By Chance: An Anthology of Poems Powered By Metaphor Dice | https://bit.ly/poetrybychance | https://buttonpoetry.com/product/poetry-by-chance-an-anthology-of-poems-powered-by-metaphor-dice/ | Preview + landing | Pass |
| Please Come Off-Book | http://bit.ly/kantoroffbook | https://buttonpoetry.com/product/please-come-off-book/ | Preview + landing | Pass |
| Patricide | http://bit.ly/davepatricide | https://buttonpoetry.com/product/patricide/ | Preview + landing | Pass |
| Our Numbered Days | http://bit.ly/ournumbereddays | http://buttonpoetry.com/product/our-numbered-days/ | Preview + landing | Pass |
| Nothing Is Okay | http://bit.ly/nothingisokay | https://buttonpoetry.com/product/nothing-is-okay/ | Preview + landing | Pass |
| New American Best Friend | http://bit.ly/oliviabestfriend | https://buttonpoetry.com/product/new-american-best-friend/ | Preview + landing | Pass |
| Never Catch Me | https://bit.ly/nevercatchme | https://buttonpoetry.com/product/never-catch-me/ | Direct landing | Pass |
| NOT A LOT OF REASONS TO SING, BUT ENOUGH | http://bit.ly/guantenotalot | https://buttonpoetry.com/product/not-a-lot-of-reasons-to-sing-but-enough/ | Preview + landing | Pass |
| Lord of the Butterflies | http://bit.ly/andreagibsonlb | https://buttonpoetry.com/product/lord-of-the-butterflies/ | Preview + landing | Pass |
| Keep This To Yourself | http://bit.ly/keepthistoyourself | https://buttonpoetry.com/product/keep-this-to-yourself/ | Direct landing | Pass |
| About Time | https://bit.ly/hilborn-about-time | https://buttonpoetry.com/product/about-time/ | Preview + landing | Pass |
| ABC Death | http://bit.ly/abcdeath | https://buttonpoetry.com/product/abc-death/ | Preview + landing | Pass |
| A Socially Acceptable Breakdown | http://bit.ly/rochebreakdown | https://buttonpoetry.com/product/a-socially-acceptable-breakdown/ | Preview + landing | Pass |
| A Peculiar People | https://bit.ly/apeculiarpeople | https://buttonpoetry.com/product/a-peculiar-people/ | Direct landing | Pass |
| A Love Song, A Death Rattle, A Battle Cry | http://bit.ly/guantelovesong | http://buttonpoetry.com/product/love-song-death-rattle-battle-cry/ | Preview + landing | Pass |
| A Guide to Undressing Your Monsters | http://bit.ly/samsaxguide | http://buttonpoetry.com/product/a-guide-to-undressing-your-monsters/ | Preview + landing | Pass |
