(function (globalScope) {
  'use strict';

  const THEME_STORAGE_KEY = 'redactlocal_theme';

  // =========================================================================
  // Shared Formatting Utilities
  // =========================================================================

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatNumber(num) {
    return Number(num || 0).toLocaleString('en-US');
  }

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

  // =========================================================================
  // Theme Persistence (`redactlocal_theme` only)
  // =========================================================================

  function getPreferredTheme() {
    try {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (_) {
      // Ignore storage failures under restricted file:// contexts
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  function applyTheme(theme) {
    const resolved = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = resolved;
    const label = document.getElementById('theme-toggle-label');
    if (label) {
      label.textContent = resolved === 'dark' ? 'Dark' : 'Light';
    }
    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-pressed', resolved === 'dark' ? 'true' : 'false');
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, resolved);
    } catch (_) {
      // Ignore storage failures
    }
  }

  // =========================================================================
  // Toast Notifications (`aria-live="polite"`)
  // =========================================================================

  function ensureToastRegion() {
    let region = document.getElementById('toast-region');
    if (!region) {
      region = document.createElement('div');
      region.id = 'toast-region';
      region.className = 'toast-region';
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-atomic', 'false');
      document.body.appendChild(region);
    }
    return region;
  }

  function showToast(message, type = 'info', durationMs = 3200) {
    if (typeof document === 'undefined') return;
    const region = ensureToastRegion();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');

    const textSpan = document.createElement('span');
    textSpan.textContent = String(message);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.textContent = '×';

    let removed = false;
    function dismiss() {
      if (removed) return;
      removed = true;
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }

    closeBtn.addEventListener('click', dismiss);
    toast.appendChild(textSpan);
    toast.appendChild(closeBtn);
    region.appendChild(toast);

    if (durationMs > 0) {
      setTimeout(dismiss, durationMs);
    }
  }

  // =========================================================================
  // Accessible Confirmation Modal
  // =========================================================================

  function openConfirmModal(options) {
    if (typeof document === 'undefined') return;
    const {
      title = 'Confirm Action',
      message = 'Are you sure?',
      confirmLabel = 'Confirm',
      cancelLabel = 'Cancel',
      confirmVariant = 'danger',
      onConfirm,
    } = options || {};

    const previouslyFocused = document.activeElement;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'confirm-modal-title');
    dialog.setAttribute('aria-describedby', 'confirm-modal-desc');

    const h2 = document.createElement('h2');
    h2.id = 'confirm-modal-title';
    h2.className = 'modal-title';
    h2.textContent = title;

    const body = document.createElement('p');
    body.id = 'confirm-modal-desc';
    body.className = 'modal-body';
    body.textContent = message;

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-secondary btn-md';
    cancelBtn.textContent = cancelLabel;

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = `btn btn-${confirmVariant} btn-md`;
    confirmBtn.textContent = confirmLabel;

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    dialog.appendChild(h2);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    function close() {
      document.removeEventListener('keydown', handleKeydown);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    }

    function handleKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        const focusables = [cancelBtn, confirmBtn];
        const idx = focusables.indexOf(document.activeElement);
        if (e.shiftKey) {
          e.preventDefault();
          focusables[(idx <= 0 ? focusables.length - 1 : idx - 1)].focus();
        } else {
          e.preventDefault();
          focusables[(idx + 1) % focusables.length].focus();
        }
      }
    }

    cancelBtn.addEventListener('click', close);
    confirmBtn.addEventListener('click', () => {
      close();
      if (typeof onConfirm === 'function') onConfirm();
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

  function initNavigationAndTheme() {
    applyTheme(getPreferredTheme());

    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const current = document.documentElement.dataset.theme;
        applyTheme(current === 'dark' ? 'light' : 'dark');
      });
    }

    window.addEventListener('storage', (e) => {
      if (e.key === THEME_STORAGE_KEY && (e.newValue === 'dark' || e.newValue === 'light')) {
        applyTheme(e.newValue);
      }
    });

    const menuBtn = document.getElementById('mobile-menu-btn');
    const drawer = document.getElementById('mobile-drawer');
    if (!menuBtn || !drawer) return;

    function setDrawerOpen(open) {
      drawer.hidden = !open;
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menuBtn.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
      if (open && typeof drawer.querySelector === 'function') {
        const firstLink = drawer.querySelector('a');
        if (firstLink && typeof firstLink.focus === 'function') firstLink.focus();
      }
    }

    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setDrawerOpen(drawer.hidden);
    });

    drawer.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('a')) {
        setDrawerOpen(false);
      }
    });

    document.addEventListener('click', (e) => {
      if (!drawer.hidden && !drawer.contains(e.target) && !menuBtn.contains(e.target)) {
        setDrawerOpen(false);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !drawer.hidden) {
        setDrawerOpen(false);
        menuBtn.focus();
      }
    });
  }

  globalScope.RedactLocalUI = {
    THEME_STORAGE_KEY,
    formatBytes,
    formatNumber,
    formatDateHuman,
    getPreferredTheme,
    applyTheme,
    showToast,
    openConfirmModal,
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initNavigationAndTheme);
  }
})(typeof window !== 'undefined' ? window : globalThis);
