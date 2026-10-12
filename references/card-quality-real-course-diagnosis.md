> Historical implementation report, before the teacher-course reform. For the current product and generation contract, read [PRODUCT.md](../PRODUCT.md) and [teacher-course-architecture.md](teacher-course-architecture.md). Source-only restrictions in this report do not apply to the current production pipeline.

# Observed card quality: actual course, 10 October 2026

This is a diagnosis from local saved content, not a measured comparison with RemNote.

## Current course

The default course contains `Session_1_Introduction.pdf`, 38 pages. Its latest saved generation job attempted 53 model calls (318,193 input tokens, 68,246 output tokens), produced three cards and reported zero ready cards. It failed while generating unsupported interpretations of market-share material. All three current cards cite page 24, whose PDF image was rendered and inspected: a Liberty Mutual advertisement, with no experimental findings or explanation of marketing effects.

The card asserting that national imagery increased trust invents both an experiment and its result. Another card offers a generic marketing strategy unrelated to any explicit teaching on that image. The source can support recognizing what is visibly shown, but cannot establish those psychological or strategic claims. A decorative advertisement should ordinarily produce no study card without a stated course objective.

Saved historical cards also illustrate the same design failure: cost savings inferred from a captive-insurance table, broad department lists, vague reasons why a function is important, and a mathematically false explanation claiming real-number constraints prevent division by zero. These historical examples must not be confused with current outputs.

## Causes established in code and saved jobs

- The diagram-aware path automatically reused lesson goals and hypothetical experiments as cards. This encouraged generic or underdetermined questions.
- Prompts required causal explanation and transfer tasks even for factual tables and shown organizational titles. The writer expanded attributes into unestablished benefits; the factual critic then rejected them.
- A valid quotation or image description established provenance, but not the truth of the added interpretation.
- Several source-checking calls rejected content, but did not repair the underlying mismatch between the question type and source evidence. Additional checks alone yielded cost and drafts rather than good cards.

## Changes in this iteration

Every diagram-aware generation now explicitly designs cards from original evidence instead of automatically converting lesson experiments. Shared design instructions match questions to source type, allow short factual answers without invented reasons, preserve illustrative scope, and contain calibrated good/bad examples for the actual problematic subjects. Sparse-image classification excludes decorative advertisements lacking an explicit taught claim. Section goals and audits permit precise factual distinctions instead of requiring invented causality. Generation and card-design versions changed to invalidate previous generated caches.

Regression checks cover the real fast and diagram pipelines, targeted card repair, stable card IDs and review history. Their model outputs are simulated; they do not establish a quality score.

Further corrections make approved factual cards count toward source-objective coverage instead of demanding an additional non-definition card. Every new section card cites its own exact source snippets; its factual review and saved evidence use that narrower scope rather than the entire lesson bibliography. Lesson length is proportional to the evidence instead of imposing 150–220 words on simple associations. Exact short answers such as an acronym or a numerical value are no longer rejected by a minimum character quota; semantic sufficiency and source checks still apply. The generated section version is now `sections-v7-card-specific-evidence`.

`card-quality-real-course-targets.json` records bounded reference questions for pages 23 and 32 and the zero-card expectation for page 24. These are development review targets, not published cards, expert certifications or scores.

## Outstanding verification

`node scripts/evaluate-card-quality-live.mjs --live --real-source` copies pages 23 and 32 into a disposable course and records source/card pairs for review. The attempt in `data/reports/card-quality-live-1791587387950.json` failed on its first OpenAI request with `Connection error`, zero input/output tokens, and no generated cards. This is an execution limitation, not evidence of improved outputs. No 10/10 score or RemNote parity is established. The real evaluation must succeed and its cards must be reviewed against the PDF before such a conclusion is possible.

Connectivity was subsequently checked with an unauthenticated request to `https://api.openai.com/v1/models`. It failed immediately with `fetch failed`, cause `EACCES`, before an HTTP response. This establishes a local network-access failure; it does not establish an invalid API key, exhausted credits, or a provider rejection. Network permissions cannot be escalated in this session. Further live validation requires an execution environment that can reach the configured provider. The four-hour objective and the requested output quality remain unfinished; the goal is blocked rather than completed.
