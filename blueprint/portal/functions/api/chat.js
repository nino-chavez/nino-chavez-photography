// Blueprint Portal — Pages Function: stakeholder chat endpoint
//
// Runs on the Cloudflare Pages Functions runtime. Proxies stakeholder
// questions through OpenRouter with the blueprint docs loaded as
// system context.
//
// Required env var: OPENROUTER_API_KEY (set via `wrangler pages secret put`).
//   Stored in 1Password as "blueprint-global" (Developer Secrets vault).
//
// Why OpenRouter, not Anthropic direct: lets the same "blueprint-global" key
// fan out to any model — Claude, GPT, etc. — without per-app key management.
//
// Manifest-driven corpus (wave 5 — 2026-05-25): the doc list is read from
// _meta/index.json docs.tiers[].docs[] at request time, not hardcoded here.
// Prior version shipped the source project's hardcoded DOCS array
// (research-synthesis, cx-strategy, etc.) that every consumer inherited
// verbatim — the chat function would 404 on every doc and silently render
// zero context, producing hallucinated answers. Caught in the blog consumer
// session 2026-05-25; encoded here.
//
// Docs are copied into _docs/ at deploy time (see scripts/prep-deploy.sh)
// so the function can fetch them via the ASSETS binding from /_docs/*.md.

let SYSTEM_CONTEXT = null;

async function loadContext(env, requestUrl) {
  if (SYSTEM_CONTEXT) return SYSTEM_CONTEXT;

  const origin = new URL(requestUrl).origin;
  const fetchAsset = (path) => {
    const url = `${origin}${path}`;
    return env.ASSETS ? env.ASSETS.fetch(new Request(url)) : fetch(url);
  };

  // Read manifest for project name + doc list. If manifest is missing, fall
  // back to a thin generic prompt so the chat still responds (just without
  // grounding).
  let manifest = {};
  try {
    const mres = await fetchAsset('/_meta/index.json');
    if (mres.ok) manifest = await mres.json();
  } catch {
    /* manifest unavailable — generic fallback below */
  }

  const projectName = (manifest.name || 'Blueprint').replace(/\s*Blueprint\s*$/i, '').trim() || 'Blueprint';
  const tagline = manifest.tagline || '';

  // Flatten manifest.docs.tiers[].docs[] to all doc IDs across all tiers.
  // Subdirectory IDs are preserved (docs/index.html allows / in slugs).
  const docEntries = [];
  const tiers = (manifest.docs && Array.isArray(manifest.docs.tiers)) ? manifest.docs.tiers : [];
  for (const tier of tiers) {
    for (const d of (tier.docs || [])) {
      if (d && d.id) docEntries.push({ id: d.id, title: d.title || d.id });
    }
  }

  const sections = [];
  for (const { id, title } of docEntries) {
    try {
      const res = await fetchAsset(`/_docs/${id}.md`);
      if (res.ok) {
        const content = await res.text();
        sections.push(`=== ${title} (/_docs/${id}.md) ===\n${content}`);
      }
    } catch {
      // Skip missing — partial context still useful
    }
  }

  const corpusBlock = sections.length
    ? `--- BLUEPRINT CORPUS ---\n\n${sections.join('\n\n')}`
    : '(No corpus available — manifest.docs.tiers[].docs[] is empty or the docs failed to load.)';

  SYSTEM_CONTEXT = `You are a research/design assistant grounded in the ${projectName} Blueprint${tagline ? ` — ${tagline}` : ''}.

You have access to the corpus below. Answer accurately from what's documented. When citing a decision or finding, name it by ID (whatever ID convention the corpus uses — finding numbers, decision IDs, rule numbers, page identifiers). When asked something the corpus doesn't cover, say so — do not fabricate.

Tone: direct, no cheerleading, no hedging. Short sentences, imperative when giving advice, concrete examples grounded in cited evidence. No emoji.

${corpusBlock}`;

  return SYSTEM_CONTEXT;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'OPENROUTER_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { messages = [], page, pageTitle } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages array required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const system = (await loadContext(env, request.url)) +
    (page ? `\n\nUser is currently viewing the "${pageTitle || page}" prototype page (id: ${page}).` : '');

  // Derive OpenRouter attribution headers from the request URL + the
  // manifest's project name. Prior version hardcoded the source project's
  // deploy URL and display name — a stamp leak that propagated to every
  // Pattern B consumer that copied this file verbatim (incident:
  // docs/case-studies/case-study-v3-portal-css-gap.md § "Follow-up — docs
  // viewer"). Now project-agnostic: referer from the request origin, X-Title
  // from _meta/index.json `name`. The static fallbacks below are the
  // template's neutral source identity ("Blueprint Example" is in the
  // stamper's substitution table — see template/tools/blueprint-init/
  // stamp.mjs — so Pattern A stamps bake the consumer's display name in).
  let httpReferer = 'https://blueprint.example.com';
  let xTitle = 'Blueprint Example';
  try {
    const reqUrl = new URL(request.url);
    httpReferer = `${reqUrl.protocol}//${reqUrl.host}`;
    // Read project name from manifest if available; fall back to host-derived
    const manifestRes = await fetch(new URL('/_meta/index.json', request.url).toString());
    if (manifestRes.ok) {
      const manifest = await manifestRes.json();
      if (manifest && manifest.name) xTitle = manifest.name;
    }
  } catch {
    // Stay with defaults; attribution is non-critical
  }

  try {
    const openrouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': httpReferer,
        'X-Title': xTitle
      },
      body: JSON.stringify({
        model: 'anthropic/claude-haiku-4.5',
        max_tokens: 800,
        messages: [
          { role: 'system', content: system },
          ...messages.map(m => ({ role: m.role, content: m.content }))
        ]
      })
    });

    if (!openrouterRes.ok) {
      const text = await openrouterRes.text();
      return new Response(JSON.stringify({
        error: `OpenRouter API error: ${openrouterRes.status}`,
        detail: text.slice(0, 500)
      }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    const data = await openrouterRes.json();
    const reply = data.choices?.[0]?.message?.content || '(no response)';
    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: 'Chat request failed',
      message: err.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
