/* Shared public-content tracker. Gallery actions have their own collector clients. */
(() => {
  if (window.__ninoSiteActivity || location.origin !== 'https://ninochavez.co' || navigator.webdriver) return;
  window.__ninoSiteActivity = true;
  const reactNavigation = document.currentScript?.dataset.siteNavigation === 'react';
  const endpoint = '/photography/api/analytics';
  const prefKey = 'gallery-analytics-preferences-v2';
  let preferences = { linkedAnalytics: false, excludeThisBrowser: true };
  let view = null, timer = null, observer = null, activeSeconds = 0, lastTick = 0;
  let sent = new Set();
  const safePath = path => path === '/' || path === '/photography' || path === '/photography/coverage' || /^\/(?:about|now|links|learn|work)(?:\/[a-z0-9-]+)?$/.test(path) || /^\/demos(?:\/(?:applied\/)?[a-z0-9-]+)?$/.test(path) || /^\/blog(?:\/(?!draft(?:\/|$)|private(?:\/|$)|api(?:\/|$)|search(?:\/|$))[a-z0-9-]+){0,2}$/.test(path);
  const section = path => path.startsWith('/blog') ? 'writing' : path.startsWith('/demos') ? 'demos' : path.startsWith('/photography') ? 'photography' : 'profile';
  function storage(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
  function identity() {
    if (!preferences.linkedAnalytics || preferences.excludeThisBrowser) return { anonymous_browser_id: null, visit_id: null };
    const now = Date.now();
    try {
      let browser = storage('gallery-analytics-browser-v2');
      if (!browser || now - browser.createdAt >= 90 * 86400000) browser = { id: crypto.randomUUID(), createdAt: now };
      localStorage.setItem('gallery-analytics-browser-v2', JSON.stringify(browser));
      let visit = storage('gallery-analytics-visit-v2');
      if (!visit || now - visit.lastInteractionAt >= 1800000 || now - visit.startedAt >= 86400000) visit = { id: crypto.randomUUID(), startedAt: now };
      visit.lastInteractionAt = now;
      localStorage.setItem('gallery-analytics-visit-v2', JSON.stringify(visit));
      return { anonymous_browser_id: browser.id, visit_id: visit.id };
    } catch { return { anonymous_browser_id: null, visit_id: null }; }
  }
  function emit(name, extra = {}) {
    if (!view || preferences.excludeThisBrowser || document.visibilityState !== 'visible') return;
    const event = { event_id: crypto.randomUUID(), schema_version: 2, event_name: name, occurred_at: new Date().toISOString(), ...identity(), properties: { site_section: view.section, canonical_path: view.path, view_id: view.id, ...extra } };
    const body = JSON.stringify(event);
    // Retry the same UUID, so a lost response cannot double-count an accepted action.
    const deliver = () => fetch(endpoint + '/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).then(r => { if (r.status >= 500) throw Error('retry'); });
    deliver().catch(() => setTimeout(() => deliver().catch(() => {}), 750));
  }
  function once(key, name, extra) { if (!sent.has(key)) { sent.add(key); emit(name, extra); } }
  function progress() {
    if (!view || document.visibilityState !== 'visible') return;
    const article = view.section === 'writing' && document.querySelector('article[data-pagefind-body]');
    if (article) {
      const box = article.getBoundingClientRect();
      const depth = Math.min(100, Math.max(0, (innerHeight - box.top) / Math.max(1, box.height) * 100));
      for (const threshold of [50, 90]) if (depth >= threshold) once('depth' + threshold, 'content_progressed', { threshold });
    }
  }
  function start() {
    if (document.visibilityState !== 'visible') return;
    const path = location.pathname.replace(/\/$/, '') || '/';
    if (reactNavigation && (document.documentElement.dataset.analyticsPath?.replace(/\/$/, '') || '/') !== path) return;
    if (view?.path === path) return;
    clearInterval(timer); observer?.disconnect(); sent = new Set(); activeSeconds = 0;
    view = safePath(path) && path.length <= 160 ? { path, section: section(path), id: crypto.randomUUID() } : null;
    if (!view) return;
    emit('site_page_viewed', { layout_class: innerWidth < 640 ? 'narrow' : 'wide', content_kind: view.section === 'writing' && document.querySelector('article[data-pagefind-body]') ? 'article' : view.section === 'demos' && document.querySelector('[data-analytics-demo-path]')?.getAttribute('data-analytics-demo-path') === view.path ? 'demo_story' : 'page' });
    const demo = [...document.querySelectorAll('[data-analytics-demo-path]')].find(el => el.getAttribute('data-analytics-demo-path') === view.path);
    const sections = demo ? [...demo.querySelectorAll('[data-analytics-demo-section]')] : [];
    if (view.section === 'demos' && sections.length && sections.length <= 100) {
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting && document.visibilityState === 'visible') {
          const position = sections.indexOf(entry.target) + 1;
          once('section' + position, 'demo_section_viewed', { position, section_count: sections.length });
        }
      }, { rootMargin: '-20% 0px -20% 0px', threshold: 0 });
      sections.forEach(el => observer.observe(el));
    }
    lastTick = performance.now();
    timer = setInterval(() => {
      const now = performance.now(), delta = Math.min(1.5, (now - lastTick) / 1000); lastTick = now;
      const article = view?.section === 'writing' && document.querySelector('article[data-pagefind-body]');
      if (document.visibilityState !== 'visible' || !document.hasFocus() || !article) return;
      const box = article.getBoundingClientRect();
      if (box.bottom <= 0 || box.top >= innerHeight) return;
      activeSeconds += delta;
      for (const threshold of [30, 60, 120]) if (activeSeconds >= threshold) once('time' + threshold, 'content_active_time', { threshold });
    }, 1000);
    progress();
  }
  document.addEventListener('click', event => {
    if (!event.isTrusted) return;
    const link = event.target instanceof Element && event.target.closest('a[href]');
    if (!link || link.hasAttribute('download')) return;
    const url = new URL(link.href, location.href);
    if (url.protocol === 'mailto:' || url.protocol === 'tel:') emit('site_link_clicked', { target_kind: url.protocol === 'mailto:' ? 'email' : 'phone' });
    else if (/^https?:$/.test(url.protocol) && url.origin !== location.origin) emit('site_link_clicked', { target_kind: 'external' });
    else if (url.origin === location.origin && safePath(url.pathname.replace(/\/$/, '') || '/') && url.pathname !== location.pathname) emit('site_link_clicked', { target_kind: 'internal', target_path: url.pathname.replace(/\/$/, '') || '/' });
  }, true);
  let navigationTimer;
  const scheduleStart = () => { clearTimeout(navigationTimer); navigationTimer = setTimeout(start, 250); };
  addEventListener('nino:page-ready', start);
  if (!reactNavigation) for (const method of ['pushState', 'replaceState']) { const original = history[method]; history[method] = function(...args) { const result = original.apply(this, args); scheduleStart(); return result; }; }
  addEventListener('popstate', scheduleStart);
  addEventListener('scroll', progress, { passive: true });
  document.addEventListener('visibilitychange', () => { lastTick = performance.now(); start(); });
  addEventListener('storage', event => { if (event.key === prefKey) preferences = storage(prefKey) || preferences; });
  fetch(endpoint + '/preferences', { cache: 'no-store' }).then(r => { if (!r.ok) throw Error('unavailable'); return r.json(); }).then(value => {
    preferences = { linkedAnalytics: value.linkedAnalytics === true, excludeThisBrowser: value.excludeThisBrowser === true };
    try { localStorage.setItem(prefKey, JSON.stringify(preferences)); if (!preferences.linkedAnalytics) { localStorage.removeItem('gallery-analytics-browser-v2'); localStorage.removeItem('gallery-analytics-visit-v2'); } } catch {}
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  }).catch(() => {});
})();
