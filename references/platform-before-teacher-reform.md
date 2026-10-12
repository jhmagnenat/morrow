# Historical platform documentation

This describes the platform before the teacher-course reform. The current product contract is in ../PRODUCT.md and the current implementation is described in teacher-course-architecture.md.

# Encyclopedia

Generation after a reset: [v8 source-only inventory, native-card repair and independently verified visual cards](references/generation-v8-reset.md).

Current generation work: [selected essentials, source inspection, safe reuse, real-course recovery and validation limits](references/generation-knowledge-coverage-update.md).

Generation update: [short recall answers, standalone concept definitions, text/visual evidence fixes and safe regeneration](references/generation-functional-update.md).

Latest changes: [source assertions, mobile installation/offline preparation,
cross-device refresh and generation budgets](references/content-mobile-generation-upgrade.md).

A local learning platform that turns course slides into a source-based knowledge map and independent spaced-repetition cards. Each course has its own SQLite database and original PDFs.

## Run

Use Node.js 24, install dependencies with `npm install`, then start with `npm run dev`. Open http://localhost:3000.

Copy `.env.local.example` to `.env.local` and configure the provider you use: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `OLLAMA_MODEL`. `LLM_PROVIDER` selects `openai`, `anthropic`, or `ollama`; model overrides are `OPENAI_MODEL`, `ANTHROPIC_MODEL`, and `OLLAMA_MODEL`. Restart after changing environment variables. Slide-image analysis needs a model that accepts images.

## Slide generation

Generation defaults to granular source targets, a required card per target, and an independent factual, pedagogical and coverage review. Native structured relations bypass planning and writing; quiz review requires a decision for every original question. Text and diagrams use the same engine. A short first batch exposes checked cards early; later batches contain up to three pages and run concurrently. Lessons and graph relationships are outside the import path. Reviews use FSRS-6 with preserved histories. See [the direct architecture and its unmeasured quality limits](references/morrow-direct-generation.md).

FSRS now supports per-course parameter fitting with chronological held-out validation. Automatic recovery checkpoints protect destructive actions and preserve original PDFs without copying unchanged files repeatedly. See [recovery APIs, scheduler validation and remaining limitations](references/reliability-and-scheduling.md).

Anki package import/export, guarded manual course transfers, a large-deck benchmark and a human evaluation harness are available. The compact **Tools** dialog exposes synchronization/conflicts, recovery, Anki import, scheduler personalization and evaluation exports. Imported images/audio use authenticated local routes and a restricted HTML renderer. Scripts and external resources are blocked; complex templates still require verification. See [commands, measured improvements and compatibility limits](references/interoperability-and-validation.md).

For protected multi-user hosting, first provision an account with `node scripts/users.mjs your-name --owner` (password from stdin, at least fourteen characters), then set `MORROW_AUTH=required` and restart. The owner retains existing courses; additional accounts created without `--owner` receive separate registries, databases and PDFs. Sessions are revocable and stored as hashes; passwords use salted scrypt. Use HTTPS for remote access. Local mode remains the default. This is a single-host deployment, not a distributed storage service.

The previous interface files are preserved in [the UI baseline](references/ui-baselines/before-usability-changes.json). Mobile Study tabs now scroll, the map details have a return button, and keyboard focus/reduced motion are supported. No automatic quality score proves scientific accuracy: real course evaluations and measured generation latency are still required.

Background generation uses up to three normal model calls per uncached batch: source inventory, fixed-target card design and independent review. Explicit source relationships can produce cards directly with one review call. At most one bounded repair round checks six unresolved source-supported targets; accepted cards survive repair failure. Images are sent when their evidence is needed. Transport retries remain bounded. Previous engines are archived under `references/legacy-generation`; old pipeline flags no longer select a production engine.

Primary page text is preserved in full, with two relevant context pages. The writer selects stable source IDs; the server materializes their original quotations. The reviewer checks all displayed claims and independently lists essential objectives. A page completes only when its declared objectives have actually published cards with primary-page evidence. Rejections and coverage gaps stay visible, and full artifacts are saved for inspection. Notions are minimal source-backed card groups; deeper explanations remain on demand.

Direct import always grounds cards in the supplied document, including when Open mode is selected. Outside explanations remain separate from imported source facts. Manual decomposition retains its existing enrichment settings.

Concepts and relationships need supporting evidence. Text quotations are checked against the actual page; the model separately checks semantic support, scope, atomicity and coverage. Visual-only cards remain drafts for human review. A matching quote and a model audit do not guarantee factual correctness.

Failed, incomplete or visually unavailable pages remain retryable. Browse → Content quality shows page classifications, coverage, warnings, generation versions and token counts. Reprocess selected pages there, then generate from Documents. Older backups can recover the original PDF through the same panel; replacement PDFs must match the existing page count/text.

Generation is pinned to its starting course, protected by a renewable database lease, and committed transactionally by batch. Clearing the mapping, restoring or resetting cancels pending writes. Existing notions, including hidden ones, are reused after exact/semantic checks; card IDs, scheduling, suspension and manual corrections are retained. Newly supported content can improve unedited legacy definitions/cards.

## Mapping and cards

Study separates **Notions** (term → approved definition) from **Q&A** (course question → answer). Notions uses definition cards attached to the map; mechanism, comparison, application and imported-template cards remain available in Q&A. Both presentations reuse the same card IDs and FSRS history, and grading in one removes that objective from the other queue until it is due. Connect keeps relationship practice; Explain remains the written explanation exercise. No additional model call is required to open these modes.

Q&A can also **create questions from a course notion** through its collapsed generator. Select a notion to request up to three short source-based questions, followed by an independent AI audit and local validation. Supported questions join the review queue; uncertain answers remain drafts in Browse. Existing cards/history are preserved, duplicates are skipped, and source changes during generation cancel the write. Generation uses the configured provider only after pressing Generate; opening Q&A makes no model call. The AI audit is not a scientific accuracy guarantee.

The mapping opens as a compact overview with previews of each main topic. Click a topic to view its immediate subtopics, with a breadcrumb to return to the overview. Up to sixteen topics fit in a grid; larger levels have pagination. Search covers all notions, including deeper branches. Drag to pan and use the ordinary wheel or pinch to zoom. Connections for the selected notion remain available without drawing a tangle of edges. Existing hierarchy and cards are preserved; disconnected notions and cycles remain accessible.

Cards are independent of graph nodes and can test definitions, mechanisms, comparisons or applications. Deleting a Browse card leaves the mapping intact. Browse offers status filters, answer previews, source quotations/PDFs, editing, approval and suspension. Drafts and suspended cards stay outside the review queues. Legacy cards retain their IDs/history and carry an unverified-content warning; clearly administrative legacy content is hidden from the mapping, with unreviewed cards kept as drafts.


Different definition objectives are no longer collapsed merely because they share a notion. Up to eight previous card versions are retained in backups when content changes. Strict chat uses source quotations and available slide images, checks that its answer is supported and addresses the question, and returns verified source references. Unsupported answers are withheld. Open chat uses outside knowledge. Viewing a notion does not automatically generate workplace answers.

Optional `OPENAI_AUDIT_MODEL`, `ANTHROPIC_AUDIT_MODEL` or `OLLAMA_AUDIT_MODEL` selects a different audit model within the configured provider. Without an override, generation and audit still use the same model. Strict chat performs two model calls; a source check reduces errors but does not guarantee correctness.

Today, Drill, Connect, Pronounce, Vocab and Explain retain their session/draft state across tabs and navigation. Reviewing in one queue removes that card from the other queues. Grading is transactional and idempotent, so delayed/double submissions cannot award progress twice. Failed saves retain the current card. Review buttons display the next intervals, including short learning/relearning steps. Due reviews take priority; new-card slots are shared across decks and capped daily. Configure the daily/session limits in Content quality.

## Backup and migration

The first independent-card migration creates a SQLite copy in `data/backups/`. New JSON backups include PDFs, independent cards, edits, page audits, schedules, mastery and streak progress. Restoring validates the content, rolls back database failures and preserves the previous state if PDF restoration fails. Older version-1 backups remain supported, with a PDF recovery option when original files were absent.

Clear mapping only keeps the complete card collection/history and source documents. Regeneration reuses that collection instead of deleting review history. Full Reset remains a separate destructive operation.

## Validation

Content precision, parallel section generation and successful audit reuse are
documented in [learning quality and the 30-second target](references/learning-quality-and-speed.md).
`node scripts/audit-learning-content.mjs` reviews existing prose and structured
lessons read-only, without paid model calls. The latency target requires live
measurements; it is not an accuracy or speed guarantee.
The [evaluation protocol](references/evaluation/protocole.md) supplies separate
immediate and delayed transfer questions, an independent content-review packet,
and explicit pending-evidence gates. Visual reviews identify their reviewer and
remain tied to the exact PDF; they do not certify scientific correctness.

Morrow now offers **Study → Understand** with progressive C.L.A.I.R. lessons and **Interview → Course understanding**, sharing five distinct mastery skills with Drills and Explain. Existing notes and workflows remain available. Document generation now supplies cards and minimal notion groups; deeper lessons are generated on demand. See [methodology, migration and limitations](references/clair-methodology.md).

Read-only `/api/learning` exposes the learning path; `/api/reliability` reports verifiable source/quality issues. `/api/export?format=anki` exports checked ready cards as ID/Front/Back/Sources/Tags TSV. Use a custom Anki note type with ID first and Front/Back in the template. Review schedules and media are not transferred by this text export.

`npm test` runs isolated database/migration tests, study-state tests and a 16-case source-quality corpus. These use disposable directories under `.next`, never the user's course databases, and make no paid LLM calls.

`npm run lint` and `npx tsc --noEmit` check the code; `npm run build` builds production.

With the dev server and a dedicated Chrome debugging session on port 9222:

- `node scripts/browser-inspect.mjs http://localhost:3000 --check-mapping`
- `node scripts/browser-inspect.mjs http://localhost:3000 --check-compact`
- `node scripts/browser-inspect.mjs http://localhost:3000 --check-intuition`
- `npm run test:browser`
- `node scripts/browser-inspect.mjs http://localhost:3000/browse --check-quality`

Browser grading/editor requests are stubbed so these checks do not change real cards or reviews.

`npm run evaluate` checks the offline source/quality guards. `npm run evaluate:live` explicitly calls the configured LLM and consumes API credits; it evaluates textual fixtures in an isolated database and writes `.next/slide-quality-report.json`. Exact-label scores require human interpretation and do not measure factual answer accuracy. Visual accuracy needs evaluation against real slide images.

## Main modules

### Content accuracy safeguards

Card generation uses a pure source-first engine with typed inputs and up to three normal model
operations: inventory, fixed-target design, then factual/pedagogical/coverage review. Original
extracted text and layout are stored before chunking, with source revisions.
Existing answers are excluded from the writer input. Notions are projections
of accepted cards, rather than intermediate generated teaching material.
Rejected cards stay drafts; coverage gaps stay explicit. One bounded targeted repair is allowed.
See [the current production architecture and live evaluation](references/generation-knowledge-coverage-update.md).

Historical live scripts for the progressive/detailed engines explicitly replay
archived snapshots through the test harness; they do not evaluate the new
production path. Paid evaluations still require a cost estimate and approval.

Generated lessons, cards, source-only explanations and learning assessments now
require an additional adversarial claim review against original sources. Every
displayed field must be covered in order, with exact supporting quotations;
unsupported, contradicted, uncertain or incomplete reviews block publication.
Deterministic arithmetic checks also apply independently of model approval.
Source quotations establish provenance, not factual truth.

Approved automatic cards retain fingerprints of their reviewed text and full
source pages. Changed sources or legacy cards without this review become drafts
at read time and leave revision, export and refreshed offline inventories;
identities and review histories are preserved. Previously downloaded content
cannot discover source changes while the device remains disconnected.

Checks may leave correct but insufficiently verified content unpublished. A configurable `*_ACCURACY_MODEL` can separate
the factual reviewer from the writer; the default may use the same model.
Neither automated approval nor simulated tests establishes a 10/10 accuracy
score. Expert evaluation against representative real courses remains required.

`node scripts/evaluate-accuracy-live.mjs --live` runs a declared factual-error
corpus with the configured provider, consumes API credits and records failures
as well as results. Network failures produce no accuracy score. `npm test`
includes adversarial review, arithmetic, source-change, assessment and offline
regression tests with simulated models and isolated databases.

- `lib/sourceDocument.ts`: authoritative page text/layout and source identity.
- `lib/generationEngine.ts`: pure source-to-card engine.
- `lib/directCardGeneration.ts`: provider/cache/source adapter.
- `lib/generationRepository.ts`: scoped queries and transactional publication.
- `lib/documentGeneration.ts`: durable jobs and bounded concurrency.
- `lib/contentQuality.ts` / `lib/structuredSchema.ts`: evidence, card and output validation.
- `lib/qualityDb.ts`: independent cards, provenance, page states, leases and metrics.
- `lib/courseScope.ts`: request-scoped course identity across asynchronous calls.
- `lib/backup.ts`: complete snapshot/PDF restoration.
- `lib/studySession.ts` / `lib/useStudySession.ts`: persistent synchronized sessions.
- `lib/srs.ts`: learning/review intervals.

This remains a single-host application, with optional isolated users and non-streaming LLM responses.

Study now supports a cached offline session with durable browser reviews and
automatic replay to the same server. Optional separate-worker generation,
positioned PDF extraction/Tesseract integration and modern Anki package decoding
are available without visual changes. See [setup, validation and explicit remaining limits](references/production-readiness.md).

The archived progressive engine supplied compact C.L.A.I.R. lessons: intuition, mechanism, precise source terms and conditions, and a self-contained worked task. On-demand deepening adds audited analogies when useful and varied transfer tasks. The archived detailed engine retained a logical course plan, bridge ledger, workflow, sketches and comparisons. Both workflows preserve exact source provenance, manual/validated notes, card identities and histories. Per-slide notes remain in backups. These checks validate structure and detect selected failures; they do not establish equivalence to a live lecture or general scientific correctness.

`node scripts/evaluate-implicit-course-live.mjs` replays the archived detailed pipeline on two actual uploaded insurance slides and images in an isolated database, consuming configured LLM credits. It saves source/output pairs in `data/reports/implicit-course-live.json`. A connection failure is reported as failure, never as proof of pedagogical quality.

The generation engine now tracks individual knowledge targets and resolves reviewer evidence from immutable source IDs. See [knowledge coverage, regression cases and isolated evaluation](references/generation-knowledge-coverage-update.md).
