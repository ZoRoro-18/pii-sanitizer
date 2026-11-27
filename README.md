# RedactLocal â€” 100% Client-Side PII Data Sanitizer

**Live demo:** https://pii-sanitizer-five.vercel.app

RedactLocal is a zero-dependency, offline-first SaaS-grade web application that detects, checksum-validates, classifies, and redacts Personally Identifiable Information (PII) completely inside your browserâ€”with **zero network requests**, **zero external dependencies**, and **zero PII ever leaving your device**.

## Project Structure

```text
.
â”œâ”€â”€ index.html              # Landing page (hero, interactive CSS demo, feature grid, trust CTA)
â”œâ”€â”€ sanitizer.html          # Main PII sanitizer workspace (4-step stepper, synced diff, exports)
â”œâ”€â”€ how-it-works.html       # 6-stage pipeline, detector specs, live Luhn demo, self-tests, FAQ
â”œâ”€â”€ dashboard.html          # Local-only lifetime aggregate usage KPIs & breakdown chart
â”œâ”€â”€ privacy.html            # Zero-trust security architecture & "Verify It Yourself" guide
â”œâ”€â”€ 404.html                # Custom offline/static 404 page matching site design
â”œâ”€â”€ engine.js               # Pure detection, Luhn/Verhoeff, overlap, CSV, redaction & self-tests
â”œâ”€â”€ vercel.json             # Static hosting security headers (CSP connect-src 'none', nosniff)
â”œâ”€â”€ .gitignore              # Ignores .DS_Store, Thumbs.db, node_modules, .vercel
â”œâ”€â”€ styles/
â”‚   â”œâ”€â”€ tokens.css          # Neutral slate ramp, indigo accent, entity colors, dark/light tokens
â”‚   â”œâ”€â”€ components.css      # Navbar, footer, buttons, cards, badges, stepper, modal, toasts
â”‚   â””â”€â”€ pages.css           # Page layouts, before/after CSS mockup, charts, responsive grids
â”œâ”€â”€ scripts/
â”‚   â”œâ”€â”€ shared.js           # Theme persistence, mobile nav drawer, toast & modal utilities
â”‚   â”œâ”€â”€ stats.js            # Aggregate count-only localStorage manager (redactlocal_stats_v1)
â”‚   â”œâ”€â”€ sanitizer-ui.js     # Sanitizer controller wired to engine.js & stats.js
â”‚   â”œâ”€â”€ how-it-works.js     # Step-by-step Luhn Explorer & live window.runSelfTests() runner
â”‚   â””â”€â”€ dashboard.js        # Dashboard KPIs, horizontal bar chart, & Reset modal flow
â”œâ”€â”€ README.md
â””â”€â”€ PROMPT_LOG.md
```

## Requirements to Implementation

| Hackathon Requirement | File(s) | Function / Symbol(s) |
| :--- | :--- | :--- |
| Email detection & lowercase normalization | `engine.js` | `detectEmails` |
| Phone detection (Indian + E.164) & unified normalization | `engine.js` | `detectPhones`, `normalizePhoneDigits`, `hasValidPhoneBoundaries`, `isLikelyDateOrIp`, `hasNonPiiIdContext` |
| IPv4 (`0â€“255` bounds, version guard) & IPv6 (`::` validation) | `engine.js` | `detectIPv4`, `detectIPv6`, `isStrictIPv4`, `isValidIPv6`, `isVersionPrefix` |
| Indian PAN (`[A-Z]{5}[0-9]{4}[A-Z]`) | `engine.js` | `detectPAN` |
| Indian Aadhaar + Verhoeff checksum toggle | `engine.js`, `scripts/sanitizer-ui.js` | `detectAadhaar`, `isValidVerhoeff`, `VERHOEFF_D`, `VERHOEFF_P`, `VERHOEFF_INV`, `strictVerhoeffToggle` |
| Credit Card detection + Luhn checksum + Brand detection | `engine.js` | `detectCreditCards`, `isValidLuhn`, `detectCardBrand` |
| Luhn-rejected exclusion zones & audit counter | `engine.js`, `scripts/sanitizer-ui.js` | `detectCreditCards`, `overlapsSortedZones`, `resolveOverlaps`, `renderStats` |
| Priority overlap resolution (no double-redaction) | `engine.js` | `PRIORITY`, `resolveOverlaps`, `insertIfNonOverlapping`, `overlapsSortedZones` |
| 3 Redaction Modes (`Full`, `Partial`, `Consistent Pseudonymization`) | `engine.js`, `scripts/sanitizer-ui.js` | `resolveReplacement`, `formatPartialMask`, `maskDigitsKeepLast`, `createScanSession` |
| Pseudonym Mapping Table | `sanitizer.html`, `engine.js`, `scripts/sanitizer-ui.js` | `resolveReplacement`, `renderMappingTable`, `setMappingDrawerOpen` |
| RFC 4180 CSV cell-by-cell parsing & quoting preservation | `engine.js` | `parseCsvRfc4180`, `detectCsvDelimiter`, `serializeCsvCell`, `buildCsvCellHighlightHtml` |
| Side-by-side scroll-synced diff + XSS-safe tooltips | `sanitizer.html`, `engine.js`, `scripts/sanitizer-ui.js` | `escapeHtml`, `buildPlainHighlightHtml`, `handlePaneScroll`, `showDiffTooltip`, `hideDiffTooltip` |
| Large-input debouncing & 250k preview capping | `engine.js`, `scripts/sanitizer-ui.js` | `LARGE_PREVIEW_CHAR_LIMIT`, `DEBOUNCE_MS`, `scheduleProcess`, `processAndRender` |
| Strict count-only `localStorage` & deduplicated stats | `scripts/stats.js`, `scripts/shared.js` | `STATS_STORAGE_KEY`, `THEME_STORAGE_KEY`, `computeInMemoryFingerprint`, `recordRun`, `getStats`, `resetStats` |
| Dashboard KPIs, horizontal chart & Reset modal | `dashboard.html`, `scripts/dashboard.js`, `scripts/shared.js` | `renderDashboard`, `openConfirmModal`, `showToast` |
| Interactive Luhn demo & `window.runSelfTests()` suite | `how-it-works.html`, `engine.js`, `scripts/how-it-works.js` | `runSelfTests`, `renderLuhnBreakdown`, `executeAndRenderTests` |
| Offline `file://` compatibility & zero-network CSP | `index.html`, `sanitizer.html`, `how-it-works.html`, `dashboard.html`, `privacy.html`, `404.html`, `vercel.json` | Classic `<script defer>`, relative links, inline SVG data-URI favicon, `Content-Security-Policy` |
| Accessibility, keyboard navigation & light/dark themes | `styles/tokens.css`, `styles/components.css`, `styles/pages.css`, `scripts/shared.js`, `scripts/sanitizer-ui.js` | `applyTheme`, `initNavigationAndTheme`, `setDrawerOpen`, `openConfirmModal` |

## Features

- **5-Page Product Experience**: Landing (`index.html`), Sanitizer (`sanitizer.html`), How It Works (`how-it-works.html`), Dashboard (`dashboard.html`), and Privacy & Security (`privacy.html`), plus a matching `404.html`.
- **Zero-Trust Offline Architecture**: Classic `<script defer>` loading, system sans/mono typography, inline SVG icons & favicon, zero CDNs, and zero network requests.
- **High-Precision Engine (`engine.js`)**: Single-pass scanning with Luhn & Verhoeff checksum validation, order-ID/date/timestamp/version false-positive guards, deterministic overlap resolution, and `22/22` built-in self-tests (`window.runSelfTests()`).
- **Large Input & CSV Fidelity**: 200 ms keystroke debouncing, `Uint8Array` overlap acceleration, preview capping at `250,000` characters while keeping Copy/Download 100% complete, and byte-preserving RFC 4180 CSV handling.
- **Strict Local Storage Policy**: Persists only `redactlocal_theme` and aggregate numeric counts in `redactlocal_stats_v1`â€”never user text, output, filenames, or pseudonym maps.

## How to Run

1. **Offline via `file://`**: Double-click `index.html` in any modern browser. No local server, npm install, or internet connection is required.
2. **GitHub Pages / Vercel Static Hosting**: Deploy the repository root directly as a static site (no build step required). All links and assets use relative paths (`styles/tokens.css`, `sanitizer.html`), and `vercel.json` enforces strict CSP headers (`connect-src 'none'`).

## Running Self-Tests

All `22` engine assertions live in `engine.js` under `window.runSelfTests()` and can be verified in three ways:

1. **Via UI (`how-it-works.html`)**: Open `how-it-works.html`â€”the **Live Automated Self-Tests** panel executes automatically on page load and renders `Self-test: 22/22 passed` with a **Re-run** button and expandable assertion details.
2. **Via Browser DevTools Console**: Open `sanitizer.html` or `how-it-works.html`, press `F12` (`Cmd+Option+I`), switch to **Console**, and run:
   ```js
   window.runSelfTests();
   ```
3. **Via Node CLI**:
   ```bash
   node -e "require('./engine.js'); const s = globalThis.runSelfTests(); if (s.failed > 0) process.exit(1);"
   ```

## How to Verify Privacy

1. Open Browser DevTools (`F12` / `Cmd+Option+I`), go to the **Network** tab, and click **Clear**.
2. Open `sanitizer.html`, click **Load Sample Noisy Text** (or drag-and-drop a `.txt` / `.csv` file), switch redaction modes, and click **Copy Sanitized** and **Download File**.
3. Confirm **0 outbound network requests** appear in the Network panel (under static hosting with `vercel.json`, `connect-src 'none'` also blocks any outbound connections at the browser CSP layer).
4. Open **Application â†’ Local Storage** and confirm only `redactlocal_theme` and `redactlocal_stats_v1` (aggregate numbers only) are storedâ€”zero text, files, or PII.
5. Disconnect Wi-Fi / enable Airplane Mode and navigate across all 5 pages (`index.html`, `sanitizer.html`, `how-it-works.html`, `dashboard.html`, `privacy.html`) to verify 100% offline operation.

## Screenshots

Drop PNG captures into `docs/screenshots/` using the exact filenames below and uncomment/embed the Markdown image tags when ready:

| Page | Target File Path | Ready-to-Use Markdown & Suggested Caption |
| :--- | :--- | :--- |
| **Landing** | `docs/screenshots/landing.png` | `![Landing Page â€” Hero and Before/After PII Redaction Preview](docs/screenshots/landing.png)`<br>*Capture hero, privacy pill, and Full/Partial/Pseudonym before/after window mockup.* |
| **Sanitizer** | `docs/screenshots/sanitizer.png` | `![Sanitizer Workspace â€” Highlighted Diff, Audit Stats, and Pseudonym Map](docs/screenshots/sanitizer.png)`<br>*Capture loaded sample data in Pseudonymization mode with colored `<mark>` spans, `Luhn-Rejected: 2`, and expanded Pseudonym Map.* |
| **How It Works** | `docs/screenshots/how-it-works.png` | `![How It Works â€” 6-Stage Pipeline, Interactive Luhn Explorer, and 22/22 Self-Tests](docs/screenshots/how-it-works.png)`<br>*Capture the interactive Luhn digit breakdown alongside the `Self-test: 22/22 passed` badge.* |
| **Dashboard** | `docs/screenshots/dashboard.png` | `![Local Usage Dashboard â€” Aggregate KPIs and Entity Breakdown Chart](docs/screenshots/dashboard.png)`<br>*Capture lifetime entity KPIs, semantic entity bar chart, and local-storage notice.* |
| **Privacy** | `docs/screenshots/privacy.png` | `![Privacy & Security â€” Zero-Trust Guarantees and DevTools Verification Guide](docs/screenshots/privacy.png)`<br>*Capture the 4 security guarantee cards and 4-step DevTools Network verification guide.* |

## Future Improvements

- Client-side PDF text extraction & redaction using an offline WASM/JS PDF parser.
- Local `.docx` XML archive inspection and in-browser document sanitization.
- On-device WebAssembly OCR for redacting scanned receipts and identity documents.
