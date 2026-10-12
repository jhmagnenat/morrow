> Historical implementation report, before the teacher-course reform. For the current product and generation contract, read [PRODUCT.md](../PRODUCT.md) and [teacher-course-architecture.md](teacher-course-architecture.md). Source-only restrictions in this report do not apply to the current production pipeline.

# Generation v8: works from the source after a reset

This change concerns the generator, not a repaired saved deck. No real-course cards or analyses were edited for this implementation. Version `direct-cards-v8-reset-independent-visual` separates its caches from earlier generation contracts.

## Structural changes

- Remove the old-deck fallback from source inventory. An independent source audit identifies missing objectives and feeds the bounded repair, including on the first import. Old questions, answers and source-traced claims cannot change model inputs. Persistence still protects studied and user-edited cards.
- Allow the bounded writer/reviewer repair to redesign native table and diagram cards. Previously native `recall` targets were excluded from repair, and their original wording was forcibly reused. The revised path discards the native wording for that repair, keeps its source claim, and independently audits the new recall.
- Give the planner every provided relevant original image, with compact image indices and explicit primary/context roles. Native text length no longer silently removes a necessary figure. Ranking questions can receive the original figures from selected nearby source pages; these remain contextual evidence rather than new generation objectives.
- Permit automatic visual cards only after the normal independent factual/design audit **and a separate original-image read-back**. The latter must confirm readable evidence, full support and matching scope; it records actual visible values, labels and relationships. Units, dates, populations, denominators and ordering must match when relevant. Uncertain or rejected visual answers remain drafts. No image is converted into a forged textual quotation.
- Bind automatic visual approval to the original PDF hash and exact question/answer/claim content. It is explicitly labelled automatic independent image checking, not user inspection. Changed answers or replaced PDFs invalidate that approval.
- Preserve accepted text if the additional visual check fails. Surface no-credit failures to the existing billing-stop mechanism. Perform at most one additional visual-check call per batch, for at most 12 candidates, with strict keyed output, bounded token capacity and existing source/image-bound cache reuse. Unverified candidates remain visible as drafts.

## Verification and limits

`node scripts/test-generation-reset.mjs` starts with disposable empty data. It verifies identical complete model inputs and results with and without an old deck, first-import omission recovery, native-card repair, independent visual acceptance/rejection, contextual-image evidence, unchanged-PDF/recall binding and preservation of accepted text after visual verification failure.

These tests use explicit synthetic model responses. They prove protocol, isolation and publication behavior; they do **not** measure factual model accuracy or establish RemNote equivalence. A fresh paid end-to-end evaluation remains necessary. The configured provider's latest real response was `no credits remaining`; no provider calls were made for this work. Earlier repaired-course counts and historical v7 benchmarks are not evidence of v8 generation quality.

No additional software, model service or skill installation is required. Existing writer/reviewer settings are used. Compared with the previous image path, verified image generation adds one bounded model operation; text-only generation adds none. Dollar cost and real latency have not been measured for v8.
