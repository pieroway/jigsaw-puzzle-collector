# Individual collection-copy deletion

From Home or Collection, open a saved copy and choose **Delete this copy**. Review the title/copy ID and choose **Delete copy permanently**, or **Keep copy**. There is no Undo. Editing and deletion are separate actions.

Deletion removes the selected physical copy, its private corrections, notes and edit history. Shared puzzles, editions and other copies are retained. A minimal owner/copy/source deletion marker remains for idempotent requests and to prevent import retries from resurrecting removed copies.

## Photograph lifetime

- An active import batch retains source history and original/derived photographs, labelled **Removed from collection**.
- Deleting that batch removes an explicitly deleted copy's source when no remaining copy references that source. Deleting a batch by itself still preserves imported copies.
- If the batch was already hidden, deleting its last source-linked copy removes the retained source immediately.
- Files shared by another physical copy are retained. A registry carries original and retired derivative keys forward even after source metadata disappears.
- Unreferenced photos enter durable cleanup. Quota is released only after file removal succeeds. Failures remain queued and the UI offers **Retry photo cleanup**.

## Concurrency and access

DELETE requires the session owner, CSRF and the revision fetched before confirmation. Stale revisions return 409 and require explicit re-review. A repeated deletion by the owner is successful; another owner's or unknown copy ID returns 404. Owner-row locks serialize edit/delete/batch-cleanup transactions. A failed transaction rolls back the copy, history and marker together. Filesystem cleanup follows the database transaction.

## Verification

Local development verification uses `make test-frontend test-php-unit` followed by `make dev`. Unit coverage includes confirmation/cancellation/Escape, latest revisions, missing records, retained editing drafts, conflict handling, Home response ordering, Collection focus/totals, retryable cleanup, atomic rollback, owner-specific idempotency, asset-key validation and reference policies.

The API suite additionally covers CSRF, ownership, stale revisions, original checksums, shared photo references, both batch/copy deletion orders, cleanup quota and import retry protection. The browser import regression covers cancel/delete/reload and import retry without recreation. These remain in the full `make ci` quality gate; they are not claimed as locally executed during unit-only development verification. Physical iPhone confirmation/focus checks remain manual.
