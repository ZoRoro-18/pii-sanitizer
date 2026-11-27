(function (globalScope) {
  'use strict';

  // =========================================================================
  // Constants & Configuration
  // =========================================================================

  const LARGE_PREVIEW_CHAR_LIMIT = 250000;
  const DEBOUNCE_MS = 200;
  const THEME_STORAGE_KEY = 'redactlocal-theme';

  const ENTITY_GROUPS = ['EMAIL', 'PHONE', 'IP', 'PAN', 'AADHAAR', 'CREDIT_CARD'];

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

  const MODE_LABELS = {
    full: 'Full Mask',
    partial: 'Partial Mask',
    pseudonym: 'Consistent Pseudonymization',
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

  // =========================================================================
  // Pure Utility Helpers
  // =========================================================================

  const HTML_ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatNumber(num) {
    return Number(num).toLocaleString('en-US');
  }

  function getEntityGroup(type) {
    return type === 'IPV4' || type === 'IPV6' ? 'IP' : type;
  }

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

  function computeVerhoeffCheckDigit(baseDigits) {
    let c = 0;
    const len = baseDigits.length;
    for (let i = 0; i < len; i++) {
      const digit = baseDigits.charCodeAt(len - 1 - i) - 48;
      c = VERHOEFF_D[c][VERHOEFF_P[(i + 1) % 8][digit]];
    }
    return String(VERHOEFF_INV[c]);
  }

  function isStrictIPv4(str) {
    return /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(str);
  }

  function isValidIPv6(str) {
    if (!str || str === '::' || str.includes(':::')) return false;
    const doubleColonParts = str.split('::');
    if (doubleColonParts.length > 2) return false;

    const hexGroupRe = /^[0-9A-Fa-f]{1,4}$/;

    if (doubleColonParts.length === 1) {
      if (str.startsWith(':') || str.endsWith(':')) return false;
      const groups = str.split(':');
      if (groups.length === 8) {
        return groups.every((g) => hexGroupRe.test(g));
      }
      if (groups.length === 7 && groups[6].includes('.')) {
        return groups.slice(0, 6).every((g) => hexGroupRe.test(g)) && isStrictIPv4(groups[6]);
      }
      return false;
    }

    const left = doubleColonParts[0];
    const right = doubleColonParts[1];
    if (left.startsWith(':') || left.endsWith(':') || right.startsWith(':') || right.endsWith(':')) {
      return false;
    }

    const leftGroups = left === '' ? [] : left.split(':');
    const rightGroups = right === '' ? [] : right.split(':');

    if (!leftGroups.every((g) => hexGroupRe.test(g))) return false;

    let rightHextetCount = rightGroups.length;
    if (rightGroups.length > 0 && rightGroups[rightGroups.length - 1].includes('.')) {
      const last = rightGroups[rightGroups.length - 1];
      if (!isStrictIPv4(last)) return false;
      if (!rightGroups.slice(0, -1).every((g) => hexGroupRe.test(g))) return false;
      rightHextetCount = rightGroups.length + 1;
    } else if (!rightGroups.every((g) => hexGroupRe.test(g))) {
      return false;
    }

    const totalHextets = leftGroups.length + rightHextetCount;
    return totalHextets >= 1 && totalHextets < 8;
  }

  // =========================================================================
  // Detectors (run independently on unmodified input string)
  // =========================================================================

  function detectCreditCards(text) {
    const candidates = [];
    const luhnRejectedZones = [];
    let luhnRejectedCount = 0;

    const re = /\d(?:[ -]?\d){12,18}/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      const raw = match[0];
      const start = match.index;
      const end = start + raw.length;

      if (start > 0 && /[\dA-Za-z+]/.test(text[start - 1])) continue;
      if (end < text.length && /[\dA-Za-z]/.test(text[end])) continue;
      if (start > 0 && text[start - 1] === '.' && start >= 2 && /\d/.test(text[start - 2])) continue;
      if (end < text.length && text[end] === '.' && end + 1 < text.length && /\d/.test(text[end + 1])) continue;

      const digits = raw.replace(/[ -]/g, '');
      if (digits.length < 13 || digits.length > 19) continue;

      // ISO/IEC 7812 payment cards never begin with '0'; prevents 0091-... phones or 0000-... masks from false Luhn checks.
      if (digits.startsWith('0')) continue;

      if (isValidLuhn(digits)) {
        candidates.push({
          start,
          end,
          raw,
          normalized: digits,
          type: 'CREDIT_CARD',
          meta: { brand: detectCardBrand(digits) },
        });
      } else {
        luhnRejectedCount += 1;
        luhnRejectedZones.push({ start, end });
      }
    }

    return { candidates, luhnRejectedZones, luhnRejectedCount };
  }

  function detectEmails(text) {
    const candidates = [];
    const re = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      const raw = match[0];
      const start = match.index;
      const end = start + raw.length;
      const atIdx = raw.indexOf('@');
      const domain = raw.slice(atIdx + 1);
      if (domain.includes('..') || domain.startsWith('.') || domain.startsWith('-')) continue;
      candidates.push({
        start,
        end,
        raw,
        normalized: raw.trim().toLowerCase(),
        type: 'EMAIL',
        meta: {},
      });
    }
    return candidates;
  }

  function detectIPv4(text) {
    const candidates = [];
    const re = /\b(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}\b/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      const raw = match[0];
      const start = match.index;
      const end = start + raw.length;

      if (start > 0 && /[A-Za-z0-9_.]/.test(text[start - 1])) continue;
      if (end < text.length) {
        if (/[A-Za-z0-9_]/.test(text[end])) continue;
        if (text[end] === '.' && end + 1 < text.length && /[\dA-Za-z.]/.test(text[end + 1])) continue;
      }

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

      if (start > 0) {
        const prev = text[start - 1];
        if (/[0-9A-Za-z]/.test(prev)) continue;
        if (prev === ':' && start >= 2 && /[0-9A-Fa-f:]/.test(text[start - 2])) continue;
      }
      if (end < text.length && /[0-9A-Za-z]/.test(text[end])) continue;
      if (end < text.length && text[end] === ':' && raw.endsWith('::')) continue;

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

      if (start > 0 && /[\dA-Za-z+]/.test(text[start - 1])) continue;
      if (end < text.length && /[\dA-Za-z]/.test(text[end])) continue;
      if (start > 0 && text[start - 1] === '-' && start >= 2 && /\d/.test(text[start - 2])) continue;
      if (end < text.length && text[end] === '-' && end + 1 < text.length && /\d/.test(text[end + 1])) continue;

      const digits = raw.replace(/[ -]/g, '');
      if (digits.length !== 12) continue;
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

  function normalizePhoneDigits(raw) {
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('00')) {
      digits = digits.slice(2);
    } else if (digits.startsWith('0')) {
      digits = digits.slice(1);
    }
    return digits;
  }

  function hasValidPhoneBoundaries(text, start, end, allowLeadingPlus) {
    if (start > 0) {
      const prev = text[start - 1];
      if (/[\dA-Za-z.]/.test(prev)) return false;
      if (!allowLeadingPlus && prev === '+') return false;
      if (prev === '-' && start >= 2 && /\d/.test(text[start - 2])) return false;
    }
    if (end < text.length) {
      const next = text[end];
      if (/[\dA-Za-z]/.test(next)) return false;
      if ((next === '-' || next === '.') && end + 1 < text.length && /\d/.test(text[end + 1])) return false;
    }
    return true;
  }

  function isLikelyDateOrIp(raw) {
    if (/\d{4}[-/.]\d{2}[-/.]\d{2}/.test(raw)) return true;
    if (/\d{2}[-/.]\d{2}[-/.]\d{4}/.test(raw)) return true;
    if (/^\+?\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) return true;
    if (/(--|\.\.| {2})/.test(raw)) return true;
    return false;
  }

  function detectPhones(text) {
    const candidates = [];

    // 1. Indian formats (+91, 0091, 91, 0 optional prefix + 10 digits starting with 6-9)
    const indianRe = /(?:(?:\+|00)?91[ -]?|0[ -]?)?(?:[6-9]\d{9}|[6-9]\d{4}[ -]\d{5}|[6-9]\d{2}[ -]\d{3}[ -]\d{4})/g;
    let match;
    while ((match = indianRe.exec(text)) !== null) {
      const raw = match[0];
      const start = match.index;
      const end = start + raw.length;
      if (!hasValidPhoneBoundaries(text, start, end, raw.startsWith('+'))) continue;
      if (isLikelyDateOrIp(raw)) continue;

      const normalized = normalizePhoneDigits(raw);
      if (normalized.length < 10 || normalized.length > 12) continue;

      candidates.push({
        start,
        end,
        raw,
        normalized,
        type: 'PHONE',
        meta: {},
      });
    }

    // 2. International E.164 formats (+country code + grouped digits, 10-15 digits total)
    const intlRe = /\+[1-9]\d{0,2}(?:[ .-]?\(\d{1,5}\)|[ .-]?\d{1,5}){1,7}/g;
    while ((match = intlRe.exec(text)) !== null) {
      const raw = match[0];
      const start = match.index;
      const end = start + raw.length;
      if (!/\d$/.test(raw)) continue;
      if (!hasValidPhoneBoundaries(text, start, end, true)) continue;
      if (isLikelyDateOrIp(raw)) continue;

      const digitsOnly = raw.replace(/\D/g, '');
      if (digitsOnly.length < 10 || digitsOnly.length > 15) continue;

      candidates.push({
        start,
        end,
        raw,
        normalized: normalizePhoneDigits(raw),
        type: 'PHONE',
        meta: {},
      });
    }

    return candidates;
  }

  // =========================================================================
  // Overlap Resolution & Redaction Engine
  // =========================================================================

  function spansOverlap(a, b) {
    return a.start < b.end && b.start < a.end;
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
    if (lo > 0 && sortedAccepted[lo - 1].end > candidate.start) {
      return false;
    }
    if (lo < sortedAccepted.length && candidate.end > sortedAccepted[lo].start) {
      return false;
    }
    sortedAccepted.splice(lo, 0, candidate);
    return true;
  }

  function resolveOverlaps(candidates, luhnRejectedZones) {
    const filtered = candidates.filter((c) => {
      if (c.type !== 'AADHAAR' && c.type !== 'PHONE') return true;
      for (let i = 0; i < luhnRejectedZones.length; i++) {
        if (spansOverlap(c, luhnRejectedZones[i])) {
          return false;
        }
      }
      return true;
    });

    filtered.sort((a, b) => {
      const pDiff = PRIORITY[a.type] - PRIORITY[b.type];
      if (pDiff !== 0) return pDiff;
      const lenDiff = (b.end - b.start) - (a.end - a.start);
      if (lenDiff !== 0) return lenDiff;
      return a.start - b.start;
    });

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
        const local = raw.slice(0, atIdx);
        const domain = raw.slice(atIdx + 1);
        return `${local.charAt(0)}***@${domain}`;
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
        const prefix = raw.slice(0, firstColon);
        const rest = raw.slice(firstColon).replace(/[0-9A-Fa-f]+/g, 'XXXX');
        return prefix + rest;
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
    if (session.mode === 'full') {
      return '[REDACTED]';
    }
    if (session.mode === 'partial') {
      return formatPartialMask(span);
    }

    // Consistent Pseudonymization
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

  function sanitizeSegment(text, session, collectRenderData = true) {
    if (!text) {
      return {
        sanitizedText: '',
        spans: [],
      };
    }

    const candidates = [];
    let luhnRejectedZones = [];

    if (session.enabledEntities.CREDIT_CARD) {
      const ccRes = detectCreditCards(text);
      for (let i = 0; i < ccRes.candidates.length; i++) candidates.push(ccRes.candidates[i]);
      luhnRejectedZones = ccRes.luhnRejectedZones;
      session.stats.luhnRejectedCount += ccRes.luhnRejectedCount;
    }
    if (session.enabledEntities.EMAIL) {
      const emails = detectEmails(text);
      for (let i = 0; i < emails.length; i++) candidates.push(emails[i]);
    }
    if (session.enabledEntities.IP) {
      const ipv6 = detectIPv6(text);
      for (let i = 0; i < ipv6.length; i++) candidates.push(ipv6[i]);
      const ipv4 = detectIPv4(text);
      for (let i = 0; i < ipv4.length; i++) candidates.push(ipv4[i]);
    }
    if (session.enabledEntities.AADHAAR) {
      const aadhaars = detectAadhaar(text, session.strictVerhoeff);
      for (let i = 0; i < aadhaars.length; i++) candidates.push(aadhaars[i]);
    }
    if (session.enabledEntities.PAN) {
      const pans = detectPAN(text);
      for (let i = 0; i < pans.length; i++) candidates.push(pans[i]);
    }
    if (session.enabledEntities.PHONE) {
      const phones = detectPhones(text);
      for (let i = 0; i < phones.length; i++) candidates.push(phones[i]);
    }

    const accepted = resolveOverlaps(candidates, luhnRejectedZones);
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

    return {
      sanitizedText: outChunks.join(''),
      spans: collectRenderData ? accepted : [],
    };
  }

  function buildTooltip(span) {
    const label = TYPE_LABELS[span.type] || span.type;
    const brandPart = span.meta && span.meta.brand ? ` (${span.meta.brand})` : '';
    return `${label}${brandPart} → ${span.replacement}`;
  }

  function buildPlainHighlightHtml(text, spans, previewCharLimit) {
    const limit = typeof previewCharLimit === 'number' ? previewCharLimit : text.length;
    const effectiveEnd = Math.min(text.length, limit);
    const origChunks = [];
    const sanChunks = [];
    let cursor = 0;

    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      if (span.start >= effectiveEnd) break;

      if (span.start > cursor) {
        const plain = escapeHtml(text.slice(cursor, span.start));
        origChunks.push(plain);
        sanChunks.push(plain);
      }

      const group = getEntityGroup(span.type);
      const tooltip = escapeHtml(buildTooltip(span));
      const safeRaw = escapeHtml(span.raw);
      const safeRep = escapeHtml(span.replacement);

      origChunks.push(`<mark class="pii-mark pii-${group}" title="${tooltip}">${safeRaw}</mark>`);
      sanChunks.push(`<span class="sanitized-token pii-${group}" title="${tooltip}">${safeRep}</span>`);
      cursor = span.end;
    }

    if (cursor < effectiveEnd) {
      const tail = escapeHtml(text.slice(cursor, effectiveEnd));
      origChunks.push(tail);
      sanChunks.push(tail);
    }

    return {
      originalHtml: origChunks.join(''),
      sanitizedHtml: sanChunks.join(''),
      truncated: text.length > effectiveEnd,
    };
  }

  // =========================================================================
  // RFC 4180 CSV Parser & Serializer
  // =========================================================================

  function detectCsvDelimiter(text) {
    const firstLineEnd = text.search(/\r?\n/);
    const sample = firstLineEnd === -1 ? text.slice(0, 2000) : text.slice(0, Math.min(firstLineEnd, 2000));
    let inQuotes = false;
    let commas = 0;
    let semicolons = 0;
    let tabs = 0;

    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i];
      if (ch === '"') {
        if (inQuotes && sample[i + 1] === '"') {
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (!inQuotes) {
        if (ch === ',') commas++;
        else if (ch === ';') semicolons++;
        else if (ch === '\t') tabs++;
      }
    }

    if (commas > 0) return ',';
    if (tabs > 0 && tabs >= semicolons) return '\t';
    if (semicolons > 0) return ';';
    return ',';
  }

  function parseCsvRfc4180(text, forcedDelimiter) {
    const delimiter = forcedDelimiter || detectCsvDelimiter(text);
    const rows = [];
    if (text.length === 0) {
      return { delimiter, rows };
    }

    let i = 0;
    const len = text.length;

    while (i < len) {
      const cells = [];
      let lineEnding = '';

      while (true) {
        if (i < len && text[i] === '"') {
          // Quoted field
          i++; // skip opening quote
          const valChunks = [];
          while (i < len) {
            if (text[i] === '"') {
              if (i + 1 < len && text[i + 1] === '"') {
                valChunks.push('"');
                i += 2;
              } else {
                i++; // skip closing quote
                break;
              }
            } else {
              valChunks.push(text[i]);
              i++;
            }
          }
          cells.push({ value: valChunks.join(''), wasQuoted: true });

          // Consume whitespace/garbage only up to delimiter or EOL? Standard RFC 4180 expects delimiter or EOL immediately.
          if (i < len && text[i] === delimiter) {
            i++;
            continue;
          }
          if (i < len && text[i] === '\r') {
            if (i + 1 < len && text[i + 1] === '\n') {
              lineEnding = '\r\n';
              i += 2;
            } else {
              lineEnding = '\r';
              i += 1;
            }
            break;
          }
          if (i < len && text[i] === '\n') {
            lineEnding = '\n';
            i += 1;
            break;
          }
          // If stray characters follow closing quote before delimiter/newline, consume until delimiter/newline
          while (i < len && text[i] !== delimiter && text[i] !== '\n' && text[i] !== '\r') {
            i++;
          }
          if (i < len && text[i] === delimiter) {
            i++;
            continue;
          }
          if (i < len && text[i] === '\r') {
            if (i + 1 < len && text[i + 1] === '\n') {
              lineEnding = '\r\n';
              i += 2;
            } else {
              lineEnding = '\r';
              i += 1;
            }
            break;
          }
          if (i < len && text[i] === '\n') {
            lineEnding = '\n';
            i += 1;
            break;
          }
          break;
        } else {
          // Unquoted field
          const start = i;
          while (i < len && text[i] !== delimiter && text[i] !== '\n' && text[i] !== '\r') {
            i++;
          }
          cells.push({ value: text.slice(start, i), wasQuoted: false });

          if (i < len && text[i] === delimiter) {
            i++;
            // If delimiter is right before EOL or EOF, there is a trailing empty unquoted cell
            if (i === len) {
              cells.push({ value: '', wasQuoted: false });
              break;
            }
            continue;
          }
          if (i < len && text[i] === '\r') {
            if (i + 1 < len && text[i + 1] === '\n') {
              lineEnding = '\r\n';
              i += 2;
            } else {
              lineEnding = '\r';
              i += 1;
            }
            break;
          }
          if (i < len && text[i] === '\n') {
            lineEnding = '\n';
            i += 1;
            break;
          }
          break;
        }
      }

      rows.push({ cells, lineEnding });
    }

    return { delimiter, rows };
  }

  function serializeCsvCell(value, wasQuoted, delimiter) {
    const mustQuote =
      wasQuoted ||
      value.includes(delimiter) ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r');
    if (!mustQuote) return value;
    return `"${value.replace(/"/g, '""')}"`;
  }

  function formatCsvCellLiteral(text, wasQuoted) {
    return wasQuoted ? text.replace(/"/g, '""') : text;
  }

  function buildCsvCellHighlightHtml(cellValue, spans, wasQuoted, delimiter, sanitizedValue) {
    const origChunks = [];
    const sanChunks = [];

    const sanNeedsQuote =
      wasQuoted ||
      sanitizedValue.includes(delimiter) ||
      sanitizedValue.includes('"') ||
      sanitizedValue.includes('\n') ||
      sanitizedValue.includes('\r');

    if (wasQuoted) origChunks.push('&quot;');
    if (sanNeedsQuote) sanChunks.push('&quot;');

    let cursor = 0;
    for (let i = 0; i < spans.length; i++) {
      const span = spans[i];
      if (span.start > cursor) {
        const seg = cellValue.slice(cursor, span.start);
        origChunks.push(escapeHtml(formatCsvCellLiteral(seg, wasQuoted)));
        sanChunks.push(escapeHtml(formatCsvCellLiteral(seg, sanNeedsQuote)));
      }
      const group = getEntityGroup(span.type);
      const tooltip = escapeHtml(buildTooltip(span));
      const safeRaw = escapeHtml(formatCsvCellLiteral(span.raw, wasQuoted));
      const safeRep = escapeHtml(formatCsvCellLiteral(span.replacement, sanNeedsQuote));

      origChunks.push(`<mark class="pii-mark pii-${group}" title="${tooltip}">${safeRaw}</mark>`);
      sanChunks.push(`<span class="sanitized-token pii-${group}" title="${tooltip}">${safeRep}</span>`);
      cursor = span.end;
    }

    if (cursor < cellValue.length) {
      const tail = cellValue.slice(cursor);
      origChunks.push(escapeHtml(formatCsvCellLiteral(tail, wasQuoted)));
      sanChunks.push(escapeHtml(formatCsvCellLiteral(tail, sanNeedsQuote)));
    }

    if (wasQuoted) origChunks.push('&quot;');
    if (sanNeedsQuote) sanChunks.push('&quot;');

    return {
      originalHtml: origChunks.join(''),
      sanitizedHtml: sanChunks.join(''),
    };
  }

  // =========================================================================
  // Top-Level Sanitization Entry Point
  // =========================================================================

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

    if (!isCsv) {
      const res = sanitizeSegment(text, session, buildHtml);
      let originalHtml = '';
      let sanitizedHtml = '';
      let truncatedPreview = false;

      if (buildHtml) {
        const htmlRes = buildPlainHighlightHtml(text, res.spans, previewLimit);
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

    // CSV-Aware Processing
    const parsed = parseCsvRfc4180(text, options.csvDelimiter);
    const delimiter = parsed.delimiter;
    const escapedDelimiter = escapeHtml(delimiter);
    const outRows = [];
    const origHtmlChunks = [];
    const sanHtmlChunks = [];
    let renderedChars = 0;
    let truncatedPreview = false;

    for (let r = 0; r < parsed.rows.length; r++) {
      const row = parsed.rows[r];
      const rowCellsOut = [];
      const rowOrigHtml = [];
      const rowSanHtml = [];
      const shouldRenderRow = buildHtml && renderedChars < previewLimit;
      if (buildHtml && !shouldRenderRow) {
        truncatedPreview = true;
      }

      for (let c = 0; c < row.cells.length; c++) {
        const cell = row.cells[c];
        const cellRes = sanitizeSegment(cell.value, session, shouldRenderRow);
        rowCellsOut.push(serializeCsvCell(cellRes.sanitizedText, cell.wasQuoted, delimiter));

        if (shouldRenderRow) {
          const cellHtml = buildCsvCellHighlightHtml(
            cell.value,
            cellRes.spans,
            cell.wasQuoted,
            delimiter,
            cellRes.sanitizedText
          );
          rowOrigHtml.push(cellHtml.originalHtml);
          rowSanHtml.push(cellHtml.sanitizedHtml);
          renderedChars += cell.value.length + (cell.wasQuoted ? 2 : 0) + 1;
        }
      }

      outRows.push(rowCellsOut.join(delimiter) + row.lineEnding);
      if (shouldRenderRow) {
        const safeEol = escapeHtml(row.lineEnding);
        origHtmlChunks.push(rowOrigHtml.join(escapedDelimiter) + safeEol);
        sanHtmlChunks.push(rowSanHtml.join(escapedDelimiter) + safeEol);
      }
    }

    return {
      sanitizedText: outRows.join(''),
      originalHtml: origHtmlChunks.join(''),
      sanitizedHtml: sanHtmlChunks.join(''),
      truncatedPreview,
      stats: session.stats,
      mappings: Array.from(session.pseudonymMap.values()),
      csvDelimiter: delimiter,
    };
  }

  // =========================================================================
  // Built-In Self-Test Suite (window.runSelfTests)
  // =========================================================================

  function runSelfTests() {
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

    // 1. Luhn Validator & Card Brand Tests
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

      const res = sanitizeInput('Bad1: 4532-0151-1283-0367 Bad2: 9999-8888-7777-6666', {
        mode: 'full',
        strictVerhoeff: false,
      });
      assertEqual(res.stats.CREDIT_CARD, 0, 'Credit card count');
      assertEqual(res.stats.AADHAAR, 0, 'Aadhaar exclusion');
      assertEqual(res.stats.PHONE, 0, 'Phone exclusion');
      assertEqual(res.stats.total, 0, 'Total entities');
      assertEqual(res.stats.luhnRejectedCount, 2, 'Luhn rejected count');
    });

    // 2. Verhoeff Validator Tests
    test('Verhoeff validates valid Aadhaar digits and rejects mutations/transpositions', () => {
      assert(isValidVerhoeff('2363'), 'Known vector 2363');
      assert(isValidVerhoeff('482931047561'), 'Aadhaar 1 valid');
      assert(isValidVerhoeff('739150284619'), 'Aadhaar 2 valid');
      assert(!isValidVerhoeff('482931047562'), 'Single digit error caught');
      assert(!isValidVerhoeff('482931047516'), 'Transposition error caught');
    });

    test('Strict Aadhaar Verhoeff toggle controls non-checksum 12-digit matching', () => {
      const text = 'Aadhaar candidate: 4829 3104 7562';
      const strictOn = sanitizeInput(text, { strictVerhoeff: true });
      const strictOff = sanitizeInput(text, { strictVerhoeff: false });
      assertEqual(strictOn.stats.AADHAAR, 0, 'Rejected when strict ON');
      assertEqual(strictOff.stats.AADHAAR, 1, 'Accepted when strict OFF');
    });

    // 3. Entity Detection & False-Positive Guards
    test('IPv4 rejects out-of-range, 5-octet, and version strings', () => {
      const text = 'ok=192.168.1.45 ok2=10.0.42.199 bad=999.256.1.1 five=1.2.3.4.5 ver=v2.4.1.0';
      const res = sanitizeInput(text, { mode: 'full' });
      assertEqual(res.stats.IP, 2, 'Only 2 valid IPv4s');
      assert(res.sanitizedText.includes('999.256.1.1'), 'Preserves 999.256.1.1');
      assert(res.sanitizedText.includes('1.2.3.4.5'), 'Preserves 1.2.3.4.5');
      assert(res.sanitizedText.includes('v2.4.1.0'), 'Preserves v2.4.1.0');
    });

    test('IPv6 matches full & compressed formats and rejects timestamps/pseudo-classes', () => {
      const text =
        'full=2001:0db8:85a3:0000:0000:8a2e:0370:7334 comp=fe80::1ff:fe23:4567:890a lo=::1 ts=12:34:56 css=div::before bad=2001:::1';
      const res = sanitizeInput(text, { mode: 'full' });
      assertEqual(res.stats.IP, 3, '3 valid IPv6 addresses');
      assert(res.sanitizedText.includes('12:34:56'), 'Timestamp untouched');
      assert(res.sanitizedText.includes('div::before'), 'CSS pseudo-element untouched');
      assert(res.sanitizedText.includes('2001:::1'), 'Malformed triple-colon untouched');
    });

    test('Dates are never flagged as Phone or Aadhaar', () => {
      const res = sanitizeInput('Dates: 2026-11-27 27-11-2026 2026/11/27 12:38:58', { mode: 'full' });
      assertEqual(res.stats.total, 0, 'Dates and timestamps ignored');
    });

    test('PAN enforces uppercase and word boundaries', () => {
      const res = sanitizeInput('Valid: ABCDE1234F BZTPS4821K Invalid: abcde1234f ABCDE1234F1', { mode: 'full' });
      assertEqual(res.stats.PAN, 2, 'Only 2 strict PANs');
    });

    test('Phone handles Indian, 0091, and E.164 international formats without Luhn collision', () => {
      const text = 'A:+91 98765 43210 B:0091-9876543210 C:98201-44556 D:+1 (415) 555-0192 E:+919876543210';
      const res = sanitizeInput(text, { mode: 'pseudonym', strictVerhoeff: false });
      assertEqual(res.stats.PHONE, 5, 'All 5 phone numbers matched as PHONE');
      assertEqual(res.stats.AADHAAR, 0, '+919876543210 not misclassified as Aadhaar');
      assertEqual(res.stats.luhnRejectedCount, 0, '0091-9876543210 not counted as rejected CC');
      assertEqual(res.mappings.length, 3, '3 unique normalized phones');
      assert(res.sanitizedText.includes('A:PHONE_01 B:PHONE_01'), '+91 and 0091 share PHONE_01');
    });

    // 4. All 3 Redaction Modes
    test('Full Mask replaces every entity with [REDACTED]', () => {
      const res = sanitizeInput('e=a@b.com p=98201-44556 ip=192.168.1.45 pan=ABCDE1234F', { mode: 'full' });
      assertEqual(res.sanitizedText, 'e=[REDACTED] p=[REDACTED] ip=[REDACTED] pan=[REDACTED]');
    });

    test('Partial Mask produces exact format per entity type', () => {
      const input = [
        'john@gmail.com',
        '9876544321',
        'ABCDE1234F',
        '4829 3104 7561',
        '4532-0151-1283-0366',
        '192.168.1.45',
        '2001:db8:1::2',
      ].join(' | ');
      const res = sanitizeInput(input, { mode: 'partial' });
      assertEqual(
        res.sanitizedText,
        [
          'j***@gmail.com',
          'XXXXXX4321',
          'ABXXXXXXXF',
          'XXXX XXXX 7561',
          'XXXX-XXXX-XXXX-0366',
          '192.XXX.XXX.XXX',
          '2001:XXXX:XXXX::XXXX',
        ].join(' | ')
      );
    });

    test('Consistent Pseudonymization assigns deterministic placeholders across variants', () => {
      const text = [
        'priya.sharma@finserve.in',
        'PRIYA.SHARMA@finserve.in',
        'other@finserve.in',
        '+91 98765 43210',
        '0091-9876543210',
        '192.168.1.45',
        'fe80::1ff:fe23:4567:890a',
        'ABCDE1234F',
        '4829 3104 7561',
        '4532-0151-1283-0366',
      ].join('\n');
      const res = sanitizeInput(text, { mode: 'pseudonym' });
      assertEqual(
        res.sanitizedText,
        [
          'EMAIL_01',
          'EMAIL_01',
          'EMAIL_02',
          'PHONE_01',
          'PHONE_01',
          'IP_01',
          'IP_02',
          'PAN_01',
          'AADHAAR_01',
          'CARD_01',
        ].join('\n')
      );
      const email1 = res.mappings.find((m) => m.placeholder === 'EMAIL_01');
      assertEqual(email1.count, 2, 'EMAIL_01 occurrences');
    });

    // 5. Overlap Resolution & No Double-Redaction
    test('Overlap priority resolves CREDIT_CARD > EMAIL > IPV6 > IPV4 > AADHAAR > PAN > PHONE', () => {
      const res = sanitizeInput('Mail: ABCDE1234F@finserve.in', { mode: 'pseudonym' });
      assertEqual(res.stats.EMAIL, 1, 'Email wins over inner PAN');
      assertEqual(res.stats.PAN, 0, 'Inner PAN not double-redacted');
      assertEqual(res.sanitizedText, 'Mail: EMAIL_01');
    });

    // 6. CSV Parser & Cross-Row Pseudonymization
    test('CSV mode preserves quotes, escaped quotes, embedded newlines, CRLF, and shares map', () => {
      const csv =
        'id,notes,contact\r\n' +
        '1,"Line1, ""priya.sharma@finserve.in""\nCall +91 98765 43210",ABCDE1234F\r\n' +
        '2,"Repeat: PRIYA.SHARMA@finserve.in",0091-9876543210\r\n';
      const res = sanitizeInput(csv, { isCsv: true, mode: 'pseudonym' });
      const expected =
        'id,notes,contact\r\n' +
        '1,"Line1, ""EMAIL_01""\nCall PHONE_01",PAN_01\r\n' +
        '2,"Repeat: EMAIL_01",PHONE_01\r\n';
      assertEqual(res.sanitizedText, expected, 'Exact RFC 4180 CSV preservation');
      assertEqual(res.stats.EMAIL, 2);
      assertEqual(res.stats.PHONE, 2);
      assertEqual(res.stats.PAN, 1);
    });

    // 7. XSS Safety & Unicode Preservation
    test('XSS payloads are strictly HTML-escaped and Unicode preserves indices', () => {
      const text = 'नमस्ते 🔒 <script>alert(1)</script> email=priya.sharma@finserve.in "quote"';
      const res = sanitizeInput(text, { mode: 'full' });
      assert(!res.originalHtml.includes('<script>'), 'No unescaped script tag in originalHtml');
      assert(!res.sanitizedHtml.includes('<script>'), 'No unescaped script tag in sanitizedHtml');
      assert(res.originalHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'Escaped script tag');
      assert(res.sanitizedText.startsWith('नमस्ते 🔒 <script>alert(1)</script> email=[REDACTED]'), 'Unicode & non-PII text intact');
    });

    // 8. Sample Dataset & Download Filename Helper
    test('Sample dataset detects all expected entities and exactly 2 Luhn-rejected numbers', () => {
      const res = sanitizeInput(SAMPLE_TEXT, { mode: 'pseudonym', strictVerhoeff: true });
      assertEqual(res.stats.EMAIL, 3, 'Sample emails');
      assertEqual(res.stats.PHONE, 4, 'Sample phones');
      assertEqual(res.stats.CREDIT_CARD, 3, 'Sample valid cards');
      assertEqual(res.stats.PAN, 2, 'Sample PANs');
      assertEqual(res.stats.AADHAAR, 2, 'Sample Aadhaars');
      assertEqual(res.stats.IP, 4, 'Sample IPs (2 IPv4 + 2 IPv6)');
      assertEqual(res.stats.total, 18, 'Sample total entities');
      assertEqual(res.stats.luhnRejectedCount, 2, 'Sample Luhn-rejected count');
    });

    test('Entity toggle filtering and download filename generation work properly', () => {
      const res = sanitizeInput('priya.sharma@finserve.in 192.168.1.45', {
        mode: 'full',
        enabledEntities: {
          EMAIL: false,
          PHONE: true,
          IP: true,
          PAN: true,
          AADHAAR: true,
          CREDIT_CARD: true,
        },
      });
      assertEqual(res.stats.EMAIL, 0);
      assertEqual(res.stats.IP, 1);
      assertEqual(res.sanitizedText, 'priya.sharma@finserve.in [REDACTED]');
      assertEqual(buildDownloadFilename('users.csv', true), 'users_sanitized.csv');
      assertEqual(buildDownloadFilename('notes.txt', false), 'notes_sanitized.txt');
      assertEqual(buildDownloadFilename(null, false), 'sanitized_output.txt');
    });

    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed;
    const summary = { passed, failed, total: results.length, results };

    if (typeof console !== 'undefined' && console.groupCollapsed) {
      console.groupCollapsed(`[RedactLocal Self-Tests] ${passed}/${results.length} passed`);
      results.forEach((r) => {
        if (r.passed) console.log(`PASS: ${r.name}`);
        else console.error(`FAIL: ${r.name} -> ${r.error}`);
      });
      console.groupEnd();
    }

    return summary;
  }

  // Expose core API & self-tests globally
  globalScope.runSelfTests = runSelfTests;
  globalScope.RedactLocalEngine = {
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

  // =========================================================================
  // Browser UI Controller
  // =========================================================================

  if (typeof document === 'undefined') return;

  document.addEventListener('DOMContentLoaded', () => {
    const els = {
      themeToggle: document.getElementById('theme-toggle'),
      themeLabel: document.getElementById('theme-label'),
      csvModeToggle: document.getElementById('csv-mode-toggle'),
      loadSampleBtn: document.getElementById('load-sample-btn'),
      clearBtn: document.getElementById('clear-btn'),
      dropZone: document.getElementById('drop-zone'),
      fileInput: document.getElementById('file-input'),
      filePill: document.getElementById('file-pill'),
      fileName: document.getElementById('file-name'),
      fileSize: document.getElementById('file-size'),
      fileClearBtn: document.getElementById('file-clear-btn'),
      rawInput: document.getElementById('raw-input'),
      inputMeta: document.getElementById('input-meta'),
      modeButtons: Array.from(document.querySelectorAll('.mode-btn')),
      strictVerhoeffToggle: document.getElementById('strict-verhoeff-toggle'),
      entityCheckboxes: Array.from(document.querySelectorAll('#entity-toggles input[type="checkbox"]')),
      statTotal: document.getElementById('stat-total'),
      statEmail: document.getElementById('stat-EMAIL'),
      statPhone: document.getElementById('stat-PHONE'),
      statIp: document.getElementById('stat-IP'),
      statPan: document.getElementById('stat-PAN'),
      statAadhaar: document.getElementById('stat-AADHAAR'),
      statCard: document.getElementById('stat-CREDIT_CARD'),
      statLuhnRejected: document.getElementById('stat-luhn-rejected'),
      largeInputNotice: document.getElementById('large-input-notice'),
      largeInputNoticeText: document.getElementById('large-input-notice-text'),
      toggleMapBtn: document.getElementById('toggle-map-btn'),
      closeMapBtn: document.getElementById('close-map-btn'),
      mapCountBadge: document.getElementById('map-count-badge'),
      mappingDrawer: document.getElementById('mapping-drawer'),
      mappingEmptyState: document.getElementById('mapping-empty-state'),
      mappingTableWrap: document.getElementById('mapping-table-wrap'),
      mappingTbody: document.getElementById('mapping-tbody'),
      copyBtn: document.getElementById('copy-btn'),
      copyBtnLabel: document.getElementById('copy-btn-label'),
      downloadBtn: document.getElementById('download-btn'),
      originalDiffPane: document.getElementById('original-diff-pane'),
      originalEmpty: document.getElementById('original-empty'),
      originalDiffContent: document.getElementById('original-diff-content'),
      sanitizedDiffPane: document.getElementById('sanitized-diff-pane'),
      sanitizedEmpty: document.getElementById('sanitized-empty'),
      sanitizedDiffContent: document.getElementById('sanitized-diff-content'),
      activeModeBadge: document.getElementById('active-mode-badge'),
      runTestsBtn: document.getElementById('run-tests-btn'),
      selfTestResults: document.getElementById('self-test-results'),
    };

    const state = {
      mode: 'full',
      strictVerhoeff: true,
      isCsv: false,
      loadedFileName: null,
      loadedFileSize: 0,
      enabledEntities: {
        EMAIL: true,
        PHONE: true,
        IP: true,
        PAN: true,
        AADHAAR: true,
        CREDIT_CARD: true,
      },
      lastSanitizedText: '',
      mapOpen: false,
      debounceTimer: 0,
      copyFeedbackTimer: 0,
      dragDepth: 0,
    };

    // ----- Theme Management -----
    function resolveInitialTheme() {
      try {
        const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'dark' || saved === 'light') return saved;
      } catch (_) {
        // Ignore storage errors under restricted file:// contexts
      }
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
      return 'light';
    }

    function applyTheme(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      els.themeLabel.textContent = theme === 'dark' ? 'Dark' : 'Light';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch (_) {
        // Ignore storage errors
      }
    }

    applyTheme(resolveInitialTheme());

    els.themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    // ----- Scroll Sync with Re-entrancy Guard -----
    let isSyncing = false;
    let activeSyncSource = null;
    let syncResetRaf = 0;

    function handlePaneScroll(source, target) {
      if (isSyncing && activeSyncSource !== source) return;
      isSyncing = true;
      activeSyncSource = source;
      target.scrollTop = source.scrollTop;
      target.scrollLeft = source.scrollLeft;
      if (syncResetRaf) cancelAnimationFrame(syncResetRaf);
      syncResetRaf = requestAnimationFrame(() => {
        isSyncing = false;
        activeSyncSource = null;
        syncResetRaf = 0;
      });
    }

    els.originalDiffPane.addEventListener('scroll', () => {
      handlePaneScroll(els.originalDiffPane, els.sanitizedDiffPane);
    });

    els.sanitizedDiffPane.addEventListener('scroll', () => {
      handlePaneScroll(els.sanitizedDiffPane, els.originalDiffPane);
    });

    // ----- Rendering & Processing -----
    function updateInputMeta(text) {
      const chars = text.length;
      const lines = chars === 0 ? 0 : text.split(/\r\n|\r|\n/).length;
      const csvTag = state.isCsv ? ' · CSV-Aware' : '';
      els.inputMeta.textContent = `${formatNumber(chars)} characters · ${formatNumber(lines)} lines${csvTag}`;
    }

    function renderStats(stats) {
      els.statTotal.textContent = formatNumber(stats.total);
      els.statEmail.textContent = formatNumber(stats.EMAIL);
      els.statPhone.textContent = formatNumber(stats.PHONE);
      els.statIp.textContent = formatNumber(stats.IP);
      els.statPan.textContent = formatNumber(stats.PAN);
      els.statAadhaar.textContent = formatNumber(stats.AADHAAR);
      els.statCard.textContent = formatNumber(stats.CREDIT_CARD);
      els.statLuhnRejected.textContent = formatNumber(stats.luhnRejectedCount);
    }

    function renderMappingTable(mappings) {
      els.mapCountBadge.textContent = formatNumber(mappings.length);
      if (state.mode !== 'pseudonym' || mappings.length === 0) {
        els.mappingEmptyState.hidden = false;
        els.mappingTableWrap.hidden = true;
        els.mappingTbody.textContent = '';
        return;
      }

      els.mappingEmptyState.hidden = true;
      els.mappingTableWrap.hidden = false;

      const frag = document.createDocumentFragment();
      const maxRows = 500;
      const count = Math.min(mappings.length, maxRows);

      for (let i = 0; i < count; i++) {
        const entry = mappings[i];
        const tr = document.createElement('tr');

        const tdPlaceholder = document.createElement('td');
        tdPlaceholder.textContent = entry.placeholder;

        const tdType = document.createElement('td');
        const pill = document.createElement('span');
        pill.className = 'mapping-type-pill';
        const dot = document.createElement('span');
        dot.className = 'chip-dot';
        dot.style.background = getDotColorVar(entry.entityGroup);
        pill.appendChild(dot);
        pill.appendChild(document.createTextNode(entry.entityTypeLabel));
        tdType.appendChild(pill);

        const tdOriginal = document.createElement('td');
        tdOriginal.textContent = entry.originalSample;

        const tdCount = document.createElement('td');
        tdCount.textContent = String(entry.count);

        tr.appendChild(tdPlaceholder);
        tr.appendChild(tdType);
        tr.appendChild(tdOriginal);
        tr.appendChild(tdCount);
        frag.appendChild(tr);
      }

      if (mappings.length > maxRows) {
        const trMore = document.createElement('tr');
        const tdMore = document.createElement('td');
        tdMore.colSpan = 4;
        tdMore.textContent = `Showing first ${maxRows} of ${formatNumber(mappings.length)} unique placeholders.`;
        trMore.appendChild(tdMore);
        frag.appendChild(trMore);
      }

      els.mappingTbody.textContent = '';
      els.mappingTbody.appendChild(frag);
    }

    function getDotColorVar(group) {
      switch (group) {
        case 'EMAIL': return 'var(--c-email)';
        case 'PHONE': return 'var(--c-phone)';
        case 'IP': return 'var(--c-ip)';
        case 'PAN': return 'var(--c-pan)';
        case 'AADHAAR': return 'var(--c-aadhaar)';
        case 'CREDIT_CARD': return 'var(--c-card)';
        default: return 'var(--accent)';
      }
    }

    function processAndRender() {
      const text = els.rawInput.value;
      updateInputMeta(text);
      els.activeModeBadge.textContent = MODE_LABELS[state.mode];

      if (text.trim().length === 0) {
        const emptyResult = sanitizeInput('', {
          mode: state.mode,
          strictVerhoeff: state.strictVerhoeff,
          isCsv: state.isCsv,
          enabledEntities: state.enabledEntities,
        });
        state.lastSanitizedText = '';
        renderStats(emptyResult.stats);
        renderMappingTable([]);
        els.largeInputNotice.hidden = true;
        els.originalEmpty.hidden = false;
        els.originalDiffContent.hidden = true;
        els.originalDiffContent.textContent = '';
        els.sanitizedEmpty.hidden = false;
        els.sanitizedDiffContent.hidden = true;
        els.sanitizedDiffContent.textContent = '';
        els.copyBtn.disabled = true;
        els.downloadBtn.disabled = true;
        return;
      }

      const res = sanitizeInput(text, {
        mode: state.mode,
        strictVerhoeff: state.strictVerhoeff,
        isCsv: state.isCsv,
        enabledEntities: state.enabledEntities,
        previewLimit: LARGE_PREVIEW_CHAR_LIMIT,
      });

      state.lastSanitizedText = res.sanitizedText;
      renderStats(res.stats);
      renderMappingTable(res.mappings);

      if (res.truncatedPreview) {
        els.largeInputNotice.hidden = false;
        els.largeInputNoticeText.textContent =
          `Large input (${formatNumber(text.length)} chars): visual diff preview capped at first ` +
          `${formatNumber(LARGE_PREVIEW_CHAR_LIMIT)} characters. Copy & Download include the complete sanitized output.`;
      } else {
        els.largeInputNotice.hidden = true;
      }

      els.originalEmpty.hidden = true;
      els.originalDiffContent.hidden = false;
      els.originalDiffContent.innerHTML = res.originalHtml;

      els.sanitizedEmpty.hidden = true;
      els.sanitizedDiffContent.hidden = false;
      els.sanitizedDiffContent.innerHTML = res.sanitizedHtml;

      els.copyBtn.disabled = false;
      els.downloadBtn.disabled = false;
    }

    function scheduleProcess() {
      if (state.debounceTimer) clearTimeout(state.debounceTimer);
      const delay = els.rawInput.value.length > 50000 ? DEBOUNCE_MS : 40;
      state.debounceTimer = setTimeout(() => {
        state.debounceTimer = 0;
        processAndRender();
      }, delay);
    }

    function processImmediately() {
      if (state.debounceTimer) {
        clearTimeout(state.debounceTimer);
        state.debounceTimer = 0;
      }
      processAndRender();
    }

    // ----- File Handling -----
    function clearLoadedFile(clearTextToo) {
      state.loadedFileName = null;
      state.loadedFileSize = 0;
      els.filePill.hidden = true;
      els.fileName.textContent = '';
      els.fileSize.textContent = '';
      els.fileInput.value = '';
      if (clearTextToo) {
        els.rawInput.value = '';
        state.isCsv = false;
        els.csvModeToggle.checked = false;
        processImmediately();
      }
    }

    function loadFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const content = typeof reader.result === 'string' ? reader.result : '';
        state.loadedFileName = file.name;
        state.loadedFileSize = file.size;
        const isCsvFile = file.name.toLowerCase().endsWith('.csv');
        state.isCsv = isCsvFile;
        els.csvModeToggle.checked = isCsvFile;

        els.fileName.textContent = file.name;
        els.fileSize.textContent = formatBytes(file.size);
        els.filePill.hidden = false;

        els.rawInput.value = content;
        processImmediately();
      };
      reader.readAsText(file);
    }

    els.fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) loadFile(file);
    });

    els.fileClearBtn.addEventListener('click', () => clearLoadedFile(true));

    els.dropZone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      state.dragDepth += 1;
      els.dropZone.classList.add('is-drag-over');
    });

    els.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    els.dropZone.addEventListener('dragleave', () => {
      state.dragDepth = Math.max(0, state.dragDepth - 1);
      if (state.dragDepth === 0) {
        els.dropZone.classList.remove('is-drag-over');
      }
    });

    els.dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      state.dragDepth = 0;
      els.dropZone.classList.remove('is-drag-over');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) loadFile(file);
    });

    // ----- Input & Control Listeners -----
    els.rawInput.addEventListener('input', scheduleProcess);

    els.csvModeToggle.addEventListener('change', () => {
      state.isCsv = els.csvModeToggle.checked;
      processImmediately();
    });

    els.loadSampleBtn.addEventListener('click', () => {
      clearLoadedFile(false);
      state.isCsv = false;
      els.csvModeToggle.checked = false;
      els.rawInput.value = SAMPLE_TEXT;
      processImmediately();
    });

    els.clearBtn.addEventListener('click', () => {
      clearLoadedFile(true);
    });

    els.modeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextMode = btn.getAttribute('data-mode');
        if (!nextMode || nextMode === state.mode) return;
        state.mode = nextMode;
        els.modeButtons.forEach((b) => {
          const active = b === btn;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-checked', active ? 'true' : 'false');
        });
        processImmediately();
      });
    });

    els.strictVerhoeffToggle.addEventListener('change', () => {
      state.strictVerhoeff = els.strictVerhoeffToggle.checked;
      processImmediately();
    });

    els.entityCheckboxes.forEach((cb) => {
      cb.addEventListener('change', () => {
        const entity = cb.getAttribute('data-entity');
        if (entity) {
          state.enabledEntities[entity] = cb.checked;
          processImmediately();
        }
      });
    });

    // ----- Mapping Drawer Toggle -----
    function setMappingDrawerOpen(open) {
      state.mapOpen = open;
      els.mappingDrawer.hidden = !open;
      els.toggleMapBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    els.toggleMapBtn.addEventListener('click', () => setMappingDrawerOpen(!state.mapOpen));
    els.closeMapBtn.addEventListener('click', () => setMappingDrawerOpen(false));

    // ----- Copy & Download Actions -----
    function showCopyConfirmation() {
      if (state.copyFeedbackTimer) clearTimeout(state.copyFeedbackTimer);
      els.copyBtn.classList.add('is-copied');
      els.copyBtnLabel.textContent = 'Copied!';
      state.copyFeedbackTimer = setTimeout(() => {
        els.copyBtn.classList.remove('is-copied');
        els.copyBtnLabel.textContent = 'Copy Sanitized Output';
        state.copyFeedbackTimer = 0;
      }, 2000);
    }

    function fallbackCopyText(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (_) {
        ok = false;
      }
      document.body.removeChild(ta);
      if (ok) showCopyConfirmation();
    }

    els.copyBtn.addEventListener('click', () => {
      const output = state.lastSanitizedText;
      if (!output) return;
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(output).then(showCopyConfirmation, () => fallbackCopyText(output));
      } else {
        fallbackCopyText(output);
      }
    });

    els.downloadBtn.addEventListener('click', () => {
      const output = state.lastSanitizedText;
      if (!output) return;
      const mime = state.isCsv ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8';
      const blob = new Blob([output], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = buildDownloadFilename(state.loadedFileName, state.isCsv);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    // ----- Footer Self-Test Runner -----
    els.runTestsBtn.addEventListener('click', () => {
      const summary = runSelfTests();
      els.selfTestResults.hidden = false;
      els.selfTestResults.textContent = '';

      const header = document.createElement('div');
      header.className = `test-summary ${summary.failed === 0 ? 'is-pass' : 'is-fail'}`;
      header.textContent =
        summary.failed === 0
          ? `All ${summary.passed}/${summary.total} self-tests passed`
          : `${summary.passed}/${summary.total} passed (${summary.failed} failed)`;

      const closeTestsBtn = document.createElement('button');
      closeTestsBtn.type = 'button';
      closeTestsBtn.className = 'btn btn-ghost btn-sm';
      closeTestsBtn.textContent = 'Close';
      closeTestsBtn.addEventListener('click', () => {
        els.selfTestResults.hidden = true;
      });
      header.appendChild(closeTestsBtn);

      const list = document.createElement('ul');
      list.className = 'test-list';

      summary.results.forEach((item) => {
        const li = document.createElement('li');
        li.className = `test-item ${item.passed ? 'pass' : 'fail'}`;
        li.textContent = item.passed ? `✓ ${item.name}` : `✗ ${item.name}: ${item.error}`;
        list.appendChild(li);
      });

      els.selfTestResults.appendChild(header);
      els.selfTestResults.appendChild(list);
    });

    // Initialize empty state
    processImmediately();
  });
})(typeof window !== 'undefined' ? window : globalThis);
