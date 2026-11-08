# Jigsaw Puzzle Collector

A free, mobile-first puzzle collector. **Foundation + Bulk Photo Import MVP.** Signed-out browsing uses illustrative sample data; Add now supports private accounts, photo batches, fixture-assisted review and persisted physical copies. PWA/offline support, general catalogue editing and real valuations remain planned.

## Start (Windows 11 / WSL2 + Docker Desktop)

1. Install Docker Desktop with WSL integration and GNU Make inside WSL2.
2. Copy `.env.example` to `.env` if absent (`Copy-Item .env.example .env` in PowerShell, or `cp .env.example .env` in WSL), then run `make dev`. GNU Make and Docker Desktop also work directly from PowerShell.
3. Open **http://localhost:5173** for the React UI and **http://localhost:8080/api/health** for the PHP API.
4. `make logs`, `make stop`, `make test-fast`, `make ci`, `make help`.

The initial run downloads Docker images and dependencies. `make dev` waits for service health checks. See [starter validation](docs/STARTER-VALIDATION.md) for actual verification and remaining gaps.

For another device on the same Wi-Fi, open `http://<this-PC-Wi-Fi-IPv4>:5173`. Vite binds to all interfaces and proxies relative `/api` requests to PHP, so the browser never needs a localhost API URL. The Windows firewall must allow inbound TCP 5173 on your private network; guest Wi-Fi isolation or VPN policy can also prevent access. Check from a physical second device before considering LAN access verified. The API is also published on port 8080 for local diagnostics. The Vite proxy is development-only; shared hosting must serve static build assets and route `/api` to PHP on the same origin.

## Included

- **Studio presentation:** manufacturer-aware upright orientation, saved manual rotations, configurable millimetre box depths and cameras, transparent WebP assets, private studio gallery images and Original/Corrected/Studio details. See [the studio guide](docs/STUDIO-PRESENTATION.md). During development use `make test-unit-dev` before `make dev`; reserve the full quality gate for production promotion.

- **Photo preprocessing:** optional OpenCV processing, PHP/GD shared-hosting fallback, four-corner editing, before/after review and preserved originals. See [image preprocessing](docs/IMAGE-PREPROCESSING.md). Use `make dev-php` for development without Python.

- **Bulk Photo Import MVP:** authenticated private uploads, fixture identification, editable review, duplicate candidates, resumable batches, transactional/idempotent commit, and a private photo collection. Read [the feature guide](docs/BULK-PHOTO-IMPORT.md) for limits, routes, test isolation, and the future vision-provider boundary. No live AI or public catalogue publishing is enabled.

- React 19, TypeScript, Vite; warm light/dark theme, collection gallery, filter/search, gallery/list modes, details, responsive bottom navigation
- Gallery-to-details shared-element-like image transition (550 ms default) with **System / On / Off** reduced-motion control and back navigation
- PHP 8.3 Apache API skeleton + MySQL 8 Docker service, environment-based credentials and a versioned SQL migration
- Root `Makefile`, GitHub Actions baseline checks, Vitest, Playwright, PHPUnit and k6 scaffolding
- Product, technical, and UI/UX documents and original approved design-reference images under `docs/design/mockups/`

## Scope / important limitations

The signed-out gallery is **illustrative demo data** with original CSS/SVG artwork. Imported photos and physical copies are persisted privately for the authenticated owner. The mockup PNGs remain visual references. General collection CRUD, verified catalogue search, account recovery and photo cleanup are not complete. Load tests cover health and authenticated batch/status baselines. Production deployment is intentionally **not configured**. Never deploy using a bypass.

## Commands

`make help` lists all supported targets. `make ci` runs static checks, unit tests, API checks, Playwright E2E and baseline load testing against Docker services. No deployment target is enabled in this starter.
