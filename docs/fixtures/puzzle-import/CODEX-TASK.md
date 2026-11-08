# Codex implementation task: Bulk Photo Import MVP

Implement this feature in the existing Jigsaw Puzzle Collector project. Read PRD.md, TDD.md, UI-UX.md, Makefile and existing schema before coding. This ZIP is a handoff package, not a replacement application repository.

## User story
As a collector with ~600 front-of-box photographs, I can upload batches, review extracted puzzle identities, correct errors, identify possible duplicates, and import approved physical copies into my private collection. The global catalogue must not be polluted by unverified AI suggestions.

## MVP scope
1. Mobile-first drag/drop and iPhone file picker supporting multiple images; show batch progress, thumbnail, per-image state and retry.
2. Store originals privately, preserving orientation; generate resized thumbnails; validate MIME by file contents, file size and dimensions; prevent executable uploads and path traversal. Never expose originals through guessable public paths.
3. Persist import batches and items, allowing resume after refresh and idempotent retries. Suggested states: queued, processing, needs_review, approved, imported, failed.
4. Create a pluggable extraction service interface. Start with a deterministic fixture provider using `puzzles.json` to make the full review/import workflow work offline. Do not pretend this is real AI. Add a documented adapter boundary for a future vision API, with secrets server-side only and explicit user consent before transmitting images to a third-party service.
5. Review UI shows photo, proposed title, manufacturer, pieces, product number, release year, source/confidence and editable fields. Unknowns remain null. Distinguish visible facts, unverified suggestions, and catalogue-verified data. Approve, edit, reject, and bulk approve reviewed records.
6. Duplicate detection: exact SHA-256 photo match, optional perceptual near-match, and candidate identity match based on normalized manufacturer/title/pieces/product number. Flag candidates for review; NEVER auto-delete. Multiple owned copies of one catalogue edition must be supported.
7. On approval, transactionally create or link a catalogue identity/edition as appropriate and create a *private* owner-copy record. Preserve provenance linking import item, original image, extracted suggestion, human edits and approval. No automatic public catalogue publishing.
8. Display batch summary: uploaded, identified, needs review, approved, imported, failed. Errors are actionable; partial failures don't discard other records.
9. Preserve existing warm Apple Books-like visual design, light/dark themes, 550 ms relaxed transition preference and reduce-motion support.

## Suggested backend routes (adapt to existing conventions)
POST /api/import-batches
POST /api/import-batches/{id}/photos
GET /api/import-batches/{id}
GET /api/import-batches/{id}/items
PATCH /api/import-items/{id}
POST /api/import-items/{id}/approve
POST /api/import-batches/{id}/commit

All routes require authentication and owner authorization. Use CSRF protections consistent with the project's session strategy. Enforce per-user storage quotas and upload limits; avoid timeouts by processing in bounded chunks, compatible with PHP shared hosting (no persistent worker required).

## Quality gates
- Unit tests for normalization, state transitions, extraction fixture, exact duplicate detection, invalid files and idempotency.
- Integration tests for authorization, transaction rollback, catalogue/edition/copy relationships and two distinct physical copies.
- Frontend tests for review edits, error states, progress counts, dark mode and reduce motion.
- Playwright E2E: upload 10 fixture images, review, correct an unverified title, approve, commit, verify 10 private copies; retry commit must not duplicate entries.
- k6 baseline smoke load test for batch/status endpoints; no production deployment without passing the project's `make ci` quality gate.

## Acceptance criteria
- Ten provided images import as ten separate physical copies by default.
- No edition year, SKU, condition, seal or completeness is fabricated.
- Unverified titles remain editable and clearly marked.
- Identical photo uploaded twice is flagged, not silently dropped.
- Two photos of the same edition can be kept as two owned copies.
- Interrupted upload can resume or retry without corrupting batch.
- Images and collection records are private by default.
- `make dev`, `make test`, `make ci` work or blockers are clearly documented; never claim unrun tests passed.

## Implementation order
First audit the existing repo. Then database migrations and fixture importer, backend routes, review UI, tests, and optional vision-provider integration. Report changes and actual command results. Do not deploy.
