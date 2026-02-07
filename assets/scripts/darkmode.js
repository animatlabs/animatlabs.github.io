// Dark mode toggle using darkreader library
// Respects user's OS preference, persists choice in localStorage
(function () {
  'use strict';

  var STORAGE_KEY = 'darkmode-preference';
  var DARK = 'dark';
  var LIGHT = 'light';

  // Wait for darkreader to load
  function waitForDarkReader(callback, attempts) {
    if (typeof DarkReader !== 'undefined') {
      callback();
      return;
    }
    if (attempts > 20) return; // Give up after ~2s
    setTimeout(function () {
      waitForDarkReader(callback, (attempts || 0) + 1);
    }, 100);
  }

  function getStoredPreference() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setStoredPreference(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (e) {
      // localStorage not available; fail silently
    }
  }

  function getSystemPreference() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return DARK;
    }
    return LIGHT;
  }

  function enableDarkMode() {
    DarkReader.enable({
      brightness: 100,
      contrast: 100,
      sepia: 0
    });
    // Preserve amber accent colours that darkreader would otherwise invert
    var style = document.getElementById('darkmode-overrides');
    if (!style) {
      style = document.createElement('style');
      style.id = 'darkmode-overrides';
      document.head.appendChild(style);
    }
    style.textContent =
      '#readingProgress { background: linear-gradient(90deg, #0ea5e9, #0284c7) !important; }' +
      '#backToTop { background: #0ea5e9 !important; color: #fff !important; }' +
      '#darkModeToggle { background: #0ea5e9 !important; color: #fff !important; }' +
      '#subscribeFloat { background: #0ea5e9 !important; color: #fff !important; }' +
      '#subscribe-cta button[type="submit"] { background: #0ea5e9 !important; color: #fff !important; }' +
      '.consent-btn.accept { background: #0ea5e9 !important; color: #fff !important; }';
  }

  function disableDarkMode() {
    DarkReader.disable();
    var style = document.getElementById('darkmode-overrides');
    if (style) style.textContent = '';
  }

  function updateToggleButton(btn, isDark) {
    if (!btn) return;
    btn.innerHTML = isDark
      ? '<span aria-hidden="true">&#9788;</span>'   // Sun icon (switch to light)
      : '<span aria-hidden="true">&#9790;</span>';   // Moon icon (switch to dark)
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  }

  function init() {
    var stored = getStoredPreference();
    var isDark = stored === DARK || (stored === null && getSystemPreference() === DARK);

    if (isDark) {
      enableDarkMode();
    } else {
      disableDarkMode();
    }

    // Create toggle button
    var btn = document.createElement('button');
    btn.id = 'darkModeToggle';
    btn.type = 'button';
    updateToggleButton(btn, isDark);
    document.body.appendChild(btn);

    btn.addEventListener('click', function () {
      isDark = !isDark;
      if (isDark) {
        enableDarkMode();
      } else {
        disableDarkMode();
      }
      setStoredPreference(isDark ? DARK : LIGHT);
      updateToggleButton(btn, isDark);
    });

    // Listen for OS theme changes (only if user hasn't set a manual preference)
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
        if (getStoredPreference() !== null) return; // User set manual preference
        isDark = e.matches;
        if (isDark) {
          enableDarkMode();
        } else {
          disableDarkMode();
        }
        updateToggleButton(btn, isDark);
      });
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      waitForDarkReader(init, 0);
    });
  } else {
    waitForDarkReader(init, 0);
  }
})();
