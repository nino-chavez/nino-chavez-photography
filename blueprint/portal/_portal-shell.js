/**
 * Blueprint canonical portal shell
 *
 * Single source of truth for the meta-page shell across Front Door,
 * Prototype Studio, and Docs viewer. Injected as HTML on page load so
 * the three pages can't drift visually — they all consume this file.
 *
 * Origin: extracted from the origin consumer's 2026-05-24 polish pass.
 * Promoted to wip/blueprint/template as the canonical going-forward shell.
 *
 * Usage in any portal page:
 *
 *   <header data-portal-shell="prototype"></header>
 *   ...
 *   <script src="/_portal-shell.js"></script>
 *
 * The `data-portal-shell` attribute value chooses which nav item gets the
 * active treatment: 'index' | 'prototype' | 'docs'.
 *
 * Project-level config resolution (in order):
 *   1. window.PORTAL_SHELL_CONFIG if set BEFORE this script loads (back-compat
 *      and used by the example/scaffold HTML for synchronous render)
 *   2. _meta/index.json — productName derived from `name` (strips
 *      " Blueprint" suffix); docsLandingHref derived to plain "/docs/"
 *      so the docs viewer itself resolves the default doc from its manifest
 *   3. Built-in placeholder defaults ('Project', '/docs/')
 *
 * The manifest-aware path is the recommended canonical: it means the
 * three HTML files (index, prototype/index, docs/index) can omit
 * PORTAL_SHELL_CONFIG entirely. A consumer renames their project by
 * editing one field in _meta/index.json, not by hunting for
 * PORTAL_SHELL_CONFIG occurrences across the portal.
 *
 * Prior version (pre-2026-05-25-evening) hard-coded a consumer-shaped
 * default 'docsLandingHref: /docs/?doc=cx-strategy'. That was a stamp
 * leak — see docs/case-studies/case-study-v3-portal-css-gap.md "Follow-up — docs viewer".
 */
(function () {
  'use strict'

  // Bump when the shell HTML or behavior changes. The drift check in
  // prep-deploy.sh compares this string against the template's version to
  // catch projects falling behind.
  const SHELL_VERSION = '2026-05-25.2'

  const PLACEHOLDER_CONFIG = {
    productName: 'Project',
    docsLandingHref: '/docs/'
  }

  // Initial config from window override or placeholder defaults. May be
  // upgraded asynchronously by manifest fetch below.
  let config = Object.assign({}, PLACEHOLDER_CONFIG, window.PORTAL_SHELL_CONFIG || {})

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function renderShell(activePage) {
    const item = (id, label, href) => {
      const active = id === activePage ? ' class="active" aria-current="page"' : ''
      return `<a href="${href}"${active}>${escapeHtml(label)}</a>`
    }
    return `
      <div class="portal-shell-inner">
        <a href="/" class="brand-mark">
          ${escapeHtml(config.productName)}<span class="brand-mark-tag">Blueprint</span>
        </a>
        <nav class="portal-shell-nav" aria-label="Primary">
          ${item('index', 'Front door', '/')}
          ${item('prototype', 'Prototype', '/prototype/')}
          ${item('docs', 'Docs', config.docsLandingHref)}
        </nav>
      </div>`
  }

  function renderAll() {
    const targets = document.querySelectorAll('header[data-portal-shell]')
    if (!targets.length) return
    targets.forEach((el) => {
      const active = el.getAttribute('data-portal-shell') || 'index'
      el.classList.add('portal-shell')
      el.innerHTML = renderShell(active)
      el.setAttribute('data-portal-shell-version', SHELL_VERSION)
    })
  }

  function deriveProductName(rawName) {
    if (!rawName) return null
    // "PROJECT_NAME Blueprint" → "PROJECT_NAME"; consumer's "Acme Blueprint" → "Acme"
    return rawName.replace(/\s+Blueprint\s*$/, '').trim() || null
  }

  async function upgradeFromManifest() {
    // Only fetch if the consumer hasn't explicitly set PORTAL_SHELL_CONFIG.
    // Pages with synchronous productName (legacy path) skip the manifest hop.
    if (window.PORTAL_SHELL_CONFIG && window.PORTAL_SHELL_CONFIG.productName) return
    // Try in order: same-dir-up, root. Most pages live at /, /prototype/,
    // /docs/ — relative path resolves differently per page, absolute /
    // works uniformly under Cloudflare Pages.
    try {
      const res = await fetch('/_meta/index.json', { cache: 'default' })
      if (!res.ok) return
      const manifest = await res.json()
      const derived = deriveProductName(manifest && manifest.name)
      if (derived) {
        config = Object.assign({}, config, { productName: derived })
        renderAll() // re-render with the upgraded name
      }
    } catch {
      // Manifest unavailable — keep the placeholder. Not fatal.
    }
  }

  function init() {
    renderAll()
    // Upgrade asynchronously. The initial render uses the placeholder or the
    // PORTAL_SHELL_CONFIG value; the manifest fetch (if it resolves) replaces
    // the brand mark text in-place.
    upgradeFromManifest()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

  // Expose for drift checks + debugging
  window.__portalShell = { version: SHELL_VERSION, get config() { return config } }
})()
