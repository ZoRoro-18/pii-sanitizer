(() => {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;

  // =========================================================================
  // Constants & Configuration
  // =========================================================================

  const LARGE_PREVIEW_CHAR_LIMIT = 250000;
  const LARGE_PREVIEW_SPAN_LIMIT = 8000;
  const CARD_MIN_DIGITS = 13;
  const CARD_MAX_DIGITS = 19;
  const AADHAAR_DIGIT_LENGTH = 12;
  const E164_MIN_DIGITS = 10;
  const E164_MAX_DIGITS = 15;
  const LOOKBACK_CONTEXT_CHARS = 32;
  const VERSION_LOOKBACK_CHARS = 20;
  const CSV_DELIM_SAMPLE_LIMIT = 2000;
  const OVERLAP_FAST_THRESHOLD = 256;
  const OVERLAP_BITSET_MAX_LENGTH = 8000000;
  const SELF_TEST_STRESS_BYTES = 1050 * 1024;
  const SELF_TEST_MAX_MS = 2000;

  const PRIORITY = {
    CREDIT_CARD: 1,
    EMAIL: 2,
    IPV6: 3,
    IPV4: 4,
    AADHAAR: 5,
    PAN: 6,
    PHONE: 7,
  };

  const TYPE_LABELS = {
    EMAIL: 'Email',
    PHONE: 'Phone',
    IPV4: 'IP (IPv4)',
    IPV6: 'IP (IPv6)',
    IP: 'IP',
    PAN: 'PAN',
    AADHAAR: 'Aadhaar',
    CREDIT_CARD: 'Credit Card',
  };

  const PSEUDONYM_PREFIX = {
    EMAIL: 'EMAIL',
    PHONE: 'PHONE',
    IPV4: 'IP',
    IPV6: 'IP',
    PAN: 'PAN',
    AADHAAR: 'AADHAAR',
    CREDIT_CARD: 'CARD',
  };

  // Verhoeff multiplication, permutation, and inverse tables
  const VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];

  const VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];

  const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

  const SAMPLE_TEXT = [
    '=== SUPPORT TICKET #TKT-2026-4419 ===',
    'Date: 2026-11-27 12:38:58 | App Version: v2.4.1.0',
    'Customer: Priya Sharma (नमस्ते)',
    'Primary Email: priya.sharma@finserve.in',
    'Billing Contact: PRIYA.SHARMA@finserve.in | Escalation: support-audit@finserve.in',
    'Mobile (IN): +91 98765 43210 | Alt Dial: 0091-9876543210',
    'Secondary Mobile: 98201-44556 | US Callback: +1 (415) 555-0192',
    '',
    '=== PAYMENT & KYC VERIFICATION ===',
    'Primary Card (Visa): 4532-0151-1283-0366',
    'Corporate Card (Amex): 3782-822463-10005',
    'Domestic Card (RuPay): 6074-8200-1234-5673',
    'Rejected Card Attempt #1: 4532-0151-1283-0367',
    'Rejected Card Attempt #2: 9999-8888-7777-6666',
    'Primary PAN: ABCDE1234F | Co-applicant PAN: BZTPS4821K',
    'Primary Aadhaar: 4829 3104 7561 | Co-applicant Aadhaar: 7391-5028-4619',
    '',
    '=== SERVER ACCESS & WAF LOGS ===',
    '2026-11-27T12:31:09Z INFO  auth-svc client_ip=192.168.1.45 gateway=10.0.42.199 status=200',
    '2026-11-27T12:34:56Z WARN  waf-edge blocked_probe="<script>alert(1)</script>" malformed_ip=999.256.1.1',
    '2026-11-27T12:36:12Z INFO  ipv6-router src=2001:0db8:85a3:0000:0000:8a2e:0370:7334 link_local=fe80::1ff:fe23:4567:890a',
  ].join('\n');

  const HTML_ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  const HEX_GROUP_RE = /^[0-9A-Fa-f]{1,4}$/;
  const NON_PII_SUFFIX_HYPHEN_RE = /\b(?:ord|order|inv|invoice|txn|trans|ref|po|tkt|ticket|req|sku|awb|trk|track|oid|case|doc|job|run|batch|trace|span|corr|uuid)[A-Za-z0-9_]*-$/i;
  const NON_PII_LABEL_RE = /\b(?:order|invoice|tracking|transaction|ticket|shipment|reference|booking|receipt|request|case|job|batch|trace)\s*(?:id|no|num|number|code|#)\s*[:=#-]?\s*$/i;
  const NON_PII_KEY_VALUE_RE = /\b(?:order|invoice|tracking|txn|ticket|shipment|ref)[_-](?:id|no|num)\s*[:=]\s*$/i;
  const VERSION_PREFIX_RE = /(?:\b(?:ver|version|release|app_version|api_version)[\s:=_-]*$|\bv[-:=]$)/i;

  // =========================================================================
  // Pure Utility Helpers
  // =========================================================================

  /**
   * Escapes HTML special characters (`&`, `<`, `>`, `"`, `'`) to prevent XSS when injecting DOM highlights.
   * @param {string} str - Untrusted input string.
   * @returns {string} HTML-escaped string.
   */
  function escapeHtml(str) {
    const s = String(str);
    if (!/[&<>"']/.test(s)) return s;
    return s.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
  }

  function getEntityGroup(type) {
    return type === 'IPV4' || type === 'IPV6' ? 'IP' : type;
  }

  /**
   * Derives the default download filename while preserving `.csv` vs `.txt` extensions.
   * @param {string|null} originalFilename - Uploaded filename, or null when pasting text.
   * @param {boolean} isCsv - Whether CSV-aware mode is active.
   * @returns {string} Sanitized output filename.
   */
  function buildDownloadFilename(originalFilename, isCsv) {
    const ext = isCsv ? '.csv' : '.txt';
    if (!originalFilename) {
      return `sanitized_output${ext}`;
    }
    const dotIdx = originalFilename.lastIndexOf('.');
    const base = dotIdx > 0 ? originalFilename.slice(0, dotIdx) : originalFilename;
    return `${base}_sanitized${ext}`;
  }

  // =========================================================================
  // Validators: Luhn, Card Brand, Verhoeff, IPv4, IPv6
  // =========================================================================

  /**
   * Validates a numeric string (13–19 digits) against the standard Luhn modulo-10 checksum.
   * @param {string} digits - Digit-only card candidate string.
   * @returns {boolean} True when Luhn-valid.
   */
  function isValidLuhn(digits) {
    if (!/^\d{13,19}$/.test(digits)) return false;
    let sum = 0;
    let shouldDouble = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let d = digits.charCodeAt(i) - 48;
      if (shouldDouble) {
        d *= 2;
        if (d > 9) d -= 9;
      }
      sum += d;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }

  /**
   * Classifies a card digit sequence into Visa, Mastercard, RuPay, Amex, or generic Card.
   * @param {string} digits - Digit-only card number.
   * @returns {'Visa'|'Mastercard'|'RuPay'|'Amex'|'Card'} Detected card network brand.
   */
  function detectCardBrand(digits) {
    const len = digits.length;
    if (digits.startsWith('4') && (len === 13 || len === 16 || len === 19)) {
      return 'Visa';
    }
    if (len === 16) {
      const p2 = Number(digits.slice(0, 2));
      const p4 = Number(digits.slice(0, 4));
      if ((p2 >= 51 && p2 <= 55) || (p4 >= 2221 && p4 <= 2720)) {
        return 'Mastercard';
      }
      if (
        digits.startsWith('60') ||
        digits.startsWith('6521') ||
        digits.startsWith('6522') ||
        digits.startsWith('81') ||
        digits.startsWith('82') ||
        digits.startsWith('508')
      ) {
        return 'RuPay';
      }
    }
    if (len === 15 && (digits.startsWith('34') || digits.startsWith('37'))) {
      return 'Amex';
    }
    return 'Card';
  }

  /**
   * Validates a numeric string against the Verhoeff dihedral group D5 checksum (used for Aadhaar).
   * @param {string} digits - Digit-only candidate string.
   * @returns {boolean} True when Verhoeff checksum passes.
   */
  function isValidVerhoeff(digits) {
    if (!/^\d+$/.test(digits)) return false;
    let c = 0;
    const len = digits.length;
    for (let i = 0; i < len; i++) {
      const digit = digits.charCodeAt(len - 1 - i) - 48;
      c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digit]];
    }
    return c === 0;
  }

  /**
   * Computes the Verhoeff trailing check digit for a digit payload.
   * @param {string} baseDigits - Payload digits excluding check digit.
   * @returns {string} Single check digit `'0'`–`'9'`.
   */
  function computeVerhoeffCheckDigit(baseDigits) {
    let c = 0;
    const len = baseDigits.length;
    for (let i = 0; i < len; i++) {
      const digit = baseDigits.charCodeAt(len - 1 - i) - 48;
      c = VERHOEFF_D[c][VERHOEFF_P[(i + 1) % 8][digit]];
    }
    return String(VERHOEFF_INV[c]);
  }

  /**
   * Checks strict dotted-quad IPv4 format with 0–255 bounds per octet.
   * @param {string} str - Candidate IPv4 string.
   * @returns {boolean} True when valid IPv4.
   */
  function isStrictIPv4(str) {
    return /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(str);
  }

  function validateUncompressedIPv6(str) {
    if (str.startsWith(':') || str.endsWith(':')) return false;
    const groups = str.split(':');
    if (groups.length === 8) {
      return groups.every((g) => HEX_GROUP_RE.test(g));
    }
    if (groups.length === 7 && groups[6].includes('.')) {
      return groups.slice(0, 6).every((g) => HEX_GROUP_RE.test(g)) && isStrictIPv4(groups[6]);
    }
    return false;
  }

  /**
   * Validates full, compressed (`::`), and IPv4-embedded IPv6 syntax.
   * @param {string} str - Candidate IPv6 string.
   * @returns {boolean} True when syntactically valid IPv6.
   */
  function isValidIPv6(str) {
    if (!str || str === '::' || str.includes(':::')) return false;
    const parts = str.split('::');
    if (parts.length > 2) return false;
    if (parts.length === 1) return validateUncompressedIPv6(str);

    const [left, right] = parts;
    if (left.startsWith(':') || left.endsWith(':') || right.startsWith(':') || right.endsWith(':')) {
      return false;
    }

    const leftGroups = left === '' ? [] : left.split(':');
    const rightGroups = right === '' ? [] : right.split(':');
    if (!leftGroups.every((g) => HEX_GROUP_RE.test(g))) return false;

    const rightCount = countRightIPv6Hextets(rightGroups);
    if (rightCount === -1) return false;

    const totalHextets = leftGroups.length + rightCount;
    return totalHextets >= 1 && totalHextets < 8;
  }

  function countRightIPv6Hextets(rightGroups) {
    if (rightGroups.length === 0) return 0;
    const last = rightGroups[rightGroups.length - 1];
    if (last.includes('.')) {
      if (!isStrictIPv4(last)) return -1;
      if (!rightGroups.slice(0, -1).every((g) => HEX_GROUP_RE.test(g))) return -1;
      return rightGroups.length + 1;
    }
    return rightGroups.every((g) => HEX_GROUP_RE.test(g)) ? rightGroups.length : -1;
  }

  // =========================================================================
  // Detectors (run independently on unmodified input string)
  // =========================================================================

  function hasNonPiiIdContext(text, start, raw) {
    if (raw.startsWith('+') || raw.startsWith('(+')) return false;
    const lookback = text.slice(Math.max(0, start - LOOKBACK_CONTEXT_CHARS), start);
    return (
      NON_PII_SUFFIX_HYPHEN_RE.test(lookback) ||
      NON_PII_LABEL_RE.test(lookback) ||
      NON_PII_KEY_VALUE_RE.test(lookback)
    );
  }

  function isVersionPrefix(text, start) {
    const lookback = text.slice(Math.max(0, start - VERSION_LOOKBACK_CHARS), start);
    return VERSION_PREFIX_RE.test(lookback);
  }

  function hasValidCardOrAadhaarBoundaries(text, start, end, allowDotPrev, allowDotNext) {
    if (start > 0 && /[\dA-Za-z_+]/.test(text[start - 1])) return false;
    if (end < text.length && /[\dA-Za-z_]/.test(text[end])) return false;
    if (start > 0 && (text[start - 1] === '-' || (allowDotPrev && text[start - 1] === '.'))) {
      if (start >= 2 && /\d/.test(text[start - 2])) return false;
    }
    if (end < text.length && (text[end] === '-' || (allowDotNext && text[end] === '.'))) {
      if (end + 1 < text.length && /\d/.test(text[end + 1])) return false;
    }
    return true;
  }

  function processCardCandidate(text, raw, start, end, state) {
    if (!hasValidCardOrAadhaarBoundaries(text, start, end, true, true)) return;
    if (hasNonPiiIdContext(text, start, raw)) return;

    const digits = raw.replace(/[ -]/g, '');
    if (digits.length < CARD_MIN_DIGITS || digits.length > CARD_MAX_DIGITS) return;
    if (digits.startsWith('00') || /^0+$/.test(digits)) return;

    if (isValidLuhn(digits)) {
      state.candidates.push({
        start,
        end,
        raw,
        normalized: digits,
        type: 'CREDIT_CARD',
        meta: { brand: detectCardBrand(digits) },
      });
      return;
    }
    state.luhnRejectedCount += 1;
    state.luhnRejectedZones.push({ start, end });
  }

  function detectCreditCards(text) {
    const state = { candidates: [], luhnRejectedZones: [], luhnRejectedCount: 0 };
    const re = /\d(?:[ -]?\d){12,18}/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      processCardCandidate(text, match[0], match.index, match.index + match[0].length, state);
    }
    return state;
  }

  function detectEmails(text) {
    const candidates = [];
    const re = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      const raw = match[0];
      const atIdx = raw.indexOf('@');
      const domain = raw.slice(atIdx + 1);
      if (domain.includes('..') || domain.startsWith('.') || domain.startsWith('-')) continue;
      candidates.push({
        start: match.index,
        end: match.index + raw.length,
        raw,
        normalized: raw.trim().toLowerCase(),
        type: 'EMAIL',
        meta: {},
      });
    }
    return candidates;
  }

  function hasValidIPv4Boundaries(text, start, end) {
    if (start > 0 && /[A-Za-z0-9_.]/.test(text[start - 1])) return false;
    if (end >= text.length) return true;
    if (/[A-Za-z0-9_]/.test(text[end])) return false;
    if (text[end] === '.' && end + 1 < text.length && /[\dA-Za-z.]/.test(text[end + 1])) return false;
    if ((text[end] === '-' || text[end] === '+') && end + 1 < text.length && /[A-Za-z]/.test(text[end + 1])) {
      return false;
    }
    return true;
  }

  function detectIPv4(text) {
    const candidates = [];
    const re = /\b(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}\b/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      const raw = match[0];
      const start = match.index;
      const end = start + raw.length;
      if (!hasValidIPv4Boundaries(text, start, end)) continue;
      if (isVersionPrefix(text, start)) continue;
      candidates.push({
        start,
        end,
        raw,
        normalized: raw.trim().toLowerCase(),
        type: 'IPV4',
        meta: {},
      });
    }
    return candidates;
  }

  function hasValidIPv6Boundaries(text, start, end, raw) {
    if (start > 0) {
      const prev = text[start - 1];
      if (/[0-9A-Za-z_]/.test(prev)) return false;
      if (prev === ':' && start >= 2 && /[0-9A-Fa-f:]/.test(text[start - 2])) return false;
    }
    if (end < text.length && /[0-9A-Za-z_]/.test(text[end])) return false;
    if (end < text.length && text[end] === ':' && raw.endsWith('::')) return false;
    return true;
  }

  function detectIPv6(text) {
    const candidates = [];
    const re = /(?:::|[0-9A-Fa-f]{1,4}:)[0-9A-Fa-f:]*(?:\d{1,3}(?:\.\d{1,3}){3})?/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      let raw = match[0];
      const start = match.index;
      let end = start + raw.length;

      // Strip a single trailing colon (e.g. prose punctuation) while keeping '::'
      if (raw.length > 1 && raw.endsWith(':') && !raw.endsWith('::')) {
        raw = raw.slice(0, -1);
        end -= 1;
      }

      if (!hasValidIPv6Boundaries(text, start, end, raw)) continue;
      if (!isValidIPv6(raw)) continue;

      candidates.push({
        start,
        end,
        raw,
        normalized: raw.trim().toLowerCase(),
        type: 'IPV6',
        meta: {},
      });
    }
    return candidates;
  }

  function detectPAN(text) {
    const candidates = [];
    const re = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      const raw = match[0];
      candidates.push({
        start: match.index,
        end: match.index + raw.length,
        raw,
        normalized: raw.toUpperCase(),
        type: 'PAN',
        meta: {},
      });
    }
    return candidates;
  }

  function detectAadhaar(text, strictVerhoeff) {
    const candidates = [];
    const re = /[2-9]\d{3}(?:([ -]?)\d{4}\1\d{4})/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      const raw = match[0];
      const start = match.index;
      const end = start + raw.length;

      if (!hasValidCardOrAadhaarBoundaries(text, start, end, false, false)) continue;
      if (hasNonPiiIdContext(text, start, raw)) continue;

      const digits = raw.replace(/[ -]/g, '');
      if (digits.length !== AADHAAR_DIGIT_LENGTH) continue;
      if (strictVerhoeff && !isValidVerhoeff(digits)) continue;

      candidates.push({
        start,
        end,
        raw,
        normalized: digits,
        type: 'AADHAAR',
        meta: {},
      });
    }
    return candidates;
  }

  function normalizePhoneDigits(raw, isIndianFormat) {
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('00')) {
      digits = digits.slice(2);
    } else if (digits.startsWith('0')) {
      digits = digits.slice(1);
    }
    if (digits.length === E164_MIN_DIGITS && /^[6-9]\d{9}$/.test(digits) && (isIndianFormat || !raw.startsWith('+'))) {
      digits = '91' + digits;
    }
    return digits;
  }

  function hasValidPhoneBoundaries(text, start, end, allowLeadingPlus) {
    if (start > 0) {
      const prev = text[start - 1];
      if (/[\dA-Za-z_.]/.test(prev)) return false;
      if (!allowLeadingPlus && prev === '+') return false;
      if (prev === '-' && start >= 2 && /\d/.test(text[start - 2])) return false;
    }
    if (end < text.length) {
      const next = text[end];
      if (/[\dA-Za-z_]/.test(next)) return false;
      if ((next === '-' || next === '.') && end + 1 < text.length && /\d/.test(text[end + 1])) return false;
    }
    return true;
  }

  function isLikelyDateOrIp(raw) {
    if (/\d{4}[-/.]\d{2}[-/.]\d{2}/.test(raw)) return true;
    if (/\d{2}[-/.]\d{2}[-/.]\d{4}/.test(raw)) return true;
    if (/^\+?\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) return true;
    return /(--|\.\.| {2})/.test(raw);
  }

  function collectIndianPhones(text) {
    const candidates = [];
    const indianRe =
      /(?:(?:\(\+91\)|(?:\+|00)?91|0)[ -]?)?(?:[6-9]\d{9}|[6-9]\d{4}[ -]\d{5}|[6-9]\d{2}[ -]\d{3}[ -]\d{4}|[6-9]\d{3}[ -]\d{3}[ -]\d{3})/g;
    let match;
    while ((match = indianRe.exec(text)) !== null) {
      const raw = match[0];
      const start = match.index;
      const end = start + raw.length;
      if (!hasValidPhoneBoundaries(text, start, end, raw.startsWith('+'))) continue;
      if (isLikelyDateOrIp(raw) || hasNonPiiIdContext(text, start, raw)) continue;

      const normalized = normalizePhoneDigits(raw, true);
      if (normalized.length !== 12) continue;

      candidates.push({ start, end, raw, normalized, type: 'PHONE', meta: {} });
    }
    return candidates;
  }

  function collectInternationalPhones(text) {
    const candidates = [];
    const intlRe = /\+[1-9]\d{0,2}(?:[ .-]?\(\d{1,5}\)|[ .-]?\d{1,5}){1,7}/g;
    let match;
    while ((match = intlRe.exec(text)) !== null) {
      const raw = match[0];
      const start = match.index;
      const end = start + raw.length;
      if (!/\d$/.test(raw)) continue;
      if (!hasValidPhoneBoundaries(text, start, end, true)) continue;
      if (isLikelyDateOrIp(raw) || hasNonPiiIdContext(text, start, raw)) continue;

      const digitsOnly = raw.replace(/\D/g, '');
      if (digitsOnly.length < E164_MIN_DIGITS || digitsOnly.length > E164_MAX_DIGITS) continue;

      candidates.push({
        start,
        end,
        raw,
        normalized: normalizePhoneDigits(raw, false),
        type: 'PHONE',
        meta: {},
      });
    }
    return candidates;
  }

  function detectPhones(text) {
    return collectIndianPhones(text).concat(collectInternationalPhones(text));
  }

  // =========================================================================
  // Overlap Resolution & Redaction Engine
  // =========================================================================

  function overlapsSortedZones(span, sortedZones) {
    let lo = 0;
    let hi = sortedZones.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const z = sortedZones[mid];
      if (span.end <= z.start) {
        hi = mid - 1;
      } else if (span.start >= z.end) {
        lo = mid + 1;
      } else {
        return true;
      }
    }
    return false;
  }

  function insertIfNonOverlapping(sortedAccepted, candidate) {
    let lo = 0;
    let hi = sortedAccepted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sortedAccepted[mid].start < candidate.start) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (lo > 0 && sortedAccepted[lo - 1].end > candidate.start) return false;
    if (lo < sortedAccepted.length && candidate.end > sortedAccepted[lo].start) return false;
    sortedAccepted.splice(lo, 0, candidate);
    return true;
  }

  function resolveWithOccupancyBuffer(filtered, textLength) {
    const occupied = new Uint8Array(textLength);
    const accepted = [];
    for (let i = 0; i < filtered.length; i++) {
      const c = filtered[i];
      let blocked = false;
      for (let p = c.start; p < c.end; p++) {
        if (occupied[p] !== 0) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        occupied.fill(1, c.start, c.end);
        accepted.push(c);
      }
    }
    accepted.sort((a, b) => a.start - b.start);
    return accepted;
  }

  function resolveOverlaps(candidates, luhnRejectedZones, textLength) {
    const filtered =
      luhnRejectedZones.length === 0
        ? candidates.slice()
        : candidates.filter((c) => {
            if (c.type !== 'AADHAAR' && c.type !== 'PHONE') return true;
            return !overlapsSortedZones(c, luhnRejectedZones);
          });

    filtered.sort((a, b) => {
      const pDiff = PRIORITY[a.type] - PRIORITY[b.type];
      if (pDiff !== 0) return pDiff;
      const lenDiff = (b.end - b.start) - (a.end - a.start);
      if (lenDiff !== 0) return lenDiff;
      return a.start - b.start;
    });

    if (
      filtered.length > OVERLAP_FAST_THRESHOLD &&
      typeof textLength === 'number' &&
      textLength > 0 &&
      textLength <= OVERLAP_BITSET_MAX_LENGTH
    ) {
      return resolveWithOccupancyBuffer(filtered, textLength);
    }

    const acceptedSorted = [];
    for (let i = 0; i < filtered.length; i++) {
      insertIfNonOverlapping(acceptedSorted, filtered[i]);
    }
    return acceptedSorted;
  }

  function maskDigitsKeepLast(str, keepCount) {
    let totalDigits = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code >= 48 && code <= 57) totalDigits++;
    }
    const maskUntil = Math.max(0, totalDigits - keepCount);
    const out = [];
    let seen = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      if (code >= 48 && code <= 57) {
        out.push(seen < maskUntil ? 'X' : str[i]);
        seen++;
      } else {
        out.push(str[i]);
      }
    }
    return out.join('');
  }

  function formatPartialMask(span) {
    const raw = span.raw;
    switch (span.type) {
      case 'EMAIL': {
        const atIdx = raw.indexOf('@');
        return `${raw.slice(0, atIdx).charAt(0)}***@${raw.slice(atIdx + 1)}`;
      }
      case 'PHONE':
      case 'AADHAAR':
      case 'CREDIT_CARD':
        return maskDigitsKeepLast(raw, 4);
      case 'PAN':
        return `${raw.slice(0, 2)}XXXXXXX${raw.slice(9)}`;
      case 'IPV4': {
        const firstDot = raw.indexOf('.');
        return `${raw.slice(0, firstDot)}.XXX.XXX.XXX`;
      }
      case 'IPV6': {
        if (raw.startsWith('::')) {
          return '::' + raw.slice(2).replace(/[0-9A-Fa-f]+/g, 'XXXX');
        }
        const firstColon = raw.indexOf(':');
        return raw.slice(0, firstColon) + raw.slice(firstColon).replace(/[0-9A-Fa-f]+/g, 'XXXX');
      }
      default:
        return '[REDACTED]';
    }
  }

  function createScanSession(options = {}) {
    return {
      mode: options.mode || 'full',
      strictVerhoeff: options.strictVerhoeff !== undefined ? Boolean(options.strictVerhoeff) : true,
      enabledEntities: {
        EMAIL: options.enabledEntities?.EMAIL ?? true,
        PHONE: options.enabledEntities?.PHONE ?? true,
        IP: options.enabledEntities?.IP ?? true,
        PAN: options.enabledEntities?.PAN ?? true,
        AADHAAR: options.enabledEntities?.AADHAAR ?? true,
        CREDIT_CARD: options.enabledEntities?.CREDIT_CARD ?? true,
      },
      pseudonymMap: new Map(),
      counters: {
        EMAIL: 0,
        PHONE: 0,
        IP: 0,
        PAN: 0,
        AADHAAR: 0,
        CARD: 0,
      },
      stats: {
        total: 0,
        EMAIL: 0,
        PHONE: 0,
        IP: 0,
        PAN: 0,
        AADHAAR: 0,
        CREDIT_CARD: 0,
        luhnRejectedCount: 0,
      },
    };
  }

  function resolveReplacement(span, session) {
    if (session.mode === 'full') return '[REDACTED]';
    if (session.mode === 'partial') return formatPartialMask(span);

    const group = getEntityGroup(span.type);
    const key = `${group}:${span.normalized}`;
    const existing = session.pseudonymMap.get(key);
    if (existing) {
      existing.count += 1;
      return existing.placeholder;
    }

    const prefix = PSEUDONYM_PREFIX[span.type];
    session.counters[prefix] += 1;
    const placeholder = `${prefix}_${String(session.counters[prefix]).padStart(2, '0')}`;
    session.pseudonymMap.set(key, {
      placeholder,
      entityGroup: group,
      entityTypeLabel: TYPE_LABELS[group] || group,
      originalSample: span.raw,
      normalized: span.normalized,
      count: 1,
    });
    return placeholder;
  }

  function pushAll(target, items) {
    for (let i = 0; i < items.length; i++) {
      target.push(items[i]);
    }
  }

  function collectAllCandidates(text, session) {
    const candidates = [];
    let luhnRejectedZones = [];

    if (session.enabledEntities.CREDIT_CARD) {
      const ccRes = detectCreditCards(text);
      pushAll(candidates, ccRes.candidates);
      luhnRejectedZones = ccRes.luhnRejectedZones;
      session.stats.luhnRejectedCount += ccRes.luhnRejectedCount;
    }
    if (session.enabledEntities.EMAIL) pushAll(candidates, detectEmails(text));
    if (session.enabledEntities.IP) {
      pushAll(candidates, detectIPv6(text));
      pushAll(candidates, detectIPv4(text));
    }
    if (session.enabledEntities.AADHAAR) pushAll(candidates, detectAadhaar(text, session.strictVerhoeff));
    if (session.enabledEntities.PAN) pushAll(candidates, detectPAN(text));
    if (session.enabledEntities.PHONE) pushAll(candidates, detectPhones(text));

    return { candidates, luhnRejectedZones };
  }

  function applyReplacements(text, accepted, session) {
    const outChunks = [];
    let cursor = 0;

    for (let i = 0; i < accepted.length; i++) {
      const span = accepted[i];
      if (span.start > cursor) {
        outChunks.push(text.slice(cursor, span.start));
      }
      const replacement = resolveReplacement(span, session);
      span.replacement = replacement;
      outChunks.push(replacement);
      cursor = span.end;

      const group = getEntityGroup(span.type);
      session.stats.total += 1;
      session.stats[group] += 1;
    }

    if (cursor < text.length) {
      outChunks.push(text.slice(cursor));
    }
    return outChunks.join('');
  }

  function sanitizeSegment(text, session, collectRenderData = true) {
    if (!text) return { sanitizedText: '', spans: [] };
    const { candidates, luhnRejectedZones } = collectAllCandidates(text, session);
    const accepted = resolveOverlaps(candidates, luhnRejectedZones, text.length);
    return {
      sanitizedText: applyReplacements(text, accepted, session),
      spans: collectRenderData ? accepted : [],
    };
  }

  function getEntityLabelWithBrand(span) {
    const label = TYPE_LABELS[span.type] || span.type;
    const brandPart = span.meta && span.meta.brand ? ` (${span.meta.brand})` : '';
    return `${label}${brandPart}`;
  }

  function buildTooltip(span) {
    return `${getEntityLabelWithBrand(span)} → ${span.replacement}`;
  }

  function appendHighlightPair(origChunks, sanChunks, span, rawDisplay, repDisplay) {
    const group = getEntityGroup(span.type);
    const safeLabel = escapeHtml(getEntityLabelWithBrand(span));
    const tooltip = escapeHtml(buildTooltip(span));
    const safeRaw = escapeHtml(rawDisplay);
    const safeRep = escapeHtml(repDisplay);
    const safeAttrRep = escapeHtml(span.replacement);

    origChunks.push(
      `<mark class="pii-mark pii-${group}" data-group="${group}" data-label="${safeLabel}" data-rep="${safeAttrRep}" title="${tooltip}">${safeRaw}</mark>`
    );
    sanChunks.push(
      `<span class="sanitized-token pii-${group}" data-group="${group}" data-label="${safeLabel}" data-rep="${safeAttrRep}" title="${tooltip}">${safeRep}</span>`
    );
  }

  function buildPlainHighlightHtml(text, spans, previewCharLimit, previewSpanLimit) {
    const limit = typeof previewCharLimit === 'number' ? previewCharLimit : text.length;
    const spanLimit = typeof previewSpanLimit === 'number' ? previewSpanLimit : LARGE_PREVIEW_SPAN_LIMIT;
    const effectiveEnd = Math.min(text.length, limit);
    const origChunks = [];
    const sanChunks = [];
    let cursor = 0;
    let renderedSpans = 0;
    let spanLimited = false;

    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      if (span.start >= effectiveEnd) break;
      if (renderedSpans >= spanLimit) {
        spanLimited = true;
        break;
      }
      if (span.start > cursor) {
        const plain = escapeHtml(text.slice(cursor, span.start));
        origChunks.push(plain);
        sanChunks.push(plain);
      }
      appendHighlightPair(origChunks, sanChunks, span, span.raw, span.replacement);
      cursor = span.end;
      renderedSpans += 1;
    }

    if (!spanLimited && cursor < effectiveEnd) {
      const tail = escapeHtml(text.slice(cursor, effectiveEnd));
      origChunks.push(tail);
      sanChunks.push(tail);
    }

    return {
      originalHtml: origChunks.join(''),
      sanitizedHtml: sanChunks.join(''),
      truncated: text.length > effectiveEnd || spanLimited,
    };
  }

  // =========================================================================
  // RFC 4180 CSV Parser & Serializer
  // =========================================================================

  function detectCsvDelimiter(text) {
    const firstLineEnd = text.search(/\r?\n/);
    const maxLen = firstLineEnd === -1 ? CSV_DELIM_SAMPLE_LIMIT : Math.min(firstLineEnd, CSV_DELIM_SAMPLE_LIMIT);
    const sample = text.slice(0, maxLen);
    let inQuotes = false;
    let commas = 0;
    let semicolons = 0;
    let tabs = 0;

    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i];
      if (ch === '"') {
        if (inQuotes && sample[i + 1] === '"') i++;
        else inQuotes = !inQuotes;
        continue;
      }
      if (inQuotes) continue;
      if (ch === ',') commas++;
      else if (ch === ';') semicolons++;
      else if (ch === '\t') tabs++;
    }

    if (commas > 0) return ',';
    if (tabs > 0 && tabs >= semicolons) return '\t';
    if (semicolons > 0) return ';';
    return ',';
  }

  function consumeCsvLineEnding(text, len, cursor) {
    const i = cursor.index;
    if (i >= len) return '';
    if (text[i] === '\r') {
      if (i + 1 < len && text[i + 1] === '\n') {
        cursor.index += 2;
        return '\r\n';
      }
      cursor.index += 1;
      return '\r';
    }
    if (text[i] === '\n') {
      cursor.index += 1;
      return '\n';
    }
    return '';
  }

  function readQuotedCsvCell(text, delimiter, len, cursor) {
    cursor.index += 1; // skip opening quote
    const valChunks = [];
    while (cursor.index < len) {
      const segStart = cursor.index;
      while (cursor.index < len && text[cursor.index] !== '"') cursor.index++;
      if (cursor.index > segStart) valChunks.push(text.slice(segStart, cursor.index));
      if (cursor.index >= len) break;
      if (cursor.index + 1 < len && text[cursor.index + 1] === '"') {
        valChunks.push('"');
        cursor.index += 2;
      } else {
        cursor.index += 1; // skip closing quote
        break;
      }
    }
    // Consume any stray characters after closing quote up to delimiter or EOL
    while (
      cursor.index < len &&
      text[cursor.index] !== delimiter &&
      text[cursor.index] !== '\n' &&
      text[cursor.index] !== '\r'
    ) {
      cursor.index++;
    }
    return { value: valChunks.length === 1 ? valChunks[0] : valChunks.join(''), wasQuoted: true };
  }

  function readUnquotedCsvCell(text, delimiter, len, cursor) {
    const start = cursor.index;
    while (
      cursor.index < len &&
      text[cursor.index] !== delimiter &&
      text[cursor.index] !== '\n' &&
      text[cursor.index] !== '\r'
    ) {
      cursor.index++;
    }
    return { value: text.slice(start, cursor.index), wasQuoted: false };
  }

  function parseCsvRow(text, delimiter, len, cursor) {
    const cells = [];
    while (true) {
      const isQuoted = cursor.index < len && text[cursor.index] === '"';
      cells.push(isQuoted ? readQuotedCsvCell(text, delimiter, len, cursor) : readUnquotedCsvCell(text, delimiter, len, cursor));
      if (cursor.index >= len || text[cursor.index] !== delimiter) break;

      cursor.index += 1;
      if (!isQuoted && cursor.index === len) {
        cells.push({ value: '', wasQuoted: false });
        break;
      }
    }
    return { cells, lineEnding: consumeCsvLineEnding(text, len, cursor) };
  }

  /**
   * Parses CSV input per RFC 4180 while preserving quoting state and exact row line endings.
   * @param {string} text - Raw CSV payload.
   * @param {string} [forcedDelimiter] - Optional explicit delimiter (`,` / `;` / `\t`).
   * @returns {{ delimiter: string, rows: Array<{ cells: Array<{ value: string, wasQuoted: boolean }>, lineEnding: string }> }} Parsed delimiter and rows.
   */
  function parseCsvRfc4180(text, forcedDelimiter) {
    const delimiter = forcedDelimiter || detectCsvDelimiter(text);
    const rows = [];
    if (text.length === 0) return { delimiter, rows };

    const cursor = { index: 0 };
    const len = text.length;
    while (cursor.index < len) {
      rows.push(parseCsvRow(text, delimiter, len, cursor));
    }
    return { delimiter, rows };
  }

  function requiresCsvQuoting(value, wasQuoted, delimiter) {
    return (
      wasQuoted ||
      value.includes(delimiter) ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r')
    );
  }

  function serializeCsvCell(value, wasQuoted, delimiter) {
    if (!requiresCsvQuoting(value, wasQuoted, delimiter)) return value;
    return `"${value.replace(/"/g, '""')}"`;
  }

  function formatCsvCellLiteral(text, wasQuoted) {
    return wasQuoted ? text.replace(/"/g, '""') : text;
  }

  function appendCsvPlainSegment(origChunks, sanChunks, seg, wasQuoted, sanNeedsQuote) {
    origChunks.push(escapeHtml(formatCsvCellLiteral(seg, wasQuoted)));
    sanChunks.push(escapeHtml(formatCsvCellLiteral(seg, sanNeedsQuote)));
  }

  function appendCsvMatchedSpan(origChunks, sanChunks, span, wasQuoted, sanNeedsQuote) {
    appendHighlightPair(
      origChunks,
      sanChunks,
      span,
      formatCsvCellLiteral(span.raw, wasQuoted),
      formatCsvCellLiteral(span.replacement, sanNeedsQuote)
    );
  }

  function buildCsvCellHighlightHtml(cellValue, spans, wasQuoted, delimiter, sanitizedValue, maxChars, maxSpans) {
    const effectiveEnd = Math.min(cellValue.length, typeof maxChars === 'number' ? maxChars : cellValue.length);
    const spanLimit = typeof maxSpans === 'number' ? maxSpans : spans.length;
    const origChunks = wasQuoted ? ['&quot;'] : [];
    const sanNeedsQuote = requiresCsvQuoting(sanitizedValue, wasQuoted, delimiter);
    const sanChunks = sanNeedsQuote ? ['&quot;'] : [];
    let cursor = 0;
    let renderedSpans = 0;

    for (let i = 0; i < spans.length && spans[i].start < effectiveEnd && renderedSpans < spanLimit; i++) {
      const span = spans[i];
      if (span.start > cursor) appendCsvPlainSegment(origChunks, sanChunks, cellValue.slice(cursor, span.start), wasQuoted, sanNeedsQuote);
      appendCsvMatchedSpan(origChunks, sanChunks, span, wasQuoted, sanNeedsQuote);
      cursor = span.end;
      renderedSpans += 1;
    }

    const spanLimited = renderedSpans >= spanLimit && spans.length > renderedSpans && spans[renderedSpans].start < effectiveEnd;
    if (!spanLimited && cursor < effectiveEnd) {
      appendCsvPlainSegment(origChunks, sanChunks, cellValue.slice(cursor, effectiveEnd), wasQuoted, sanNeedsQuote);
      cursor = effectiveEnd;
    }
    const truncated = cellValue.length > effectiveEnd || spanLimited;
    if (!truncated) {
      if (wasQuoted) origChunks.push('&quot;');
      if (sanNeedsQuote) sanChunks.push('&quot;');
    }
    return { originalHtml: origChunks.join(''), sanitizedHtml: sanChunks.join(''), renderedChars: cursor + (wasQuoted ? 2 : 0), renderedSpans, truncated };
  }

  // =========================================================================
  // Top-Level Sanitization Entry Point
  // =========================================================================

  function sanitizePlainText(text, session, buildHtml, previewLimit) {
    const res = sanitizeSegment(text, session, buildHtml);
    let originalHtml = '';
    let sanitizedHtml = '';
    let truncatedPreview = false;

    if (buildHtml) {
      const htmlRes = buildPlainHighlightHtml(text, res.spans, previewLimit, LARGE_PREVIEW_SPAN_LIMIT);
      originalHtml = htmlRes.originalHtml;
      sanitizedHtml = htmlRes.sanitizedHtml;
      truncatedPreview = htmlRes.truncated;
    }

    return {
      sanitizedText: res.sanitizedText,
      originalHtml,
      sanitizedHtml,
      truncatedPreview,
      stats: session.stats,
      mappings: Array.from(session.pseudonymMap.values()),
    };
  }

  function sanitizeCsvRow(row, delimiter, escapedDelimiter, session, buildHtml, previewState) {
    const rowCellsOut = [];
    const rowOrigHtml = [];
    const rowSanHtml = [];
    const startedUnderCap =
      buildHtml && previewState.chars < previewState.charLimit && previewState.spans < LARGE_PREVIEW_SPAN_LIMIT;
    if (buildHtml && !startedUnderCap) previewState.truncated = true;

    for (let c = 0; c < row.cells.length; c++) {
      const cell = row.cells[c];
      const remChars = Math.max(0, previewState.charLimit - previewState.chars);
      const remSpans = Math.max(0, LARGE_PREVIEW_SPAN_LIMIT - previewState.spans);
      const shouldRender = buildHtml && remChars > 0 && remSpans > 0;
      const cellRes = sanitizeSegment(cell.value, session, shouldRender);
      rowCellsOut.push(serializeCsvCell(cellRes.sanitizedText, cell.wasQuoted, delimiter));

      if (shouldRender) {
        const html = buildCsvCellHighlightHtml(
          cell.value,
          cellRes.spans,
          cell.wasQuoted,
          delimiter,
          cellRes.sanitizedText,
          remChars,
          remSpans
        );
        rowOrigHtml.push(html.originalHtml);
        rowSanHtml.push(html.sanitizedHtml);
        previewState.chars += html.renderedChars + 1;
        previewState.spans += html.renderedSpans;
        if (html.truncated) previewState.truncated = true;
      } else if (startedUnderCap) {
        previewState.truncated = true;
      }
    }

    return {
      rowText: rowCellsOut.join(delimiter) + row.lineEnding,
      origRowHtml: startedUnderCap ? rowOrigHtml.join(escapedDelimiter) + (previewState.truncated ? '' : escapeHtml(row.lineEnding)) : '',
      sanRowHtml: startedUnderCap ? rowSanHtml.join(escapedDelimiter) + (previewState.truncated ? '' : escapeHtml(row.lineEnding)) : '',
      rendered: startedUnderCap,
    };
  }

  function sanitizeCsvText(text, options, session, buildHtml, previewLimit) {
    const parsed = parseCsvRfc4180(text, options.csvDelimiter);
    const delimiter = parsed.delimiter;
    const escapedDelimiter = escapeHtml(delimiter);
    const outRows = [];
    const origHtmlChunks = [];
    const sanHtmlChunks = [];
    const previewState = { charLimit: previewLimit, chars: 0, spans: 0, truncated: false };

    for (let r = 0; r < parsed.rows.length; r++) {
      const rowRes = sanitizeCsvRow(parsed.rows[r], delimiter, escapedDelimiter, session, buildHtml, previewState);
      outRows.push(rowRes.rowText);
      if (rowRes.rendered) {
        origHtmlChunks.push(rowRes.origRowHtml);
        sanHtmlChunks.push(rowRes.sanRowHtml);
      }
    }

    return {
      sanitizedText: outRows.join(''),
      originalHtml: origHtmlChunks.join(''),
      sanitizedHtml: sanHtmlChunks.join(''),
      truncatedPreview: previewState.truncated,
      stats: session.stats,
      mappings: Array.from(session.pseudonymMap.values()),
      csvDelimiter: delimiter,
    };
  }

  /**
   * Runs single-pass PII detection, checksum validation, priority overlap resolution,
   * redaction, and XSS-safe HTML diff generation across plain text or RFC 4180 CSV input.
   * @param {string} text - Raw input payload.
   * @param {Object} [options] - Configuration options.
   * @param {'full'|'partial'|'pseudonym'} [options.mode='full'] - Redaction mode.
   * @param {boolean} [options.strictVerhoeff=true] - Require Verhoeff checksum for Aadhaar.
   * @param {boolean} [options.isCsv=false] - Enable RFC 4180 cell-by-cell CSV handling.
   * @param {string} [options.csvDelimiter] - Optional CSV delimiter override.
   * @param {Object} [options.enabledEntities] - Per-entity include/exclude boolean flags.
   * @param {number} [options.previewLimit=250000] - Character limit for rendered HTML diff preview.
   * @param {boolean} [options.buildHtml=true] - Whether to construct HTML preview strings.
   * @returns {{ sanitizedText: string, originalHtml: string, sanitizedHtml: string, truncatedPreview: boolean, stats: Object, mappings: Array, csvDelimiter?: string }} Sanitized payload and audit metadata.
   */
  function sanitizeInput(text, options = {}) {
    const isCsv = Boolean(options.isCsv);
    const previewLimit = typeof options.previewLimit === 'number' ? options.previewLimit : LARGE_PREVIEW_CHAR_LIMIT;
    const buildHtml = options.buildHtml !== false;
    const session = createScanSession(options);

    if (!text) {
      return {
        sanitizedText: '',
        originalHtml: '',
        sanitizedHtml: '',
        truncatedPreview: false,
        stats: session.stats,
        mappings: [],
      };
    }

    if (isCsv) {
      return sanitizeCsvText(text, options, session, buildHtml, previewLimit);
    }
    return sanitizePlainText(text, session, buildHtml, previewLimit);
  }

  // =========================================================================
  // Built-In Self-Test Suite (window.runSelfTests)
  // =========================================================================

  function createTestHarness() {
    const results = [];
    function test(name, fn) {
      try {
        fn();
        results.push({ name, passed: true, error: null });
      } catch (err) {
        results.push({ name, passed: false, error: err && err.message ? err.message : String(err) });
      }
    }
    function assert(cond, msg) {
      if (!cond) throw new Error(msg || 'Assertion failed');
    }
    function assertEqual(actual, expected, msg) {
      if (actual !== expected) {
        throw new Error(`${msg ? msg + ': ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    }
    return { test, assert, assertEqual, results };
  }

  function registerValidatorTests({ test, assert, assertEqual }) {
    test('Luhn accepts Visa, Mastercard (51-55 & 2221-2720), Amex, RuPay', () => {
      assert(isValidLuhn('4532015112830366'), 'Visa valid');
      assert(isValidLuhn('5412751234567898'), 'Mastercard 5x valid');
      assert(isValidLuhn('2221000000000009'), 'Mastercard 2221 valid');
      assert(isValidLuhn('378282246310005'), 'Amex valid');
      assert(isValidLuhn('6074820012345673'), 'RuPay valid');
      assertEqual(detectCardBrand('4532015112830366'), 'Visa');
      assertEqual(detectCardBrand('5412751234567898'), 'Mastercard');
      assertEqual(detectCardBrand('2221000000000009'), 'Mastercard');
      assertEqual(detectCardBrand('378282246310005'), 'Amex');
      assertEqual(detectCardBrand('6074820012345673'), 'RuPay');
      assertEqual(detectCardBrand('3530111333300000'), 'Card');
    });

    test('Luhn rejects invalid 16-digit numbers and prevents Phone/Aadhaar false positives', () => {
      assert(!isValidLuhn('4532015112830367'), 'Invalid Visa fails Luhn');
      assert(!isValidLuhn('9999888877776666'), 'Invalid 9999 card fails Luhn');
      const res = sanitizeInput('Bad1: 4532-0151-1283-0367 Bad2: 9999-8888-7777-6666', { mode: 'full', strictVerhoeff: false });
      assertEqual(res.stats.CREDIT_CARD, 0);
      assertEqual(res.stats.AADHAAR, 0);
      assertEqual(res.stats.PHONE, 0);
      assertEqual(res.stats.total, 0);
      assertEqual(res.stats.luhnRejectedCount, 2);
    });

    test('Verhoeff validates valid Aadhaar digits and rejects mutations/transpositions', () => {
      assert(isValidVerhoeff('2363'), 'Known vector 2363');
      assert(isValidVerhoeff('482931047561'), 'Aadhaar 1 valid');
      assert(isValidVerhoeff('739150284619'), 'Aadhaar 2 valid');
      assert(!isValidVerhoeff('482931047562'), 'Single digit error caught');
      assert(!isValidVerhoeff('482931047516'), 'Transposition error caught');
    });

    test('Strict Aadhaar Verhoeff toggle controls non-checksum 12-digit matching', () => {
      const text = 'Aadhaar candidate: 4829 3104 7562';
      assertEqual(sanitizeInput(text, { strictVerhoeff: true }).stats.AADHAAR, 0);
      assertEqual(sanitizeInput(text, { strictVerhoeff: false }).stats.AADHAAR, 1);
    });
  }

  function registerDetectorTests({ test, assert, assertEqual }) {
    test('IPv4 rejects out-of-range, 5-octet, and version strings', () => {
      const res = sanitizeInput('ok=192.168.1.45 ok2=10.0.42.199 bad=999.256.1.1 five=1.2.3.4.5 ver=v2.4.1.0', { mode: 'full' });
      assertEqual(res.stats.IP, 2);
      assert(res.sanitizedText.includes('999.256.1.1'));
      assert(res.sanitizedText.includes('1.2.3.4.5'));
      assert(res.sanitizedText.includes('v2.4.1.0'));
    });

    test('IPv6 matches full & compressed formats and rejects timestamps/pseudo-classes', () => {
      const text = 'full=2001:0db8:85a3:0000:0000:8a2e:0370:7334 comp=fe80::1ff:fe23:4567:890a lo=::1 ts=12:34:56 css=div::before bad=2001:::1';
      const res = sanitizeInput(text, { mode: 'full' });
      assertEqual(res.stats.IP, 3);
      assert(res.sanitizedText.includes('12:34:56'));
      assert(res.sanitizedText.includes('div::before'));
      assert(res.sanitizedText.includes('2001:::1'));
    });

    test('Dates are never flagged as Phone or Aadhaar', () => {
      assertEqual(sanitizeInput('Dates: 2026-11-27 27-11-2026 2026/11/27 12:38:58', { mode: 'full' }).stats.total, 0);
    });

    test('PAN enforces uppercase and word boundaries', () => {
      assertEqual(sanitizeInput('Valid: ABCDE1234F BZTPS4821K Invalid: abcde1234f ABCDE1234F1', { mode: 'full' }).stats.PAN, 2);
    });

    test('Phone handles Indian, 0091, and E.164 international formats without Luhn collision', () => {
      const text = 'A:+91 98765 43210 B:0091-9876543210 C:98201-44556 D:+1 (415) 555-0192 E:+919876543210';
      const res = sanitizeInput(text, { mode: 'pseudonym', strictVerhoeff: false });
      assertEqual(res.stats.PHONE, 5);
      assertEqual(res.stats.AADHAAR, 0);
      assertEqual(res.stats.luhnRejectedCount, 0);
      assertEqual(res.mappings.length, 3);
      assert(res.sanitizedText.includes('A:PHONE_01 B:PHONE_01'));
    });
  }

  function registerModeTests({ test, assertEqual }) {
    test('Full Mask replaces every entity with [REDACTED]', () => {
      const res = sanitizeInput('e=a@b.com p=98201-44556 ip=192.168.1.45 pan=ABCDE1234F', { mode: 'full' });
      assertEqual(res.sanitizedText, 'e=[REDACTED] p=[REDACTED] ip=[REDACTED] pan=[REDACTED]');
    });

    test('Partial Mask produces exact format per entity type', () => {
      const input = ['john@gmail.com', '9876544321', 'ABCDE1234F', '4829 3104 7561', '4532-0151-1283-0366', '192.168.1.45', '2001:db8:1::2'].join(' | ');
      const expected = ['j***@gmail.com', 'XXXXXX4321', 'ABXXXXXXXF', 'XXXX XXXX 7561', 'XXXX-XXXX-XXXX-0366', '192.XXX.XXX.XXX', '2001:XXXX:XXXX::XXXX'].join(' | ');
      assertEqual(sanitizeInput(input, { mode: 'partial' }).sanitizedText, expected);
    });

    test('Consistent Pseudonymization assigns deterministic placeholders across variants', () => {
      const text = [
        'priya.sharma@finserve.in', 'PRIYA.SHARMA@finserve.in', 'other@finserve.in',
        '+91 98765 43210', '0091-9876543210', '192.168.1.45', 'fe80::1ff:fe23:4567:890a',
        'ABCDE1234F', '4829 3104 7561', '4532-0151-1283-0366',
      ].join('\n');
      const res = sanitizeInput(text, { mode: 'pseudonym' });
      assertEqual(res.sanitizedText, ['EMAIL_01', 'EMAIL_01', 'EMAIL_02', 'PHONE_01', 'PHONE_01', 'IP_01', 'IP_02', 'PAN_01', 'AADHAAR_01', 'CARD_01'].join('\n'));
      assertEqual(res.mappings.find((m) => m.placeholder === 'EMAIL_01').count, 2);
    });

    test('Overlap priority resolves CREDIT_CARD > EMAIL > IPV6 > IPV4 > AADHAAR > PAN > PHONE', () => {
      const res = sanitizeInput('Mail: ABCDE1234F@finserve.in', { mode: 'pseudonym' });
      assertEqual(res.stats.EMAIL, 1);
      assertEqual(res.stats.PAN, 0);
      assertEqual(res.sanitizedText, 'Mail: EMAIL_01');
    });
  }

  function registerCsvAndSafetyTests({ test, assert, assertEqual }) {
    test('CSV mode preserves quotes, escaped quotes, embedded newlines, CRLF, and shares map', () => {
      const csv = 'id,notes,contact\r\n1,"Line1, ""priya.sharma@finserve.in""\nCall +91 98765 43210",ABCDE1234F\r\n2,"Repeat: PRIYA.SHARMA@finserve.in",0091-9876543210\r\n';
      const expected = 'id,notes,contact\r\n1,"Line1, ""EMAIL_01""\nCall PHONE_01",PAN_01\r\n2,"Repeat: EMAIL_01",PHONE_01\r\n';
      const res = sanitizeInput(csv, { isCsv: true, mode: 'pseudonym' });
      assertEqual(res.sanitizedText, expected);
      assertEqual(res.stats.EMAIL, 2);
      assertEqual(res.stats.PHONE, 2);
      assertEqual(res.stats.PAN, 1);
    });

    test('XSS payloads are strictly HTML-escaped and Unicode preserves indices', () => {
      const text = 'नमस्ते 🔒 <script>alert(1)</script> email=priya.sharma@finserve.in "quote"';
      const res = sanitizeInput(text, { mode: 'full' });
      assert(!res.originalHtml.includes('<script>'));
      assert(!res.sanitizedHtml.includes('<script>'));
      assert(res.originalHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
      assert(res.sanitizedText.startsWith('नमस्ते 🔒 <script>alert(1)</script> email=[REDACTED]'));
    });

    test('Sample dataset detects all expected entities and exactly 2 Luhn-rejected numbers', () => {
      const res = sanitizeInput(SAMPLE_TEXT, { mode: 'pseudonym', strictVerhoeff: true });
      assertEqual(res.stats.EMAIL, 3);
      assertEqual(res.stats.PHONE, 4);
      assertEqual(res.stats.CREDIT_CARD, 3);
      assertEqual(res.stats.PAN, 2);
      assertEqual(res.stats.AADHAAR, 2);
      assertEqual(res.stats.IP, 4);
      assertEqual(res.stats.total, 18);
      assertEqual(res.stats.luhnRejectedCount, 2);
    });

    test('Entity toggle filtering and download filename generation work properly', () => {
      const res = sanitizeInput('priya.sharma@finserve.in 192.168.1.45', {
        mode: 'full',
        enabledEntities: { EMAIL: false, PHONE: true, IP: true, PAN: true, AADHAAR: true, CREDIT_CARD: true },
      });
      assertEqual(res.stats.EMAIL, 0);
      assertEqual(res.stats.IP, 1);
      assertEqual(res.sanitizedText, 'priya.sharma@finserve.in [REDACTED]');
      assertEqual(buildDownloadFilename('users.csv', true), 'users_sanitized.csv');
      assertEqual(buildDownloadFilename('notes.txt', false), 'notes_sanitized.txt');
      assertEqual(buildDownloadFilename(null, false), 'sanitized_output.txt');
    });
  }

  function registerEdgeTests({ test, assert, assertEqual }) {
    test('Empty & whitespace-only input returns 0 entities and empty output cleanly', () => {
      const empty = sanitizeInput('', { mode: 'pseudonym' });
      assertEqual(empty.stats.total, 0);
      assertEqual(empty.stats.luhnRejectedCount, 0);
      assertEqual(empty.sanitizedText, '');
      assertEqual(empty.mappings.length, 0);

      const wsText = '   \n\t  ';
      const ws = sanitizeInput(wsText, { mode: 'full' });
      assertEqual(ws.stats.total, 0);
      assertEqual(ws.sanitizedText, wsText);
    });

    test('Dates, timestamps, order IDs, and software versions are never flagged', () => {
      const text = [
        'dates: 2026-11-27 12/05/2025 27-11-2026 2026.11.27',
        'times: 14:35:09 2026-11-27T14:35:09Z 14:35:09+05:30',
        'orders: ORD-9876543210 ORD_9876543210 ORDER-98765-43210 TXN-4829-3104-7561 INV-4532015112830367 Order ID: 9876543210 order_id=9876543210',
        'versions: v1.2.3.4 v2.4.1.0 version=1.2.3.4 ver:1.2.3.4 1.2.3.4-beta 1.2.3.4+build.5',
        'long_keys: 12345678901234567890 9876-5432-1098-7654-3210-1234-5678',
      ].join('\n');
      const res = sanitizeInput(text, { mode: 'full', strictVerhoeff: false });
      assertEqual(res.stats.total, 0);
      assertEqual(res.stats.luhnRejectedCount, 0);
      assertEqual(res.sanitizedText, text);
    });

    test('Luhn-valid and Luhn-rejected cards never leak into Phone or Aadhaar', () => {
      const text = 'valid_visa=4532-0151-1283-0366 valid_amex=3782-822463-10005 bad_with_mobile_tail=4532-98765-43210 bad_with_aadhaar_prefix=5555-9876-5432-1098 bad_plain=9999-8888-7777-6666';
      const res = sanitizeInput(text, { mode: 'full', strictVerhoeff: false });
      assertEqual(res.stats.CREDIT_CARD, 2);
      assertEqual(res.stats.PHONE, 0);
      assertEqual(res.stats.AADHAAR, 0);
      assertEqual(res.stats.luhnRejectedCount, 3);
      assert(res.sanitizedText.includes('bad_with_mobile_tail=4532-98765-43210'));
    });
  }

  function registerPhoneEquivalenceTest({ test, assertEqual }) {
    test('Indian phones across +91, 0091, leading 0, spaces, and dashes share one key', () => {
      const variants = [
        '+91 98765 43210', '+91-98765-43210', '0091-9876543210', '0091 98765 43210',
        '91-98765-43210', '09876543210', '0 98765-43210', '98765 43210',
        '98765-43210', '(+91) 98765-43210',
      ];
      const res = sanitizeInput(variants.join('\n'), { mode: 'pseudonym' });
      assertEqual(res.stats.PHONE, variants.length);
      assertEqual(res.mappings.length, 1);
      assertEqual(res.mappings[0].placeholder, 'PHONE_01');
      assertEqual(res.mappings[0].count, variants.length);
    });
  }

  function resolveStatsModule() {
    if (globalScope.RedactStats || typeof require !== 'function' || typeof module === 'undefined') {
      return globalScope.RedactStats;
    }
    try {
      require('./scripts/stats.js');
    } catch (_) {
      // Safe fallback when running standalone engine bundle without scripts/stats.js
    }
    return globalScope.RedactStats;
  }

  function registerBenchmarkAndStatsTests({ test, assert, assertEqual }) {
    test('Complex multi-column CSV preserves byte-for-byte structure outside redacted tokens', () => {
      const csv = [
        'id,customer,contact_notes,meta,trailing_empty',
        'ORD-9876543210,"Sharma, ""Priya""\nEmail: priya.sharma@finserve.in","Ph: +91 98765 43210, Card: 4532-0151-1283-0366","<script>alert(1)</script> | नमस्ते 🔒 | v1.2.3.4",',
        'ORD-9876543211,"José ""Test""","Repeat: 09876543210 | PRIYA.SHARMA@finserve.in","Date: 12/05/2025 14:35:09 | 192.168.1.45",ok',
      ].join('\r\n') + '\r\n';
      const expected = [
        'id,customer,contact_notes,meta,trailing_empty',
        'ORD-9876543210,"Sharma, ""Priya""\nEmail: EMAIL_01","Ph: PHONE_01, Card: CARD_01","<script>alert(1)</script> | नमस्ते 🔒 | v1.2.3.4",',
        'ORD-9876543211,"José ""Test""","Repeat: PHONE_01 | EMAIL_01","Date: 12/05/2025 14:35:09 | IP_01",ok',
      ].join('\r\n') + '\r\n';
      const res = sanitizeInput(csv, { isCsv: true, mode: 'pseudonym' });
      assertEqual(res.sanitizedText, expected);
      assert(!res.originalHtml.includes('<script>'));
      assert(!res.sanitizedHtml.includes('<script>'));
      assertEqual(res.stats.total, 6);
    });

    test('1MB+ synthetic input completes quickly with capped preview and complete output', () => {
      const unit = SAMPLE_TEXT + '\n';
      const repeats = Math.ceil(SELF_TEST_STRESS_BYTES / unit.length);
      const largeText = unit.repeat(repeats);
      const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
      const t0 = now();
      const res = sanitizeInput(largeText, { mode: 'pseudonym', previewLimit: LARGE_PREVIEW_CHAR_LIMIT });
      const elapsedMs = now() - t0;

      assert(largeText.length > 1024 * 1024, 'Input exceeds 1 MB');
      assertEqual(res.truncatedPreview, true);
      assertEqual(res.stats.total, repeats * 18);
      assertEqual(res.stats.luhnRejectedCount, repeats * 2);
      assert(!res.sanitizedText.includes('priya.sharma@finserve.in'));
      assert(!res.sanitizedText.includes('4532-0151-1283-0366'));
      assert(elapsedMs < SELF_TEST_MAX_MS, `1MB+ sanitization stayed fast (${elapsedMs.toFixed(1)} ms)`);
    });

  }

  function registerStatsTests({ test, assert, assertEqual }) {
    test('RedactStats records numeric counts only and reset() zeroes all fields cleanly', () => {
      const StatsModule = resolveStatsModule();
      assert(StatsModule && typeof StatsModule.createStore === 'function', 'RedactStats.createStore available');

      const mem = new Map();
      const store = StatsModule.createStore({
        getItem: (k) => (mem.has(k) ? mem.get(k) : null),
        setItem: (k, v) => mem.set(k, String(v)),
        removeItem: (k) => mem.delete(k),
      });
      const sampleRes = sanitizeInput('priya@finserve.in | 4532-0151-1283-0366 | 9999-8888-7777-6666', { mode: 'full' });
      assertEqual(store.recordRun({ text: 'secret-raw-sample', stats: sampleRes.stats, sourceType: 'file' }), true);
      assertEqual(store.recordRun({ text: 'secret-raw-sample', stats: sampleRes.stats, sourceType: 'export' }), false);

      const storedJson = mem.get(StatsModule.STATS_STORAGE_KEY) || '';
      assert(!storedJson.includes('secret-raw-sample'), 'No raw input stored');
      assertEqual(store.getStats().totalEntities, 2);
      assertEqual(store.getStats().luhnRejected, 1);

      const zeroed = store.reset();
      assertEqual(zeroed.totalEntities, 0);
      assertEqual(zeroed.runs, 0);
      assertEqual(store.getStats().totalEntities, 0);
    });
  }

  function printSelfTestReport(summary) {
    if (typeof console === 'undefined' || !console.groupCollapsed) return;
    console.groupCollapsed(`[RedactLocal Self-Tests] ${summary.passed}/${summary.total} passed`);
    summary.results.forEach((r) => {
      if (r.passed) console.log(`PASS: ${r.name}`);
      else console.error(`FAIL: ${r.name} -> ${r.error}`);
    });
    console.groupEnd();
  }

  /**
   * Executes the built-in self-test suite verifying validators, detectors, modes,
   * overlap resolution, CSV fidelity, XSS escaping, 1 MB+ performance, and RedactStats.
   * @returns {{ passed: number, failed: number, total: number, results: Array<{ name: string, passed: boolean, error: string|null }> }} Self-test summary.
   */
  function runSelfTests() {
    const harness = createTestHarness();
    registerValidatorTests(harness);
    registerDetectorTests(harness);
    registerModeTests(harness);
    registerCsvAndSafetyTests(harness);
    registerEdgeTests(harness);
    registerPhoneEquivalenceTest(harness);
    registerBenchmarkAndStatsTests(harness);
    registerStatsTests(harness);

    const passed = harness.results.filter((r) => r.passed).length;
    const summary = {
      passed,
      failed: harness.results.length - passed,
      total: harness.results.length,
      results: harness.results,
    };
    printSelfTestReport(summary);
    return summary;
  }

  // Expose core API & self-tests globally
  globalScope.runSelfTests = runSelfTests;
  globalScope.RedactEngine = {
    SAMPLE_TEXT,
    LARGE_PREVIEW_CHAR_LIMIT,
    escapeHtml,
    isValidLuhn,
    detectCardBrand,
    isValidVerhoeff,
    computeVerhoeffCheckDigit,
    isStrictIPv4,
    isValidIPv6,
    parseCsvRfc4180,
    sanitizeInput,
    buildDownloadFilename,
  };
})();
