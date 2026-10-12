> Historical implementation report, before the teacher-course reform. For the current product and generation contract, read [PRODUCT.md](../PRODUCT.md) and [teacher-course-architecture.md](teacher-course-architecture.md). Source-only restrictions in this report do not apply to the current production pipeline.

# Intuitive generation: implemented changes and observed limits

The generation pipeline now adapts BetterExplained's [ADEPT method](https://betterexplained.com/articles/adept-method/) inside existing note/card fields: a concrete mental model, causal explanation, useful bounded analogy, a self-contained reasoning situation, then technical precision. Source-owned learning goals must receive an explicit answer inside the note. No UI component, stylesheet or navigation was changed for this work.

Structural source inventories and revised lessons use required named properties to prevent omitted or duplicate identities. A failed lesson is repaired against the same source inventory. Source facts remain independently retained. An auditor must solve a different situation from actual displayed reasoning and select a server-owned supporting paragraph. This establishes traceability, not mathematical or pedagogical certainty.

For one primary slide, the source-owned question and its generated answer seed an independently audited mechanism card. Multi-slide sections retain primary-specific drafting. Rejected cards get one bounded targeted repair. Reviewed card identities, edits and scheduling remain covered by regression tests. Vocabulary-only cards cannot establish mechanism coverage.

## Verification

- All 16 automated suites passed, including source/citation gates, worked-task generation, targeted repair, mapping-clear deduplication, preserved study history, session/navigation regression checks and annotated source fixtures.
- TypeScript, focused ESLint and the production build passed.
- Local browser inspection reported no runtime exceptions. Original active course remained `default`, with 13 notions, 10 links and one document; temporary evaluation courses were removed from the registry.
- The last real insurance-table trial used a temporary course and primary PDF page 23. It finished in 38.91 seconds, with four model calls and five ready mechanism cards. The source/card/note artifact is `data/reports/generation-v11-server-evaluation.json`. This is one trial, not a latency guarantee.
- Mathematical trials exposed over-fragmented formula concepts, rate-versus-finite-change confusion, citation-format rejection and a false missing-PDF warning for text-only material. Those findings informed the final generation contracts and regression tests. Earlier mathematical trial artifacts are not evidence that the final version passed every mathematical task.

## Human review still matters

The final insurance sample better targets claims frequency/severity, healthcare inflation, ceded premiums/recoveries and retained group risk. However, some explanations still assert relevance instead of fully deriving it. Life-insurance investment sensitivity remains too concise; some analogies are decorative; some experimental assumptions or outcomes remain vague. Automatic approval is too generous on these examples. The final source-owned goal answer improves focus, but does not make every output an excellent lecturer's explanation.

An alternative GPT-5.4-mini trial failed with an API connection error in this environment. No persistent model or credential configuration was changed; the active configured model remains GPT-4o.

There has been no controlled comparison with RemNote on identical slides and learner tasks. Neither passing software tests nor ready-card counts establish RemNote parity or a 10/10 pedagogical score. The present evidence supports implemented generation/traceability/efficiency improvements, with remaining pedagogical limitations explicitly identified above.
