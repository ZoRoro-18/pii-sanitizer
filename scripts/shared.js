(() => {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;

  const THEME_STORAGE_KEY = 'redactlocal_theme';
  const TOAST_DEFAULT_DURATION_MS = 3200;
  const KB_BYTES = 1024;
  const MB_BYTES = 1024 * 1024;

  // =========================================================================
  // Shared Formatting & DOM Construction Utilities
  // =========================================================================

  /**
   * Formats a byte count into a human-readable B, KB, or MB string.
   * @param {number} bytes - Non-negative byte size.
   * @returns {string} Formatted byte size.
   */
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes < KB_BYTES) return `${bytes} B`;
    if (bytes < MB_BYTES) return `${(bytes / KB_BYTES).toFixed(1)} KB`;
    return `${(bytes / MB_BYTES).toFixed(2)} MB`;
  }

  /**
   * Formats a numeric count with en-US thousands separators.
   * @param {number} num - Input number.
   * @returns {string} Locale-formatted number string.
   */
  function formatNumber(num) {
    return Number(num || 0).toLocaleString('en-US');
  }

  /**
   * Formats an ISO timestamp string for dashboard display.
   * @param {string|null} isoString - ISO 8601 date string.
   * @returns {string} Localized date/time or `'No runs yet'`.
   */
  function formatDateHuman(isoString) {
    if (!isoString) return 'No runs yet';
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return 'No runs yet';
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Safely removes all child nodes from an optional DOM container.
   * @param {Element|null} el - Target element.
   * @returns {void}
   */
  function clearChildren(el) {
    if (el) el.textContent = '';
  }

  /**
   * Creates a DOM element using safe `textContent` and attribute helpers.
   * @param {string} tag - HTML tag name.
   * @param {Object} [opts] - Element configuration (`className`, `text`, `id`, `attrs`, `children`).
   * @returns {HTMLElement} Constructed element.
   */
  function createEl(tag, opts = {}) {
    const el = document.createElement(tag);
    if (opts.id) el.id = opts.id;
    if (opts.className) el.className = opts.className;
    if (opts.text !== undefined) el.textContent = String(opts.text);
    if (opts.attrs) {
      Object.entries(opts.attrs).forEach(([k, v]) => {
        if (v !== undefined && v !== null) el.setAttribute(k, String(v));
      });
    }
    if (opts.children) {
      opts.children.forEach((child) => {
        if (child) el.appendChild(child);
      });
    }
    return el;
  }

  // =========================================================================
  // Theme Persistence (`redactlocal_theme` only)
  // =========================================================================

  /**
   * Resolves the user's preferred theme (`dark` or `light`) from `localStorage` or OS preference.
   * @returns {'dark'|'light'} Active theme token.
   */
  function getPreferredTheme() {
    try {
      const saved = globalScope.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (_) {
      // Fall back to media query when storage access is disabled
    }
    if (globalScope.matchMedia && globalScope.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  /**
   * Applies the active theme to `document.documentElement`, syncs the toggle button, and persists preference.
   * @param {'dark'|'light'} theme - Target theme name.
   * @returns {void}
   */
  function applyTheme(theme) {
    const resolved = theme === 'dark' ? 'dark' : 'light';
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = resolved;

    const label = document.getElementById('theme-toggle-label');
    if (label) label.textContent = resolved === 'dark' ? 'Dark' : 'Light';

    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) toggleBtn.setAttribute('aria-pressed', resolved === 'dark' ? 'true' : 'false');

    try {
      globalScope.localStorage.setItem(THEME_STORAGE_KEY, resolved);
    } catch (_) {
      // Ignore storage persistence errors in sandboxed/private file:// modes
    }
  }

  // =========================================================================
  // Toast Notifications (`aria-live="polite"`)
  // =========================================================================

  function ensureToastRegion() {
    let region = document.getElementById('toast-region');
    if (region) return region;
    region = createEl('div', {
      id: 'toast-region',
      className: 'toast-region',
      attrs: { 'aria-live': 'polite', 'aria-atomic': 'false' },
    });
    document.body.appendChild(region);
    return region;
  }

  /**
   * Displays a dismissible status toast notification in the live toast region.
   * @param {string} message - Plain text notification message.
   * @param {'info'|'success'|'error'} [type='info'] - Visual toast severity variant.
   * @param {number} [durationMs=3200] - Auto-dismiss delay in milliseconds (`<= 0` disables).
   * @returns {void}
   */
  function showToast(message, type = 'info', durationMs = TOAST_DEFAULT_DURATION_MS) {
    if (typeof document === 'undefined') return;
    const region = ensureToastRegion();
    const closeBtn = createEl('button', {
      className: 'toast-close',
      text: '×',
      attrs: { type: 'button', 'aria-label': 'Dismiss notification' },
    });
    const toast = createEl('div', {
      className: `toast toast-${type}`,
      attrs: { role: 'status' },
      children: [createEl('span', { text: String(message) }), closeBtn],
    });

    let removed = false;
    function dismiss() {
      if (removed) return;
      removed = true;
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }

    closeBtn.addEventListener('click', dismiss);
    region.appendChild(toast);
    if (durationMs > 0) setTimeout(dismiss, durationMs);
  }

  // =========================================================================
  // Accessible Confirmation Modal
  // =========================================================================

  function buildConfirmDialog(options) {
    const {
      title = 'Confirm Action',
      message = 'Are you sure?',
      confirmLabel = 'Confirm',
      cancelLabel = 'Cancel',
      confirmVariant = 'danger',
    } = options || {};

    const cancelBtn = createEl('button', {
      className: 'btn btn-secondary btn-md',
      text: cancelLabel,
      attrs: { type: 'button' },
    });
    const confirmBtn = createEl('button', {
      className: `btn btn-${confirmVariant} btn-md`,
      text: confirmLabel,
      attrs: { type: 'button' },
    });
    const dialog = createEl('div', {
      className: 'modal-dialog',
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'confirm-modal-title',
        'aria-describedby': 'confirm-modal-desc',
      },
      children: [
        createEl('h2', { id: 'confirm-modal-title', className: 'modal-title', text: title }),
        createEl('p', { id: 'confirm-modal-desc', className: 'modal-body', text: message }),
        createEl('div', { className: 'modal-footer', children: [cancelBtn, confirmBtn] }),
      ],
    });
    const backdrop = createEl('div', { className: 'modal-backdrop', children: [dialog] });
    return { backdrop, cancelBtn, confirmBtn };
  }

  function createModalKeyHandler(focusables, close) {
    return (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const idx = focusables.indexOf(document.activeElement);
      const next = e.shiftKey
        ? (idx <= 0 ? focusables.length - 1 : idx - 1)
        : (idx + 1) % focusables.length;
      focusables[next].focus();
    };
  }

  /**
   * Opens an accessible confirmation dialog with Escape handling, focus trapping, and focus restoration.
   * @param {Object} options - Dialog title, message, button labels, variant, and `onConfirm` callback.
   * @returns {void}
   */
  function openConfirmModal(options) {
    if (typeof document === 'undefined') return;
    const previouslyFocused = document.activeElement;
    const { backdrop, cancelBtn, confirmBtn } = buildConfirmDialog(options);
    document.body.appendChild(backdrop);

    function close() {
      document.removeEventListener('keydown', handleKeydown);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    }

    const handleKeydown = createModalKeyHandler([cancelBtn, confirmBtn], close);
    cancelBtn.addEventListener('click', close);
    confirmBtn.addEventListener('click', () => {
      close();
      if (options && typeof options.onConfirm === 'function') options.onConfirm();
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', handleKeydown);
    cancelBtn.focus();
  }

  // =========================================================================
  // Navbar, Theme Toggle & Mobile Menu Initialization
  // =========================================================================

  function initThemeToggle() {
    applyTheme(getPreferredTheme());
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.dataset.theme;
        applyTheme(current === 'dark' ? 'light' : 'dark');
      });
    }
    globalScope.addEventListener('storage', (e) => {
      if (e.key === THEME_STORAGE_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
        applyTheme(e.newValue);
      }
    });
  }

  function handleDrawerKeydown(e, menuBtn, drawer, setDrawerOpen) {
    if (drawer.hidden) return;
    if (e.key === 'Escape') {
      setDrawerOpen(false);
      menuBtn.focus();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = [menuBtn, ...Array.from(drawer.querySelectorAll('a, button'))];
    const idx = focusables.indexOf(document.activeElement);
    if (idx === -1) return;
    e.preventDefault();
    const nextIdx = e.shiftKey
      ? (idx <= 0 ? focusables.length - 1 : idx - 1)
      : (idx + 1) % focusables.length;
    focusables[nextIdx].focus();
  }

  function initMobileDrawer() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const drawer = document.getElementById('mobile-drawer');
    if (!menuBtn || !drawer) return;

    function setDrawerOpen(open) {
      drawer.hidden = !open;
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menuBtn.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
      if (!open || typeof drawer.querySelector !== 'function') return;
      const firstLink = drawer.querySelector('a');
      if (firstLink && typeof firstLink.focus === 'function') firstLink.focus();
    }

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setDrawerOpen(drawer.hidden);
    });
    drawer.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('a')) setDrawerOpen(false);
    });
    document.addEventListener('click', (e) => {
      if (!drawer.hidden && !drawer.contains(e.target) && !menuBtn.contains(e.target)) setDrawerOpen(false);
    });
    document.addEventListener('keydown', (e) => handleDrawerKeydown(e, menuBtn, drawer, setDrawerOpen));
  }

  function initNavigationAndTheme() {
    initThemeToggle();
    initMobileDrawer();
  }

  globalScope.RedactUI = {
    THEME_STORAGE_KEY,
    formatBytes,
    formatNumber,
    formatDateHuman,
    clearChildren,
    createEl,
    getPreferredTheme,
    applyTheme,
    showToast,
    openConfirmModal,
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initNavigationAndTheme);
  }
})();
