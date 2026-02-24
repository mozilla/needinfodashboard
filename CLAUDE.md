# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development

**No build system.** This is a static site — plain HTML/CSS/JS files served directly from GitHub Pages. There is no `package.json`, no bundler, no transpiler, no test framework, no linting config. To develop locally, serve the files with any static file server (e.g., `python3 -m http.server 8000`) and open `http://localhost:8000`.

**Testing against Bugzilla:** Switch `use_test_domain` to `true` in `js/config.json` to point the dashboard at `bugzilla-dev.allizom.org` instead of production. Revert before committing.

**Deployment:** Push to `main` — GitHub Pages serves the repo directly.

## Architecture

Two pages, each with a dedicated JS file, sharing `js/utils.js` and `js/config.json`:

- **`index.html` + `js/needinfo.js`** — Summary dashboard. Loads `js/config.json`, then the selected team's JSON (e.g., `js/media.json`) to get a developer name→email map. For each developer, fires one combined Bugzilla REST query and buckets results client-side into 5 columns (odr/otr/cdr/onb/cnb — see table in FUNCTIONALITY.md).

- **`details.html` + `js/details.js`** — Needinfo detail list. Reached via URL params `?userid=&userquery=&creation_time=`. Fetches full bug data, renders a sortable table, and supports bulk flag operations (clear, redirect) via Bugzilla REST PUT requests using the user's API key.

- **`js/utils.js`** — Shared utilities: settings persistence (sessionStorage/localStorage), URL param helpers, DOM element builder (`el()`), Bugzilla URL construction, `trimAddress()` for normalizing account display names.

### Adding a new team

1. Create `js/<teamname>.json` with a `developers` object mapping display name → Bugzilla email (use `js/media.json` as template).
2. Add a `<option>` for the new team in the `#team-select` dropdown in `index.html`.

### Key configuration

- `js/config.json` — Bugzilla base URLs, default field/bug query strings, test domain toggle.
- `js/<team>.json` — Per-team developer list. The `use_test_domain` flag present in some team configs is read by `utils.js` to override `config.json`.

### Bugzilla REST API

- Queries: `GET /rest/bug?` with advanced filter syntax (`f1`, `o1`, `v1` params for boolean logic).
- Bulk actions: `PUT /rest/bug/{id}` with `api_key` in the request body.
- User lookup: `GET /rest/user?match={value}`.
- Responses are JSON; the `flags` array on each bug is the primary data structure processed.

### Libraries (vendored, no npm)

- `js/libs/jquery-1.12.0.min.js` — DOM and AJAX
- `js/libs/jquery-cross-origin.min.js` — CORS support for cross-origin AJAX
- `js/libs/purl-2.3.1/` — Legacy URL parsing (newer code uses `URLSearchParams` directly)
- `js/libs/ical.js` — iCalendar parsing library; loaded by `details.html` but not currently called anywhere — appears to be unused/dead code
