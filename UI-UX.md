# UI/UX Specification — Jigsaw Puzzle Collector

## Visual direction

Warm, richly tactile Apple Books-inspired interface: ivory light surfaces, charcoal dark surfaces, generous breathing room, elegant typography, softly rounded cards, understated shadows, photography-forward layouts. See `docs/design/mockups/` for approved visual references. They are concept references, not pixel-perfect source files.

## Navigation

Five tabs: Home, Collection, Add, Explore, Profile. Collection shows illustrative data when signed out and private imported copies when signed in. Add hosts the Bulk Photo Import MVP; Profile provides preferences. Home and Explore remain labelled previews. The active tab is restored locally after refresh.

The main header shows **Log in** when signed out and **Sign out** when signed in, on every screen and on mobile/desktop. Header login opens a separate account screen with login and account creation. Add is disabled until a session is confirmed, and remains an import-only workspace with no login form. A stored Add tab cannot bypass this gate. Successful login opens the private collection and enables Add; successful sign-out closes private views and disables Add while preserving server records/preferences. Do not duplicate account controls in content or the sidebar. On phones, the decorative tagline gives way to the account control. Disable repeat requests and navigation while login is pending; show retryable errors without granting collection access. Reuse existing session/CSRF auth endpoints.

On mobile/tablet layouts, size the app to the dynamic viewport and place bottom navigation in normal flex layout so Safari chrome cannot push it below the visible screen. Reserve top/bottom safe-area insets for the camera/status area and Home indicator, plus left/right insets in landscape. Gallery and detail scroll regions must fit between the safe header and navigation. Keep navigation available throughout the range where the desktop sidebar is hidden. Physical iPhone verification is required for Safari, Home Screen mode and orientation changes.

Portrait iPhone/WebKit touch layouts add a configurable 20 px opaque clearance below the reported top safe area, moving header controls below the browser's blurred edge. Mobile bottom navigation reduces its reported bottom inset by 20 px, clamped to zero to avoid negative padding/clipping. These refinements move the header up and the footer down relative to the previous spacing; desktop remains unchanged. Detail overlays share the adjusted offsets. Avoid applying backdrop blur to the header itself. This is a content-spacing mitigation; disabling the browser's own visual effects is not claimed. Verify on a physical phone after refresh.

## Photo import

The resume selector has a **Delete batch** action. Confirmation explicitly states that unimported photos/reviews are permanently removed and imported collection copies/photos are retained. Disable deletion while work is active. After deletion, clear the batch's local resume data and select the next available batch; empty history offers a new batch. If private photo cleanup fails, show a retry action and retain quota accounting until cleanup succeeds. A failed deletion keeps the current batch and resume data available.

Image review includes **Rotate Left** and **Rotate Right** controls for reading orientation. Each click regenerates the corrected image from the source using an absolute quarter-turn, saves it as a manual choice, and requires image selection again. Disable rotation while unsaved corner edits exist or processing is busy. Display **Orientation needs review** with the OCR/fallback reason when evidence is uncertain. Saved manual orientation has a visible label and survives reload, corner redetection and reprocessing, including an explicit 0° choice. The Before overlay remains in EXIF source coordinates. Controls use existing button styles, light/dark tokens and system-aware Reduce Motion; rotation changes are not animated.

Use the same warm surfaces, system sans-serif typography, rounded photo cards and light/dark tokens. Add provides private sign-in, resumable batches, a multi-file picker/drop area, per-image errors/retries, progress and editable review cards. Label fixture output as unverified suggestions and photo notes as transcriptions; never imply live AI or catalogue verification. Require explicit review confirmation before approval. Keep possible duplicate photos as separate physical-copy candidates. Block bulk approval/commit while corrections are unsaved. See `docs/BULK-PHOTO-IMPORT.md`.

The new flow is upload → preprocessing → image review → identification → identity review → import. Image review presents Before (orientation-corrected preview) and After (proposed catalogue image) side by side on wide screens and stacked on phones. Overlay all four outer corners on the Before view. Each handle supports dragging and arrow keys; labelled X/Y percentage inputs provide an alternative. Apply corners regenerates the proposal and requires a new image decision. The boundary score is explicitly heuristic, not a calibrated probability; portable detection and scores below 0.65 are flagged for checking.

Offer **Use processed image** and **Keep original photo**. Neither is preselected, and puzzle identification waits for a choice. Show image-review counts in batch progress. Preserve every original with an owner-only download link. Invalid/crossed corners, processing failure and stale revisions have actionable errors. Existing historical reviews remain usable; reprocessing an older draft is an explicit action labelled as starting a new review. Use existing warm surfaces, system font stack, light/dark tokens and Reduce Motion controls; do not introduce motion to communicate processing status.

## Collection

Signed-in collections use the sample gallery's visual hierarchy: matching page heading/settings button, three summary cards, section heading, icon search field, horizontal filter pills, collection toolbar and polished gallery/list cards. Totals show saved physical copies, distinct known manufacturers and the sum of known piece counts; do not invent wishlist counts. Pills use actual manufacturers (plus Unknown maker when needed), since imported records do not yet have theme classifications. Additional filters select piece count, including Unknown; sorting offers newest, title and piece count. Search includes title, manufacturer, pieces, product number and year. Preserve image aspect ratios, studio surfaces and metadata styling in both views. Returning from details restores search, filters, sort, view mode, scroll and focused card. Keep existing mobile safe-area offsets and Reduce Motion behavior.

The private collection uses the accepted studio presentation by default when available and enabled. Preserve the Apple Books-inspired card layout and consistent long-side scale. Transparent box/shadow assets sit on CSS warm ivory or muted charcoal surfaces; explicit Light/Dark overrides work in either app theme. Side/top surfaces and shadows are labelled simulations, with unchanged printed artwork. Existing copies without studio assets retain their prior presentation.

Follow the supplied Scooby-Doo comparison: an upright box resting on a neutral surface, visible left side, small top edge and soft contact shadow at the base. Preserve the photographed front, including its existing lighting and wear. Simulated side faces remain unbranded; do not copy or invent the reference's side-panel graphics.

Import review displays Original/Corrected and a Studio preview. Controls offer Thin/Standard/Deep, Front/Three-quarter, Light/Dark/Transparent, an explicit studio-use checkbox and optional measured width/height/depth. Clearly distinguish estimated sizes from user-supplied, unverified measurements. Save presentation independently; block approval/image choices while settings are unsaved. Show actionable rendering warnings and keep the flat corrected image available. Rotation uses existing Left/Right controls. Low OCR text confidence is informational; an orientation-review warning is reserved for ambiguous rankings or insufficient evidence. Details switch between Studio, Corrected Front (straight-on) and Original, with an untouched-original download. Preserve Relaxed 550 ms motion, system-aware Reduce Motion, keyboard focus and scroll restoration.

Two-column cards on phones, adaptive grid on wider screens. Search, filter chips, gallery/list switch, piece count and manufacturer visible without entering details. Preserve gallery scroll, search and filter when returning from a puzzle.

## Details

Hero image, title, publisher/edition, owned badge, piece count/year/size, condition, storage, acquisition and value define the target details layout. Signed-out values remain illustrative. Imported-copy details use private photos and owner-reviewed metadata, label missing fields Unknown, and leave unimplemented copy attributes unset. Back and Escape return to the gallery with scroll/focus restored.

## Motion

Default **Relaxed 550 ms** shared-element-like gallery → details transition; reverse navigation is slightly quicker. Settings: **System / On / Off** Reduce Motion. System follows OS `prefers-reduced-motion`; On replaces spatial movement with a short crossfade; Off enables normal motion even when OS prefers reduction (explicit override). Never make motion necessary to understand state changes.

## Accessibility

Focus-visible rings, keyboard activation, semantic buttons, descriptive labels, contrast-aware colours, text scaling and reduced-motion. Verify WCAG 2.2 AA with automated and manual audits before release.

## Design tokens

See `docs/design/DESIGN-TOKENS.md` and `frontend/src/styles.css` for implementation. Light/dark mode: System default with manual override stored locally. Animation speed can be changed in the prototype; product default is 550 ms.
