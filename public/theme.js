(() => {
  'use strict';
  const root = document.documentElement;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const system = matchMedia('(prefers-color-scheme: dark)');
  const key = 'hujie-theme';
  const validMode = value => value === 'day' || value === 'night' ? value : 'system';
  let mode = 'system';
  let picker;

  try { mode = validMode(localStorage.getItem(key)); } catch {}

  function applyTheme() {
    const night = mode === 'system' ? system.matches : mode === 'night';
    root.dataset.theme = night ? 'night' : 'day';
    themeColor.content = night
      ? (themeColor.dataset.night || '#101517')
      : (themeColor.dataset.day || '#f4f1eb');
    if (picker) picker.value = mode;
  }

  applyTheme();
  system.addEventListener('change', () => {
    if (mode === 'system') applyTheme();
  });
  window.addEventListener('storage', event => {
    if (event.storageArea !== localStorage || (event.key !== key && event.key !== null)) return;
    mode = validMode(event.newValue);
    applyTheme();
  });
  document.addEventListener('DOMContentLoaded', () => {
    picker = document.getElementById('theme-select');
    picker.value = mode;
    picker.closest('label').hidden = false;
    picker.addEventListener('change', () => {
      mode = validMode(picker.value);
      try { localStorage.setItem(key, mode); } catch {}
      applyTheme();
    });
  }, { once: true });
})();
