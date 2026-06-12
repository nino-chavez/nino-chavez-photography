/* Blueprint canonical chrome — Proto-nav + panels + comparison toggle + flow mode
 *
 * Reads the portal manifest from /_meta/index.json and the per-page metadata
 * from /_meta/<id>.json so the nav is auto-derived from filesystem instead
 * of hard-coded. Pages only need to declare their id:
 *
 *   window.PROTO_PAGE = { id: 'example-page' };
 *
 * Everything else (title, group, strategy, currentState) comes from the JSON.
 *
 * Flow mode: append ?flow=<flow-id> to any prototype URL. The flow bar shows
 * clickable step dots + prev/next buttons threading the flow's pages in order.
 *
 * Wayfinding (nav paradigm wave, 2026-06-11): the breadcrumb slice/page
 * segments are manifest-driven dropdown switchers, and Cmd/Ctrl+K opens a
 * command palette over pages + slices + docs. The persistent slice rail
 * (.proto-slice-sidebar) is retired — full-bleed mockups are the content;
 * the rail cost ~210px permanently for slice-scoped wayfinding (cognitive
 * audit + operator decision 2026-06-11). Slice context now lives in the
 * strategy drawer.
 *
 * Surface contract (from CONVENTIONS.md): everything this script renders is
 * harness chrome — it never modifies the prototype page's product UI. The
 * panels, comparison toggle, footer nav, and flow breadcrumb all live in
 * fixed-position layers above the page body. The one sanctioned touch of the
 * page body is the mock frame (canvas rule, 2026-06-11): view sections get a
 * portal-owned frame class + window bar so the mock's theme stays inside the
 * frame — the frame wraps the product UI, it never alters it.
 */
(function () {
  let MANIFEST = null;
  let CURRENT_META = null;
  let CURRENT_FLOW = null;

  // Reuse this script's ?v= cache-bust token for all _meta JSON fetches.
  // Without this the browser caches manifest + per-page JSON aggressively
  // and stale data keeps shipping after edits.
  const CACHE_BUST = (() => {
    const src = document.currentScript?.src || '';
    const match = src.match(/[?&]v=([^&]+)/);
    return match ? `?v=${match[1]}` : '';
  })();

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') node.innerHTML = v;
      else node.setAttribute(k, v);
    });
    children.flat().forEach(c => {
      if (c == null) return;
      node.appendChild(c.nodeType ? c : document.createTextNode(c));
    });
    return node;
  }

  function isProtoRoot() {
    const path = window.location.pathname;
    return path === '/' || path.endsWith('/index.html') || path.endsWith('/index');
  }

  // ─────────────── manifest + metadata loaders ───────────────

  async function loadManifest() {
    if (MANIFEST) return MANIFEST;
    const base = (isProtoRoot() ? '_meta/index.json' : '../_meta/index.json') + CACHE_BUST;
    try {
      const res = await fetch(base);
      if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
      MANIFEST = await res.json();
    } catch (err) {
      console.warn('proto-nav: manifest load failed', err);
      MANIFEST = { name: 'Blueprint', groups: [], pages: [], flows: [] };
    }
    return MANIFEST;
  }

  async function loadPageMeta(id) {
    if (!id) return null;
    const base = (isProtoRoot() ? `_meta/${id}.json` : `../_meta/${id}.json`) + CACHE_BUST;
    try {
      const res = await fetch(base);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`proto-nav: meta load failed for ${id}`, err);
      return null;
    }
  }

  function pageHref(id) {
    // Manifest may declare per-id route overrides (_meta/index.json `routes`):
    // meta-only product destinations (a documented Pattern B feature) live at
    // production URLs, not ./pages/<id>.html — without this, every chrome
    // surface that builds hrefs from ids (jump-to, flow nav) emits phantom
    // links for them (cognitive audit 2026-06-11).
    const route = MANIFEST?.routes?.[id];
    if (route) return route;
    return isProtoRoot() ? `./pages/${id}.html` : `./${id}.html`;
  }

  // Cross-surface jump targets (breadcrumb menus, palette): the routes-map
  // override wins via pageHref; otherwise prefer the page meta's absolute
  // route because pageHref's relative fallback only resolves between sibling
  // prototype pages, not from docs/front-door (nav paradigm wave, 2026-06-11).
  function jumpHref(id) {
    if (MANIFEST?.routes?.[id]) return pageHref(id);
    return MANIFEST?._cache?.[id]?.route || pageHref(id);
  }

  // ─────────────── flow mode ───────────────

  function getFlowFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('flow');
  }

  function buildFlowBreadcrumb(flow, currentId) {
    const idx = flow.pages.indexOf(currentId);
    const prev = idx > 0 ? flow.pages[idx - 1] : null;
    const next = idx >= 0 && idx < flow.pages.length - 1 ? flow.pages[idx + 1] : null;
    const total = flow.pages.length;

    const wrap = el('div', { class: 'proto-flow-breadcrumb' },
      el('div', { class: 'flow-meta' },
        el('span', { class: 'flow-label' }, 'Flow:'),
        el('span', { class: 'flow-name' }, flow.label),
        // Step dots are in-flow navigation, not just a counter — each dot is
        // the page at that position (nav paradigm wave, 2026-06-11).
        el('span', {
          class: 'flow-step-dots',
          role: 'navigation',
          'aria-label': `Step ${idx + 1} of ${total}`
        }, flow.pages.map((pid, i) => {
          const title = MANIFEST?._titleCache?.[pid] || pid;
          return i === idx
            ? el('span', { class: 'flow-step-dot is-current', 'aria-current': 'step', title })
            : el('a', {
                class: 'flow-step-dot',
                href: `${pageHref(pid)}?flow=${flow.id}`,
                title,
                'aria-label': `Step ${i + 1} of ${total}: ${title}`
              });
        }))
      ),
      el('div', { class: 'flow-actions' },
        prev ? el('a', {
          class: 'flow-nav-btn',
          href: `${pageHref(prev)}?flow=${flow.id}`,
          'aria-label': 'Previous page in flow'
        }, '← ', el('span', { class: 'flow-page-name' }, MANIFEST?._titleCache?.[prev] || prev))
        : el('span', { class: 'flow-nav-btn disabled' }, '← Start of flow'),
        next ? el('a', {
          class: 'flow-nav-btn primary',
          href: `${pageHref(next)}?flow=${flow.id}`,
          'aria-label': 'Next page in flow'
        }, el('span', { class: 'flow-page-name' }, MANIFEST?._titleCache?.[next] || next), ' →')
        : el('span', { class: 'flow-nav-btn disabled' }, 'End of flow →')
      )
    );
    document.body.appendChild(wrap);
  }

  // ─────────────── footer nav (auto-built from manifest) ───────────────

  function buildFooterNav() {
    // The 'Jump to' select is retired — the breadcrumb switchers + command
    // palette subsume it (nav paradigm wave, 2026-06-11). The drawer toggle
    // buttons stay: the hidden footer keeps them reachable in the DOM.
    const nav = el('div', { class: 'proto-footer-nav' },
      el('div', { class: 'nav-actions' },
        el('button', { id: 'toggle-current-state', onclick: () => togglePanel('current-state') }, '◀ Shipped'),
        el('button', { id: 'toggle-strategy', onclick: () => togglePanel('strategy') }, 'Strategy ▶')
      )
    );
    document.body.appendChild(nav);
  }

  // ─────────────── unified top bar (proto-nav.js, on every prototype page) ───────────────
  //
  // Single 56px region. Left: brand mark + breadcrumb. Right: compare toggle
  // (mounted later by buildCompareToggle) + trace badges + global nav.
  // Replaces the old two-bar stack (brand bar 36px + slice header 44px).

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ─────────────── citation chip + overlay (replaces trace pills) ───────────────
  //
  // A single chip in the top bar lists short IDs (F4, R6, …) gated by a 2px
  // brand-rule. Clicking expands an overlay anchored below the chip showing
  // each citation's full title with a colored margin rule (gold = finding,
  // indigo = rule) — designed to read as a scholarly margin annotation, not
  // a status badge cluster.

  function resolveCitations(slice) {
    if (!slice) return [];
    const findings = slice.findings_cited || [];
    const principles = slice.principles_cited || [];
    const dict = MANIFEST?.citations || {};
    const lookup = (id, kind) => {
      const table = kind === 'finding' ? dict.findings : dict.rules;
      const entry = table?.[id];
      return {
        kind,
        id,
        short: entry?.short || id,
        title: entry?.title || null,
        source: entry?.source || null,
      };
    };
    return [
      ...findings.map(id => lookup(id, 'finding')),
      ...principles.map(id => lookup(id, 'rule')),
    ];
  }

  function renderCitationChip(rows) {
    const VISIBLE = 4;
    const visible = rows.slice(0, VISIBLE);
    const overflow = rows.length - VISIBLE;
    const codes = visible.map((r, i) =>
      (i > 0 ? `<span class="citation-sep">·</span>` : '') +
      `<span>${escapeHtml(r.short)}</span>`
    ).join('');
    const overflowHtml = overflow > 0
      ? `<span class="citation-overflow">+${overflow}</span>` : '';
    return `
      <button class="citation-chip" type="button"
              aria-haspopup="dialog" aria-controls="citation-overlay"
              aria-expanded="false"
              title="${rows.length} spec citation${rows.length === 1 ? '' : 's'} — click for detail">
        <span class="citation-codes">${codes}${overflowHtml}</span>
        <span class="citation-chevron" aria-hidden="true">▾</span>
      </button>`;
  }

  function renderCitationOverlay(rows) {
    const sources = Array.from(new Set(rows.map(r => r.source).filter(Boolean)));
    const sourceLine = sources.length === 1
      ? sources[0]
      : sources.length > 1 ? `${sources.length} sources` : '';
    const rowsHtml = rows.map(r => `
      <div class="citation-row ${r.kind === 'finding' ? 'is-finding' : ''}${r.title ? '' : ' unknown'}">
        <div class="rule" aria-hidden="true"></div>
        <div class="short">${escapeHtml(r.short)}</div>
        <div class="title">${escapeHtml(r.title || '(citation not found in manifest)')}</div>
      </div>`).join('');
    return `
      <div class="citation-overlay" id="citation-overlay" role="dialog" aria-label="Spec citations">
        <div class="citation-overlay-heading">
          <span>Cited spec evidence (${rows.length})</span>
          ${sourceLine ? `<span class="source-path">${escapeHtml(sourceLine)}</span>` : ''}
        </div>
        ${rowsHtml}
      </div>`;
  }

  function wireCitationChip() {
    const chip = document.querySelector('.proto-top-bar .citation-chip');
    const overlay = document.querySelector('.citation-overlay');
    if (!chip || !overlay) return;

    const close = () => {
      overlay.classList.remove('open');
      chip.setAttribute('aria-expanded', 'false');
    };
    const open = () => {
      const chipRect = chip.getBoundingClientRect();
      const bar = document.querySelector('.proto-top-bar');
      const barBottom = bar ? bar.getBoundingClientRect().bottom : 56;
      overlay.style.top = `${barBottom}px`;
      overlay.style.right = `${Math.max(16, window.innerWidth - chipRect.right)}px`;
      overlay.classList.add('open');
      chip.setAttribute('aria-expanded', 'true');
    };

    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      if (overlay.classList.contains('open')) close(); else open();
    });
    document.addEventListener('click', (e) => {
      if (!overlay.classList.contains('open')) return;
      if (overlay.contains(e.target) || e.target === chip || chip.contains(e.target)) return;
      close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });
    window.addEventListener('resize', () => {
      if (overlay.classList.contains('open')) {
        const rect = chip.getBoundingClientRect();
        overlay.style.top = `${rect.bottom + 2}px`;
        overlay.style.right = `${Math.max(16, window.innerWidth - rect.right)}px`;
      }
    });
  }

  // ─────────────── breadcrumb switchers (nav paradigm wave, 2026-06-11) ───────────────
  //
  // The slice + page breadcrumb segments are dropdown buttons, manifest-driven.
  // Prototype surfaces only — the front door / docs top bar is unchanged.

  function renderSliceMenu(currentSliceId) {
    const rows = (MANIFEST.slices || [])
      .map(id => MANIFEST._sliceCache?.[id])
      .filter(Boolean)
      .map(s => {
        const current = s.id === currentSliceId;
        const href = s.pages?.[0] ? jumpHref(s.pages[0]) : '/prototype/';
        return `
          <a role="menuitem" class="crumb-menu-item${current ? ' is-current' : ''}"
             href="${href}"${current ? ' aria-current="true"' : ''}>
            <span class="item-label">${escapeHtml(s.label)}</span>
            ${s.summary ? `<span class="item-summary">${s.summary}</span>` : ''}
          </a>`;
      }).join('');
    return `<div class="crumb-menu" role="menu" aria-label="All slices">${rows}</div>`;
  }

  function renderPageMenu(slice, currentPageId) {
    const pageRows = (slice.pages || [])
      .map(id => MANIFEST._cache?.[id])
      .filter(Boolean)
      .map(p => {
        const current = p.id === currentPageId;
        return `
          <a role="menuitem" class="crumb-menu-item${current ? ' is-current' : ''}"
             href="${jumpHref(p.id)}"${current ? ' aria-current="page"' : ''}>
            <span class="item-label">${escapeHtml(p.title)}</span>
          </a>`;
      }).join('');
    const flows = (MANIFEST.flows || []).filter(f =>
      (slice.flows_touching_this_slice || []).includes(f.id) ||
      (f.pages || []).some(pid => (slice.pages || []).includes(pid))
    );
    const flowRows = flows.map(f => `
      <a role="menuitem" class="crumb-menu-item crumb-menu-flow"
         href="${jumpHref((f.pages || [])[0])}?flow=${f.id}">
        <span class="item-label">Walk: ${escapeHtml(f.label)}</span>
      </a>`).join('');
    return `<div class="crumb-menu" role="menu" aria-label="Pages in this slice">
      ${pageRows}
      ${flowRows ? `<div class="crumb-menu-divider" role="separator"></div>${flowRows}` : ''}
    </div>`;
  }

  function renderCrumbSwitch(labelClass, label, menuHtml, titleAttr) {
    return `<span class="crumb-switch-wrap">
      <button type="button" class="crumb-switch ${labelClass}"
              aria-haspopup="menu" aria-expanded="false"${titleAttr || ''}>
        ${escapeHtml(label)}<span class="crumb-chevron" aria-hidden="true">▾</span>
      </button>
      ${menuHtml}
    </span>`;
  }

  function wireCrumbSwitchers(bar) {
    const wraps = Array.from(bar.querySelectorAll('.crumb-switch-wrap'));
    if (!wraps.length) return;
    const closeAll = () => wraps.forEach(w => {
      w.querySelector('.crumb-menu')?.classList.remove('open');
      w.querySelector('.crumb-switch')?.setAttribute('aria-expanded', 'false');
    });
    wraps.forEach(wrap => {
      const btn = wrap.querySelector('.crumb-switch');
      const menu = wrap.querySelector('.crumb-menu');
      if (!btn || !menu) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = menu.classList.contains('open');
        closeAll(); // only one switcher open at a time
        if (!wasOpen) {
          menu.classList.add('open');
          btn.setAttribute('aria-expanded', 'true');
          // position:fixed + JS placement: consumers own arbitrary top-bar CSS
          // (rally-hq's crumb container carries overflow:hidden for ellipsis),
          // so an absolutely-positioned menu can be clipped invisible. Fixed
          // positioning escapes every ancestor clip (nav paradigm wave,
          // 2026-06-11 verify finding).
          const r = btn.getBoundingClientRect();
          const w = Math.min(360, window.innerWidth - 16);
          menu.style.top = `${Math.round(r.bottom + 4)}px`;
          menu.style.left = `${Math.round(Math.max(8, Math.min(r.left, window.innerWidth - w - 8)))}px`;
        }
      });
      wrap.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        if (!menu.classList.contains('open')) return;
        e.preventDefault();
        const items = Array.from(menu.querySelectorAll('[role="menuitem"]'));
        const idx = items.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown'
          ? items[Math.min(idx + 1, items.length - 1)]
          : items[Math.max(idx - 1, 0)];
        next?.focus();
      });
    });
    document.addEventListener('click', (e) => {
      if (wraps.some(w => w.contains(e.target))) return;
      closeAll();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAll();
    });
    window.addEventListener('scroll', closeAll, { passive: true });
    window.addEventListener('resize', closeAll);
  }

  function buildTopBar(slice, currentPageMeta) {
    // If the canonical portal-shell is already on the page, don't render
    // our own top bar — the meta-pages now consume _portal-shell.js as the
    // single source of truth for the brand mark + global nav. proto-nav.js
    // still handles strategy panels, citation chips, compare toggle, etc.
    // on prototype-mock pages (where there's no [data-portal-shell]).
    if (document.querySelector('header[data-portal-shell]')) return;

    const pageId = window.PROTO_PAGE?.id;
    const isFrontDoor = pageId === 'index';
    const isDocs = pageId === 'docs';
    const isPrototype = !isFrontDoor && !isDocs;

    // Front door + docs use the light shell variant — these pages ARE the
    // blueprint product, not mock surfaces. Prototype pages keep the dark
    // shell where the contrast separates reviewer chrome from mock content.
    if (isFrontDoor || isDocs) {
      document.body.classList.add('proto-shell-light');
    }

    const fullName = MANIFEST?.name || 'Project';
    const productName = fullName.replace(/\s*Blueprint\s*$/i, '').trim() || fullName;

    // Breadcrumb only renders inside Prototype (slice + page context).
    // Slice + page segments are dropdown switchers (nav paradigm wave,
    // 2026-06-11) — the slice menu lists all slices, the page menu lists the
    // current slice's pages + its flows as Walk entries.
    const crumbParts = [];
    if (isPrototype) {
      crumbParts.push(`<a href="/prototype/">Prototype</a>`);
      if (slice) {
        const surfaceAttr = slice.production_surface
          ? ` title="${escapeHtml(slice.production_surface)}"` : '';
        crumbParts.push(`<span class="sep">/</span>`);
        crumbParts.push(renderCrumbSwitch('slice-label', slice.label, renderSliceMenu(slice.id), surfaceAttr));
      }
      if (currentPageMeta && slice) {
        crumbParts.push(`<span class="sep">/</span>`);
        crumbParts.push(renderCrumbSwitch('page-label', currentPageMeta.title, renderPageMenu(slice, currentPageMeta.id)));
      }
    }

    const citationRows = resolveCitations(slice);
    const chipHtml = citationRows.length ? renderCitationChip(citationRows) : '';

    // Three-section nav with active highlighting
    const navItems = [
      { label: 'Front door', href: '/', active: isFrontDoor },
      { label: 'Prototype',  href: '/prototype/', active: isPrototype },
      { label: 'Docs',       href: '/docs/', active: isDocs },
    ];
    const navHtml = navItems.map(n =>
      `<a href="${n.href}"${n.active ? ' class="is-active" aria-current="page"' : ''}>${n.label}</a>`
    ).join('');

    const bar = document.createElement('header');
    bar.className = 'proto-top-bar';
    bar.innerHTML = `
      <div class="proto-top-bar-inner">
        <div class="top-bar-lead">
          <a href="/" class="brand-mark">
            ${escapeHtml(productName)}<span class="brand-mark-tag">Blueprint</span>
          </a>
          ${crumbParts.length ? `<nav class="top-bar-crumb" aria-label="Breadcrumb">${crumbParts.join('')}</nav>` : ''}
        </div>
        <div class="top-bar-actions">
          ${chipHtml}
          ${currentPageMeta?.chrome && currentPageMeta.chrome !== 'specialized' ? `<button class="chrome-toggle" type="button" title="Show this page with the real product navbar it ships with"><span class="toggle-dot"></span>real product navbar</button>` : ''}
          ${isPrototype ? `<button type="button" class="palette-hint" title="Jump anywhere" aria-label="Jump anywhere (Cmd/Ctrl+K)">⌘K</button>` : ''}
          <nav class="top-bar-nav" aria-label="Primary">
            ${navHtml}
          </nav>
        </div>
      </div>
    `;
    document.body.insertBefore(bar, document.body.firstChild);

    wireCrumbSwitchers(bar);
    bar.querySelector('.palette-hint')?.addEventListener('click', () => openPalette());

    if (citationRows.length) {
      const overlayWrap = document.createElement('div');
      overlayWrap.innerHTML = renderCitationOverlay(citationRows);
      document.body.appendChild(overlayWrap.firstElementChild);
      wireCitationChip();
    }

    // Wire chrome toggle (sticky preference in localStorage)
    const toggle = bar.querySelector('.chrome-toggle');
    if (toggle) {
      const KEY = 'blueprint-chrome-preview';
      if (localStorage.getItem(KEY) === '1') {
        document.body.classList.add('show-production-chrome');
      }
      toggle.addEventListener('click', () => {
        const on = document.body.classList.toggle('show-production-chrome');
        localStorage.setItem(KEY, on ? '1' : '0');
      });
    }

    // Lifecycle strip — only on phase-scoped pages (skip cross-phase)
    if (currentPageMeta?.lifecycle_phase && currentPageMeta.lifecycle_phase !== 'cross-phase') {
      const stripHtml = renderLifecycleStrip(currentPageMeta);
      const stripEl = document.createElement('nav');
      stripEl.className = 'proto-lifecycle-strip';
      stripEl.setAttribute('aria-label', 'Lifecycle phase');
      stripEl.innerHTML = stripHtml;
      bar.insertAdjacentElement('afterend', stripEl);
    }
  }

  function renderLifecycleStrip(meta) {
    const phases = [
      { id: 'setup',           label: 'Setup' },
      { id: 'pre-event',       label: 'Pre-event' },
      { id: 'game-day',        label: 'Game day' },
      { id: 'post-event',      label: 'Post-event' },
      { id: 'between-events',  label: 'Between events' },
    ];
    const current = meta.lifecycle_phase;
    const adapts = new Set(meta.lifecycle_phase_adapts || []);
    const cells = phases.map((p, i) => {
      const cls = [
        'lifecycle-cell',
        p.id === current ? 'is-current' : '',
        adapts.has(p.id) ? 'is-adapt' : '',
      ].filter(Boolean).join(' ');
      const sep = i < phases.length - 1 ? '<span class="lifecycle-sep" aria-hidden="true">›</span>' : '';
      return `<span class="${cls}" data-phase="${p.id}"><span class="lifecycle-dot" aria-hidden="true"></span><span class="lifecycle-label">${p.label}</span></span>${sep}`;
    }).join('');
    return `<div class="proto-lifecycle-inner">
      <span class="lifecycle-leader" title="Lifecycle — where this page sits in the product's operating cycle">lifecycle</span>
      ${cells}
    </div>`;
  }

  function togglePanel(which) {
    const sel = which === 'strategy' ? '.strategy-panel' : '.current-state-panel';
    const panel = document.querySelector(sel);
    if (!panel) return;
    panel.classList.toggle('open');
  }

  // Drawer × buttons close their own drawer unconditionally — toggle
  // semantics on × flipped the opposite drawer open when class state
  // desynced (cognitive audit 2026-06-11).
  function closePanel(which) {
    const sel = which === 'strategy' ? '.strategy-panel' : '.current-state-panel';
    const panel = document.querySelector(sel);
    if (!panel) return;
    panel.classList.remove('open');
  }

  // ─────────────── panels (built from meta) ───────────────

  function buildStrategyPanel(meta) {
    if (!meta || !meta.strategy) return;
    const s = meta.strategy;
    // Helper to render content that may contain markdown-ish inline syntax
    const render = (text) => text || '';

    // Build the systems-position block (phase + chrome) if declared
    const systemsParts = [];
    if (meta.lifecycle_phase) {
      const adapts = (meta.lifecycle_phase_adapts || []).join(', ');
      const adaptsLine = adapts ? ` <span class="tiny muted">(adapts to ${escapeHtml(adapts)})</span>` : '';
      systemsParts.push(`<div><span class="tiny mono muted" style="text-transform: uppercase; letter-spacing: 0.06em;">Lifecycle</span> <strong>${escapeHtml(meta.lifecycle_phase)}</strong>${adaptsLine}</div>`);
    }
    if (meta.chrome) {
      const adapts = (meta.chrome_adapts || []).join(', ');
      const adaptsLine = adapts ? ` <span class="tiny muted">(adapts to ${escapeHtml(adapts)})</span>` : '';
      // Was a link to /docs/?doc=chrome-system (template default that
      // doesn't exist in any consumer). Rendered as plain text instead;
      // consumers can restore as a link if they ship a chrome-system doc.
      const chromeText = `<strong>${escapeHtml(meta.chrome)}</strong>`;
      systemsParts.push(`<div style="margin-top: 4px;"><span class="tiny mono muted" style="text-transform: uppercase; letter-spacing: 0.06em;">Chrome</span> ${chromeText}${adaptsLine}</div>`);
    }

    const panel = el('aside', { class: 'strategy-panel', id: 'strategy-panel' },
      el('button', { class: 'panel-close', onclick: (e) => { e.stopPropagation(); closePanel('strategy'); } }, '×'),
      el('h3', {}, 'Strategy'),
      el('p', { class: 'tiny muted mt-4' }, `Page: ${meta.title}`),
      // Slice context replaces the retired slice rail — the slice's framing
      // reads here, in the drawer reviewers already open for rationale,
      // instead of costing a permanent rail (nav paradigm wave, 2026-06-11).
      ...(CURRENT_SLICE ? [el('div', { class: 'panel-slice-context' },
        el('span', { class: 'slice-context-label' }, CURRENT_SLICE.label),
        el('p', { class: 'slice-context-summary', html: CURRENT_SLICE.summary || '' })
      )] : []),
      ...(systemsParts.length ? [el('div', { class: 'panel-section panel-systems', html: systemsParts.join('') })] : []),
      el('div', { class: 'panel-section' },
        el('h4', {}, 'The decision'),
        el('p', { html: render(s.decision) })
      ),
      el('div', { class: 'panel-section' },
        el('h4', {}, 'The why'),
        el('p', { html: render(s.why) })
      ),
      el('div', { class: 'panel-section' },
        el('h4', {}, 'Shipped state'),
        el('p', { html: render(s.shipped) })
      ),
      el('div', { class: 'panel-section' },
        el('h4', {}, 'The gap'),
        el('p', { html: render(s.gap) })
      ),
      el('div', { class: 'panel-section' },
        el('h4', {}, 'Open question'),
        el('p', { html: render(s.question) })
      )
    );
    document.body.appendChild(panel);
  }

  // Fallback copy derives the product name from the manifest — never a
  // hard-coded consumer name in canonical chrome (cognitive audit 2026-06-11).
  function shippedProductLabel() {
    const product = (MANIFEST?.name || '').replace(/\s*Blueprint\s*$/i, '').trim();
    return product ? `shipped ${escapeHtml(product)}` : 'the shipped product';
  }

  function buildCurrentStatePanel(meta) {
    if (!meta || !meta.currentState) return;
    const cs = meta.currentState;
    const panel = el('aside', { class: 'current-state-panel', id: 'current-state-panel' },
      el('button', { class: 'panel-close', onclick: (e) => { e.stopPropagation(); closePanel('current-state'); } }, '×'),
      el('h3', {}, 'Shipped state'),
      el('p', { class: 'tiny muted mt-4' }, cs.route ? `Route: ${cs.route}` : 'No equivalent surface today'),
      el('div', { class: 'panel-section' },
        el('h4', {}, 'What exists today'),
        el('p', { html: cs.summary || `<em>No equivalent surface in ${shippedProductLabel()}.</em>` })
      ),
      cs.sourceFiles && cs.sourceFiles.length ? el('div', { class: 'panel-section' },
        el('h4', {}, 'Source files'),
        ...cs.sourceFiles.map(f => el('p', {}, el('code', {}, f)))
      ) : null,
      el('div', { class: 'panel-section' },
        el('h4', {}, 'Annotation'),
        el('p', { html: cs.annotation || 'See strategy panel for proposed changes.' })
      )
    );
    document.body.appendChild(panel);
  }

  // ─────────────── mock frame (canvas rule, 2026-06-11) ───────────────
  //
  // The canvas belongs to the portal; the theme belongs to the mock. Each
  // view section renders inside a portal-owned frame — a browser window
  // for desktop surfaces, a phone bezel for handheld ones — so themed
  // mocks (including fully dark product surfaces) read as windows onto
  // the product instead of restyling the portal canvas around them.
  // Pages switch shape or opt out via meta.mock_frame:
  // "desktop" (default) | "phone" | "none". Split mode's panel rules in
  // shared.css carry higher specificity and override the frame container
  // styles by design — the frame bar simply rides inside the panel.

  function buildMockFrames(meta) {
    const mode = meta?.mock_frame || 'desktop';
    if (mode === 'none') return;
    const views = document.querySelectorAll('.proposed-view, .shipped-view');
    if (!views.length) return;
    const route = meta?.currentState?.route || meta?.surface || '';
    views.forEach(view => {
      view.classList.add(mode === 'phone' ? 'mock-frame-phone' : 'mock-frame-desktop');
      if (mode === 'desktop') {
        const bar = el('div', { class: 'mock-frame-bar', 'aria-hidden': 'true' },
          el('span', { class: 'frame-dots' }, el('span'), el('span'), el('span')),
          route ? el('span', { class: 'frame-route' }, route) : null
        );
        view.insertBefore(bar, view.firstChild);
      }
    });
  }

  // ─────────────── side-by-side comparison toggle ───────────────

  function buildCompareToggle() {
    const hasProposed = document.querySelector('.proposed-view');
    const hasShipped = document.querySelector('.shipped-view');
    if (!(hasProposed && hasShipped)) return;

    const root = document.querySelector('[data-compare-root]') || document.body;
    if (!root.hasAttribute('data-view')) root.setAttribute('data-view', 'proposed');

    function setView(v) {
      root.setAttribute('data-view', v);
      toggle.querySelectorAll('button').forEach(b => {
        const active = b.dataset.view === v;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    // Tab-style view switch: three options with sentence-case labels,
    // hairline separators between, brand underline on the active one.
    // Click any label to switch modes; mode persists via data-view on the
    // compare root (page body or a [data-compare-root] container).
    const toggle = el('div', {
      class: 'compare-toggle',
      role: 'group',
      'aria-label': 'View mode'
    },
      el('button', {
        'data-view': 'proposed', class: 'active', type: 'button',
        'aria-pressed': 'true',
        onclick: () => setView('proposed'),
        title: 'Show the proposed design'
      }, 'Proposed'),
      el('button', {
        'data-view': 'split', type: 'button',
        'aria-pressed': 'false',
        onclick: () => setView('split'),
        title: 'Side-by-side: proposed vs shipped'
      }, 'Compare'),
      el('button', {
        'data-view': 'shipped', type: 'button',
        'aria-pressed': 'false',
        onclick: () => setView('shipped'),
        title: 'Show the current shipped surface'
      }, 'Shipped')
    );

    // Preferred mount order:
    //   1. Inside the unified top bar's action cluster (lives WITH breadcrumb + trace badges)
    //   2. Explicit [data-compare-toggle-mount] in the page (legacy override)
    //   3. Floating pill in the top-right of the viewport (fallback)
    const topBarActions = document.querySelector('.proto-top-bar .top-bar-actions');
    const explicitMount = document.querySelector('[data-compare-toggle-mount]');
    if (topBarActions) {
      // Mount as first child so it sits left of the trace badges + nav
      topBarActions.insertBefore(toggle, topBarActions.firstChild);
      if (explicitMount) explicitMount.style.display = 'none';
    } else if (explicitMount) {
      explicitMount.appendChild(toggle);
    } else {
      // Fallback: floating pill, top-right, fixed-positioned
      const floating = el('div', { class: 'compare-toggle-floating' }, toggle);
      document.body.appendChild(floating);
    }
  }

  // ─────────────── footer (version surface) ───────────────

  function buildFooter() {
    if (window.PROTO_PAGE?.id === 'index') return;
    const name = MANIFEST?.name || 'Project';
    const version = MANIFEST?.version || '';
    const build = MANIFEST?.build || '';

    const footer = document.createElement('footer');
    footer.className = 'proto-footer';
    footer.innerHTML = `
      <div class="proto-footer-inner">
        <div class="proto-footer-mark">
          <span class="proto-footer-product">${escapeHtml(name)}</span>
          ${version ? `<span class="proto-footer-version">${escapeHtml(version)}</span>` : ''}
        </div>
        <div class="proto-footer-meta">
          ${build ? `<span class="proto-footer-build">built ${escapeHtml(build)}</span>` : ''}
          ${build ? `<span class="sep">·</span>` : ''}
          <span class="proto-footer-context">design prototype — not production</span>
        </div>
      </div>
    `;
    document.body.appendChild(footer);
  }

  // ─────────────── slice metadata loader + shell ───────────────

  let CURRENT_SLICE = null;

  async function loadSliceMeta(id) {
    if (!id) return null;
    const base = (isProtoRoot() ? `_meta/slices/${id}.json` : `../_meta/slices/${id}.json`) + CACHE_BUST;
    try {
      const res = await fetch(base);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(`proto-nav: slice meta load failed for ${id}`, err);
      return null;
    }
  }

  // ─────────────── slice rail: REMOVED (nav paradigm wave, 2026-06-11) ───────────────
  //
  // The persistent left rail (.proto-slice-sidebar) is gone: full-bleed
  // mockups are the content; the rail cost ~210px permanently for
  // slice-scoped wayfinding (cognitive audit + operator decision 2026-06-11).
  // Its jobs moved into the breadcrumb switchers, the strategy drawer's
  // slice-context block, and the command palette below.

  // ─────────────── command palette (Cmd/Ctrl+K) ───────────────
  //
  // Built entirely from the already-loaded manifest — no extra fetches, no
  // dependencies, no product-specific strings (nav paradigm wave, 2026-06-11).

  let PALETTE = null;

  function paletteItems() {
    const items = [];
    (MANIFEST.pages || []).forEach(id => {
      const m = MANIFEST._cache?.[id];
      if (!m) return;
      const sliceLabel = MANIFEST._sliceCache?.[m.slice]?.label;
      items.push({ label: m.title, hint: sliceLabel || 'page', href: jumpHref(id) });
    });
    (MANIFEST.slices || []).forEach(id => {
      const s = MANIFEST._sliceCache?.[id];
      if (!s) return;
      items.push({ label: s.label, hint: 'slice', href: s.pages?.[0] ? jumpHref(s.pages[0]) : '/prototype/' });
    });
    ((MANIFEST.docs?.tiers) || []).forEach(tier => {
      (tier.docs || []).forEach(d => {
        items.push({ label: d.title, hint: 'doc', href: `/docs/?doc=${d.id}` });
      });
    });
    return items;
  }

  function buildPalette() {
    if (PALETTE) return PALETTE;
    const items = paletteItems();
    let active = 0;

    const list = el('div', { class: 'cmd-palette-list', role: 'listbox' });
    const input = el('input', {
      class: 'cmd-palette-input', type: 'text',
      placeholder: 'Jump to a page, slice, or doc…',
      'aria-label': 'Jump to a page, slice, or doc'
    });
    const box = el('div', { class: 'cmd-palette', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Jump anywhere' }, input, list);
    const overlay = el('div', { class: 'cmd-palette-overlay' }, box);

    function renderList(filter) {
      const q = (filter || '').trim().toLowerCase();
      const visible = q ? items.filter(i => `${i.label} ${i.hint}`.toLowerCase().includes(q)) : items;
      active = 0;
      list.innerHTML = visible.length
        ? visible.map((i, n) => `
          <a class="cmd-palette-item${n === 0 ? ' is-active' : ''}" role="option" href="${i.href}">
            <span class="item-label">${escapeHtml(i.label)}</span>
            <span class="item-hint">${escapeHtml(i.hint)}</span>
          </a>`).join('')
        : '<div class="cmd-palette-empty">No matches</div>';
    }

    function setActive(n) {
      const nodes = list.querySelectorAll('.cmd-palette-item');
      if (!nodes.length) return;
      active = Math.max(0, Math.min(n, nodes.length - 1));
      nodes.forEach((node, i) => node.classList.toggle('is-active', i === active));
      nodes[active].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('input', () => renderList(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') {
        const target = list.querySelectorAll('.cmd-palette-item')[active];
        if (target) window.location.href = target.getAttribute('href');
      }
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePalette(); });
    list.addEventListener('mousemove', (e) => {
      const item = e.target.closest('.cmd-palette-item');
      if (!item) return;
      const nodes = Array.from(list.querySelectorAll('.cmd-palette-item'));
      setActive(nodes.indexOf(item));
    });

    document.body.appendChild(overlay);
    PALETTE = { overlay, input, renderList };
    return PALETTE;
  }

  function openPalette() {
    const p = buildPalette();
    p.input.value = '';
    p.renderList('');
    p.overlay.classList.add('open');
    p.input.focus();
  }

  function closePalette() {
    PALETTE?.overlay.classList.remove('open');
  }

  function wirePaletteShortcut() {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (PALETTE?.overlay.classList.contains('open')) closePalette();
        else openPalette();
      } else if (e.key === 'Escape') {
        closePalette();
      }
    });
    // Surface the palette to pages that render their own chrome (the docs
    // viewer's sidebar search trigger) — proto-nav owns the palette, so any
    // visible affordance routes back through here rather than rebuilding it.
    window.openBlueprintPalette = openPalette;
  }

  // ─────────────── init ───────────────

  // Apply the demo event's per-event accent from the manifest, so every
  // event-scoped surface (Public + Authenticated when scoped) renders the
  // same accent. Replaces per-page `:root { --tournament-accent: ... }` blocks.
  // Manifest key `demo_tournament` + meta key `uses_tournament_accent` are
  // back-compat config keys shared with consumer manifests — do not rename.
  // Pages opt in via meta.uses_tournament_accent === true OR meta.chrome === 'public'.
  function applyTournamentAccent(meta) {
    const demo = MANIFEST?.demo_tournament;
    if (!demo) return;
    const optedIn = meta?.uses_tournament_accent === true || meta?.chrome === 'public';
    if (!optedIn) return;
    if (demo.accent) document.documentElement.style.setProperty('--tournament-accent', demo.accent);
    if (demo.accent_soft) document.documentElement.style.setProperty('--tournament-accent-soft', demo.accent_soft);
  }

  async function init() {
    await loadManifest();

    // Prefetch all page meta into a title cache so the footer + flow nav can name pages
    if (MANIFEST.pages?.length) {
      MANIFEST._cache = {};
      MANIFEST._titleCache = {};
      await Promise.all(
        MANIFEST.pages.map(async id => {
          const m = await loadPageMeta(id);
          if (m) {
            MANIFEST._cache[id] = m;
            MANIFEST._titleCache[id] = m.title;
          }
        })
      );
    }

    // Prefetch slice meta so the slice switcher + palette have labels
    if (MANIFEST.slices?.length) {
      MANIFEST._sliceCache = {};
      await Promise.all(
        MANIFEST.slices.map(async id => {
          const m = await loadSliceMeta(id);
          if (m) MANIFEST._sliceCache[id] = m;
        })
      );
    }

    const pageId = window.PROTO_PAGE?.id || 'index';
    // Manifest-listed pages come from the prefetch cache. Pages with a meta
    // file but no manifest listing (retired/unlinked surfaces kept reachable)
    // fall back to a direct fetch so mock_frame + panels still work — but
    // never for 'index'/'docs', whose ids would resolve to the manifest
    // itself or a 404 (mock-frame wave, 2026-06-11).
    CURRENT_META = MANIFEST._cache?.[pageId]
      || (pageId !== 'index' && pageId !== 'docs' ? await loadPageMeta(pageId) : null);

    // Expose to window for the chat widget and other consumers
    if (CURRENT_META) {
      window.PROTO_PAGE = { ...window.PROTO_PAGE, ...CURRENT_META };
    }

    // Flow handling
    const flowId = getFlowFromUrl();
    if (flowId) {
      CURRENT_FLOW = (MANIFEST.flows || []).find(f => f.id === flowId);
      if (CURRENT_FLOW && CURRENT_FLOW.pages.includes(pageId)) {
        buildFlowBreadcrumb(CURRENT_FLOW, pageId);
      }
    }

    // Resolve slice metadata first so the top bar can render breadcrumb +
    // trace badges in a single pass (one DOM insert, no flash of bare brand).
    const sliceId = CURRENT_META?.slice;
    if (sliceId) {
      CURRENT_SLICE = MANIFEST._sliceCache?.[sliceId] || await loadSliceMeta(sliceId);
    }

    // Resolve per-event accent before any UI renders so chrome + content read
    // the same variable on first paint. See applyTournamentAccent().
    applyTournamentAccent(CURRENT_META);

    // Unified top bar — brand + breadcrumb + actions in one 56px region.
    buildTopBar(CURRENT_SLICE, CURRENT_META);

    wirePaletteShortcut();

    buildFooterNav();
    buildStrategyPanel(CURRENT_META);
    buildCurrentStatePanel(CURRENT_META);
    buildMockFrames(CURRENT_META);
    buildCompareToggle();
    buildFooter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
