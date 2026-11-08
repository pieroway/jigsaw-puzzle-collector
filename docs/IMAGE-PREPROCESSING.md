# Image preprocessing

Use **Add** as before. New uploads first enter image review, where you can compare the EXIF-oriented source preview with a proposed crop/enhancement. Drag the four corner handles, use their arrow keys (1% steps), or edit the eight X/Y percentage fields. Click **Apply corners**, then choose **Use processed image** or **Keep original photo**. Identification starts only after that explicit choice. Low-confidence proposals need particular care. Boundary scores are heuristic and do not guarantee a correct crop.

The original file stays byte-for-byte intact in private storage. Orientation is corrected only in derivatives. The original download retains its original EXIF metadata, including any camera/location information. Catalogue images are progressive JPEGs up to 1,600 pixels (1,200 with the portable engine); thumbnails are at most 400 pixels. Source previews are up to 1,600 pixels. All variants remain owner-authorized and quota-accounted. Nothing is published automatically.

## Optional OpenCV and shared hosting

- `make dev` starts PHP/MySQL/React plus the internal OpenCV processor.
- `make dev-php` runs the PHP/GD-only mode; no Python service is required. On shared hosting, leave `IMAGE_PROCESSOR_URL` unset/empty. Existing GD/EXIF extensions are sufficient for the portable path.
- `IMAGE_PROCESSOR_URL` and `PROCESSOR_KEY` are server-side configuration. The Compose default key is development-only. The processor has no published host port, filesystem-path request API, or database credentials. It receives bounded image bytes and normalized corners, and returns JPEGs and metadata. Do not point it at a third party without a separately reviewed consent/privacy flow.
- `make test-preprocess` runs the Python/OpenCV suite. PHP fallback tests run in `make test-unit` and integration tests; these do not require Python in the PHP image.
- `make inspect-preprocess` creates `processing/artifacts/fixture-preprocessing.jpg` and coordinate metadata for local visual inspection. These artifacts are ignored by Git.
- `make ci` runs the complete build/static/unit/integration/browser/load gate, including preprocessing tests. Tests use isolated database/photo volumes. No deployment target is added.

OpenCV uses edge contours, polygon approximation and classical foreground segmentation to propose the outer lid boundary. The four-point homography rectifies the photographed quadrilateral; it cannot infer the true physical aspect ratio from an uncalibrated camera or repair glare/occlusion. Local Tesseract evaluates 0/90/180/270-degree reading orientations after rectification, including photos without EXIF. Conflicting/weak OCR is flagged for review; close rankings retain the source reading orientation. Use **Rotate Left/Right** to save a manual correction that OCR and reprocessing cannot overwrite. Manual corners resolve uncertain geometry. The portable detector is simpler and always flags automatic proposals for corner review; PHP-only mode also flags absent OCR but supports saved GD rotations. No provider can guarantee boundary detection or upright lettering on arbitrary artwork.

Corrections are limited photographic operations: exposure gain 0.95–1.25, neutral-pixel white-balance gains 0.92–1.08, contrast 1.03 and modest sharpening. There is no generative AI, image synthesis, inpainting, logo/text reconstruction or replacement artwork. The untouched source and before/after comparison allow the owner to reject unwanted changes.

## Persistence and safety

Migration 004 is additive-only. Existing human reviews/approvals and imported copies are preserved; only new uploads and explicit reprocessing use the new stage. Explicit reprocessing resets that draft's approval and requires review again, while saved identity corrections survive re-identification. Imported copies cannot be reprocessed in place. Stale image revisions are rejected with 409. A failed processor does not silently substitute a different crop: retry or explicitly keep the source photo.

Original SHA-256 remains the exact duplicate key and fixture lookup context. The fixture provider does not become real OCR merely because a photo was processed. Actual identification input is the selected derivative/source; processing revision and image choice are recorded alongside extraction and in copy provenance. Private derivative files use random keys, sanitized owner-only routes, quota checks and cleanup after rollback. Old proposal files are replaced only after a successful regeneration; original photographs are never replaced.

## Verification

Tests were added before implementation and initially failed because the pipeline module was missing. The OpenCV suite checks all ten supplied photographs against independently reviewed approximate corner annotations, plus synthetic geometric and poor-light cases. PHP tests process all ten source photos, check manual homography, original preservation and invalid corners. Browser tests cover low confidence, all four numeric corner controls, keyboard adjustment, acceptance/rejection, image-review resume, and ten private copies with idempotent commit.

The ten-photo contact sheet was visually inspected; that review caught two initially incorrect proposals and led to stronger boundary regression assertions. Automatic detection remains a proposal that always requires explicit human image selection.

Local verification on 2026-11-07: `make ci` completed successfully: production build, TypeScript/ESLint/PHP syntax checks, 8 OpenCV tests, 11 frontend tests, 10 PHP unit tests (65 assertions), 11 integration tests (132 assertions), all 16 Playwright tests on their first attempt, and both k6 baseline load gates (zero failed HTTP requests). An earlier run exposed a cross-account upload gap-lock deadlock; the redundant missing-key lock was removed while owner/batch locks were retained, and a four-account concurrent-upload regression now passes. No failing gate was bypassed.

`make dev-php` and `make dev` both started successfully with healthy API responses; the standard OpenCV development stack was restored. `make inspect-preprocess` generated the visually inspected 2560 × 2700 contact sheet for all ten photographs, with clean EXIF-oriented original previews beside corrected images. Source files remain untouched. `make help` was also corrected and verified for the Windows command shell.

Physical iPhone, Safari/Firefox, manual screen-reader/contrast checks and shared-hosting staging performance remain release checks. The portable detector is less capable and deliberately flags every automatic proposal. Identification remains fixture-assisted rather than general OCR. No production deployment was performed.

Algorithm references: [OpenCV geometric transforms](https://docs.opencv.org/4.x/da/d54/group__imgproc__transform.html), [OpenCV contour features](https://docs.opencv.org/4.x/dd/d49/tutorial_py_contour_features.html).
