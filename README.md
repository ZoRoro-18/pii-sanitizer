# RedactLocal — 100% Client-Side PII Data Sanitizer

**Live demo:** https://pii-sanitizer-five.vercel.app

RedactLocal is a zero-dependency, offline-first SaaS-grade web application that detects, checksum-validates, classifies, and redacts Personally Identifiable Information (PII) completely inside your browser—with **zero network requests**, **zero external dependencies**, and **zero PII ever leaving your device**.

## Project Structure

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml          # GitHub Actions workflow running `node tests/run-tests.js` on push/PR
├── index.html              # Landing page (hero, interactive CSS demo, feature grid, trust CTA)
├── sanitizer.html          # Main PII sanitizer workspace (4-step stepper, synced diff, exports)
├── how-it-works.html       # 6-stage pipeline, detector specs, live Luhn demo, self-tests, FAQ
├── dashboard.html          # Local-only lifetime aggregate usage KPIs & breakdown chart
├── privacy.html            # Zero-trust security architecture & "Verify It Yourself" guide
├── 404.html                # Custom offline/static 404 page matching site design
├── engine.js               # Pure detection, Luhn/Verhoeff, overlap, CSV, redaction & self-tests (`window.RedactEngine`)
├── vercel.json             # Static security headers (CSP, X-Frame-Options, nosniff, Permissions-Policy)
├── LICENSE                 # MIT License
├── SECURITY.md             # Threat model, client-side guarantees & documented limits
├── .gitignore              # Ignores .DS_Store, Thumbs.db, node_modules, .vercel
├── styles/
│   ├── tokens.css          # Neutral slate ramp, indigo accent, entity colors, dark/light tokens
│   ├── components.css      # Navbar, footer, buttons, cards, badges, stepper, modal, toasts
│   └── pages.css           # Page layouts, before/after CSS mockup, charts, responsive grids
├── scripts/
│   ├── theme-init.js       # Synchronous pre-paint theme initializer (avoids FOUC without inline JS)
│   ├── shared.js           # Shared UI utilities, DOM helpers, theme, drawer, toast & modal (`window.RedactUI`)
│   ├── stats.js            # Aggregate count-only localStorage manager (`window.RedactStats`)
│   ├── sanitizer-ui.js     # Sanitizer controller wired to RedactEngine, RedactStats & RedactUI
│   ├── how-it-works.js     # Step-by-step Luhn Explorer & live window.runSelfTests() runner
│   └── dashboard.js        # Dashboard KPIs, horizontal bar chart & Reset modal flow
├── tests/
│   └── run-tests.js        # Zero-dependency Node test suite (engine, CSV, stats, static checks)
├── README.md
├── PROMPT_LOG.md           # Chronological engineering log mapping prompts, tools & learnings
└── PROMPTS.md              # Full verbatim archive of all prompts used across every iteration
```

## Requirements to Implementation

| Hackathon Requirement | File(s) | Function / Symbol(s) |
| :--- | :--- | :--- |
| Email detection & lowercase normalization | `engine.js` | `detectEmails` |
| Phone detection (Indian + E.164) & unified normalization | `engine.js` | `detectPhones`, `collectIndianPhones`, `collectInternationalPhones`, `normalizePhoneDigits`, `hasValidPhoneBoundaries`, `isLikelyDateOrIp`, `hasNonPiiIdContext` |
| IPv4 (`0–255` bounds, version guard) & IPv6 (`::` validation) | `engine.js` | `detectIPv4`, `detectIPv6`, `isStrictIPv4`, `isValidIPv6`, `isVersionPrefix` |
| Indian PAN (`[A-Z]{5}[0-9]{4}[A-Z]`) | `engine.js` | `detectPAN` |
| Indian Aadhaar + Verhoeff checksum toggle | `engine.js`, `scripts/sanitizer-ui.js` | `detectAadhaar`, `isValidVerhoeff`, `VERHOEFF_D`, `VERHOEFF_P`, `VERHOEFF_INV`, `strictVerhoeffToggle` |
| Credit Card detection + Luhn checksum + Brand detection | `engine.js` | `detectCreditCards`, `processCardCandidate`, `isValidLuhn`, `detectCardBrand` |
| Luhn-rejected exclusion zones & audit counter | `engine.js`, `scripts/sanitizer-ui.js` | `detectCreditCards`, `overlapsSortedZones`, `resolveOverlaps`, `renderStats` |
| Priority overlap resolution (no double-redaction) | `engine.js` | `PRIORITY`, `resolveOverlaps`, `resolveWithOccupancyBuffer`, `insertIfNonOverlapping`, `overlapsSortedZones` |
| 3 Redaction Modes (`Full`, `Partial`, `Consistent Pseudonymization`) | `engine.js`, `scripts/sanitizer-ui.js` | `resolveReplacement`, `formatPartialMask`, `maskDigitsKeepLast`, `createScanSession` |
| Pseudonym Mapping Table | `sanitizer.html`, `engine.js`, `scripts/sanitizer-ui.js` | `resolveReplacement`, `renderMappingTable`, `createMappingRow`, `setMappingDrawerOpen` |
| RFC 4180 CSV cell-by-cell parsing & quoting preservation | `engine.js` | `parseCsvRfc4180`, `parseCsvRow`, `readQuotedCsvCell`, `detectCsvDelimiter`, `serializeCsvCell`, `buildCsvCellHighlightHtml` |
| Side-by-side scroll-synced diff + XSS-safe tooltips | `sanitizer.html`, `engine.js`, `scripts/sanitizer-ui.js` | `escapeHtml`, `buildPlainHighlightHtml`, `appendHighlightPair`, `handlePaneScroll`, `showDiffTooltip`, `hideDiffTooltip` |
| File upload validation (`10 MB` limit, binary check, `.txt`/`.csv`) | `scripts/sanitizer-ui.js` | `MAX_FILE_SIZE_BYTES`, `ALLOWED_EXTENSIONS`, `hasAllowedExtension`, `loadFile`, `applyLoadedFileContent`, `showInputError` |
| Large-input debouncing & `250k`-char / `8k`-span preview capping | `engine.js`, `scripts/sanitizer-ui.js` | `LARGE_PREVIEW_CHAR_LIMIT`, `LARGE_PREVIEW_SPAN_LIMIT`, `DEBOUNCE_MS`, `LARGE_DEBOUNCE_MS`, `scheduleProcess`, `processAndRender` |
| Strict count-only `localStorage` & deduplicated stats | `scripts/stats.js`, `scripts/shared.js`, `scripts/theme-init.js` | `RedactStats`, `STATS_STORAGE_KEY`, `createStore`, `computeInMemoryFingerprint`, `recordRun`, `getStats`, `reset` |
| Dashboard KPIs, horizontal chart & Reset modal | `dashboard.html`, `scripts/dashboard.js`, `scripts/shared.js` | `RedactUI`, `renderDashboardView`, `createBarRow`, `openConfirmModal`, `showToast` |
| Interactive Luhn demo & `window.runSelfTests()` suite | `how-it-works.html`, `engine.js`, `scripts/how-it-works.js`, `tests/run-tests.js` | `RedactEngine`, `runSelfTests`, `renderLuhnBreakdown`, `executeAndRenderTests`, `runSuite` |
| Offline `file://` compatibility & hardened security headers | `vercel.json`, `scripts/theme-init.js`, `SECURITY.md` | `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` |
| Accessibility, keyboard navigation & light/dark themes | `styles/tokens.css`, `styles/components.css`, `styles/pages.css`, `scripts/shared.js`, `scripts/sanitizer-ui.js` | `applyTheme`, `initThemeToggle`, `initMobileDrawer`, `openConfirmModal`, `createEl` |

## Features

- **5-Page Product Experience**: Landing (`index.html`), Sanitizer (`sanitizer.html`), How It Works (`how-it-works.html`), Dashboard (`dashboard.html`), and Privacy & Security (`privacy.html`), plus a matching `404.html`.
- **Clean Module Architecture**: Every script runs inside an isolated `'use strict'` IIFE exposing only `window.RedactEngine`, `window.RedactStats`, `window.RedactUI`, and `window.runSelfTests`, with classic `<script defer>` loading (plus synchronous pre-paint `scripts/theme-init.js` without inline scripts), system fonts, inline SVG icons with `aria-hidden="true" focusable="false"`, and `connect-src 'none'` / `script-src 'self'` CSP enforcement in `vercel.json`.
- **High-Precision Engine (`engine.js`)**: Single-pass scanning with Luhn & Verhoeff checksum validation, order-ID/date/timestamp/version false-positive guards, deterministic overlap resolution, and `24/24` built-in self-tests (`window.runSelfTests()`).
- **Safe File Upload & Large-Input Handling**: Adaptive keystroke debouncing (`40 ms` / `200 ms` / `350 ms`), `Uint8Array` overlap acceleration, `10 MB` upload size limit + binary NUL-byte rejection, preview capping at `250,000` characters / `8,000` spans while keeping Copy/Download 100% complete, and byte-preserving RFC 4180 CSV handling.
- **Strict Local Storage Policy**: Persists only `redactlocal_theme` and aggregate numeric counts in `redactlocal_stats_v1`—never user text, output, filenames, or pseudonym maps. See [SECURITY.md](SECURITY.md) for the full threat model and known limits.

## How to Run

1. **Offline via `file://`**: Double-click `index.html` in any modern browser. No local server, `npm install`, or internet connection is required.
2. **GitHub Pages / Vercel Static Hosting**: Deploy the repository root directly as a static site (no build step or `package.json`). All links and assets use relative paths (`styles/tokens.css`, `sanitizer.html`), and `vercel.json` enforces `connect-src 'none'`, `script-src 'self'`, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, and `Permissions-Policy`.

## Running Tests & CI

The built-in engine self-tests (`24` assertions in `engine.js`) and extended Node suite (`tests/run-tests.js`, `41` total checks) require zero packages (`no package.json`, `no npm install`):

1. **Node CLI Full Suite** (runs `window.runSelfTests()` `24/24` plus extended CSV/preview edge cases, `RedactStats`/`RedactUI` module tests, and static HTML/accessibility/CSS/CSP/bloatware checks):
   ```sh
   node tests/run-tests.js
   ```
   Observed output: `41/41 passed, 0 failed` (`24/24` in `engine.js` + `17/17` extended & static checks).
2. **GitHub Actions CI**: `.github/workflows/ci.yml` runs `node tests/run-tests.js` automatically on every `push` and `pull_request` using Node.js 20.
3. **Via Browser UI (`how-it-works.html`)**: Open `how-it-works.html`—the **Live Automated Self-Tests** panel executes `window.runSelfTests()` on page load and renders `Self-test: 24/24 passed` with a **Re-run** button and expandable assertion details.
4. **Via Browser DevTools Console**: Open `sanitizer.html` or `how-it-works.html`, press `F12` (`Cmd+Option+I`), switch to **Console**, and run:
   ```js
   window.runSelfTests();
   ```

## How to Verify Privacy

1. Open Browser DevTools (`F12` / `Cmd+Option+I`), go to the **Network** tab, and click **Clear**.
2. Open `sanitizer.html`, click **Load Sample Noisy Text** (or drag-and-drop a `.txt` / `.csv` file), switch redaction modes, and click **Copy Sanitized** and **Download File**.
3. Confirm **0 outbound network requests** appear in the Network panel (under static hosting with `vercel.json`, `connect-src 'none'` also blocks outbound connections at the browser CSP layer).
4. Open **Application → Local Storage** and confirm only `redactlocal_theme` and `redactlocal_stats_v1` (aggregate numbers only) are stored—zero text, files, or PII.
5. Disconnect Wi-Fi / enable Airplane Mode and navigate across all 5 pages (`index.html`, `sanitizer.html`, `how-it-works.html`, `dashboard.html`, `privacy.html`) to verify 100% offline operation.

## Screenshots

Drop PNG captures into `docs/screenshots/` using the exact filenames below and uncomment/embed the Markdown image tags when ready:

| Page | Target File Path | Ready-to-Use Markdown & Suggested Caption |
| :--- | :--- | :--- |
| **Landing** | `docs/screenshots/landing.png` | `![Landing Page — Hero and Before/After PII Redaction Preview](docs/screenshots/landing.png)`<br>*Capture hero, privacy pill, and Full/Partial/Pseudonym before/after window mockup.* |
| **Sanitizer** | `docs/screenshots/sanitizer.png` | `![Sanitizer Workspace — Highlighted Diff, Audit Stats, and Pseudonym Map](docs/screenshots/sanitizer.png)`<br>*Capture loaded sample data in Pseudonymization mode with colored `<mark>` spans, `Luhn-Rejected: 2`, and expanded Pseudonym Map.* |
| **How It Works** | `docs/screenshots/how-it-works.png` | `![How It Works — 6-Stage Pipeline, Interactive Luhn Explorer, and 24/24 Self-Tests](docs/screenshots/how-it-works.png)`<br>*Capture the interactive Luhn digit breakdown alongside the `Self-test: 24/24 passed` badge.* |
| **Dashboard** | `docs/screenshots/dashboard.png` | `![Local Usage Dashboard — Aggregate KPIs and Entity Breakdown Chart](docs/screenshots/dashboard.png)`<br>*Capture lifetime entity KPIs, semantic entity bar chart, and local-storage notice.* |
| **Privacy** | `docs/screenshots/privacy.png` | `![Privacy & Security — Zero-Trust Guarantees and DevTools Verification Guide](docs/screenshots/privacy.png)`<br>*Capture the 4 security guarantee cards and 4-step DevTools Network verification guide.* |

## Future Improvements

- Client-side PDF text extraction & redaction using an offline WASM/JS PDF parser.
- Local `.docx` XML archive inspection and in-browser document sanitization.
- On-device WebAssembly OCR for redacting scanned receipts and identity documents.
