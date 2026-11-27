# Security Policy & Threat Model

## Architecture & Guarantees

RedactLocal is a static, zero-dependency, 100% client-side web application designed to inspect and redact PII entirely in local browser memory without transmitting user data over the network.

- **Zero Network Exfiltration**: Zero calls to `fetch`, `XMLHttpRequest`, `WebSocket`, or third-party scripts/CDNs. Static deployments via `vercel.json` enforce `Content-Security-Policy: default-src 'self'; connect-src 'none'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and `Permissions-Policy`.
- **XSS Mitigation**: All untrusted input text, CSV delimiters, line endings, entity tooltips, and sanitized tokens are escaped via `escapeHtml()` (`&`, `<`, `>`, `"`, `'`) in `engine.js` before assignment into the diff panes. Remaining DOM updates use `textContent` / `createTextNode`.
- **Storage Minimization**: Only UI theme (`redactlocal_theme`) and aggregate numeric counters (`redactlocal_stats_v1`) are persisted in `localStorage`. Raw text, sanitized text, uploaded filenames, and pseudonym maps are kept in RAM only and cleared on reload/reset.
- **Upload Guardrails**: `scripts/sanitizer-ui.js` enforces `.txt`/`.csv` filename extensions, rejects empty (`0 B`) and whitespace-only files, caps file uploads at `10 MB`, and blocks files containing binary NUL bytes (`\0`).

## Scope & Known Limitations

- **Trusted Execution Environment**: Security assumes the user's browser, OS, and installed extensions are not compromised. Running offline via `file://` relies on browser origin rules rather than HTTP response headers (`vercel.json`).
- **Heuristic Pattern Detection**: Regex and checksum rules balance false positives against recall; they cannot guarantee 100% detection of unstructured free-form names/addresses or custom proprietary identifiers.
- **Frozen Engine Boundaries**:
  - `detectEmails()` can exhibit quadratic backtracking on large, crafted inputs containing long punctuation-delimited strings without valid `@domain.tld` suffixes.
  - `detectIPv6()` can truncate mixed IPv4-mapped IPv6 literals (`::ffff:192.168.1.1`) prior to the full IPv4 suffix.
  - CSV exports preserve non-PII cell values byte-for-byte without neutralizing leading `=`, `+`, `-`, or `@` formula prefixes (and Partial Mask on `+`-prefixed phone numbers retains a leading `+`). Review untrusted CSV files before opening them with formula evaluation enabled in spreadsheet software.
- **Client-Side Resource Limits**: Interactive typing runs synchronously on the UI thread (debounced at `40–350 ms`); diff HTML previews are bounded at `250,000` characters and `8,000` spans while Copy and Download preserve full output.

## Reporting a Vulnerability

If you discover a security bug or bypass, please avoid disclosing exploit payloads publicly with live user data and report reproduction steps directly to the repository maintainers.
