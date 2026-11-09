# Editing existing collection copies

Open a private puzzle from Home or Collection and choose **Edit**. Correct title, manufacturer, piece count, product number or year, or record this box's condition, seal, completeness, storage location and notes. Save updates this copy only. Cancel discards the draft; private data is not stored in browser draft storage.

Title is required (255 characters). Manufacturer/product number limits are 160/100 characters; pieces allow 1–100,000, release year 1800–2100, storage 255 characters and notes 5,000. Nullable fields can be cleared to Unknown. Box condition: New/Excellent/Good/Fair/Poor; seal: Sealed/Opened; completeness: Complete/Incomplete/Not checked. Notes are plain text. Pricing, photo replacement, edition/catalogue editing and a visible history screen are outside this MVP.

Migration 006 is additive and resumable. Metadata corrections are private JSON overrides on `owned_copies`; missing keys inherit source metadata and explicit null clears a field. Physical attributes use existing copy columns. The shared collection serializer and global Home aggregates resolve the same effective values. Original import approvals, edition linkage, provenance and photo bytes are unchanged.

Owner-authorized `GET /api/collection-copies/{id}` returns the latest copy and revision. `PATCH` accepts `{revision, fields}` with changed editable fields only, checks CSRF/ownership, locks the copy and saves its revision/history transactionally. A no-op creates no history; stale writes return 409 and leave the server record unchanged. Loading conflicting values requires explicit draft discard. The history table stores before/after fields, owner, revision and timestamp separately from immutable import records.

Tests are included in `make test-frontend` and `make test-php-unit`. The API integration suite and existing mobile import browser test add editing, copy isolation, explicit clears, CSRF/ownership/revision, history and original-image checks for the full `make ci` gate. During development run relevant unit tests before `make dev`; do not claim the API/browser gates passed unless they ran.
