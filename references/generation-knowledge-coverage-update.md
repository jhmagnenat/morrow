> Historical implementation report, before the teacher-course reform. For the current product and generation contract, read [PRODUCT.md](../PRODUCT.md) and [teacher-course-architecture.md](teacher-course-architecture.md). Source-only restrictions in this report do not apply to the current production pipeline.

# Generation v7: selected knowledge and reviewed concept definitions

## Current course recovery and verification — 11 October 2026

The actual 38-page insurance course currently has **60 safe study-ready cards**, 11 drafts and 148 reversibly suspended variants. Its saved page analyses show **12 covered, 22 excluded and 4 needing review**, with no missing page records. All 19 pre-existing card identities remain stored; authorized corrections of unstudied automatic cards do not mean their original wording stayed unchanged. `evaluation/insurance-current-projection.json` records the current content and original-wording differences.

This recovery made **zero paid model calls**. It replayed strictly matching archived independent reviews for pages 23/31, inspected freshly rendered original figures on pages 22/24/26/29/30, selected six essential figure cards, and reversibly suspended 73 unchecked figure variants. Reinsurance now recalls both the insurer being protected and the large, volatile or accumulated losses. An applied coordination answer cites the original scenario on page 36 and explicit financial/value-chain premises on page 33. The awkward premium-market-share answer was corrected. Every original question on pages 35 and 36 now has an individually inspected saved response. These are explicit assistant source inspections, not new provider evaluations, human certifications or a RemNote-equivalence score.

Four lost but unchanged v6 page audits were restored with their **original version**, only when every source claim had exactly one safe ready card carrying its original independent review. Failed pages 19/20/21 retain the genuine latest no-credit failure and recover the earlier audit as history; their previous cards remain available. Page 28 explicitly records five distinct rankings: two answered by inspected original figures, three unresolved because the PDF does not contain them and the cited official embedded charts could not be retrieved. No outside ranking was guessed or attributed to the PDF.

Generation reviews now depend on the source and candidate design, rather than a mutable existing deck. Exact repeated generation can reuse its reviewed artifacts without paying for another review after publication or study. Studied, edited and explicitly source-inspected answers are protected; a deleted baseline duplicate is not recreated. Notion creation and aggregation happen after publication safeguards, so rejected candidates cannot contaminate definitions. Reinsurance's native product-table purpose merges its party and loss scope instead of weakening another objective with the same question.

Visual approval requires an explicit original-image confirmation. Both the actual original PDF hash and current recall-content hash bind its approval: changing an answer or replacing the PDF invalidates it. Partial inspections preserve the rest of the page as unresolved. Question-page completion requires an explicit decision for **every** original question with unchanged ready-card proofs; a card count alone cannot certify it.

The Browse **Reprocess** button now actually starts generation, observes the durable job, refreshes quality and reloads the saved card list. A production Chrome check verifies these actions, generation choices, invalid-page rejection and separate study explanations on disposable data, with model requests intercepted (`evaluation/generation-browser-latest.json`). A real-course regeneration of the five inspected figure/advertisement pages verified **zero provider calls, unchanged cards and unchanged scheduling history** (`evaluation/inspected-reuse-latest.json`).

Regression checks, lint, TypeScript and the production build pass. No additional software or skill installation was needed. Full fresh automatic-generation validation remains incomplete because the configured OpenAI account returned **no credits remaining**. The measurements below are historical; the later combined reinsurance target and source-only review changes have not been measured in a fresh paid evaluation.

## Latest changes and validation

Version `direct-cards-v7-selected-knowledge` adds explicit core/supporting/incidental priorities. Key-ideas generates core targets; comprehensive also includes supporting targets. An independent reviewer checks the selection and can promote an incorrectly deferred target through the bounded repair. Original quiz questions remain mandatory. Correctly deferred facts are recorded as `deferred`, never as covered knowledge or unresolved failures.

Native product-purpose questions now use definition cards and readable source-bound claims. Automatic notions aggregate accepted claims across pages. Each new claim is stored on its card and included in the accuracy content hash: changing a definition invalidates its review. Human and validated definitions are preserved. The active map hides unreviewed automatic notions that have no safe study-ready card; full stored content remains available for recovery.

Two real first-generation evaluations on the same original pages 23 and 31 completed in separate empty courses. Key-ideas produced 16 ready cards (11 + 5), with 13 supporting facts explicitly deferred, in 18.7 seconds and 2 provider requests. Comprehensive produced 29 ready cards (16 + 13), also with 2 requests. Reports: `direct-server-1791699870800.json` and `direct-server-1791699931383.json`. The actual questions and answers were inspected; these counts are not a pedagogical score and do not establish general performance across courses.

The subsequent full 38-page regeneration stopped with provider error 429: **You have no credits remaining**. `insurance-v7-regeneration.json` records this failed attempt; it must not be described as a successful v7 course regeneration. The saved cards were preserved. No further paid calls were attempted after this response. The prior completed v6 run below remains historical, not validation of the current full course.

The local regression suite passed, and a dedicated additional regression verifies essential/comprehensive selection, independent promotion and immutable definition review binding. No extra software or skill installation is required for these changes. Full live validation still requires available provider credits, and graphical teaching data still requires visual review.

This supersedes v4 and v5. Its passing simulated tests did not predict acceptable live output. The real insurance regeneration retained only 11 cards and failed eight pages because writer-authored references pointed to nonexistent cards. A single life-insurance card also appeared to cover several different families.

## Implemented

- Extract granular facts from immutable primary sources. Explicit balance-sheet/business-function matrices preserve their actual source rows rather than inferring accounting components. Positioned officer annotations are bound to labels in the same column. Native insurance product tables preserve each row and each substantive column as separate recall targets. These simple source relationships produce cards directly and require only independent review, with no planner or writer call. Other material uses the structured planner.
- Assign target identities on the server and require a card slot per target. Generic writer objectives cannot merge distinct source facts. A bad candidate no longer rejects unrelated valid cards.
- Require server-keyed review objects for every target, card and page; an array of repeated keys cannot silently omit another decision. Assess recall independently of novelty: an existing duplicate does not mean the new answer fails to cover its target. Bound duplicate context to related pages and 24 cards.
- Require an extraction slot and a coverage entry for every numbered original quiz question, including questions omitted by the planner. A question without a supported answer remains unresolved.
- Audit original sources, actual short Q+A, provenance, usefulness and page coverage independently. A source ID or an unrelated accepted card does not establish coverage.
- Bind notion definitions to the independently reviewed source claim. Optional automatic explanations must be exact source excerpts and pass review. Invented or paraphrased background is removed; human explanations remain editable.
- Formulate simple associations in a direct recall direction. Preserve layout coordinates, course context, quiz teaching content and original PDF text. Incidental images do not block textual proof; genuinely visual assertions and uncertain OCR remain drafts.
- Use up to three normal model operations per section and at most one targeted writer/reviewer repair for six unresolved source-supported targets. Keep accepted cards if repair fails. Retain versioned caches bound to the exact schema and supplied image hashes, billing bounds, source-race checks, stable identities, manual edits, recovery points and review history.
- Combine independently reviewed facts into the corresponding automatic notion definition. Preserve approved definitions and edits. On fully covered pages, reversibly archive old unchecked automatic variants and hide their obsolete automatic notion groups. Preserve reviewed cards and manual suspensions; freshly audited automatic archives can reuse their original IDs. One older overview cannot be reused for multiple distinct targets in a batch.
- Scale output capacity to required slots. Match quota as a whole word so quotation does not cause a fatal billing error. Distinguish covered, excluded and unresolved pages in the UI.

## Real evaluation

`node scripts/evaluate-direct-server.mjs --live --pages=20,23` uses the existing local server and configured provider in an isolated temporary course. It preserves the active course, original document and deck, records original artifacts and request traces, and deletes only its completed temporary course. Without `--live` it makes no model calls.

Timestamped `references/evaluation/direct-server-*.json` reports retain failed iterations as well as successful ones. `direct-server-latest.json` is the most recent. No automatic human quality score is assigned. The mock regression suite proves rejection and persistence behavior, not model accuracy or RemNote parity.

`insurance-before-v5.json` captures the actual course before regeneration. `insurance-v5-regeneration.json` and `insurance-v6-regeneration.json` retain previous iterations. Regeneration creates a recovery point and preserves human edits and scheduling.

## Historical completed v6 course run

The actual 38-page insurance course finished in 58.6 seconds with 24 paid requests, 67 study-ready cards, 10 covered pages, 21 excluded pages and 7 pages needing review. There were no technical page failures. The remaining pages are 22/26/29/30 (visual figures), 28 (ranking answers absent from the supplied text), 36 (an unspecified actor response), and 24 (a promotional image whose classification remained unresolved). The last run used 193999 input and 24993 output tokens; dollar cost is unknown without configured rates.

An isolated first-generation run on pages 23/35/36 produced 25 ready cards in 22.6 seconds, including four supported answers from page 36; its fifth question remained unresolved. These measurements describe this document and configured model, not a guarantee for other courses. Original PDF hash and all pre-existing card IDs were retained. All regression suites, lint, TypeScript and the production build passed. Browser interaction was not tested because no inspectable browser session was available.

## Limits

The explicit matrix parser has a narrow shape guard; other documents retain the general planner. Semantic reviews remain fallible. Ambiguous or incomplete source material can legitimately remain unresolved, and visual-only evidence needs inspection. Cost in dollars requires operator pricing; it is not invented from stale rates. Technical checks never substitute for reading actual generated cards.
