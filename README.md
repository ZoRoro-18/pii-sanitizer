# RedactLocal — 100% Client-Side PII Data Sanitization Tool

RedactLocal is a zero-dependency, offline-first browser application that detects, validates, classifies, and redacts Personally Identifiable Information (PII) completely inside your browser — with **zero network requests** and **zero data leaving your device**.

## Zero-Setup Offline Usage

1. Download or clone this folder.
2. Double-click `index.html` to open it directly in any modern browser (`file://` compatible — no local server, build step, npm install, or internet connection required).
3. Paste text, drag-and-drop a `.txt` / `.csv` file, or click **Load Sample Noisy Text**.
4. Choose a redaction mode (**Full Mask**, **Partial Mask**, or **Consistent Pseudonymization**), inspect the synchronized side-by-side diff, and click **Copy Sanitized Output** or **Download Sanitized File**.

## Architecture Summary

The application uses a strict 3-file architecture loaded via standard `<script src="app.js" defer></script>` (avoiding ES module CORS restrictions over `file://`):

- **`index.html`** — Semantic layout featuring the privacy badge, drag-and-drop/file picker, input textarea, mode & detector controls, live audit stats bar, collapsible Pseudonym Mapping drawer, synchronized diff panes, and footer self-test runner.
- **`style.css`** — Responsive layout using system font/monospace stacks, CSS custom properties for Light/Dark themes (`prefers-color-scheme` + `localStorage`), and high-contrast color coding across all PII categories.
- **`app.js`** — Self-contained sanitization engine (`RedactLocalEngine`), UI controller, and built-in `window.runSelfTests()` suite:
  - **Independent Detectors**: Email, Credit Card (`13–19` digits with Luhn checksum + Visa/Mastercard/Amex/RuPay/Card classification), IPv4 (`0–255` strict octets, rejects versions/5-octet strings), IPv6 (full 8-group and `::` compressed validation, rejects timestamps/CSS pseudo-classes), Indian PAN, Indian Aadhaar (`2–9` start + Verhoeff checksum toggle), and Indian/International E.164 Phone numbers (with date/IP/token guards).
  - **Luhn-Rejected Exclusion Zones**: 13–19 digit card-like sequences that fail Luhn increment `Luhn-Rejected Numbers` and prevent inner digits from triggering false Phone or Aadhaar matches.
  - **Deterministic Overlap Resolver**: Priority rank (`CREDIT_CARD > EMAIL > IPV6 > IPV4 > AADHAAR > PAN > PHONE`), then span length descending, then `start` ascending, using binary-search non-overlapping acceptance and single-pass array-joined output construction.
  - **RFC 4180 CSV Engine**: Cell-by-cell parsing preserving quotes, escaped quotes (`""`), embedded commas/newlines, delimiters, and line endings while sharing one Pseudonymization Map across the entire file.
  - **Security & Scale**: HTML entity escaping (`&`, `<`, `>`, `"`, `'`) across all DOM outputs; 200ms keystroke debounce for large inputs; visual diff preview capped at 250,000 characters while Copy/Download compute the complete sanitized output.

## Verification & Requirement Matrix

| Requirement | Implementation Details | Status |
| :--- | :--- | :--- |
| 3-file vanilla architecture (`file://` ready) | `index.html`, `style.css`, `app.js` with `<script defer>` and zero `type="module"` | Verified |
| Zero network requests & zero dependencies | Inline SVGs, system font stacks, zero `fetch`/`XMLHttpRequest`/CDNs | Verified |
| Strict XSS safety | `escapeHtml` applied to all DOM highlights, tooltips, and escaped CSV HTML | Verified |
| Input handling & `.txt`/`.csv` drag-and-drop | File picker, drag-drop zone with file pill, Clear button, and Sample dataset | Verified |
| CSV-aware RFC 4180 parsing | `parseCsvRfc4180` + `serializeCsvCell` + shared `session.pseudonymMap` | Verified |
| 6 PII detectors + Luhn & Verhoeff validators | `detectCreditCards`, `detectEmails`, `detectIPv4`, `detectIPv6`, `detectPAN`, `detectAadhaar`, `detectPhones` | Verified |
| Priority overlap & Luhn exclusion zones | `resolveOverlaps` with Luhn-rejected exclusion zones + binary-search interval filter | Verified |
| 3 redaction modes + Pseudonym Map table | `Full Mask`, `Partial Mask`, `Consistent Pseudonymization` + toggleable mapping drawer | Verified |
| Live synced diff, theme toggle & exports | Scroll-synced `<pre>` panes with `isSyncing` guard, Dark/Light theme, Copy & Download | Verified |
| Built-in `window.runSelfTests()` suite | 17 automated self-tests runnable via console or footer **Run Self-Tests** button | Verified (17/17 passing) |

> **Note:** Automated verification (`window.runSelfTests()`, 1.1 MB stress test, RFC 4180 CSV test, static zero-network audit, and Node DOM-binding integration check) passed after the final code edit. Live interactive Chrome inspection was not attached in this environment (Chrome remote debugging was disabled), so double-click `index.html` to inspect visual styling and scroll sync directly in your browser.
