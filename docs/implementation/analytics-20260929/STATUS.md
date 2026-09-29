# Analytics build status — September 29

The redesigned dashboard and measurement changes are integrated locally. The production build passes. **This release is not deployed, and production PostHog export is disabled.** Full-plan acceptance is still being checked; the remaining activation work is listed below.

## What is ready to review

- Light slate, white and blue workspace with a compact overview, album comparisons, selected-album summary, and direct photo drilldown.
- Popular, rising and recently active photos remain separate. Filters, CSV, shortlist, saved views, private notes and traffic correction/reversal are preserved.
- Download requests, prepared items, handoffs, failure and cancellation are separate observations. A handoff is not a completed file save.
- Photo lifecycle, exposure, favorites and search correlation fixes are integrated. Test/operator/browser-exclusion controls apply before eligible exports.
- Consent is bound to a server-issued browser identity before linked collection starts. Withdrawal cancels queued exports and suppresses later collection under that identity. Already in-flight or stored provider events are not claimed deleted.
- Raw-event expiry preserves identifier-free totals. Leased exports can recover after interruption; provider acknowledgement and queried confirmation are distinct.

## Evidence obtained

| Check | Result and limit |
|---|---|
| Type check | Passed; four pre-existing Svelte warnings remain |
| Production build | Passed, including the current gallery reader-review gate |
| Database rehearsal | Passed guarded local reset/reapply, permissions, duplicate delivery, lease recovery, retry, consent revocation, raw expiry and preserved totals |
| Browser journeys | Eleven combined cases passed; an additional consent-binding case passed afterward. Local synthetic database, not production traffic |
| Desktop and phone appearance | Parent opened actual 1440×1000 and 390×844 captures. Independent review found two mobile table issues; both were corrected and recaptured |
| Live PostHog queries | All seven fixed reports accepted by test project 635867 and matched the synthetic cohort, including source/sport/category filters |
| Duplicate delivery | Fifteen test capture calls produced fourteen events and fourteen distinct UUIDs |
| PostHog dashboards | Two private test dashboards contain seven saved insights; provider onboarding dashboard preserved |

Evidence is under [evidence](evidence/), including the [provider query receipt](evidence/posthog-test.json), [dashboard receipt](evidence/posthog-dashboards.json), and [cold review](evidence/cold-review.md). Screenshots are visibly labeled synthetic. They do not establish production analytics accuracy or photography quality.

## Provider configuration

The parent inspected the existing Signal x Studio organization through the provider API and created isolated US projects: production `635866`, test `635867`. IP anonymization is on. Autocapture and replay are off. Invalid API credentials were rejected. No production visitor data has been exported by this build.

The billing endpoint reports free with no active subscription. Organization entitlements separately include six projects and seven years of history. These responses do not establish a paid upgrade or an exact deletion date. No billing change was made. The proposed privacy wording describes the published free/paid reporting windows separately from local 90-day raw-event deletion.

## Work that still prevents activation

1. Complete the independent full-plan acceptance audit and resolve any missing functionality it identifies.
2. Finish photography credential storage. The desktop 1Password write authorization timed out; no photography secret items were created. The existing management credential was used transiently for test setup only and must not become a production runtime credential.
3. Provision a project-scoped read-only query credential. The provider refused API creation of personal keys; authenticated provider settings are required.
4. Review and publish the privacy update from the owning site repository. Its draft is in `nino-chavez-site/.worktrees/codex/photography-analytics-privacy/app/privacy/page.tsx` and is not live.
5. Apply reviewed production migrations, configure server bindings and the scheduler, install production dashboards using the current visible album catalogue, and verify hosted delivery and rendering. The new scheduler is disabled and undeployed; wire its platform git deployment before activation.
6. Complete the remaining adversarial live-provider acceptance scenarios and quota/coverage checks. The passing synthetic happy path does not establish all outage or classification behavior in Cloudflare's hosted runtime.

## Dispatch and source state

Work ran in separate managed worktrees. Measurement, interface and PostHog commits are integrated into `codex/analytics-experience-rethink`. Main and production were not changed. The dispatcher recorded selected model routes; runtime model and effort fields were not exposed, so those selections are not presented as verified execution metadata.

The chosen interface combines the overview, album table and inspector, followed by photo inspection. It follows Nino's steering and build authorization; it is not a claim that he clicked a particular comp.
