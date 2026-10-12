# Card evidence binding

Changes: diagram card candidates now declare their own visual description; publication no longer substitutes the notion's description. The description remains part of the candidate supplied to the multimodal reviewer. Missing visual proof does not gain an automatic approval. Image-only evidence still needs visual review before publication as ready.

Accuracy review hashes now include the exact evidence array, including quotations and visual descriptions. Changing evidence on the same page invalidates an earlier approval. Previously stored hashes without evidence also become obsolete: affected cards need a new review; they are not silently certified by migration.

Offline regression tests cover changed answers, same-page changed quotations, changed visual descriptions and changed source text. They establish integrity of approvals, not factual or pedagogical quality.

Remaining structural limitation: the diagram path still reconstructs lessons before card design. This change does not remove that latency or demonstrate parity with RemNote. Text-first import already separates knowledge extraction and card design; diagram import still needs that separation. No paid provider request was made for this change.
