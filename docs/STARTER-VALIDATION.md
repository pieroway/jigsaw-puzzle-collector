# Starter validation — November 7, 2026

Historical foundation audit: the subsequent [Bulk Photo Import MVP](BULK-PHOTO-IMPORT.md) supersedes the account/upload/persistence limitations below. Its final full quality gate passed, including the repeated reduced-motion navigation regression; the earlier focus issue described below no longer blocks that gate.

The starter is a sample-data UI, a PHP health endpoint, and a four-table MySQL schema. It does not yet persist the displayed collection. No production deployment was performed. This directory currently has no Git repository metadata, so branch/diff review is unavailable.

## Corrections

- Split Vite and Vitest configuration to resolve incompatible plugin types without suppressing type checks.
- Allow the specific Docker `frontend` hostname for browser tests; retain Vite's host protection. Enable polling for Windows Docker bind-mount updates.
- Use a relative API base and Vite same-origin proxy for localhost and LAN clients; remove the localhost-only CORS header.
- Add API/frontend health checks and make development startup wait for readiness.
- Install PHP extensions required by PHPUnit, plus Composer extraction tools.
- Keep the gallery laid out but inert and invisible beneath details so reverse animation has real card bounds; preserve search and scroll.
- Move keyboard focus into details and restore it to the opening card; prevent sidebar navigation from interrupting a flight animation.
- Add 120 ms reduced-motion entry/exit crossfades, remove hover translation, and cancel spatial flights if the system preference changes to reduced motion.
- Disable Back during a flight so it no longer presents an enabled control that silently ignores clicks.
- Retain dependency lockfiles and use `npm ci`; repair root package metadata that contained lockfile fields.
- Include static build and read-only HTTP/database integration tests in `make ci`; enforce k6 check failures as a threshold. Exclude generated build output from source linting.
- Correct TDD's table count from five to four.

## Verification

Final `make ci` completed with exit code 0 after the fixes:

| Check | Result |
|---|---|
| Docker API image + static frontend build | Passed |
| TypeScript, ESLint, PHP syntax | Passed |
| Vitest | 3 tests passed |
| PHPUnit unit target | 1 test, 1 assertion passed |
| PHPUnit full API/database suite | 3 tests, 9 assertions passed (includes the unit smoke test) |
| Chromium Playwright | 9 tests passed, no retries needed in final run |
| k6 health baseline | 3 virtual users, 8 seconds; 81/81 checks passed; 0 failed requests; p95 5.92 ms against the 800 ms threshold |
| `make dev` and `make restart` | Completed; API, MySQL and Vite healthy |

Browser coverage includes gallery/details/back, Escape and focus restoration, search/category/scroll preservation, two-column mobile gallery and list mode, system dark theme and persisted manual override, OS reduced motion and explicit On/Off, 550 ms opening and 429 ms reverse flight, and same-origin API requests. Light/dark mobile gallery/details screenshots were captured and visually inspected. They are written to `tests/e2e/artifacts/`; these are review artifacts, not pixel-comparison baselines.

Earlier gates failed on the Vite/Vitest type mismatch, Docker hostname rejection, an enabled Back button ignoring input during animation, and focus restoration timing. These were corrected and the complete gate rerun; failing checks were not skipped. The first blocked hostname test run was stopped explicitly before restarting services.

Localhost and the host's Wi-Fi IPv4 (192.168.2.21) both returned HTTP 200 for the UI and healthy JSON from `/api/health` during this audit. The user also confirmed that the collection opens from a second device on the same Wi-Fi.

## Design comparison and incomplete features

Typography update: the subsequent approved system font stack replaces the serif headings and DM Sans mentioned in the original comparison below. All UI text now uses `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif`; the external Google Fonts import was removed.

Typography verification: lint/typecheck and static build passed, and light/dark mobile screenshots were reviewed. Browser reruns exposed intermittent focus-restoration failures in reduced-motion navigation (including the scroll/category test). One later full gate exited successfully with eight passing browser tests and one passing on retry, which is not a clean browser result. Exploratory navigation changes did not establish a reliable fix and were reverted; this focus issue remains open. The clean baseline results above describe the earlier starter validation, not a guarantee that the focus tests are stable.

The ivory/charcoal palette, rounded artwork cards, collection-first layout, and five-tab navigation retain the Books-inspired direction. The implementation uses serif display headings, separate stat cards, category chips and original illustrated placeholders. The mockups use sans-serif titles, real box photography, manufacturer/vintage/favourite filters, and card favourite actions. Details lack the mockup's image carousel, zoom, photo thumbnails, cut fact, editable rows, and overflow actions. Favourite and sorting/filter controls are previews. These are deviations, not implemented features.

`docs/design/mockups/design-exploration.png` depicts an unrelated AI chat product and is inconsistent with the puzzle-specific references; it was not used as an application requirement.

Accounts, catalogue search, owned-copy CRUD, uploads, import/export, sharing, moderation, and real valuations remain planned. Home/Add/Explore are previews; Profile provides local preferences. No PWA manifest, service worker, offline cache, migration runner, DB seed, or isolated test reset exists. Initial SQL runs only when MySQL initializes an empty volume. Integration tests are read-only against the development schema; mutation tests require an isolated test database first.

## Coverage still needed

- Physical iOS/Android interactions, Safari/Firefox, screen-reader and manual WCAG 2.2 AA checks.
- Approved visual regression baselines, text zoom/contrast audits, and large collections (500+).
- Auth/security/upload/CRUD tests once those features exist; incremental migration, rollback, and shared-hosting staging checks.
- Stress/spike/soak tests. Current k6 coverage is only a short health-endpoint baseline.

PHP health reports API availability only; DB connectivity/schema are checked separately by the integration suite. The static frontend build remains compatible with PHP/MySQL shared hosting without a persistent Node server.
