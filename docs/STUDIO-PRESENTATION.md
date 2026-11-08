# Orientation and studio presentation

The importer preserves three separate owner-private assets: untouched Original, Corrected Front and transparent Studio. New accepted studio assets are the private gallery default; existing imported copies are not automatically changed. Details switch between Studio, Corrected Front and Original. No production deployment is authorized.

## Appearance and settings

Follow the supplied Scooby-Doo reference: an upright box resting on a studio surface, visible left side, small top surface and soft ground-plane contact shadow. The actual corrected photograph supplies the front. Simulated sides use neutral shading, conservative edge tint and upper highlights without invented text, logos or packaging artwork. No generative AI is used. Existing glare, wear, blur and imperfect crops remain visible; the reference's retouched artwork and printed side graphics are not reconstructed.

Import review offers Thin / Standard / Deep, Front / Three-quarter, Light / Dark / Transparent, Rotate Left/Right, measured dimensions, and an explicit studio-use checkbox. Disable studio use for flat corrected presentation. Unsaved settings block image decisions and approval. Presentation settings are independent of corrected/original pixels and are configured while the import draft is open; imported copies remain immutable.

`processing/studio_config.json` configures depth presets (25/40/55 mm), estimated long front edge (300 mm), cameras and materials. Standard depth is 40 mm. Three-quarter defaults to 12 degrees horizontal and 8 degrees downward with a distant virtual camera to limit distortion. Transparent 1200-pixel WebP assets and at-most-400-pixel thumbnails share artwork across CSS theme surfaces. Tests verify whole box/shadow bounds and portrait/landscape/square proportions. Physical iPhone appearance and shared-hosting throughput remain release checks.

Measured width/height/depth override estimates. Width/height must be supplied together and match corrected aspect within 2%; width anchors physical scale while exact photo aspect is retained, with entered height preserved in metadata. All values remain unverified presentation metadata, never verified edition specifications. All ten proofs use estimated fronts (300 mm long edge) and 40 mm depth; no actual measurements were supplied. Restart the worker and bump its renderer version when changing rendering configuration.

## Orientation

After EXIF correction and homography, local English Tesseract evaluates all four quarter-turns. Full-front and overlapping horizontal-band scans avoid fixed logo positions. Fuzzy manufacturer evidence includes Springbok, Ravensburger, Aquarius, Buffalo, Ceaco and White Mountain; common puzzle labels, readable direction, confidence and layout also contribute. Counts alone cannot decide orientation. Repeated tokens are deduplicated. TSV parsing disables CSV quoting so literal OCR quotes cannot consume subsequent rows.

Low OCR text confidence is informational. Orientation review is reserved for weak/conflicting rankings or incomplete scans. Close rankings retain source reading orientation. Manual angles, including zero, are absolute post-rectification turns and survive reload, retries, corner changes and reprocessing. Missing/invalid EXIF and a deliberately upside-down Springbok front have dedicated tests. Production scoring contains no fixture filenames or sample-specific angles.

## Architecture and lifecycle

The existing optional worker adds authenticated `/studio`, accepting image bytes rather than file paths. PHP stores settings/status/errors/dimensions and private asset keys in existing preprocessing JSON, without a reset migration. `POST /api/import-items/{id}/preprocessing/studio` validates owner and revision. Geometry changes regenerate studio assets; background/enable-only changes reuse transparent artwork. New files and quota accounting roll back on failure; old files are removed after commit. Original checksums and corrected pixels remain unchanged. Gallery GETs never render.

PHP/GD-only hosting remains supported: without `IMAGE_PROCESSOR_URL`, correction/manual rotation work and the collection uses corrected fronts with an explicit studio-unavailable message. Rendering outages retain previous assets; initial studio failure leaves flat image review available. Owner-authorized routes protect every variant. Existing layout, themes, keyboard behavior, Relaxed 550 ms motion and system-aware Reduce Motion are preserved.

## Visual proofs

`make inspect-studio` runs the actual project pipeline. Ignored outputs under `processing/artifacts/studio/` include:

- `studio-contact-sheet.jpg`: ten Original / Corrected / Previous / Improved rows.
- `studio-themes.jpg`: Original / Corrected / Studio Light / Studio Dark.
- `closeup-portrait.jpg`, `closeup-landscape.jpg`, `closeup-square.jpg`: enlarged geometry/material proofs.
- Per-photo images and `manifest.json`: orientation candidates, review flags, dimensions, camera, checksums and paths.

`processing/references/studio_v2.py` freezes the previous renderer and uses the same newly oriented fronts for a fair comparison. Canonical numbered fixtures exclude additional user-created Copy files without deleting them. Original photographs remain untouched. Cache signatures include source, algorithm/config versions and explicit manual angles. Optional `studio_report.py --rotate puzzle-09:0` persists a proof-only override; automatic proof results use no hidden overrides.

## Verification policy

During this development phase, run `make test-unit-dev` before `make dev`. It runs frontend, PHP and image-processing unit tests only, including ten real photos, OCR/EXIF/manual cases, depth/camera geometry, artwork/RGB preservation, transparency/shadows, thumbnail bounds, recovery and a 600-item synthetic renderer stream. That stream does not establish full-resolution 600-photo import throughput.

Keep the complete `make ci` build/static/unit/integration/browser/load gate for production promotion. An earlier full-gate attempt passed API integration but failed a browser depth-control locator. Explicit accessible labels were added; browser verification is deferred under the user's unit-only development instruction. Production readiness is not claimed.

Final development verification on 2026-11-07: `make test-unit-dev` passed 13 frontend tests, 11 PHP unit tests (71 assertions) and 25 OCR/rendering tests (134 seconds), for 49 unit tests total. An initial corner-input assertion counted the new dimension fields; it was corrected to assert the eight controls within the corner fieldset, and the complete unit target passed. `make dev` completed with all four services healthy and migrations applied. `make inspect-studio` regenerated all ten reference-aligned proofs and three enlarged aspect-ratio close-ups. Visual inspection found 10/10 upright images, zero orientation-review flags and no remaining visible orientation errors, including Springbok. All fixture dimensions remain estimated; zero measured fronts were supplied. The full production gate and physical-device checks remain pending. Nothing was deployed to production.
