/* Blueprint Portal — Theme switcher
 *
 * Initiative-specific JS (NOT canonical chrome). Enables runtime preview
 * of the 4 brand themes registered in portal/project-tokens.css:
 *   slate (default) | coral | forest | minimal
 *
 * Reads theme from (in priority order):
 *   1. URL query param ?theme=slate
 *   2. localStorage key 'blueprint-theme'
 *   3. default = slate
 *
 * Persists user-selected theme to localStorage so it survives navigation.
 *
 * Renders a small toggle UI in the bottom-left corner. The toggle is
 * positioned to avoid the bottom-right chat widget + the bottom proto-nav
 * footer that canonical chrome (proto-nav.js) injects.
 *
 * Page contract: include this script with `<script src="../theme-switcher.js" defer></script>`.
 * No page-side configuration needed.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'blueprint-theme';
  const THEMES = ['slate', 'coral', 'forest', 'minimal'];
  const DEFAULT_THEME = 'slate';

  function readInitialTheme() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('theme');
    if (fromQuery && THEMES.includes(fromQuery)) return fromQuery;

    try {
      const fromStorage = localStorage.getItem(STORAGE_KEY);
      if (fromStorage && THEMES.includes(fromStorage)) return fromStorage;
    } catch (e) {
      // localStorage may be blocked; fall through to default
    }

    return DEFAULT_THEME;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      // ignore storage failures
    }
    updateActiveButton(theme);
  }

  function updateActiveButton(theme) {
    const buttons = document.querySelectorAll('.bp-theme-switcher button');
    buttons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  }

  function renderSwitcher() {
    const container = document.createElement('div');
    container.className = 'bp-theme-switcher';
    container.innerHTML = `
      <div class="bp-theme-label">Theme</div>
      <div class="bp-theme-buttons">
        ${THEMES.map(
          (t) => `<button type="button" data-theme="${t}" aria-label="Apply ${t} theme"><span class="bp-theme-swatch bp-theme-swatch-${t}"></span>${t}</button>`
        ).join('')}
      </div>
    `;
    container.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
    });
    document.body.appendChild(container);

    // Inject styles inline so the switcher works even before project-tokens.css
    // is fully parsed; uses static colors to remain readable across themes.
    const style = document.createElement('style');
    style.textContent = `
      .bp-theme-switcher {
        position: fixed; bottom: 80px; left: 16px; z-index: 90;
        background: #ffffff; border: 1px solid #c4c7c7; border-radius: 8px;
        padding: 8px 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 11px;
      }
      .bp-theme-label {
        text-transform: uppercase; letter-spacing: 0.08em;
        color: #747878; font-weight: 600; margin-bottom: 6px;
      }
      .bp-theme-buttons { display: flex; flex-direction: column; gap: 4px; }
      .bp-theme-switcher button {
        display: flex; align-items: center; gap: 8px;
        background: transparent; border: 0; padding: 4px 6px;
        font: inherit; color: #1b1c1c; cursor: pointer;
        border-radius: 4px; text-align: left;
      }
      .bp-theme-switcher button:hover { background: #f5f3f3; }
      .bp-theme-switcher button.active { background: #f5f3f3; font-weight: 700; }
      .bp-theme-swatch {
        width: 14px; height: 14px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.12);
        flex-shrink: 0;
      }
      .bp-theme-swatch-slate   { background: hsl(225, 60%, 45%); }
      .bp-theme-swatch-coral   { background: hsl(8, 65%, 42%); }
      .bp-theme-swatch-forest  { background: hsl(150, 42%, 32%); }
      .bp-theme-swatch-minimal { background: hsl(220, 12%, 32%); }
    `;
    document.head.appendChild(style);
  }

  // Apply theme before paint to avoid flash
  const initialTheme = readInitialTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);

  // Render switcher after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderSwitcher);
  } else {
    renderSwitcher();
  }
})();
