> Historical implementation report, before the teacher-course reform. For the current product and generation contract, read [PRODUCT.md](../PRODUCT.md) and [teacher-course-architecture.md](teacher-course-architecture.md). Source-only restrictions in this report do not apply to the current production pipeline.

﻿# Production generation: rebuilt foundations

Document generation has one production path. Five previous engines/planners were removed from lib and archived in references/legacy-generation. Historical regression tests explicitly replay snapshots; production cannot select them through old environment flags. Existing content and scheduling histories are preserved. No paid model requests were made for this implementation.

## Source and boundaries

sourceDocument.ts stores original extracted page text and layout before chunking, with PDF, page and document hashes. source_documents and source_pages are authoritative; passages are compatibility projections. Scientific characters and page boundaries are preserved. Backups include and validate these records. Source edits invalidate old progress/coverage; reviewed cards carry their source revision. Old documents reconstructed from passages are explicitly marked legacy-passages: migration cannot restore lost information.

generationEngine.ts is a pure engine with a model port: no database, provider SDK, scheduler or job runner. generationTypes.ts defines inputs. The engine performs one design operation and one combined factual/pedagogical/coverage review, returning candidates and gaps without storing anything.

directCardGeneration.ts prepares sources, supplies the provider/cache port, records artifacts and calls publication. sourceSections.ts batches and selects context independently of lessons/course plans. Full source pages are retained. Explicit cross-page references and the two pages on either side of the primary material take priority over generic lexical overlap. Context includes up to six whole pages within 18,000 context characters, ordered as in the original document; primary pages are never truncated. Batch images share one parsed PDF via renderPdfPagesAsDataUrls.

generationRepository.ts owns scoped SQL and transactional publication. Indexed card_sources avoids reading every card in the course. Cards are saved together with a shared safety context. Only accepted cards create minimal notion groups: notions are projections, no longer speculative intermediate lessons used to generate answers. IDs, manual edits, suspension and FSRS history are protected. Revision/claim checks surround calls; original-PDF checks happen at publication. Publication reconciles against the live deck: another batch adding a card is not a document-wide conflict. Changed/deleted existing objectives are preserved and left for review without canceling other objectives. A concurrently created duplicate is not silently overwritten.

documentGeneration.ts owns durable jobs and bounded concurrent scheduling. Dedicated indexed generation_jobs replaces job selection from arbitrary JSON settings. Foreground and background share generationDispatch.ts and the same engine.

## Work bounds

First batch: one page. Subsequent batches: at most three consecutive pages, 9,000 primary characters and two images. Oversized individual pages remain intact. Cloud concurrency defaults to three batches, local to one. Existing budgets and bounded transport recovery remain. No semantic repair loop or fallback engine.

An uncached successful batch performs two provider requests. Invalid design may stop after one. Writer cache includes source revision, model, version and immutable input, not existing generated answers. Review cache includes duplicate candidates: publication may invalidate review while preserving design. Structurally invalid output is not cached. Identical validated inputs may reuse both operations.

Schemas, exact source quotations and arithmetic checks run locally. The reviewer returns a verdict keyed to an immutable server-defined card field; the server binds it to the whole exact topic/question/answer. The model no longer has to reproduce or partition that text. Any unsupported clause must reject the whole field. This removes copy/paraphrase failures without dropping semantic or quotation gates. Review also checks scope, atomicity, relevance, duplicates and essential-objective coverage. Unpublished objectives remain explicit coverage gaps. Successful page processing is recorded separately from verified coverage; rejected objectives stay drafts and do not automatically regenerate on every resume. Explicit reprocessing resets that state. Provider, source and contract errors remain retryable and are displayed as technical failures. Image-only facts and uncertain OCR remain drafts for visual review. A separate request to the same model is not independent scientific verification.

Student grading policies and submission logistics are filtered locally before review. High-confidence administrative pages skip provider calls; mixed teaching pages remain available. Excluded candidates are retained in run artifacts, not published as study cards. Needs-review results are presented as completed processing with drafts/gaps rather than technical errors.

## Evidence and uncertainties

Offline regressions exercise integrity, rollback, source/progress invalidation, default dispatch, durable jobs, cache boundaries, rejected claims, forged references, missing PDFs, publication races and preserved scheduling. Archived-engine tests are historical compatibility regressions. Technical success is not a pedagogical score.

Answers may develop one objective up to 3,000 characters; the existing writer output-token ceiling remains unchanged. The writer is asked to select substantive taught ideas and explain supported relationships, conditions and consequences rather than reproduce headings or terse bullet lists. This is an input/output correction within the existing two calls, not an additional generation stage. More source text and longer actual output may increase token consumption; no live gain has been measured.

The twelve-candidate cap, heuristic context retrieval, extraction reading order and correlated writer/reviewer errors remain risks. Multi-column extraction is flagged for visual review. Actual speed, token savings and educational benefit need real-document measurements and blinded human evaluation. Neither 10/10 accuracy, thirty seconds nor RemNote parity is established.

RemNote describes source selection, preview/editing and caching in [Generating Flashcards with AI](https://help.remnote.com/en/articles/10102901-generating-flashcards-with-ai), and progressive sections/direct source-based cards in [Guided Learn Mode](https://help.remnote.com/en/articles/15724936-guided-learn-mode). These public behaviors inform a focused source-first design; they do not reveal private architecture or models.

Inspect generation_runs for real provider telemetry and quality_settings direct-card-run:<documentId>:<runId> for candidates, decisions, gaps and source identities. Cost rates are operator supplied; unknown cost remains unknown. Paid experiments require an estimate and explicit agreement.
