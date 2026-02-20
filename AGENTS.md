# Repository Guidelines

## Project Structure & Module Organization
- Current tree is minimal; add plugin code under `wp-content/mu-plugins/mcp/` or `src/` with subfolders `inc/` (PHP), `assets/` (JS/CSS/images), and `languages/` for translations.
- Keep automated checks and helpers in `scripts/`; store fixtures in `tests/fixtures/` and integration specs in `tests/phpunit/`.
- Use `.github/workflows/` for CI jobs and `.gitattributes` already enforces LF normalization.

## Build, Test, and Development Commands
- `composer install` — pull PHP deps (add a `composer.json` at repo root if missing).
- `npm install` — install JS/tooling dependencies for builds and linting.
- `npm run lint` — run JS/SCSS lint; pair with `composer run phpcs` for PHP style checks.
- `npm run test` or `composer run test` — execute unit tests (JS or PHP). Add to CI.
- `npm run build` — produce production assets (enqueue built files from `assets/dist`).
- `wp-env start` / `wp-env stop` — spin up a local WordPress sandbox for manual QA if using `@wordpress/env`.

## Coding Style & Naming Conventions
- PHP: WordPress Coding Standards (`phpcs --standard=WordPress`), tabs for indent, snake_case functions, PascalCase classes, escape output with `esc_html__`, etc.
- JS/TS: 2-space indent, prefer ESLint + Prettier, use camelCase, keep components pure and small.
- CSS/SCSS: BEM-ish class names, avoid !important, co-locate component styles with scripts when practical.
- Keep files short; favor dependency-injected functions to ease testing.

## Testing Guidelines
- PHPUnit for PHP (place cases in `tests/phpunit/`, name `Test*.php`).
- Jest/Playwright for JS and browser flows (name `*.spec.[jt]s`).
- Aim for =80% coverage on core business logic; add regression tests for fixed bugs.
- For new hooks or endpoints, include both unit and request-level tests; record fixtures under `tests/fixtures/`.

## Commit & Pull Request Guidelines
- Git history is minimal; adopt Conventional Commits (e.g., `feat: add block renderer`, `fix: sanitize request params`).
- PRs should include: summary, linked issue, screenshots for UI, reproduction steps for bugs, and a checklist of tests run (`npm run lint`, `composer run phpcs`, `npm run test`).
- Keep PRs small and focused; mention breaking changes explicitly and add migration notes when schemas/options change.

## Security & Configuration Tips
- Do not commit secrets; store local overrides in `.env.local` or `.wp-env.override.json` and add samples without secrets.
- Sanitize and escape all input/output; validate REST payloads with `register_rest_field`/`register_rest_route` args.
- Review third-party deps before adding; prefer WordPress core APIs over new packages when possible.
