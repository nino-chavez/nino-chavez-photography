# Analytics intelligence engine

## What this adds

The intelligence engine turns already stored aggregate reports into a short list of evidence-bound findings. It can explain a saved report, record Nino’s private follow-up action, and queue a small set of additional calculations. It does not call PostHog or another provider while a page is loading.

The reader sees the finding, its exact date window, cutoff, coverage, unit and report link. Missing exposure, comparison, consent-compatible journey, or action history produces a suppression. It does not become a zero or a confident recommendation.

## Flow

```text
scheduled aggregate report
  -> refreshIntelligence
  -> versioned snapshot + suppressions
  -> public aggregate GET / owner assistant and action endpoints
```

`refreshIntelligence(client, scope, { ownerId?, now?, journeys? })` is the scheduled-worker seam. `loadIntelligence(client, scope, { ownerId?, page? })` reads the snapshot. The finite scheduler set is `standardIntelligenceScopes()`.

## Privacy and authorization

Public GET responses contain aggregate finding evidence only. They never contain actions, briefs, question history, identities, raw searches, raw events, provider responses, or private notes. Owner routes require a valid Supabase user and the existing exact-email `ADMIN_EMAILS` allowlist. All private POST requests require same-origin protection.

Question text is deliberately not stored. Deterministic text recognition chooses an allowlisted operation. A queued request stores only owner, scope, operation, status and expiry. It cannot execute SQL or query a provider directly.

## Rule limits

The rule catalogue covers momentum, strong photo response, discovery friction, rendering/download reliability, search, profile, writing/demos, distribution, collection health and follow-up. Only collection health and complete aggregate comparisons can be evaluated from the current scheduled payload. The other rules remain explicitly suppressed until their required, consent-compatible aggregate cohort is materialized.

Known album sport, event, team and date remain catalogue facts. No rule assigns athlete identity, aesthetic quality, sales, an inquiry, a completed file save, a person, or causality.

## Scheduler handoff

The scheduler should call `refreshIntelligence` after its successful report refresh, once for each standard scope. It must not use GET to refresh. Provider-backed journey cohorts need a separate bounded job that stores validated aggregate results before a rule may use them.

The Supabase CLI could not create this worker’s migration in the restricted sandbox because it writes telemetry under `~/.supabase`, outside the allowed filesystem. No hand-named migration was created. Before database deployment, run `supabase migration new analytics_intelligence_engine` in an environment that can write its CLI state, then create the tables and service-only RPCs described by these server modules with RLS and explicit revokes.
