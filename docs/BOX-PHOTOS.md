# Box photos

Puzzle details display a photo slider with one clickable dot per photo. Photos fit a consistent 240px-high viewport. Swipe left or right to cycle with a 280ms sliding transition, wrapping at either end; vertical scrolling and pinch zoom remain available. Arrow keys work when the carousel is focused. Reduced-motion preferences disable the slide movement. The original slide retains Original, Corrected Front, and Studio views.

**Delete this photo** and **Add photo** buttons appear directly below the gallery on the right. Dots overlay the bottom of the photo. Add opens the file picker and uploads immediately, then shows the added image. Delete removes the current additional photo. The cover and its Original, Corrected Front, and Studio views cannot be deleted. There are no names, numbered controls, or management panel. Each box supports eight photos; Add is disabled at the limit. JPEG, PNG, or WebP uploads follow the existing 12 MB, pixel, and account storage limits.

Photos remain private. The original cover remains in the gallery and retains its import provenance. Removing additional photos schedules file cleanup. Deleting a copy schedules all additional photos for cleanup. Bulk import continues to create one copy per imported photo.

Migration: `008_copy_photos.php`, applied through the normal runner.

Authenticated API routes (mutations require CSRF):

- `GET /api/collection-copies/{copy}/photos`: list photos.
- `POST /api/collection-copies/{copy}/photos`: multipart `photo`.
- `DELETE /api/collection-copies/{copy}/photos/{photo}`: remove a photo from the gallery (`original` for the import photo).
- `GET /api/collection-copies/{copy}/photos/{photo}/image`: display an additional photo.

Tests: `BoxPhotos.test.tsx`, `CopyPhotosIntegrationTest.php`, and `tests/e2e/box-photos.spec.ts`.

## Image delivery and upload performance

Gallery, Home, and details request WebP display images using 480/960/1440-pixel density candidates. Originals stay untouched. Small Original views use the existing oriented, uncropped preview; higher-density requests can resize the preserved original. Corrected and Studio views resize their corresponding assets, preserving transparent backgrounds. Display responses are generated on demand and add no persistent cache files or storage migrations.

Image responses use private browser caching with ETags and mandatory revalidation. Ownership is checked before a 304 response, so cached URLs do not bypass sign-in, deletion, or account isolation. API JSON responses remain no-store. Image delivery and uploads release the PHP session lock after authentication and CSRF checks; database transactions still serialize changes that require owner/quota locks.

The slider preloads its previous and next images with the same density candidates, except on Save-Data or slow connections. Images decode asynchronously. Uploads validate and decode once during storage instead of decoding the full image twice. Full originals still transfer during upload, so initial upload time depends on the file size and network. No browser-side downsampling discards original detail.

## Cover preference

Profile offers Studio, Corrected, Original, and User selected. The first three apply across Home, Collection, and the initial details view. User selected remembers the cover view chosen in each puzzle's details. A missing version falls back to an available image. Preferences are saved in this browser; per-puzzle choices are keyed by owner and copy and are not synchronized between devices.

Profile option highlights slide between choices in 360ms, retaining the surrounding control?s corner radius. These indicators remain animated even with Reduce Motion On. Reduce Motion On removes photo-slide movement; System follows the device preference, and Off explicitly enables full motion. Other reduced-motion behavior includes removing the sample collection-to-details zoom and card hover movement, replacing notification movement with short fades, and shortening remaining transitions.

## Collection loading

Collection keeps the same banner during session checks, loading, failure, and successful loading. A centered spinner occupies the content area below it. If session or collection loading fails, an icon, message and Retry button replace the spinner in that same area. Failed requests never masquerade as an empty collection or signed-out sample collection.

API reads time out after 15 seconds and may be retried. Superseded Collection reads are canceled and ignored. Mutation requests keep their existing completion behavior so a timeout does not imply that a save failed after it may have committed. Profile settings now use restrained 4px corners.
