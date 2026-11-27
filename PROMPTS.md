# Prompts Used

Full text of every prompt used to build RedactLocal, in the order they were used. Each section matches a stage in [PROMPT_LOG.md](PROMPT_LOG.md).

**Workflow:** the hackathon brief was turned into a meta-prompt (drafted with an AI assistant), Gemini expanded it into a master prompt, Google Antigravity built and verified the code, and the site was deployed from GitHub to Vercel. A second meta-prompt to Gemini produced the multi-page redesign prompt, and six follow-up prompts refined detection, performance, visual design, accessibility and documentation.

| # | Prompt | Tool |
| :--- | :--- | :--- |
| 1 | Meta-prompt v1 (asks Gemini to write the Antigravity master prompt) | Gemini |
| 2 | Master build prompt v1 (written by Gemini) | Google Antigravity |
| 3 | Follow-up 1: UI polish | Google Antigravity |
| 4 | Follow-up 2: detection edge-case audit | Google Antigravity |
| 5 | Follow-up 3: performance and CSV stress test | Google Antigravity |
| 6 | Meta-prompt v2 (asks Gemini to write the multi-page redesign prompt) | Gemini |
| 7 | Multi-page redesign prompt (written by Gemini) | Google Antigravity |
| 8 | Vercel deployment-compatibility constraints | Google Antigravity |
| 9 | Follow-up 4: visual cohesion and transitions | Google Antigravity |
| 10 | Follow-up 5: accessibility and responsive audit | Google Antigravity |
| 11 | Follow-up 6: README and prompt log review | Google Antigravity |
| 12 | Follow-up 7: strict automated code judge audit | Google Antigravity |
| 13 | Follow-up 8: non-breaking audit fixes, CI & security docs | Google Antigravity |

---

## 1. Meta-prompt v1 (Tool: Gemini)

````text
You are an expert prompt engineer who writes prompts for Google Antigravity, an agent-first AI coding IDE. Your job is to write ONE master prompt that I will paste into Antigravity to build a complete project in a single pass with minimal back-and-forth.

PROJECT BRIEF (hackathon problem statement):
Design and build a browser-based data sanitization tool. Users paste raw text or upload a .txt/.csv file, and the tool automatically detects, classifies, and redacts sensitive PII entirely on the client side, with no data sent to any external server.

Mandatory requirements:
1. Pattern detection: accurately detect and highlight emails, phone numbers, IP addresses, Indian PAN, Indian Aadhaar, and credit card numbers.
2. Validation logic: implement the Luhn algorithm for credit card numbers so random 16-digit strings are not flagged as false positives.
3. Three redaction modes:
   - Full Mask: replace with a fixed block such as [REDACTED].
   - Partial Mask: keep partial context, e.g. XXXX-XXXX-1234.
   - Consistent Pseudonymization: the same original value always maps to the same placeholder (e.g. USER_01) throughout the document.
4. Audit and export: live side-by-side diff view (original vs sanitized) with entity detection counts, and a 1-click download of the sanitized file.

Deliverables: a working web app with a 1-click sample noisy text loader, side-by-side diff view, downloadable sanitized output, and a prompt log.

WHAT THE PROMPT YOU WRITE MUST CONTAIN:
- A clear role and goal for the Antigravity agent.
- Tech constraints: vanilla HTML/CSS/JS only, ideally a single index.html (or index.html + style.css + app.js), zero dependencies, zero build step, zero network requests (no CDNs, no fetch, no analytics), runs offline by double-clicking.
- Detection specifics: robust regexes plus validation for each entity type:
  - Email: standard RFC-practical pattern.
  - Phone: Indian formats (+91, 0091, 10-digit starting 6-9, with spaces/dashes) and common international formats.
  - IPv4 (each octet 0-255) and IPv6.
  - PAN: 5 letters, 4 digits, 1 letter.
  - Aadhaar: 12 digits, first digit 2-9, optional spaces/dashes in 4-4-4 groups, with optional Verhoeff checksum validation.
  - Credit cards: 13-19 digits, optional spaces/dashes, validated with Luhn, with card-brand detection (Visa/Mastercard/Amex/RuPay).
- Overlap and conflict resolution rules (e.g. a Luhn-valid card must not also be flagged as a phone or Aadhaar; define a priority order and use a single-pass scan with a span-overlap resolver).
- Exact behavior of the three redaction modes per entity type, including partial-mask formats (emails like j***@gmail.com, phones showing the last 4 digits, PAN showing the first 2 and last 1, Aadhaar and cards showing the last 4).
- Pseudonymization design: per-entity-type counters (EMAIL_01, PHONE_01, CARD_01, etc.), a Map keyed on the normalized original value so repeats get the same placeholder, and a toggleable view of the mapping table.
- UI spec: modern, clean, responsive layout, with dark/light mode.
  - Input area: textarea with paste, drag-and-drop or file picker for .txt/.csv, plus a prominent "Load Sample Noisy Text" button.
  - Mode selector for the three redaction modes, with live re-processing on every change.
  - Side-by-side diff panes: original with color-coded highlights per entity type, and sanitized output. Scroll-synced.
  - Stats bar with a count per entity type, total entities found, and a "Luhn-rejected numbers" counter.
  - Per-entity-type toggles to include or exclude types.
  - "Download sanitized file" button (preserves .txt or .csv extension) and a copy-to-clipboard button.
  - A visible badge: "100% client-side. Your data never leaves this browser."
- CSV handling: process cell by cell while preserving structure and delimiters.
- A sample noisy dataset (realistic log/resume/support-ticket mix) that deliberately includes: valid Luhn cards, invalid 16-digit numbers that must NOT be flagged, repeated emails (to demonstrate pseudonymization consistency), PANs, Aadhaar numbers, various phone formats, and IPs.
- Edge cases: large inputs (performance with 1MB+ text), empty input, overlapping matches, unicode text, and no double-redaction.
- Acceptance criteria as a checklist the agent must verify before finishing, and an instruction to write a small in-page or console self-test for the Luhn validator and the regexes.
- Required output files: the app, a README.md (setup, features, how each requirement is satisfied), and a PROMPT_LOG.md template.

FORMAT OF YOUR ANSWER:
1. The final master prompt for Antigravity, in a single code block, structured with headings: Role, Goal, Tech Constraints, Features, Detection Rules, Redaction Modes, UI Spec, Sample Data, Edge Cases, Acceptance Criteria, Deliverables.
2. Then 3 short follow-up refinement prompts I can use afterwards (one for UI polish, one for fixing false positives/negatives, one for performance and edge cases).
3. Then a PROMPT_LOG.md template (columns: step, prompt used, tool, result/learning).

Be specific and unambiguous. Do not ask me questions. Make reasonable assumptions and state them inside the prompt.
````

---

## 2. Master build prompt v1 (Tool: Google Antigravity; written by Gemini from prompt 1)

````text
# Role
You are an expert senior frontend and security engineer operating inside Google Antigravity. Build a complete, production-quality, offline-first web application in a single pass with minimal back-and-forth. Make clean engineering decisions, verify all logic with automated self-tests, and deliver ready-to-demo hackathon files.

# Goal
Design and build a 100% client-side, browser-based PII Data Sanitization Tool. Users can paste raw text or upload `.txt`/`.csv` files, and the app automatically detects, validates, classifies, and redacts sensitive PII entirely in the browser—with zero data leaving the device.

# Tech Constraints
- **Stack**: Vanilla HTML5, CSS3, and ES6+ JavaScript only.
- **File Structure**: Use a clean 3-file app architecture: `index.html`, `style.css`, and `app.js` (loaded via standard `<script src="app.js" defer></script>`—do NOT use `type="module"` so the app works reliably over `file://` without CORS errors).
- **Zero Dependencies & Zero Build Step**: No frameworks, no npm, no bundlers, no external libraries.
- **Zero Network Requests**: No CDNs, no external fonts (use system font stacks and monospace stacks), no external icon libraries (use inline SVGs), no `fetch`/`XMLHttpRequest`, no analytics.
- **Offline Execution**: Must run immediately by double-clicking `index.html` in any modern browser.
- **Security**: Escape all HTML entities (`&`, `<`, `>`, `"`, `'`) before injecting user text into the DOM so pasted HTML/scripts can never execute (strict XSS safety).

# Features
1. **Input Handling**:
   - Raw text paste/edit textarea.
   - Drag-and-drop zone and file picker supporting `.txt` and `.csv` files (display loaded filename, size, and a "Clear" button).
   - Prominent **"Load Sample Noisy Text"** button to populate a realistic test dataset in one click.
2. **Real-Time Sanitization Engine**:
   - Live re-processing on every text edit, file upload, redaction mode switch, or entity toggle change (debounced for large inputs).
   - Single-pass detection and span-overlap resolution so text is never double-redacted.
3. **CSV-Aware Processing**:
   - When a `.csv` file is uploaded (or CSV mode is active), parse the file cell-by-cell using an RFC 4180-compliant parser (preserving quoted fields, escaped quotes `""`, embedded commas/newlines, and original delimiters/line endings).
   - Run PII detection and redaction independently inside each cell while sharing the same Pseudonymization Map across the entire file so repeated values across rows map to the same placeholder.
4. **Live Side-by-Side Diff & Audit**:
   - Synchronized side-by-side panes: Original (with color-coded highlights and hover tooltips) vs. Sanitized output.
   - Live audit stats bar showing total entities found, per-entity-type counts, and a **"Luhn-rejected numbers"** counter.
5. **Controls & Export**:
   - Three redaction modes: Full Mask, Partial Mask, and Consistent Pseudonymization.
   - Per-entity-type include/exclude toggles, plus a **"Strict Aadhaar Verhoeff Check"** toggle (enabled by default).
   - Toggleable **Pseudonym Mapping Table** panel showing `Placeholder`, `Entity Type`, `Original Value`, and `Occurrences`.
   - **"Download Sanitized File"** button (preserves `.csv` or `.txt` extension, e.g., `<name>_sanitized.csv` or `sanitized_output.txt`) and **"Copy Sanitized Output"** button with visual confirmation.
   - Built-in self-test suite runnable via `window.runSelfTests()` in the console and via a subtle **"Run Self-Tests"** button in the footer.

# Detection Rules
Run all enabled detectors independently against the **original unmodified text** to collect candidate spans `{ start, end, raw, normalized, type, meta }`.

1. **Email (`EMAIL`)**:
   - RFC-practical pattern: `/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g`
   - Normalization: lowercase and trimmed.

2. **Credit Card Numbers (`CREDIT_CARD`)**:
   - Candidate pattern: 13–19 digits with optional spaces or hyphens between groups, bounded so it does not match inside longer digit strings (`/(?<![\dA-Za-z])(?:\d[\s-]?){13,19}(?![\dA-Za-z])/` — avoid lookbehind issues if needed by verifying surrounding characters in JS).
   - Strip spaces/hyphens; verify digit length is 13–19.
   - **Luhn Validation**: Implement the standard Luhn checksum algorithm.
     - If Luhn **passes**: accept as `CREDIT_CARD` and detect card brand:
       - `Visa`: starts with `4` (length 13, 16, or 19)
       - `Mastercard`: starts with `51–55` or `2221–2720` (length 16)
       - `Amex`: starts with `34` or `37` (length 15)
       - `RuPay`: starts with `60`, `6521`, `6522`, `81`, `82`, or `508` (length 16)
       - `Card`: fallback for other Luhn-valid lengths/prefixes
     - If Luhn **fails**: do NOT flag as PII, increment the `luhnRejectedCount` metric, and record the span as a **Luhn-rejected exclusion zone** so its inner digits are not falsely matched by Phone or Aadhaar detectors.
   - Normalization: digits only.

3. **IP Addresses (`IPV4` and `IPV6`, grouped under `IP` in stats/toggles)**:
   - **IPv4**: Strict 0–255 per octet (`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)` repeated 4 times separated by `.`), bounded so `999.256.1.1`, `1.2.3.4.5`, or software versions like `v2.4.1.0` are rejected.
   - **IPv6**: Match full 8-group and compressed (`::`) IPv6 formats; validate group counts and hex syntax in JS so timestamps (`12:34:56`) or stray colons are never matched.
   - Normalization: lowercase and trimmed.

4. **Indian PAN (`PAN`)**:
   - Strict uppercase pattern with word boundaries: `/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g`.
   - Normalization: uppercase.

5. **Indian Aadhaar (`AADHAAR`)**:
   - Pattern: 12 digits starting with `2–9`, allowing optional uniform spaces or hyphens in `4-4-4` groups (`[2-9]\d{3}(?:[\s-]?\d{4}){2}`), bounded by non-digits.
   - **Verhoeff Validation**: Implement the complete Verhoeff checksum algorithm (using the standard `d`, `p`, and `inv` tables). Apply it when the "Strict Aadhaar Verhoeff Check" toggle is ON; when OFF, accept structurally valid 12-digit Aadhaar matches.
   - Normalization: digits only.

6. **Phone Numbers (`PHONE`)**:
   - **Indian formats**: Optional `+91`, `0091`, `91`, or `0` prefix with optional space/hyphen, followed by a 10-digit number starting with `6–9` (supporting `98765 43210`, `98765-43210`, `987-654-3210`, `9876543210`).
   - **International formats**: Leading `+` followed by country code `[1-9]\d{0,2}` and grouped digits (spaces, hyphens, dots, or parenthesized area codes) with a total of 10–15 digits (E.164).
   - **False-positive guards**: Reject matches that look like dates (`YYYY-MM-DD`, `DD-MM-YYYY`), IP addresses, or substrings inside longer alphanumeric/digit tokens.
   - Normalization: digits only (strip leading `+`/`00`/`0` formatting differences consistently so `+91 98765 43210` and `+91-98765-43210` resolve to the same key).

7. **Overlap & Conflict Resolution (Mandatory)**:
   - Priority order (highest to lowest):
     1. `CREDIT_CARD` (Luhn-valid)
     2. `EMAIL`
     3. `IPV6`
     4. `IPV4`
     5. `AADHAAR`
     6. `PAN`
     7. `PHONE`
   - First, discard any `AADHAAR` or `PHONE` candidate that overlaps a Luhn-rejected exclusion zone.
   - Sort remaining candidates by: (1) priority rank ascending, (2) span length descending, (3) `start` index ascending.
   - Greedily accept a candidate span only if it does not overlap (`a.start < b.end && b.start < a.end`) any already-accepted span.
   - Sort final accepted spans by `start` ascending and build the sanitized text and highlighted HTML in a single forward pass.

# Redaction Modes
1. **Full Mask**:
   - Replace every detected entity with `[REDACTED]`.
2. **Partial Mask**:
   - `EMAIL`: Keep first character of local part + `***@` + full domain (e.g., `j***@gmail.com`).
   - `PHONE`: Mask all digits except the last 4 with `X`, preserving `+`, spaces, parentheses, and hyphens (e.g., `+91 XXXXX X3210` or `XXXXXX4321`).
   - `PAN`: Keep first 2 characters and last 1 character, mask middle 7 with `X` (e.g., `ABXXXXXXXF`).
   - `AADHAAR`: Mask first 8 digits with `X` and keep last 4 digits, preserving original separators (e.g., `XXXX-XXXX-9012`, `XXXX XXXX 9012`, or `XXXXXXXX9012`).
   - `CREDIT_CARD`: Mask all digits except the last 4 with `X`, preserving original separators (e.g., `XXXX-XXXX-XXXX-0366`).
   - `IPV4`: Keep first octet, mask remaining 3 octets (e.g., `192.XXX.XXX.XXX`).
   - `IPV6`: Keep first hextet, mask remaining hex groups with `XXXX` (e.g., `2001:XXXX:XXXX::XXXX`).
3. **Consistent Pseudonymization**:
   - Maintain a `Map` per scan keyed on `${entityGroup}:${normalizedValue}` so identical values (even with different casing or spacing/hyphens) always receive the same placeholder.
   - Use per-entity-type 1-based zero-padded counters: `EMAIL_01`, `PHONE_01`, `IP_01`, `PAN_01`, `AADHAAR_01`, `CARD_01`.
   - Reset the map on each full document re-scan so numbering is deterministic from top to bottom.

# UI Spec
- **Aesthetic**: Clean, modern developer/security-tool UI with crisp typography, high-contrast color coding, subtle borders/cards, and smooth responsive behavior.
- **Theme**: Dark and Light mode toggle in the top header (default to `prefers-color-scheme`, persist in `localStorage` wrapped in `try/catch`).
- **Header**: App name, a clearly visible privacy badge reading `"100% client-side. Your data never leaves this browser."` with an inline shield/lock SVG, and the theme toggle.
- **Input Panel**:
  - Multi-line textarea for pasting text.
  - Drag-and-drop file dropzone + file input button (`.txt`, `.csv`) with active drag highlight, loaded file pill, and Clear button.
  - Prominent **"Load Sample Noisy Text"** button.
- **Controls Bar**:
  - 3-way mode selector (`Full Mask`, `Partial Mask`, `Consistent Pseudonymization`).
  - Per-entity-type toggle chips (`Email`, `Phone`, `IP`, `PAN`, `Aadhaar`, `Credit Card`) with distinct color dots matching the diff highlights, plus a checkbox/toggle for `Strict Aadhaar Verhoeff`.
- **Audit Stats Bar**:
  - Summary pills for `Total Entities`, each entity type's count, and a highlighted **`Luhn-Rejected Numbers`** counter.
- **Side-by-Side Diff View**:
  - Two equal-width scrollable panes (stacked on mobile): **Original (Highlighted)** on the left, **Sanitized Output** on the right.
  - Original pane wraps detected spans in color-coded `<mark>` tags with `title` tooltips showing `Type (Brand if Card) → Replacement`.
  - Sanitized pane highlights replaced tokens subtly so redactions are immediately scannable.
  - Scroll-synced vertically and horizontally using a re-entrancy guard flag (`isSyncing`) to prevent scroll jank.
- **Action Bar & Mapping Drawer**:
  - **"Download Sanitized File"** button, **"Copy Sanitized Output"** button, and **"Pseudonym Map"** toggle button.
  - Expandable Mapping Table panel showing `Placeholder`, `Type`, `Original Value`, and `Count`.
- **Footer**: Subtle **"Run Self-Tests"** button that displays inline pass/fail test results.

# Sample Data
Embed a realistic multi-format sample dataset (combining a support ticket, server log lines, and a brief candidate/customer profile) loaded by "Load Sample Noisy Text". It MUST include:
- 2+ Luhn-valid credit cards (e.g., Visa `4532-0151-1283-0366` and Amex `3782-822463-10005`, plus a Luhn-valid RuPay card).
- 2+ invalid 16-digit numbers that MUST fail Luhn and increment the Luhn-rejected counter (e.g., `4532-0151-1283-0367` and `9999-8888-7777-6666`).
- Repeated emails in different cases (e.g., `priya.sharma@finserve.in` and `PRIYA.SHARMA@finserve.in`) plus a second distinct email to prove consistent pseudonymization.
- 2 valid Indian PANs (e.g., `ABCDE1234F`, `BZTPS4821K`).
- 2 Verhoeff-valid 12-digit Aadhaar numbers (formatted with spaces and hyphens; compute/verify their exact Verhoeff check digits before embedding them in the sample).
- Multiple phone formats: Indian (`+91 98765 43210`, `0091-9876543210` as a repeat to test normalization, `98201-44556`) and international (`+1 (415) 555-0192`).
- Valid IPv4 (`192.168.1.45`, `10.0.42.199`), one invalid IPv4 (`999.256.1.1`—must NOT be flagged), and valid IPv6 (`2001:0db8:85a3:0000:0000:8a2e:0370:7334`, `fe80::1ff:fe23:4567:890a`).

# Edge Cases
- **Large Inputs (1MB+ text)**: Debounce keystroke processing (200ms). Build output strings with array joining instead of repeated string concatenation. If input exceeds 250,000 characters, render a notice in the highlighted diff preview (or cap visual DOM `<mark>` rendering to a safe preview slice) while still computing the full sanitized output for Copy and Download without freezing the browser.
- **Empty / Whitespace Input**: Show clean empty states, zero out all counters, and disable Copy/Download buttons.
- **Overlapping Matches & No Double-Redaction**: Guaranteed by single-pass detection + overlap resolver.
- **Unicode & Special Characters**: Preserve Hindi/Devanagari, emojis, accented characters, and `<script>` / HTML tags safely without corrupting indices or triggering XSS.
- **CSV Fidelity**: Preserve quotes, escaped quotes (`""`), commas inside quoted cells, and original line endings.

# Acceptance Criteria
Before finishing, write and run an in-page/console self-test suite (`window.runSelfTests()`) and verify every item below passes:
- [ ] Double-clicking `index.html` runs offline with zero console errors and zero network requests.
- [ ] Luhn validator passes known valid Visa/Mastercard/Amex/RuPay numbers and rejects invalid 16-digit numbers, incrementing the Luhn-rejected counter.
- [ ] Luhn-rejected 16-digit numbers are NOT partially matched as Phone or Aadhaar.
- [ ] Verhoeff validator accurately validates valid Aadhaar numbers and rejects invalid check digits when enabled.
- [ ] All 6 entity categories (Email, Phone, IPv4/IPv6, PAN, Aadhaar, Credit Card) are accurately detected; invalid IPv4 (`999.256.1.1`) and dates (`2026-11-27`) are not flagged.
- [ ] All 3 redaction modes produce exact expected outputs per entity type.
- [ ] Consistent Pseudonymization assigns identical placeholders to repeated values (including case/separator variants) and populates the mapping table accurately.
- [ ] Uploading a `.csv` file preserves structure, quotes, and delimiters while redacting cell contents, and downloads as `*_sanitized.csv`.
- [ ] Side-by-side panes stay scroll-synced, dark/light theme toggles cleanly, and pasted `<script>alert(1)</script>` is safely escaped.
- [ ] `window.runSelfTests()` executes and reports 100% passing assertions.

# Deliverables
Create the following files in the project root:
1. `index.html` — Semantic HTML structure, privacy badge, controls, side-by-side diff panes, mapping table, and footer self-test runner.
2. `style.css` — Responsive layout, dark/light CSS custom properties, color-coded highlight styles, and polished UI components.
3. `app.js` — Detection engine, Luhn & Verhoeff validators, overlap resolver, CSV parser/serializer, 3 redaction modes, UI controller, scroll sync, sample dataset, and `window.runSelfTests()`.
4. `README.md` — Project overview, zero-setup offline usage instructions, architecture summary, and a requirement-by-requirement verification table.
5. `PROMPT_LOG.md` — Pre-structured Markdown log template with columns: `Step`, `Prompt Used`, `Tool`, and `Result / Learning`.
````

---

## 3. Follow-up 1: UI polish (Tool: Google Antigravity)

````text
Review the current UI in index.html and style.css and polish it to hackathon-winning quality without adding any external dependencies. Improve visual hierarchy, spacing, and contrast in both dark and light modes; ensure each entity type has a distinct, accessible highlight color with clear hover tooltips; make the stats bar and mode selector scannable at a glance; and verify the layout adapts cleanly on narrow/tablet viewports with zero horizontal page overflow.
````

---

## 4. Follow-up 2: detection edge-case audit (Tool: Google Antigravity)

````text
Audit app.js for detection edge cases and tighten the regexes and validators. Specifically test and fix: (1) dates like 2026-11-27 or 12/05/2025, timestamps like 14:35:09, order IDs, and software versions like v1.2.3.4 must never be flagged as phones, IPs, or Aadhaar; (2) Luhn-valid cards must never be partially flagged as phones or Aadhaar, and Luhn-rejected 16-digit numbers must increment the rejected counter without leaking into phone/Aadhaar matches; (3) Indian phones with +91, 0091, leading 0, spaces, or dashes normalize to the same pseudonym key. Add regression assertions for all of these to window.runSelfTests() and confirm 100% pass.
````

---

## 5. Follow-up 3: performance and CSV stress test (Tool: Google Antigravity)

````text
Stress-test app.js with a 1MB+ synthetic text input and a complex multi-column CSV containing quoted fields, escaped quotes (""), embedded commas, embedded newlines, Unicode characters, and HTML/script tags. Optimize any main-thread bottleneck (debouncing, array joins, safe preview capping for massive DOM highlights while keeping Copy/Download 100% complete), verify CSV structure and delimiters are preserved byte-for-byte outside redacted tokens, and add a performance benchmark + CSV round-trip test to window.runSelfTests().
````

---

## 6. Meta-prompt v2: multi-page redesign (Tool: Gemini)

````text
You are an expert prompt engineer who writes prompts for Google Antigravity, an agent-first AI coding IDE, and a senior product designer. Write ONE detailed master prompt that I will paste into Antigravity to redesign my existing project into a professional, multi-page, production-looking website.

CONTEXT
Project: "RedactLocal", a 100% client-side PII data sanitization tool built for a hackathon. The problem statement: users paste raw text or upload .txt/.csv, and the tool detects, classifies and redacts PII entirely in the browser with no external server.

Current state (already working, committed to GitHub as tag v1-working):
- Files: index.html, style.css, app.js, README.md, PROMPT_LOG.md. Vanilla HTML/CSS/JS, zero dependencies, works offline via file://.
- Features: detectors for Email, Phone, IP (v4/v6), PAN, Aadhaar (with Verhoeff toggle), Credit Card (Luhn validated, "Luhn-rejected" counter); 3 redaction modes (Full Mask, Partial Mask, Consistent Pseudonymization) with a Pseudonym Map; CSV-aware mode; per-detector toggles; side-by-side highlighted diff; entity count chips; copy and download buttons; dark/light toggle; "100% client-side" badge; 1-click sample noisy text loader.
- Problem: it is a single page and looks like a demo. A competitor has a multi-page site with an overview page, so mine must look and feel like a real product built by a professional web developer.

GOALS
1. Redesign into a small multi-page website: Landing, Sanitizer (the tool), How It Works, Dashboard (lifetime stats), Privacy and Security.
2. Make the visual design polished and professional, at the level of a modern SaaS product.
3. Keep every existing feature working exactly as before.
4. The project will be judged by an AI reviewer reading the repo and the live site, so the README, code structure, self-tests and PROMPT_LOG must clearly show quality, verification and iteration.

HARD CONSTRAINTS
- Do NOT change detection logic, regexes, Luhn or Verhoeff validators, overlap resolution or redaction behavior. Move them into engine.js unchanged, and keep or extend the existing self-tests.
- Vanilla HTML/CSS/JS only. No frameworks, no build step, no CDNs, no external fonts, no network requests. Must work offline when opening index.html and also deploy on GitHub Pages.
- Dashboard stats come from localStorage only, counts only, never any content. Label them honestly as "stats stored in this browser".
- Never use localStorage for anything containing user text.

WHAT YOUR PROMPT MUST CONTAIN
- Role, Goal, Constraints, Design System, Page-by-Page Spec, Shared Components, Stats Tracking, Accessibility and Responsiveness, Quality and Testing, Documentation, Acceptance Checklist.
- Design System: design tokens as CSS variables (color, spacing scale, radius, shadow, type scale), one accent color plus semantic colors per entity type, system font stack, dark and light themes that are both polished, a consistent component library (buttons, cards, badges, inputs, tabs, toasts, tooltips, modals).
- Landing page: strong hero with headline and subheadline, primary and secondary calls to action, a CSS-drawn before/after redaction demo, features grid, a "how it works in 3 steps" strip, trust/privacy section, footer.
- Sanitizer page: cleaner layout, a 4-step stepper (Input, Mode, Review, Export), refined diff panes with hover tooltips on entities, empty and error states, drag-and-drop zone styling, sticky action bar, toasts for copy/download.
- How It Works page: pipeline diagram (input, detection, validation, overlap resolution, redaction, output) in inline SVG/CSS, a section per detector with example formats, an interactive Luhn demo (user types a number, sees the doubling and sum steps and a valid/invalid result), the three redaction modes with before/after examples, a "Self-test: N/N passed" badge that runs the real tests in the page, and a short FAQ.
- Dashboard page: total entities masked, per-type counts as inline SVG/CSS bar charts, files processed, Luhn-rejected count, last-used date, a Reset button, and an honest note about local-only storage.
- Privacy page: architecture explanation and a "verify it yourself" guide (DevTools, Network tab, zero requests, offline test).
- Navigation: sticky navbar with active page highlight, mobile hamburger menu, theme toggle persisted, consistent footer.
- Polish: micro-interactions and transitions, prefers-reduced-motion support, keyboard navigation, visible focus rings, ARIA labels, WCAG AA contrast, responsive from 320px up.
- Documentation: update README.md with project structure, a "Requirements to implementation" table mapping each mandatory requirement to the file and function that satisfies it, a features list, how to run, how to verify privacy, a screenshots placeholder section, and future improvements (PDF/DOCX/OCR support). Append every step of this redesign to PROMPT_LOG.md.
- A final acceptance checklist the agent must verify before finishing, including: all 6 detectors work, a Luhn-invalid 16-digit number is NOT flagged, repeated emails get the same pseudonym, CSV upload works, download works, zero network requests, all pages link correctly offline, dashboard updates after a run, mobile layout works, no console errors.
- A recommendation to work in phases (1: restructure files and design system, 2: build pages, 3: polish and docs) with a verification step after each phase.

FORMAT OF YOUR ANSWER
1. The final master prompt in a single code block.
2. Then 3 short follow-up prompts for afterwards: (a) visual polish and animations, (b) accessibility and responsive audit, (c) README and screenshots cleanup for AI judges.
3. Then 5 bullet points on how I should review the result before committing.

Be specific and unambiguous. Do not ask me questions. State any assumptions inside the prompt.
````

---

## 7. Multi-page redesign prompt (Tool: Google Antigravity; written by Gemini from prompt 6)

````text
# Role
You are a senior frontend architect and product designer operating inside Google Antigravity. Redesign the existing `RedactLocal` hackathon project (currently at tag `v1-working`) into a cohesive, multi-page, SaaS-grade web application while preserving 100% of its proven detection and redaction logic.

# Goal
Transform `RedactLocal` from a single-page demo into a polished 5-page product website—**Landing**, **Sanitizer**, **How It Works**, **Dashboard**, and **Privacy & Security**—that looks and feels like a modern security SaaS tool (clean typography, restrained color system, crisp surfaces) and stands out to both human and AI judges inspecting the repository and live site.

# Constraints & Assumptions
- **Preserve Core Engine Unchanged**: Do NOT modify any detection regexes, Luhn or Verhoeff validators, overlap resolution rules, CSV parsing/serialization, redaction mode logic, or sample dataset behavior. Extract the existing pure engine and `window.runSelfTests()` cleanly into `engine.js` at the project root without altering their behavior. You may add new tests to `window.runSelfTests()`, but every existing assertion must remain intact and pass.
- **Zero Dependencies & Offline-First**: Vanilla HTML5, CSS3, and ES6+ JavaScript only. No frameworks, no build tools, no CDNs, no Google Fonts, no external icon libraries, and zero network requests (`fetch`/`XMLHttpRequest`/analytics).
- **Dual Compatibility (`file://` + GitHub Pages)**:
  - Use standard `<script src="..." defer></script>` tags (do NOT use `type="module"`, which fails with CORS errors over `file://`).
  - Use relative paths (`./index.html`, `./sanitizer.html`, `./styles/tokens.css`, etc.) everywhere so links and assets work identically when double-clicking `index.html` offline and when deployed on GitHub Pages under a repo subpath.
- **Strict Local Storage Policy**:
  - `localStorage` may ONLY store theme preference (`redactlocal_theme`) and aggregate numeric dashboard statistics (`redactlocal_stats_v1`).
  - NEVER store user text, sanitized output, pseudonym maps, or filenames in `localStorage`.
  - Label dashboard metrics honestly as **"Stats stored locally in this browser"**.
- **Assumed File Structure** (create/refactor into this exact layout):
  - `index.html` (Landing)
  - `sanitizer.html` (Main Sanitizer tool)
  - `how-it-works.html` (Architecture, detectors, interactive Luhn demo, self-tests, FAQ)
  - `dashboard.html` (Local-only lifetime statistics)
  - `privacy.html` (Client-side architecture & "Verify It Yourself" guide)
  - `engine.js` (Extracted detection, validation, overlap, CSV, redaction engine + `window.runSelfTests()`)
  - `styles/tokens.css` (Design tokens, light/dark themes, base reset)
  - `styles/components.css` (Shared component library: navbar, footer, buttons, cards, badges, inputs, tabs, stepper, tooltips, toasts, modal)
  - `styles/pages.css` (Page-specific layouts and visual demos)
  - `scripts/shared.js` (Navbar/mobile menu, theme persistence, toast & modal utilities)
  - `scripts/stats.js` (Aggregate `localStorage` stats manager)
  - `scripts/sanitizer-ui.js` (Sanitizer page controller wired to `engine.js` and `scripts/stats.js`)
  - `scripts/how-it-works.js` (Interactive Luhn step-by-step demo + live self-test runner)
  - `scripts/dashboard.js` (Dashboard KPIs, inline SVG/CSS charts, Reset modal)
  - `README.md` & `PROMPT_LOG.md`

# Execution Plan (Work in Phases)
Execute this redesign in three sequential phases and verify before advancing:
1. **Phase 1 — Restructure & Design System**: Extract `engine.js` unchanged, build `styles/tokens.css`, `styles/components.css`, `scripts/shared.js`, and `scripts/stats.js`. Verify `window.runSelfTests()` passes 100% with zero console errors.
2. **Phase 2 — Build All 5 Pages**: Implement `index.html`, `sanitizer.html`, `how-it-works.html`, `dashboard.html`, `privacy.html`, `styles/pages.css`, and page scripts. Verify all existing Sanitizer features, cross-page relative links, interactive Luhn demo, and Dashboard stat updates.
3. **Phase 3 — Polish, Accessibility & Documentation**: Refine micro-interactions, responsive breakpoints (`320px`–`1440px+`), WCAG AA contrast, keyboard/ARIA support, update `README.md`, append every redesign step to `PROMPT_LOG.md`, and run the full Acceptance Checklist.

# Design System (`styles/tokens.css` & `styles/components.css`)
- **Design Tokens (CSS Variables)**:
  - Color system: neutral slate surface ramp (`--bg-page`, `--bg-surface`, `--bg-elevated`, `--bg-muted`), borders (`--border-subtle`, `--border-strong`), text hierarchy (`--text-primary`, `--text-secondary`, `--text-muted`).
  - Single brand accent: crisp security-SaaS indigo (`--accent: #4f46e5` in light, `#6366f1` in dark; plus `--accent-hover`, `--accent-soft`).
  - Semantic entity colors (distinct, WCAG AA compliant in both themes): `--entity-email`, `--entity-phone`, `--entity-ip`, `--entity-pan`, `--entity-aadhaar`, `--entity-card`, each with `-bg`, `-border`, and `-text` tokens.
  - Status tokens: `--success`, `--warning`, `--danger`.
  - Spacing scale (`--space-1: 4px` through `--space-16: 64px`), border radii (`--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 16px`, `--radius-full: 9999px`), subtle multi-layer shadows (`--shadow-sm`, `--shadow-md`, `--shadow-lg`), and clear type scale (`--text-xs` to `--text-5xl`).
- **Typography**: System sans-serif stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`) for UI and system monospace (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`) for code, regexes, and diff panes.
- **Themes**: Both Dark and Light themes must look intentional and polished. Include a tiny inline `<script>` in `<head>` on every page that reads `redactlocal_theme` (falling back to `prefers-color-scheme`) and sets `document.documentElement.dataset.theme` before first paint to prevent theme flicker.
- **Component Library**: Build reusable classes for Buttons (`primary`, `secondary`, `ghost`, `danger`, `sm`/`md`/`lg`), Cards, Badges/Pills, Inputs & Dropzone, Segmented Tabs, Stepper, Tooltips, Toast Notifications, and Confirmation Modal.

# Page-by-Page Spec

## 1. Landing Page (`index.html`)
- **Hero**: Privacy eyebrow pill (`100% Client-Side · Zero Server Calls`), strong headline & concise subheadline, Primary CTA (`Launch Sanitizer` -> `./sanitizer.html`), Secondary CTA (`How It Works` -> `./how-it-works.html`).
- **CSS-Drawn Before/After Redaction Demo**: A polished window-frame mockup showing a realistic raw text snippet (with color-coded Email, Phone, PAN, Aadhaar, and Luhn-valid Card pills) side-by-side with its redacted output—built purely in HTML/CSS with subtle polish (optional lightweight toggle to preview Full / Partial / Pseudonymized output).
- **Features Grid**: 6 clean cards with inline SVG icons covering: 6 PII Detectors, Luhn & Verhoeff Validation, 3 Redaction Modes, CSV-Aware Processing, Side-by-Side Diff & Audit, and Offline Zero-Trust Architecture.
- **How It Works in 3 Steps Strip**: Numbered horizontal cards (`1. Paste or Drop File`, `2. Detect & Validate Locally`, `3. Review & Export`).
- **Trust & Privacy Section**: Highlight zero network requests, no cloud uploads, no PII storage, and a CTA to `./privacy.html` ("Verify in DevTools").
- **Footer**: Shared site footer.

## 2. Sanitizer Page (`sanitizer.html`)
- **Preserve 100% of Existing Functionality**: Textarea input, `.txt`/`.csv` drag-and-drop and file picker, 1-click **"Load Sample Noisy Text"** button, 3 redaction modes (Full Mask, Partial Mask, Consistent Pseudonymization), Pseudonym Map view, CSV-aware mode, per-detector toggles, Aadhaar Verhoeff toggle, side-by-side scroll-synced highlighted diff, entity count chips, **"Luhn-rejected"** counter, copy and download buttons, `"100% client-side. Your data never leaves this browser."` badge.
- **4-Step Stepper**: Clean horizontal indicator (`1. Input` → `2. Mode` → `3. Review` → `4. Export`) that updates dynamically as the user loads text, selects a mode, inspects matches, and exports.
- **Input & Dropzone Polish**: Clear drag-over visual state, file metadata chip (filename + size + Clear button), and explicit **error states** (e.g., unsupported file type, unreadable/empty file) shown via alert banner/toast.
- **Refined Diff Panes**: Clean headers with character/match counts, styled hover tooltips on every highlighted entity `<mark>` (displaying Entity Type, Card Brand if card, and Replacement), and a helpful **empty state** before text is entered.
- **Sticky Action Bar & Toasts**: Sticky bottom/toolbar action bar containing Copy Sanitized, Download File, Toggle Pseudonym Map, and Clear, paired with accessible toast notifications confirming Copy, Download, Sample Loaded, or Reset actions.

## 3. How It Works Page (`how-it-works.html`)
- **Pipeline Diagram**: Clean 6-stage architecture diagram (`Input` → `Detection` → `Validation` → `Overlap Resolution` → `Redaction` → `Output`) built with inline SVG and responsive CSS.
- **Per-Detector Breakdown**: 6 structured cards (Email, Phone, IPv4/IPv6, PAN, Aadhaar, Credit Card) listing supported patterns, validation rules (Luhn/Verhoeff/octet bounds), priority rank, and realistic valid vs. rejected examples.
- **Interactive Luhn Algorithm Demo**: An interactive widget where the user types or pastes a digit string (with quick-fill preset buttons: `Valid Visa`, `Valid Amex`, `Invalid 16-Digit`) and sees a live step-by-step breakdown: right-to-left digit positions, doubled alternate digits (`>9` minus `9`), running total sum, `sum % 10`, and a clear Valid/Invalid result powered by `engine.js`.
- **Three Redaction Modes Comparison**: Clean comparison table/cards showing Full Mask, Partial Mask, and Consistent Pseudonymization with concrete before/after examples across all 6 entity types.
- **Live Self-Test Badge & Panel**: A prominent **`Self-test: N/N passed`** badge that executes the real `window.runSelfTests()` from `engine.js` on page load, with a `Re-run` button and an expandable `<details>` list of individual test assertions.
- **Short FAQ**: Accessible `<details>/<summary>` accordion covering offline usage, false-positive prevention, CSV quoting, Verhoeff toggle, and local-only storage.

## 4. Dashboard Page (`dashboard.html`)
- **Honest Storage Banner**: Visible notice reading: `"Stats stored locally in this browser. Only aggregate counts are recorded—never your text, files, or PII."`
- **KPI Summary Cards**: `Total Entities Masked`, `Files Processed`, `Luhn-Rejected Numbers`, and `Last Used Date` (human-readable date or `"No runs yet"`).
- **Per-Entity-Type Breakdown Chart**: Inline SVG/CSS horizontal bar chart using each entity's semantic color token, showing exact counts and share percentages, plus an inviting empty state linking to `./sanitizer.html` when counts are zero.
- **Reset Stats Control**: Danger button opening a confirmation modal before clearing `redactlocal_stats_v1` and updating the UI with a confirmation toast.

## 5. Privacy & Security Page (`privacy.html`)
- **Architecture Explanation**: Clear breakdown of why RedactLocal is safe—100% in-browser execution, zero third-party scripts/fonts/CDNs, strict HTML escaping against XSS, and count-only `localStorage`.
- **"Verify It Yourself" Guide**: Numbered, reproducible verification steps:
  1. Open Browser DevTools (`F12` / `Cmd+Option+I`) → **Network** tab.
  2. Click **Clear**, then open `Sanitizer`, load sample text or upload a CSV, and download the output.
  3. Confirm **0 network requests** were sent.
  4. Enable Airplane Mode / disconnect Wi-Fi and reload—confirm every page and feature still works.

# Shared Components (`scripts/shared.js`)
- **Sticky Navbar**: Inline SVG shield/logo + `RedactLocal` wordmark, 5 links (`Home`, `Sanitizer`, `How It Works`, `Dashboard`, `Privacy`) with automatic active highlight (`aria-current="page"`), persistent Dark/Light theme toggle button, and responsive mobile hamburger menu (toggles drawer, closes on `Escape` or outside click).
- **Consistent Footer**: App tagline, privacy statement (`100% Client-Side · Zero External Requests`), quick links to all 5 pages, and offline-ready indicator.
- **Toast & Modal Utilities**: Reusable `showToast(message, type)` with `aria-live="polite"` and accessible `openConfirmModal({ title, message, confirmLabel, onConfirm })` with focus trapping/restoration and `Escape` dismissal.

# Stats Tracking (`scripts/stats.js`)
- Storage key: `redactlocal_stats_v1`, wrapped in `try/catch`.
- Schema: `{ totalEntities: 0, byType: { EMAIL: 0, PHONE: 0, IP: 0, PAN: 0, AADHAAR: 0, CREDIT_CARD: 0 }, filesProcessed: 0, luhnRejected: 0, runs: 0, lastUsed: null }`.
- **Recording Rule (Deterministic & Spam-Free)**: Record a run's counts automatically when a user (a) loads a file, (b) clicks **Load Sample Noisy Text**, or (c) clicks **Copy** or **Download** on sanitized text—using an in-memory session hash of the current sanitized input so copying and then downloading the same text does not double-count, while uploading a new file or editing text and exporting increments accurately. Never persist the hash or any text to `localStorage`.

# Accessibility & Responsiveness
- WCAG AA color contrast (`>= 4.5:1` for normal text, `>= 3:1` for large text and UI controls) in both Light and Dark themes.
- Keyboard navigable end-to-end with clear `:focus-visible` outlines.
- Semantic landmarks (`<header>`, `<nav>`, `<main>`, `<footer>`), proper heading hierarchy (`h1` -> `h2` -> `h3`), `aria-label` on icon-only buttons, `aria-expanded` on mobile menu, `aria-live="polite"` on toasts and live stats.
- `@media (prefers-reduced-motion: reduce)` disabling transitions and animations.
- Fully responsive from `320px` mobile to `1440px+` desktop with zero unintended horizontal scroll.

# Documentation
1. **Update `README.md`** to include:
   - Project overview & value proposition.
   - **Project Structure** directory tree.
   - **Requirements to Implementation** table mapping every mandatory hackathon requirement (6 detectors, Luhn, Verhoeff, 3 redaction modes, Pseudonym Map, CSV preservation, side-by-side diff, audit stats, offline zero-network execution) to the exact file and function name(s) that satisfy it.
   - Complete **Features** list.
   - **How to Run** (offline double-click + GitHub Pages).
   - **How to Verify Privacy** (DevTools Network tab & offline test).
   - **Screenshots** section with clean placeholder slots (`docs/screenshots/landing.png`, `sanitizer.png`, `how-it-works.png`, `dashboard.png`).
   - **Future Improvements** (client-side PDF parsing, DOCX redaction, local WebAssembly OCR for scanned documents).
2. **Update `PROMPT_LOG.md`**: Keep all existing v1 rows and append new rows documenting each phase of this multi-page redesign (Phase 1 restructure/design system, Phase 2 pages/interactive demos, Phase 3 polish/accessibility/docs) with columns `Step | Prompt Used | Tool | Result / Learning`.

# Acceptance Checklist
Before finishing, run `window.runSelfTests()` and manually verify every item below:
- [ ] All 6 detectors (Email, Phone, IPv4/IPv6, PAN, Aadhaar, Credit Card) work identically to `v1-working`.
- [ ] A Luhn-invalid 16-digit number is NOT flagged as PII and increments the "Luhn-rejected" counter.
- [ ] Repeated emails (including case variants) receive the exact same pseudonym (`EMAIL_01`) and appear accurately in the Pseudonym Map.
- [ ] `.csv` upload redacts cell-by-cell while preserving quotes, commas, and structure, and downloads as `*_sanitized.csv`.
- [ ] Copy and Download buttons work cleanly and trigger toast confirmations.
- [ ] Zero network requests occur across all 5 pages (no external fonts, icons, CDNs, or scripts).
- [ ] All 5 pages link to each other accurately via relative URLs when opened offline via `file://`.
- [ ] Dashboard updates lifetime counts after running/exporting on the Sanitizer page, displays inline SVG/CSS charts, and resets cleanly via the confirmation modal; `localStorage` contains zero user text or PII.
- [ ] Interactive Luhn demo on `how-it-works.html` computes step-by-step doubling/sum accurately, and the `Self-test: N/N passed` badge shows 100% passing.
- [ ] Mobile layout (`320px`–`480px`) and desktop layout work cleanly with dark/light mode persisted across pages and zero console errors.
````

---

## 8. Vercel deployment-compatibility constraints (Tool: Google Antigravity)

Added to the redesign prompt so the static site deploys cleanly on Vercel.

````text
DEPLOYMENT COMPATIBILITY (Vercel static hosting)
- The site must deploy on Vercel as a pure static site: no build step, no package.json, no framework, no server code. index.html must be in the repo root.
- Use only relative paths (e.g. "style.css", "./engine.js", "how-it-works.html"). Never use absolute paths starting with "/".
- Use lowercase kebab-case for ALL file and folder names, with no spaces. Make sure every file name in every href/src matches the real file name exactly (the host is case-sensitive).
- Use classic <script src="..."> tags only. No ES modules (no type="module", no import/export), so it works on both file:// and https://.
- Link between pages using relative .html links (e.g. href="sanitizer.html").
- Add a custom 404.html in the root that matches the site design with a link back home.
- Add an inline SVG data-URI favicon in every page head so there is no /favicon.ico 404 in the console.
- Add a .gitignore (ignore .DS_Store, Thumbs.db, node_modules, .vercel).
- Before finishing, scan every HTML file and verify that every referenced local file exists with the exact same case, and that there are no absolute paths and no external URLs.
- OPTIONAL BONUS (only if everything else passes): add a vercel.json with security headers, including a Content-Security-Policy with default-src 'self'; connect-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; plus X-Content-Type-Options: nosniff and Referrer-Policy: no-referrer. This enforces "zero network requests" at the server level. Verify that downloads, copy, theme toggle and all pages still work, and remove the CSP if anything breaks.
````

---

## 9. Follow-up 4: visual cohesion and transitions (Tool: Google Antigravity)

````text
Audit all 5 pages (index.html, sanitizer.html, how-it-works.html, dashboard.html, privacy.html) and styles/ for visual cohesion and SaaS polish. Tighten spacing rhythm, card elevation, hover/active states, and typography hierarchy across both dark and light modes. Add subtle, purposeful CSS transitions (button feedback, stepper progress, toast slide-in, chart bar fill, modal fade) while strictly honoring prefers-reduced-motion. Keep zero external dependencies and zero network requests.
````

---

## 10. Follow-up 5: accessibility and responsive audit (Tool: Google Antigravity)

````text
Perform a full accessibility and responsive audit across all 5 pages from 320px mobile to 1440px desktop. Verify WCAG AA contrast in both light and dark modes (especially on entity highlight badges and muted text), confirm zero horizontal page overflow at 320px and 375px, test full keyboard-only navigation (Tab, Enter, Space, Escape on mobile menu and Reset modal), verify visible :focus-visible rings and ARIA attributes, and fix any issues found.
````

---

## 11. Follow-up 6: README and prompt log review (Tool: Google Antigravity)

````text
Review README.md and PROMPT_LOG.md from the perspective of an automated AI judge grading this repository. Verify every file path and function name in the "Requirements to Implementation" table matches the actual codebase exactly, ensure the self-test instructions and privacy verification steps are crystal clear, refine the Screenshots section with clear captions and filenames so I can drop in captures cleanly, and confirm PROMPT_LOG.md accurately reflects all iterations from v1-working through the final polish.
````

---

## 12. Follow-up 7: strict automated code judge audit (Tool: Google Antigravity)

````text
Act as a strict automated code judge. Audit this repository (RedactLocal) and score it out of 100 using these categories, with a score and a list of specific deductions for each:
1. Code quality (structure, naming, duplication, dead code, comments/JSDoc, consistency, README accuracy)
2. Security (XSS and innerHTML usage, CSP and response headers in vercel.json, file upload validation, ReDoS risk in every regex, localStorage contents, Blob URL handling, CSV formula injection handling, dependency-free claim)
3. Efficiency (regex complexity, algorithmic cost, large-input handling, DOM rendering cost, debouncing, memory)
4. Testing (coverage of every detector, validator, redaction mode, CSV edge case, overlap resolution; whether tests can run outside the browser and in CI)
5. Accessibility (WCAG AA contrast, keyboard use, focus management, ARIA, landmarks, skip link, lang attribute, page titles, meta descriptions, reduced motion, 320px layout)
6. Problem statement alignment (map each mandatory requirement and deliverable to the exact file and function: 6 detectors, Luhn false-positive prevention, three redaction modes, consistent pseudonymization, live side-by-side diff with counts, 1-click download, 1-click sample loader, prompt log)

Rules:
- Do NOT change any files in this step. Output a report only.
- Every deduction must name the exact file and line or function.
- Only report issues you verified by reading the code or running it. Do not invent problems.
- End with a ranked fix list ordered by points gained per effort, and mark any fix that could risk detection behavior.
````

---

## 13. Follow-up 8: non-breaking audit fixes, CI & security docs (Tool: Google Antigravity)

````text
Apply the fixes from your ranked list, highest value first. Rules:
- Do not change detection regexes, validators, overlap resolution or redaction behavior. If a fix needs that, skip it and tell me.
- Keep zero external dependencies and zero network requests. Do not weaken or break the CSP in vercel.json.
- After each group of fixes, run window.runSelfTests() and report the real result.
- Where useful, add: JSDoc on public engine functions; a skip-to-content link, lang attribute, unique page titles and meta descriptions on every page; additional security headers (frame-ancestors/X-Frame-Options, Permissions-Policy) in vercel.json; an upload size limit with a clear error message; a Node-runnable test file (tests/run-tests.js) that loads engine.js without a browser, plus a GitHub Actions workflow that runs it on every push (no package.json, no npm install); a LICENSE file; a short SECURITY.md describing the threat model and limits.
- Update README.md (add test and CI instructions, real numbers only) and append every step to PROMPT_LOG.md and PROMPTS.md. Do not claim a result you did not run.
````