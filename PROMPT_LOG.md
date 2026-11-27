# Prompt & Engineering Log

Track prompts, tools used, and key learnings across design, implementation, and verification.

| Step | Prompt Used | Tool | Result / Learning |
| :--- | :--- | :--- | :--- |
| 1 | Design an offline-first 3-file client-side PII sanitization architecture (`index.html`, `style.css`, `app.js`) with zero external dependencies or network requests. | Architecture & Spec Analysis | Scoped pure JS detection, overlap resolution, CSV RFC 4180 parser, and UI controller inside an IIFE with `<script src="app.js" defer>` for reliable `file://` execution. |
| 2 | Implement Luhn and Verhoeff checksum algorithms and verify sample Visa, Amex, RuPay, Mastercard, and Aadhaar test vectors. | Node CLI (`node -e`) | Generated verified Aadhaar numbers (`4829 3104 7561`, `7391-5028-4619`) and Luhn-valid RuPay/Mastercard numbers; guarded `0`-prefixed numbers so `0091-...` phones do not trigger false Luhn rejections. |
| 3 | Build semantic UI (`index.html`), responsive light/dark CSS (`style.css`), and detection/redaction engine (`app.js`) with strict HTML escaping. | File Authoring | Implemented color-coded `<mark>` diff highlights, scroll sync with `isSyncing` + `requestAnimationFrame` guard, large-input preview capping at 250k chars, and Pseudonym Map table. |
| 4 | Run automated self-tests (`window.runSelfTests()`), 1 MB performance/CSV checks, and DOM integration verification in Node. | Node CLI (`node -e`) | Verified 17/17 self-tests, 1.1 MB throughput (138 ms), zero external URLs/network APIs, XSS escaping, CSV round-trip fidelity, and DOM UI controller bindings. |
| 5 | *(Add your next hackathon iteration prompt here)* | *(Tool)* | *(Notes & learnings)* |
