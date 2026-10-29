# Analytics build status — September 29

The redesigned dashboard is ready for release. Four production analytics migrations were applied on September 29 and the database reports no pending migrations. The application release is **not yet deployed**: GitHub is waiting for its required GitGuardian check, which has not started. PostHog production export remains disabled pending a restricted query credential.

## What is ready to review

- Light slate, white and blue workspace with a compact overview, album comparisons, selected-album summary, and direct photo drilldown.
- Popular, rising and recently active photos remain separate. Filters, CSV, shortlist, saved views, private notes and traffic correction/reversal are preserved.
- Download requests, prepared items, handoffs, failure and cancellation are separate observations. A handoff is not a completed file save.
- Photo lifecycle, exposure, favorites and search correlation fixes are integrated. Test/operator/browser-exclusion controls apply before eligible exports.
- Consent is bound to a server-issued browser identity before linked collection starts. Withdrawal cancels queued exports and suppresses later collection under that identity. Already in-flight or stored provider events are not claimed deleted.
- Raw-event expiry preserves identifier-free totals, including bounded search/error diagnostics. Leased exports recover after interruption; provider acknowledgement and queried confirmation are distinct.
- Retained v2 traffic corrections and reversals now reach first-party reports and all owned provider queries. A durable attempted-delivery marker covers correction during an in-flight export.
- Tagged-source rows show subsequent album opens, photo opens, download requests and favorites. Content-sliced search is explicitly selection-conditioned; zero-result coverage is unavailable in that slice.
- Experiment assignment is connected to a real album-card variant, with consent and exclusion gates and visible-exposure tracking. No experiment is active.

## Evidence obtained

| Check | Result and limit |
|---|---|
| Type check | Passed; four pre-existing Svelte warnings remain |
| Production build | Passed, including the current gallery reader-review gate |
| Database rehearsal | Passed guarded local reset/reapply, permissions, duplicate delivery, lease recovery, retry, consent revocation, raw expiry and preserved totals |
| Browser journeys | Twelve combined cases passed; the updated source and health sections were recaptured afterward. Local synthetic database, not production traffic |
| Desktop and phone appearance | Parent opened actual 1440×1000 and 390×844 captures. Independent review found two mobile table issues; both were corrected and recaptured |
| Live PostHog queries | All seven fixed reports accepted by test project 635867 and matched the synthetic cohort, including source/sport/category filters |
| Collector-to-provider delivery | Actual local API, durable outbox, official SDK, live UUID query and database confirmation passed for all three synthetic events |
| Adversarial provider cases | Wrong photo/category/hidden album did not convert; action tags did not fabricate arrivals; highest correction version beat delivery order; reversal restored the action |
| Duplicate delivery | Fifteen test capture calls produced fourteen events and fourteen distinct UUIDs |
| PostHog dashboards | Two private test dashboards contain seven saved insights; provider onboarding dashboard preserved |

Evidence is under [evidence](evidence/), including the [provider query receipt](evidence/posthog-test.json), [dashboard receipt](evidence/posthog-dashboards.json), and [cold review](evidence/cold-review.md). Screenshots are visibly labeled synthetic. They do not establish production analytics accuracy or photography quality.

## Provider configuration

The parent inspected the existing Signal x Studio organization through the provider API and created isolated US projects: production `635866`, test `635867`. IP anonymization is on. Autocapture and replay are off. Invalid API credentials were rejected. No production visitor data has been exported by this build.

The billing endpoint reports free with no active subscription. Organization entitlements separately include six projects and seven years of history. These responses do not establish a paid upgrade or an exact deletion date. No billing change was made. The proposed privacy wording describes the published free/paid reporting windows separately from local 90-day raw-event deletion.

## Work that still prevents activation

1. Complete hosted acceptance after activation preparation. The independent local audit gaps were implemented; parent verification caught and fixed timestamp-format, database correction lifecycle, provider UUID type and query-timeout defects.
2. Finish photography credential storage. The desktop 1Password write authorization timed out; no photography secret items were created. The existing management credential was used transiently for test setup only and must not become a production runtime credential.
3. Provision a project-scoped read-only query credential. The provider refused API creation of personal keys; authenticated provider settings are required.
4. Review and publish the privacy update from the owning site repository. Its draft is in `nino-chavez-site/.worktrees/codex/photography-analytics-privacy/app/privacy/page.tsx` at commit `19cab5f` and is not live.
5. Apply reviewed production migrations, configure server bindings and the scheduler, install production dashboards using the current visible album catalogue, and verify hosted delivery and rendering. The new scheduler is disabled and undeployed; wire its platform git deployment before activation.
6. Verify deployed-worker interruption/retry behavior, account quota/coverage behavior and populated linked-report rendering. Local and dedicated-provider receipts do not establish those hosted states. No quota exhaustion or billing change was induced.

## Dispatch and source state

Work ran in separate managed worktrees. Measurement, interface and PostHog commits are integrated into `codex/analytics-experience-rethink`. Main and production were not changed. The dispatcher recorded selected model routes; runtime model and effort fields were not exposed, so those selections are not presented as verified execution metadata.

The chosen interface combines the overview, album table and inspector, followed by photo inspection. It follows Nino's steering and build authorization; it is not a claim that he clicked a particular comp.

## Final integration receipts

The source-owned private test dashboards were updated and fetched again: two dashboards, seven saved insights, all using versioned traffic corrections. Production project 635866 received no visitor events from this build. The companion policy is committed only on its isolated branch. Nothing in this completion wave was pushed or deployed.

Branch-ref comparison found changes only to the parent integration branch and the three assigned worker branches. Unrelated `.impeccable` drafts remain untouched. The local review server remains available on `http://analytics-review.localhost:57210/photography/analytics/operator`.

## September 29 production release attempt

- Production Supabase `skywzpcekhntecegyjoj`: applied migrations `20260929040000`, `20260929160010`, `20260929180000`, and `20260929190000`. A second dry run reports up to date.
- Production delivery-health RPC returns schema version 2 through the server role; anonymous access returns HTTP 401. No event delivery or test events were submitted to production.
- `PostHog photography` and `PostHog photography-test` now exist in 1Password. Capture keys, scheduler tokens and browser-binding secrets passed read-back verification. A restricted read key is still missing.
- Gallery release PR: https://github.com/nino-chavez/nino-chavez-photography/pull/164. Privacy release PR: https://github.com/nino-chavez/nino-chavez-site/pull/31. Both have auto-merge queued, but neither has a GitGuardian result. Repository rules were not altered.
- Cloudflare Pages production git deployment is enabled for gallery `main`. The current production application remains commit `8d840154c2d55726cbc0e6a39299e49e8c7d1fb5` until the release merges.
- The companion Worker deployment workflow is dormant because its Cloudflare GitHub secrets are absent. Its documented manual deployment remains necessary unless the existing automation is activated.
- PostHog sign-in in the shared browser is still unavailable. Production export, scheduler, dashboards and hosted linked-report checks remain pending.
