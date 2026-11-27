(function (globalScope) {
  'use strict';

  const STATS_STORAGE_KEY = 'redactlocal_stats_v1';

  const ENTITY_KEYS = ['EMAIL', 'PHONE', 'IP', 'PAN', 'AADHAAR', 'CREDIT_CARD'];

  // In-memory-only deduplication state (never persisted to localStorage)
  let lastRecordedSignature = null;

  function createEmptyStats() {
    return {
      totalEntities: 0,
      byType: {
        EMAIL: 0,
        PHONE: 0,
        IP: 0,
        PAN: 0,
        AADHAAR: 0,
        CREDIT_CARD: 0,
      },
      filesProcessed: 0,
      luhnRejected: 0,
      runs: 0,
      lastUsed: null,
    };
  }

  function sanitizeNumericStats(raw) {
    const base = createEmptyStats();
    if (!raw || typeof raw !== 'object') return base;

    base.totalEntities = toNonNegInt(raw.totalEntities);
    base.filesProcessed = toNonNegInt(raw.filesProcessed);
    base.luhnRejected = toNonNegInt(raw.luhnRejected);
    base.runs = toNonNegInt(raw.runs);
    base.lastUsed = typeof raw.lastUsed === 'string' && !Number.isNaN(Date.parse(raw.lastUsed))
      ? raw.lastUsed
      : null;

    if (raw.byType && typeof raw.byType === 'object') {
      for (let i = 0; i < ENTITY_KEYS.length; i++) {
        const key = ENTITY_KEYS[i];
        base.byType[key] = toNonNegInt(raw.byType[key]);
      }
    }
    return base;
  }

  function toNonNegInt(val) {
    const num = Number(val);
    return Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
  }

  function getStats() {
    try {
      const raw = window.localStorage.getItem(STATS_STORAGE_KEY);
      if (!raw) return createEmptyStats();
      return sanitizeNumericStats(JSON.parse(raw));
    } catch (_) {
      return createEmptyStats();
    }
  }

  function saveStats(stats) {
    try {
      window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(sanitizeNumericStats(stats)));
      return true;
    } catch (_) {
      return false;
    }
  }

  function resetStats() {
    lastRecordedSignature = null;
    try {
      window.localStorage.removeItem(STATS_STORAGE_KEY);
    } catch (_) {
      // Ignore storage errors
    }
    return createEmptyStats();
  }

  /**
   * Computes a lightweight in-memory FNV-1a fingerprint so copying and then
   * downloading the same sanitized input does not double-count aggregate stats.
   * This value is NEVER persisted anywhere.
   */
  function computeInMemoryFingerprint(text) {
    const str = `${text.length}:${text}`;
    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      h1 ^= code;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= code + i;
      h2 = Math.imul(h2, 0x85ebca6b);
    }
    return `${h1 >>> 0}:${h2 >>> 0}`;
  }

  function clearSessionFingerprint() {
    lastRecordedSignature = null;
  }

  /**
   * Records aggregate run counts into localStorage (`redactlocal_stats_v1`).
   * @param {Object} params
   * @param {string} params.text - Raw input text (used only to compute in-memory fingerprint)
   * @param {Object} params.stats - Counts returned by RedactLocalEngine.sanitizeInput()
   * @param {'file'|'sample'|'export'} params.sourceType - Trigger event category
   * @returns {boolean} Whether stats were incremented
   */
  function recordRun({ text, stats, sourceType }) {
    if (!text || !text.trim() || !stats) return false;

    const fingerprint = computeInMemoryFingerprint(text);

    // Prevent double-counting when e.g. loading sample/file, switching redaction modes, and copying/downloading
    if (sourceType !== 'file' && lastRecordedSignature === fingerprint) {
      return false;
    }

    lastRecordedSignature = fingerprint;

    const current = getStats();
    current.totalEntities += toNonNegInt(stats.total);
    current.luhnRejected += toNonNegInt(stats.luhnRejectedCount);
    current.runs += 1;
    if (sourceType === 'file') {
      current.filesProcessed += 1;
    }
    for (let i = 0; i < ENTITY_KEYS.length; i++) {
      const key = ENTITY_KEYS[i];
      current.byType[key] += toNonNegInt(stats[key]);
    }
    current.lastUsed = new Date().toISOString();

    saveStats(current);
    return true;
  }

  globalScope.RedactLocalStats = {
    STATS_STORAGE_KEY,
    ENTITY_KEYS,
    createEmptyStats,
    getStats,
    resetStats,
    recordRun,
    clearSessionFingerprint,
  };
})(typeof window !== 'undefined' ? window : globalThis);
