# Bulk Photo Import MVP

New uploads now require [image preprocessing review](IMAGE-PREPROCESSING.md) before identity review. Compare the source and proposed image, adjust corners if needed, then choose **Use processed image** or **Keep original photo** to continue. Original photographs remain unchanged; all private derivatives count toward storage quotas.

iPhone JPEGs containing an MPF directory may be decoded as MPO. The optional processor uses their primary JPEG frame only; auxiliary images are not combined with the artwork. The untouched original retains all embedded data. A processing failure has no corner-confidence result: show the failure and retry controls without a low-confidence warning or a synthetic 0% score. In an existing failed review, **Detect corners again** retries preparation without re-uploading the photo.

## Use locally

Account access is now separate from importing: use **Log in** in the main header first (or **Create private account** on that account screen), then choose **Add**. Add is disabled while signed out. The header shows **Sign out** after authentication; the import workspace has no login form.

Run `make dev`, open the app, and use header **Log in** or create a private account (12–72 byte password). After authentication, choose **Add**, start a photo batch, and select or drop JPEG, PNG, or WebP files. Use the ten reference JPEGs in `docs/fixtures/puzzle-import/photos` for fixture identity suggestions; other images start with unknown identity fields. Identification remains deterministic fixture lookup. Local OCR assists reading orientation only; no live AI is enabled.

Review each photo and its proposed identity. Blank fields are unknown. Correct the title or other fields, save, and confirm **I reviewed this photo and its fields**. Approve individually or use **Approve reviewed records**, then **Import approved copies**. Every approved item creates a separate private physical copy, even when another copy uses the same edition. View them with **View private collection**. Signed-out users see the original illustrative gallery; signed-in users see their own persisted copies.

The active tab and selected batch resume after refresh. Server records are authoritative. Browsers cannot restore file handles after a refresh: reselect the same files to resume an interrupted selection. Retry keys are retained in local storage until the selection is registered, including successfully uploaded files so selecting the whole interrupted group again does not add those files twice. Once a selection finishes, selecting the same image again intentionally creates a new item and flags its exact hash match. Per-image errors do not discard other photos.

## Limits and privacy

Use **Delete batch** below the resume selector to remove an old batch. Confirmation deletes unimported photos and reviews while keeping puzzles already imported into your collection, including all their image variants. Deleted batches cannot be resumed. Source records needed by imported copies remain private internally. Photo storage is released after successful cleanup; a visible **Retry photo cleanup** action handles failures without losing retry information. Existing batches are not removed automatically.

- At most 100 images per batch, one file per HTTP request, 12 MB per image, 25 megapixels and 12,000 pixels per side. The pixel limit includes iPhone 5712 × 4284 photographs (24.47 MP). More batches allow a 600-photo collection without a collection-size cap. HEIC/SVG/GIF are not supported; convert to JPEG/PNG/WebP first. Physical iPhone picker behavior still needs a device check.
- The current collection query displays the newest 1,000 copies and the batch selector the newest 100 batches; pagination is still needed for browsing beyond those windows. These do not limit how many copies can be imported or stored.
- The default per-account storage quota is 1 GiB, configurable with `IMPORT_STORAGE_QUOTA_BYTES`. Originals and thumbnails count toward the quota. Rejected photos remain private and still consume storage; an account deletion/photo cleanup workflow is not part of this MVP.
- Originals retain their bytes and orientation metadata in the private Docker volume. Display thumbnails apply EXIF orientation, resize to at most 800 pixels, and remove source EXIF metadata. Downloading an original is owner-only and may include its original location/camera metadata.
- Private files live outside Apache's `public` document root under random storage keys. Only owner-authorized `/api/import-items/{id}/image` and `/original` routes serve them. IDs, filenames, and SHA-256 values are never used as public file paths.
- Session cookies are HttpOnly, SameSite=Lax. Every mutation, including login and registration, requires the per-session CSRF token. Login/registration attempts have a database-backed per-IP hourly limit. Local HTTP development uses `SESSION_COOKIE_SECURE=0`; shared hosting must use HTTPS and `SESSION_COOKIE_SECURE=1`. Password reset, email verification, MFA and comprehensive account lifecycle operations remain out of scope.

## Data and extraction boundary

The API authenticates and authorizes every batch, item, image, and collection request. Content-based MIME, image decoding, byte and dimension checks reject unsafe uploads before file storage. Random keys and owner checks prevent path traversal and cross-account reads. File writes are cleaned up on database failure. Per-owner locking serializes quota accounting and concurrent commits.

`ExtractionProvider::extract(localPath)` is the provider boundary. `FixtureExtractor` hashes image contents against the supplied fixture photos and reads their provisional metadata. Renaming a photo does not change its result. Unrecognized photos return null identity fields and unknown confidence. The raw suggestion, source/provider/confidence, human edits, approval snapshot, image, import item, and append-only review events preserve provenance.

All suggestions are unverified. The image is the visible evidence; fixture photo notes are labelled as transcriptions, not independent catalogue verification. No year, SKU, condition, seal or completeness is invented. An owner-reviewed draft stays private and does not become a verified public catalogue entry. Public catalogue publication is not exposed by this MVP. An existing catalogue-verified public edition may be explicitly linked when it is a candidate; another owner's private draft cannot be linked or read.

Exact SHA-256 duplicates and normalized manufacturer/title/pieces/product-number identity candidates are flagged; they are never removed automatically. Edition matching within the owner's private drafts also respects a differing release year. Identical edition details can share one edition while each approved item still gets a distinct copy. Perceptual near-match detection is optional and is not implemented.

A future vision adapter must be selected on the server, keep API keys in server configuration, require explicit per-user/per-batch consent before any photo is transmitted, record provider/model/version and uncertainty, and retain the same review boundary. No such adapter is enabled here, and this application sends no images to third parties.

## Shared-hosting execution and migrations

No Node server, queue daemon, or persistent worker is needed in production architecture. The frontend builds to static assets. PHP requests process at most five queued records or commit at most ten approvals. The UI repeats bounded requests and shows partial progress. Refresh or retry safely resumes queued work; transactions and a unique import-item/copy constraint make commits idempotent.

`make migrate` runs ordered SQL/PHP migrations with a database advisory lock and an applied-migration ledger. The additive column migration checks each operation so an interrupted DDL step can resume. MySQL DDL is not transactional: before using this migration outside local development, take a backup and validate backup/restore on staging. No down migration, destructive reset, or production deployment is supplied. `make dev` also applies outstanding migrations, including to existing starter volumes.

Shared hosting needs PHP 8.3 with PDO MySQL, Fileinfo, GD JPEG/PNG/WebP, EXIF and mbstring; a writable private storage directory outside the document root; the configured upload limits; HTTPS cookies; and same-origin `/api` routing to `public/index.php`. Configure `PRIVATE_STORAGE_PATH`, `FIXTURE_PATH`, database credentials and quota server-side. The fixture manifest/photos must remain server-side reference resources. The development Vite proxy is not a production server.

## Automated verification

Import unit tests and the ten-image browser acceptance test were established before substantial feature implementation. Their initial run failed on missing import classes/modules. The Makefile remains the entry point:

- `make test-fast`: static checks, frontend model/component tests, PHP unit tests.
- `make test-integration`: authentication, CSRF, ownership, duplicates, idempotency, partial failure/retry, quota, relationships and injected transaction rollback.
- `make test-e2e`: gallery/motion regressions, ten-photo review/import/resume flow, invalid-file recovery. Flaky browser tests fail the gate even if a retry succeeds.
- `make test-load`: existing health baseline plus authenticated batch-list/status baseline.
- `make test` / `make ci`: the full sequence; `ci` includes the static build.

Tests run under the separate `jigsaw-test` Compose project with its own database and photo/dependency volumes and no host ports. Mutation tests refuse to run against a database other than `jigsaw_test`. Test MySQL disables binary logging solely to allow the rollback test's failure-injection trigger without SUPER privileges. Development data is not reset. CI shuts down both projects. Test volumes retain their own records between runs; no automatic destructive cleanup is performed.

Final local verification on November 7, 2026:

| Command/check | Actual result |
|---|---|
| `make dev` | Passed; development services healthy and migrations applied to the existing volume |
| `make ci` | Passed, exit code 0; includes the `test` target and static build |
| Static frontend build, TypeScript/ESLint, all PHP syntax | Passed |
| Vitest model/component/unit tests | 9 passed |
| PHPUnit unit suite | 7 passed, 26 assertions |
| PHPUnit API/database integration suite | 9 passed, 96 assertions |
| Playwright Chromium | 13 passed with no retries in the final gate |
| k6 health baseline | 81/81 checks; 0 failed requests; p95 5.08 ms |
| k6 authenticated batch/status baseline | 146/146 checks; 0/149 failed HTTP requests; p95 25.59 ms |

Both k6 runs used three virtual users for eight seconds and enforced the 800 ms p95 and failure-rate thresholds. The browser suite includes the ten-photo edit/review/approve/import case, retrying commit, real mid-upload interruption/reselection, intentional duplicate warning, invalid-file replacement, private copy navigation, light/dark/reduced motion, and eight rapid reduced-motion gallery returns. The final gate treats any flaky browser result as failure. Earlier failures were investigated and fixed rather than skipped. Screenshots are local ignored artifacts under `tests/e2e/artifacts/`.

Missing release checks include Safari/Firefox, physical iPhone/Android, screen-reader/manual accessibility checks, broader upload fuzzing, stress/soak testing, and a shared-hosting staging rehearsal. Perceptual duplicate matching, remote vision extraction, photo cleanup and account recovery remain unimplemented. No production deployment was performed.

The test-tool update removed the reported high/critical dependency findings. Seven moderate transitive lint-tool advisories remained after a nonbreaking `npm audit fix`; no forced dependency upgrade or audit suppression was applied.
