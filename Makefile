.PHONY: help editor-deps dev dev-php stop restart build logs test test-env test-fast test-unit test-unit-dev test-php-unit test-integration test-frontend test-e2e test-load test-preprocess inspect-preprocess inspect-studio lint migrate seed reset-test ci
DC = docker compose
TC = docker compose -p jigsaw-test -f docker-compose.yml -f compose.test.yml
help:
	@echo "make editor-deps | dev | dev-php | stop | restart | build | logs | lint | test-fast | test-unit | test-unit-dev | test-php-unit | test-integration | test-frontend | test-e2e | test-load | test-preprocess | inspect-preprocess | inspect-studio | test | ci | migrate | seed | reset-test"
editor-deps:
	npm --prefix frontend ci --ignore-scripts --no-audit --no-fund
dev:
	$(DC) --profile processing up --build -d --wait
	$(DC) run --rm api php scripts/migrate.php
dev-php:
	$(DC) -f docker-compose.yml -f compose.php.yml up --build -d --wait db api frontend
	$(DC) -f docker-compose.yml -f compose.php.yml run --rm api php scripts/migrate.php
stop:
	$(DC) --profile processing down
restart: stop dev
build:
	$(DC) build
	$(DC) run --rm frontend npm run build
logs:
	$(DC) logs -f --tail=100
lint:
	$(DC) run --rm frontend npm run check
	$(DC) run --rm --no-deps api php scripts/lint.php
test-env:
	$(TC) --profile processing up --build -d --wait --force-recreate db api frontend processor
	$(TC) run --rm api php scripts/migrate.php
test-unit: test-env
	$(TC) run --rm frontend npm run test:unit
	$(TC) run --rm api sh -c 'composer install --no-interaction && vendor/bin/phpunit --testsuite unit'
test-frontend:
	$(DC) run --rm frontend npm run test:unit
test-php-unit:
	$(DC) run --rm --no-deps api sh -c 'composer install --no-interaction && vendor/bin/phpunit --testsuite unit'
test-unit-dev: test-frontend test-php-unit test-preprocess
test-integration: test-env
	$(TC) run --rm api sh -c 'composer install --no-interaction && vendor/bin/phpunit --testsuite integration'
test-e2e: test-env
	$(TC) --profile test run --rm playwright
test-load: test-env
	$(TC) --profile test run --rm k6 run /scripts/health.js
	$(TC) --profile test run --rm k6 run /scripts/import.js
test-fast: lint test-unit
test-preprocess:
	$(DC) --profile processing build processor
	$(DC) --profile processing run --rm --no-deps processor python -m unittest discover -s tests -v
inspect-preprocess:
	$(DC) --profile processing run --rm --no-deps processor python report.py
inspect-studio:
	$(DC) --profile processing run --rm --no-deps processor python studio_report.py
test: test-preprocess test-fast test-integration test-e2e test-load
ci: build test
migrate:
	$(DC) run --rm api php scripts/migrate.php
seed:
	@echo 'Demo data is in frontend/src/data/puzzles.ts; DB seed is not implemented.'
	@exit 1
reset-test:
	@echo 'Test database reset not implemented; no destructive reset performed.'
	@exit 1
