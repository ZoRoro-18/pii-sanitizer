(() => {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;

  const STATS_STORAGE_KEY = 'redactlocal_stats_v1';
  const ENTITY_KEYS = ['EMAIL', 'PHONE', 'IP', 'PAN', 'AADHAAR', 'CREDIT_CARD'];
  const FNV_OFFSET_A = 0x811c9dc5;
  const FNV_PRIME_A = 0x01000193;
  const FNV_PRIME_B = 0x85ebca6b;

  /**
   * Creates a fresh zero-initialized aggregate stats object.
   * @returns {{ totalEntities: number, byType: Object<string, number>, filesProcessed: number, luhnRejected: number, runs: number, lastUsed: string|null }} Empty stats record.
   */
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

  function toNonNegInt(val) {
    const num = Number(val);
    return Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
  }

  /**
   * Validates and normalizes parsed `localStorage` stats so corrupted values reset safely to `0`.
   * @param {Object} raw - Untrusted parsed object.
   * @returns {{ totalEntities: number, byType: Object<string, number>, filesProcessed: number, luhnRejected: number, runs: number, lastUsed: string|null }} Sanitized numeric stats object.
   */
  function sanitizeNumericStats(raw) {
    const base = createEmptyStats();
    if (!raw || typeof raw !== 'object') return base;

    base.totalEntities = toNonNegInt(raw.totalEntities);
    base.filesProcessed = toNonNegInt(raw.filesProcessed);
    base.luhnRejected = toNonNegInt(raw.luhnRejected);
    base.runs = toNonNegInt(raw.runs);
    base.lastUsed =
      typeof raw.lastUsed === 'string' && !Number.isNaN(Date.parse(raw.lastUsed))
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

  function hashFeed(state, code) {
    state.h1 ^= code;
    state.h1 = Math.imul(state.h1, FNV_PRIME_A);
    state.h2 ^= code + state.idx++;
    state.h2 = Math.imul(state.h2, FNV_PRIME_B);
  }

  /**
   * Computes a lightweight in-memory FNV-1a fingerprint so copying and then downloading
   * the same sanitized input does not double-count aggregate stats. Never persisted.
   * @param {string} text - Raw input string.
   * @returns {string} Non-persistent session fingerprint.
   */
  function computeInMemoryFingerprint(text) {
    const state = { h1: FNV_OFFSET_A, h2: FNV_PRIME_A, idx: 0 };
    const lenStr = String(text.length);
    for (let i = 0; i < lenStr.length; i++) hashFeed(state, lenStr.charCodeAt(i));
    hashFeed(state, 58); // ':' delimiter
    for (let i = 0; i < text.length; i++) hashFeed(state, text.charCodeAt(i));
    return `${state.h1 >>> 0}:${state.h2 >>> 0}`;
  }

  function readFromStorage(storage) {
    try {
      const raw = storage.getItem(STATS_STORAGE_KEY);
      return raw ? sanitizeNumericStats(JSON.parse(raw)) : createEmptyStats();
    } catch (_) {
      // Fall back safely when storage is unavailable or contains malformed JSON
      return createEmptyStats();
    }
  }

  function writeToStorage(storage, stats) {
    try {
      storage.setItem(STATS_STORAGE_KEY, JSON.stringify(sanitizeNumericStats(stats)));
      return true;
    } catch (_) {
      // Ignore storage write failures under restricted browser or quota contexts
      return false;
    }
  }

  function removeFromStorage(storage) {
    try {
      storage.removeItem(STATS_STORAGE_KEY);
    } catch (_) {
      // Ignore storage removal errors under restricted contexts
    }
  }

  function mergeRunCounts(current, stats, sourceType) {
    current.totalEntities += toNonNegInt(stats.total);
    current.luhnRejected += toNonNegInt(stats.luhnRejectedCount);
    current.runs += 1;
    if (sourceType === 'file') current.filesProcessed += 1;
    for (let i = 0; i < ENTITY_KEYS.length; i++) {
      const key = ENTITY_KEYS[i];
      current.byType[key] += toNonNegInt(stats[key]);
    }
    current.lastUsed = new Date().toISOString();
    return current;
  }

  /**
   * Creates an aggregate-stats store bound to a `Storage`-compatible backend (defaults to `window.localStorage`).
   * @param {Storage|null} storageBackend - Storage backend supporting `getItem`/`setItem`/`removeItem`.
   * @returns {{ getStats: Function, reset: Function, recordRun: Function, clearSessionFingerprint: Function }} Bound stats store API.
   */
  function createStore(storageBackend) {
    let lastRecordedSignature = null;
    const resolveStorage = () => (storageBackend !== undefined ? storageBackend : globalScope.localStorage);

    function getStats() {
      return readFromStorage(resolveStorage());
    }

    function reset() {
      lastRecordedSignature = null;
      removeFromStorage(resolveStorage());
      return createEmptyStats();
    }

    function clearSessionFingerprint() {
      lastRecordedSignature = null;
    }

    function recordRun({ text, stats, sourceType }) {
      if (!text || !/\S/.test(text) || !stats) return false;
      const fingerprint = computeInMemoryFingerprint(text);
      if (sourceType !== 'file' && lastRecordedSignature === fingerprint) return false;

      lastRecordedSignature = fingerprint;
      const storage = resolveStorage();
      const updated = mergeRunCounts(readFromStorage(storage), stats, sourceType);
      writeToStorage(storage, updated);
      return true;
    }

    return { getStats, reset, recordRun, clearSessionFingerprint };
  }

  const defaultStore = createStore(undefined);

  /**
   * Reads persisted aggregate counts from `localStorage`.
   * @returns {{ totalEntities: number, byType: Object<string, number>, filesProcessed: number, luhnRejected: number, runs: number, lastUsed: string|null }} Aggregate stats.
   */
  function getStats() {
    return defaultStore.getStats();
  }

  /**
   * Clears persisted aggregate counts from `localStorage` and resets session deduplication.
   * @returns {{ totalEntities: number, byType: Object<string, number>, filesProcessed: number, luhnRejected: number, runs: number, lastUsed: string|null }} Zeroed stats object.
   */
  function reset() {
    return defaultStore.reset();
  }

  /**
   * Records aggregate run counts into `localStorage` (`redactlocal_stats_v1`) without persisting PII.
   * @param {Object} params - Run metadata.
   * @param {string} params.text - Raw input text (used only to compute in-memory fingerprint).
   * @param {Object} params.stats - Counts returned by `RedactEngine.sanitizeInput()`.
   * @param {'file'|'sample'|'export'} params.sourceType - Trigger event category.
   * @returns {boolean} Whether stats were incremented.
   */
  function recordRun(params) {
    return defaultStore.recordRun(params);
  }

  /**
   * Clears the in-memory deduplication fingerprint when resetting the workspace.
   * @returns {void}
   */
  function clearSessionFingerprint() {
    defaultStore.clearSessionFingerprint();
  }

  globalScope.RedactStats = {
    STATS_STORAGE_KEY,
    ENTITY_KEYS,
    createEmptyStats,
    createStore,
    getStats,
    reset,
    recordRun,
    clearSessionFingerprint,
  };
})();
