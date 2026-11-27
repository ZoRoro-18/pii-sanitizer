(() => {
  'use strict';

  const THEME_STORAGE_KEY = 'redactlocal_theme';

  try {
    let theme = localStorage.getItem(THEME_STORAGE_KEY);
    if (theme !== 'dark' && theme !== 'light') {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = theme;
  } catch (_) {
    // Fall back safely to light theme when localStorage is blocked over restricted file:// contexts
    document.documentElement.dataset.theme = 'light';
  }
})();
