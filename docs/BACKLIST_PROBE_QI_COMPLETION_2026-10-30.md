# Backlist probe QI handoff — completed 30 October 2026

All four requested square QIs were created in P.I.G., visually checked, approved individually through Weaver QC, and imported once into Poetry Please. Actual public PNG bodies were checked (not only HTTP status): all are 1080×1080. Each quote matches its current Catalog source. Book/author/title and permanent poem keys are verified. No calendar rows, dates, checkboxes or publishing jobs were changed; Command Center owns placement as unticked probes.

| Book | Poem | Permanent key | PP content ID | Reading link |
| --- | --- | --- | --- | --- |
| What I Learned from the Trees | Don’t ask me to pour out my heart | BPP-02903 | pig-1793371689351 | [Open](https://poetryplease.org/?item=pig-1793371689351) |
| Black Movie | Politics of Elegy | BPP-04616 | pig-1793370328236 | [Open](https://poetryplease.org/?item=pig-1793370328236) |
| A Love Song, A Death Rattle, A Battle Cry | Mickey Mouse Gas Mask | BPP-04098 | pig-1793370659004 | [Open](https://poetryplease.org/?item=pig-1793370659004) |
| Still Cant Do My Daughters Hair | Dust | BPP-04234 | pig-1793371237281 | [Open](https://poetryplease.org/?item=pig-1793371237281) |

## Checks and source handling

The handoff's character estimates were historical. Current Catalog was read by exact book and permanent key before choosing quotes; all four current full-poem captions fit below Instagram's 2,200-character limit. Full caption text and direct public PNG URLs are supplied in the accompanying shared-drive JSON, not published in this repository.

The existing graphics handoff did not populate PP's explicit poemKey field. Each new record already retained the correct BPP sourceRecordId. After checking exact request, source text, title, book and author, only poemKey and poemKeySource were added to these four new graphics in a guarded transaction with a minimal metadata backup. The existing content cache generation was invalidated. Public contentById readback confirms the keys; IDs, media, source identities and other fields were retained. This was a bounded correction, not automatic upstream key propagation.

## Necessary queue fix

P.I.G. requested 5,000 Weaver handoffs in one call, while Weaver returned only the first 500 and an empty nextCursor. The four requests were present on numeric cursor 500 but unreachable through P.I.G. search. P.I.G. now follows supported numeric cursor pages within its existing 5,000-record bound. Four focused tests pass; normal small loads remain first-page-only. [P.I.G. PR #1](https://github.com/samvancook/PIG/pull/1) is merged, and the existing deploy-cloud-run.sh released pig-00286-v2p at 100% traffic with the existing model, service account and Drive folder settings preserved. Live P.I.G. search found the exact new request. No Weaver code or authentication scope changed.

## Follow-up owners

- Poetry Please intake owner, coordinating P.I.G./Weaver: preserve the explicit Catalog poem key through request/completion/QC/PP adapters and add a regression canary. These four already have verified keys; do not regenerate/resend them.
- Catalog/PP identity owner: existing BM-FP-POLITICS-OF-ELEGY and ALSA-FP-MICKEY-MOUSE-GAS-MASK lack poem keys. They were left unchanged. Compare current text against Catalog before any future FP identity update; graphics key linking is not evidence that those older FPs were synchronized.
- Weaver owner: repair missing nextCursor on a full handoff page. P.I.G. currently uses the existing supported numeric offset and does not pretend the first 500 are a complete search.
