# Needinfo Dashboard — Functional Summary

**Purpose:** A single-page Mozilla internal tool for tracking Bugzilla `needinfo?` flags across engineering teams. Hosted at `https://mozilla.github.io/needinfodashboard/`.

**Tech stack:** Vanilla JS + jQuery 1.12.0, jquery-cross-origin, purl (URL parsing), ical.js (details page only). No build system — plain HTML/CSS/JS files served statically from GitHub Pages. Configuration is driven by JSON files (`js/config.json` for Bugzilla base config, `js/<team>.json` for per-team developer lists).

---

## Pages

### `index.html` / `js/needinfo.js` — Summary Dashboard

- User selects a team (Performance, Graphics, Media Playback, Necko, Privacy, Application Security, Web Conferencing) or "Specific Account…".
- A date-picker filters bugs by creation date (defaults to one year ago).
- The team's JSON config is fetched, which provides a `developers` map (nick → Bugzilla email).
- For each developer, **one combined Bugzilla REST API query** fetches all `needinfo?` bugs. The results are bucketed client-side into 5 columns:

| Column | Key | Meaning |
|--------|-----|---------|
| Open Dev Related | `odr` | Open bugs, NI set by anyone except Nagbot (optionally excluding self-NIs) |
| Open Tracked | `otr` | Open bugs, NI on a bug tracking nightly/beta/release |
| Closed Dev Related | `cdr` | Resolved/verified/closed bugs, NI set by non-Nagbot |
| Open Nagbot | `onb` | Open bugs, NI set by `release-mgmt-account-bot@mozilla.tld` |
| Closed Nagbot | `cnb` | Closed bugs, NI set by Nagbot |

- Each non-zero cell shows: a count link → details page, and a Bugzilla bug-list icon link.
- A totals row sums all columns when viewing a team (more than one developer).
- "Specific Account…" opens a search dialog to look up any Bugzilla user by email/nick and drill into their needinfos.

---

### `details.html` / `js/details.js` — Needinfo Detail List

- Reached via URL params: `?userid=<email>&userquery=<odr|otr|cdr|onb|cnb>&creation_time=<date>`.
- Fetches full bug data (flags, comments, severity, priority, assignee, summary, OS) and displays each NI as a row.
- Columns: checkbox, NI date, Bug ID, NI setter (+ extra NIs), Assignee, Severity, Priority, OS, Title, NI Message (linked to the matching comment).
- Rows are sortable by NI Date, Bug ID, Severity, Priority (sort order persisted in session/localStorage).
- **Bulk actions** (require API key):
  - **Clear** — clears the `needinfo?` flag on checked bugs (no comment).
  - **Clear w/Comment** — same but adds a comment (single bug only, Bugzilla spam guard).
  - **Redirect to Setter** — clears NI and re-requests it from the original setter, with optional comment.
  - **Redirect to…** — clears NI and re-requests it from a user-searched Bugzilla account, with optional comment.
- A progress bar shows submission status when bulk-changing multiple bugs.

---

## Settings (shared dialog, both pages)

- **Bugzilla API Key** — required for security-sensitive bugs and all write operations. Absence is indicated by a red dot on the Settings button.
- **Ignore self-NIs** — hides flags where you are both requester and requestee.
- **Re-use target tab** — bug links all open in the same named tab instead of new tabs.
- **Persist settings** — saves API key and options to `localStorage`; otherwise session-only (`sessionStorage`).

---

## Key Files

| File | Role |
|------|------|
| `index.html` | Dashboard page markup + settings/query dialogs |
| `details.html` | Detail list page markup + all action dialogs |
| `js/needinfo.js` | Dashboard logic: config load, query, bucketing, rendering |
| `js/details.js` | Detail list logic: query, row rendering, sorting, bulk actions |
| `js/utils.js` | Shared utilities: settings persistence, URL helpers, DOM helpers, Bugzilla URL builders |
| `css/needinfo.css` | All styles for both pages |
| `js/config.json` | Bugzilla base URLs, API defaults |
| `js/<team>.json` | Per-team developer list (e.g. `js/media.json`) |
