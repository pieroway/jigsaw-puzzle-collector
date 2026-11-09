# Product Requirements Document — Jigsaw Puzzle Collector

Status: Foundation plus Bulk Photo Import MVP, November 2026. The import acceptance criteria in `docs/fixtures/puzzle-import/CODEX-TASK.md` extend this baseline.

## Vision

A delightful, serious, free collector-first database for physical jigsaw puzzles. Users can inventory hundreds or thousands of boxed puzzles with low-friction data entry. No subscriptions or collection-size caps.

## Personas

- Large-scale collector with 500+ puzzles, interested in preserving boxes, variants and provenance.
- Theme/manufacturer/vintage specialist.
- Casual collector who wants an attractive gallery and wishlist.

## Domain model

1. **Puzzle identity**: canonical design/artwork, title, subject and creator where known.
2. **Edition/release**: publisher, SKU, UPC/EAN, year, piece count, dimensions, cut, language/market, box art and distinguishing variations.
3. **Owned copy**: one physical object owned by a user; multiple copies of one edition supported. Seal, completeness, box condition, acquisition, storage, value, notes, photos, provenance and privacy belong here.

## Key features (planned)

- Global community-maintained searchable catalogue with edition-level disambiguation and moderation.
- Private collection, favourites, wishlist and selectively shared public collection pages.
- Gallery, compact and list views; filters for manufacturer, year, condition, pieces, theme and storage location.
- Add by catalogue lookup, manual entry, CSV import and bulk edit; barcode and photo-assisted identification later.
- Owned-copy detail and edit flows; front/back/side box photography, condition, seal, missing pieces, purchase history and value.
- Accessible mobile-first PWA with offline-friendly navigation; export/backup and account deletion.

## Release sequence

- **Foundation (included)**: docs, mockups, Docker/Make, React design system and interactive sample-data gallery/details.
- **Bulk Photo Import MVP (included)**: private session accounts, original/thumbnail storage, fixture-assisted identification, editable human review, duplicate warnings, resumable batches and private copy persistence.
- **Batch management**: owners can confirm deletion of old batches. Remove unimported drafts/photos while preserving imported collection copies, their images and provenance. Hide deleted batches from resume/history; retry failed private-photo cleanup safely without releasing quota prematurely.
- **Image preprocessing**: before identification, create an EXIF-oriented, outer-box crop with four-point perspective correction, conservative photographic adjustments, and optimized catalogue/thumbnail derivatives. Require explicit processed/original selection, flag uncertain boundaries, and allow manual adjustment of every corner. Originals remain byte-for-byte intact; no generative reconstruction is permitted. Existing reviewed/imported records are not retroactively changed.
- **Studio presentation**: deterministic physical cuboids using corrected fronts, neutral top/right sides, configurable cameras, soft shadows and transparent WebP assets. Default estimated depth is 40 mm, with Thin 25 mm / Standard 40 mm / Deep 55 mm presets. User-supplied dimensions override estimates without becoming verified catalogue specifications. Import review offers depth/view/background and studio/flat controls. Accepted available studio assets become the private gallery default; details switch between Studio, Corrected Front and Original. Preserve layout, themes, motion, original photographs and existing imported records. See `docs/STUDIO-PRESENTATION.md`.
- **First vertical slice (next)**: persistence, authentication, edition search, owned-copy CRUD, photo uploads and full automated gates.
- **Later**: CSV import, public sharing, moderation, barcode and photo identification.

## Non-functional requirements

Owners can edit existing physical copies from the shared Home/Collection details screen. The MVP supports private title/manufacturer/piece-count/product-number/year corrections plus box condition, seal, completeness, storage and notes. Corrections affect only the selected copy; shared identities/editions, other copies, original photographs and immutable import provenance stay unchanged. Use optimistic revisions to prevent silent cross-device overwrites and record successful edits in separate history. Save updates cards, search/filter data and Home totals; Cancel discards the draft. Warn before unsaved Back/Escape/tab/sign-out/browser navigation. Photo replacement, pricing/valuations, canonical catalogue editing and history UI are deferred.

Home is a personal overview, separate from the complete Collection library. Authenticated Home shows exact owner-wide puzzle/manufacturer/known-piece totals, up to three unfinished import batches with actionable state counts, and the six newest physical copies. Batch actions resume the selected batch; recent cards reuse existing private Puzzle Details and restore Home focus/scroll on return. Hide finished/deleted batches. Signed-out Home explains the app and links to the illustrative collection; adding remains disabled until header authentication. Include loading, retryable error and first-puzzle states. Do not fabricate wishlist, recommendations, completion activity or valuations.

Authentication belongs in the main header/account screen, separate from Add. Show Log in when signed out and Sign out when signed in. Disable adding/importing until authenticated; keep backend owner/session/CSRF enforcement. Protect mobile header controls from safe-area and browser-edge blur with opaque clearance and consistent detail positioning.

Reading orientation is evaluated after rectification at all four quarter-turns using local OCR, readable direction, manufacturer names and packaging labels. Do not hardcode fixture corrections or logo positions. Low text confidence is informational; require orientation review only for genuinely weak/conflicting rankings or incomplete scans. Preserve manual angles, including zero, across reload/reprocessing. PHP-only mode supports manual rotation and corrected-front presentation without requiring Python. Studio framing maintains consistent apparent scale and safe shadow margins across portrait/landscape/square boxes.

- Free for all users; no artificial item cap.
- Privacy by default: owned-copy location, price and notes private unless explicitly shared.
- Fast browsing for 500+ items, responsive mobile layout, keyboard and screen-reader access, reduced-motion support.
- Tests and static checks mandatory for production promotion, including baseline load tests; never bypass a failed gate.

## Out of scope for current starter

The Bulk Photo Import MVP now adds local session accounts, private photo uploads, fixture-assisted review and persisted private owned copies. Full catalogue search/moderation, canonical catalogue editing and copy management beyond the editing MVP, monetary valuations, CSV import/export, production hosting and production deployment remain out of scope. See `docs/BULK-PHOTO-IMPORT.md` for exact scope and limits.
