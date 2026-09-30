<script lang="ts">
	import { base } from '$app/paths';
	import {
		parseIntelligenceScope,
		type AssistantAnswer,
		type Finding,
		type FindingEvidence,
		type IntelligenceAction,
		type IntelligenceReport,
		type IntelligenceScope
	} from '$lib/analytics/intelligence-contract';

	interface Props {
		scope: IntelligenceScope;
		/** This is a server-validated authorization result. It is never inferred in the browser. */
		owner: boolean;
		kind: 'gallery' | 'sites';
		contextTarget?: Finding['target'] | null;
		class?: string;
	}
	let { scope, owner, kind, contextTarget = null, class: className = '' }: Props = $props();

	type ActionMode = 'record' | 'dismiss' | 'snooze' | null;
	type PollResponse = { status: 'pending' | 'complete' | 'unavailable'; answer: AssistantAnswer | null };
	type PendingPoll = { requestId: string; scopeKey: string; startedAt: number; attempt: number };

	const endpoint = `${base}/api/analytics/intelligence`;
	const firstViewportLimit = 3;
	const maximumPollMs = 120_000;
	const initialPollMs = 750;
	const maximumPollDelayMs = 5_000;

	let report = $state<IntelligenceReport | null>(null);
	let loading = $state(true);
	let reportError = $state<string | null>(null);
	let currentPage = $state(0);
	let expandedFindings = $state(false);
	let selectedFinding = $state<Finding | null>(null);
	let question = $state('');
	let answer = $state<AssistantAnswer | null>(null);
	let previousAnswer = $state<AssistantAnswer | null>(null);
	let answerLoading = $state(false);
	let answerError = $state<string | null>(null);
	let actionFinding = $state<Finding | null>(null);
	let actionMode = $state<ActionMode>(null);
	let actionMessage = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let reportAbort: AbortController | null = null;
	let answerAbort: AbortController | null = null;
	let pollTimer: ReturnType<typeof setTimeout> | null = null;
	let pendingPoll = $state<PendingPoll | null>(null);
	let reportRequestVersion = 0;
	let answerRequestVersion = 0;

	const validatedScope = $derived(parseIntelligenceScope(scope));
	const scopeKey = $derived(validatedScope ? JSON.stringify(validatedScope) : '');
	const scopeChanged = $derived(answer !== null && scopeKey !== JSON.stringify(answer.scope));
	const visibleFindings = $derived(expandedFindings ? (report?.findings ?? []) : (report?.findings ?? []).slice(0, firstViewportLimit));
	const contextLabel = $derived(targetLabel(contextTarget));

	function object(value: unknown): value is Record<string, unknown> {
		return !!value && typeof value === 'object' && !Array.isArray(value);
	}
	function validWindow(value: unknown): value is { start: string; end: string } {
		return object(value) && typeof value.start === 'string' && typeof value.end === 'string';
	}
	function validEvidence(value: unknown): value is FindingEvidence {
		if (!object(value) || !object(value.windows) || !validWindow(value.windows.current)) return false;
		return (value.windows.previous === undefined || value.windows.previous === null || validWindow(value.windows.previous))
			&& (typeof value.cutoff === 'string' || value.cutoff === null)
			&& ['complete', 'partial', 'unavailable'].includes(String(value.coverage))
			&& typeof value.units === 'string'
			&& ['strong', 'exploratory', 'limited'].includes(String(value.strength));
	}
	function validTarget(value: unknown): value is Finding['target'] {
		return object(value) && ['gallery', 'album', 'photo', 'site', 'page'].includes(String(value.kind))
			&& (value.id === undefined || value.id === null || typeof value.id === 'string')
			&& (value.albumKey === undefined || value.albumKey === null || typeof value.albumKey === 'string');
	}
	function validFinding(value: unknown): value is Finding {
		if (!object(value)) return false;
		return typeof value.id === 'string' && typeof value.rule === 'string' && validTarget(value.target)
			&& typeof value.title === 'string' && typeof value.explanation === 'string' && typeof value.action === 'string'
			&& typeof value.reportHref === 'string' && ['open', 'dismissed', 'snoozed', 'recorded', 'recovered'].includes(String(value.status))
			&& validEvidence(value.evidence);
	}
	function validAction(value: unknown): value is IntelligenceAction {
		return object(value) && typeof value.id === 'string' && ['record', 'dismiss', 'snooze', 'undo'].includes(String(value.kind))
			&& typeof value.createdAt === 'string';
	}
	function validBrief(value: unknown): value is IntelligenceReport['briefs'][number] {
		return object(value) && typeof value.id === 'string' && typeof value.periodKey === 'string'
			&& ['daily', 'weekly', 'operational'].includes(String(value.kind)) && typeof value.createdAt === 'string';
	}
	function validReport(value: unknown): value is IntelligenceReport {
		if (!object(value) || !parseIntelligenceScope(value.scope)) return false;
		return typeof value.generatedAt === 'string' && (typeof value.cutoff === 'string' || value.cutoff === null)
			&& ['complete', 'partial', 'unavailable'].includes(String(value.coverage))
			&& Array.isArray(value.findings) && value.findings.every(validFinding)
			&& Array.isArray(value.suppressions) && value.suppressions.every((item) => object(item) && typeof item.rule === 'string' && typeof item.reason === 'string')
			&& Array.isArray(value.actions) && value.actions.every(validAction)
			&& Array.isArray(value.briefs) && value.briefs.every(validBrief)
			&& Number.isInteger(value.page) && Number.isInteger(value.pageCount) && typeof value.owner === 'boolean';
	}
	function validAnswer(value: unknown): value is AssistantAnswer {
		if (!object(value) || !parseIntelligenceScope(value.scope)) return false;
		return typeof value.question === 'string' && typeof value.operation === 'string'
			&& ['complete', 'pending', 'unavailable', 'unsupported'].includes(String(value.status))
			&& typeof value.summary === 'string' && Array.isArray(value.findings) && value.findings.every(validFinding)
			&& Array.isArray(value.evidenceLinks) && value.evidenceLinks.every((link) => typeof link === 'string')
			&& Array.isArray(value.limitations) && value.limitations.every((limit) => typeof limit === 'string')
			&& typeof value.generatedAt === 'string' && (value.requestId === undefined || typeof value.requestId === 'string');
	}
	function validPollResponse(value: unknown): value is PollResponse {
		return object(value) && ['pending', 'complete', 'unavailable'].includes(String(value.status))
			&& (value.answer === null || validAnswer(value.answer));
	}
	function number(value: number | undefined) { return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : 'Not supplied'; }
	function formatTime(value: string | null | undefined) {
		if (!value || Number.isNaN(Date.parse(value))) return 'Not supplied';
		return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago', timeZoneName: 'short' }).format(new Date(value));
	}
	function targetLabel(target: Finding['target'] | null | undefined) {
		if (!target) return 'Report scope';
		if (target.albumKey) return `Album ${target.albumKey}`;
		if (target.id) return `${target.kind} ${target.id}`;
		return target.kind;
	}
	function scopeLabel(value: IntelligenceScope) {
		if (value.kind === 'sites') return `Sites · ${value.period} days · ${value.section}`;
		const { query } = value;
		return `Gallery · ${query.start} to ${query.end} · ${query.traffic} traffic`;
	}
	function evidenceWindows(evidence: FindingEvidence) {
		const current = `Current: ${evidence.windows.current.start} to ${evidence.windows.current.end}`;
		return evidence.windows.previous ? `${current}. Previous: ${evidence.windows.previous.start} to ${evidence.windows.previous.end}` : current;
	}
	function findingLimitations(finding: Finding) {
		const limits = report?.suppressions.filter((item) => item.rule === finding.rule).map((item) => item.reason) ?? [];
		return limits.length ? limits : ['No additional limitation was stored with this finding.'];
	}
	function sameTarget(left: Finding['target'] | null | undefined, right: Finding['target'] | null | undefined) {
		return left?.kind === right?.kind && left?.id === right?.id && left?.albumKey === right?.albumKey;
	}
	function actionsForFinding(finding: Finding) {
		return report?.actions.filter((action) => action.findingId === finding.id && action.kind === 'record') ?? [];
	}
	function followUpFor(action: IntelligenceAction) {
		return report?.findings.find((finding) => finding.rule === 'follow_up' && sameTarget(finding.target, action.target)) ?? null;
	}
	function localExplanation(finding: Finding, questionText: string): AssistantAnswer {
		return {
			scope: validatedScope!, question: questionText, operation: 'public_finding_explanation', status: 'complete',
			summary: `${finding.explanation} ${finding.action}`, findings: [finding], evidenceLinks: [finding.reportHref, ...(finding.evidenceLinks ?? [])],
			limitations: ['This explains the visible public aggregate finding only. It does not run a new calculation or reveal private records.'], generatedAt: new Date().toISOString()
		};
	}
	async function json(response: Response): Promise<unknown> {
		try { return await response.json(); } catch { return null; }
	}
	function stopPolling() {
		if (pollTimer) clearTimeout(pollTimer);
		pollTimer = null;
		pendingPoll = null;
	}
	function safeAnswerError() { return 'The assistant could not complete that request. The saved report is unchanged.'; }
	function schedulePoll(poll: PendingPoll) {
		if (pendingPoll?.requestId !== poll.requestId || pendingPoll.scopeKey !== poll.scopeKey) return;
		const delay = Math.min(maximumPollDelayMs, initialPollMs * 2 ** poll.attempt);
		pollTimer = setTimeout(() => void pollAnswer(), delay);
	}
	async function loadReport(page = 0) {
		if (!validatedScope) { reportError = 'This report has an invalid scope.'; loading = false; return; }
		reportAbort?.abort();
		const controller = new AbortController();
		reportAbort = controller;
		const version = ++reportRequestVersion;
		loading = true; reportError = null;
		try {
			const params = new URLSearchParams({ scope: scopeKey, page: String(page) });
			const response = await fetch(`${endpoint}?${params}`, { signal: controller.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
			const payload = await json(response);
			if (!response.ok || !validReport(payload)) throw new Error('report');
			if (version !== reportRequestVersion) return;
			report = payload; currentPage = payload.page; expandedFindings = false;
			if (!selectedFinding || !payload.findings.some((finding) => finding.id === selectedFinding?.id)) selectedFinding = payload.findings[0] ?? null;
		} catch (cause) {
			if (controller.signal.aborted || version !== reportRequestVersion) return;
			report = null; reportError = 'Saved intelligence is unavailable right now. The rest of this report is still usable.';
		} finally { if (version === reportRequestVersion) loading = false; }
	}
	async function ask(questionText: string, finding: Finding | null = selectedFinding) {
		if (!validatedScope) { answerError = 'This report has an invalid scope.'; return; }
		const cleanQuestion = questionText.trim();
		if (!cleanQuestion) return;
		answerError = null;
		if (!owner) {
			if (finding) answer = localExplanation(finding, cleanQuestion);
			else answerError = 'Public reports can explain a visible finding. Verified owner access is required for a new question.';
			return;
		}
		if (pendingPoll?.scopeKey === scopeKey && answer?.question === cleanQuestion && answer.status === 'pending') return;
		if (answer && scopeChanged) previousAnswer = answer;
		answerAbort?.abort(); stopPolling();
		const controller = new AbortController(); answerAbort = controller;
		const version = ++answerRequestVersion; answerLoading = true;
		try {
			const response = await fetch(endpoint, { method: 'POST', signal: controller.signal, cache: 'no-store', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ scope: validatedScope, question: cleanQuestion }) });
			const payload = await json(response);
			if (!response.ok || !validAnswer(payload)) throw new Error('answer');
			if (controller.signal.aborted || version !== answerRequestVersion) return;
			answer = payload;
			if (payload.status === 'pending' && payload.requestId) {
				pendingPoll = { requestId: payload.requestId, scopeKey, startedAt: Date.now(), attempt: 0 };
				schedulePoll(pendingPoll);
			}
		} catch {
			if (!controller.signal.aborted && version === answerRequestVersion) answerError = safeAnswerError();
		} finally { if (!controller.signal.aborted && version === answerRequestVersion) answerLoading = false; }
	}
	async function pollAnswer() {
		const poll = pendingPoll;
		if (!poll || !owner || !validatedScope || poll.scopeKey !== scopeKey) return;
		if (Date.now() - poll.startedAt > maximumPollMs) {
			stopPolling(); answerLoading = false; answerError = 'This calculation is taking longer than two minutes. You can keep the saved answer and try again later.'; return;
		}
		answerAbort?.abort();
		const controller = new AbortController(); answerAbort = controller;
		const version = ++answerRequestVersion; answerLoading = true;
		try {
			const params = new URLSearchParams({ scope: scopeKey, requestId: poll.requestId });
			const response = await fetch(`${endpoint}?${params}`, { signal: controller.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
			const payload = await json(response);
			if (!response.ok || !validPollResponse(payload)) throw new Error('poll');
			if (controller.signal.aborted || version !== answerRequestVersion || pendingPoll?.requestId !== poll.requestId) return;
			if (payload.status === 'pending') {
				answer = { ...(answer ?? { scope: validatedScope, question: '', operation: 'pending', findings: [], evidenceLinks: [], limitations: [], generatedAt: new Date().toISOString() }), status: 'pending', summary: 'This calculation is still running against the captured report scope.', requestId: poll.requestId };
				pendingPoll = { ...poll, attempt: poll.attempt + 1 }; schedulePoll(pendingPoll); return;
			}
			stopPolling();
			if (payload.status === 'complete' && payload.answer) answer = payload.answer;
			else answer = { ...(answer ?? { scope: validatedScope, question: '', operation: 'unavailable', findings: [], evidenceLinks: [], limitations: [], generatedAt: new Date().toISOString() }), status: 'unavailable', summary: 'The saved evidence cannot complete this request safely.', limitations: ['The bounded calculation did not return a usable answer.'], requestId: poll.requestId };
		} catch {
			if (!controller.signal.aborted && version === answerRequestVersion) { stopPolling(); answerError = safeAnswerError(); }
		} finally { if (!controller.signal.aborted && version === answerRequestVersion) answerLoading = false; }
	}
	function cancelAnswer() {
		answerAbort?.abort(); stopPolling(); answerLoading = false;
		answerError = 'Request cancelled. The saved report and any prior answer are unchanged.';
	}
	async function submitAction(kind: Exclude<IntelligenceAction['kind'], 'undo'>, form: HTMLFormElement) {
		if (!owner || !validatedScope || !actionFinding) { actionError = 'Verified owner access is required for private action history.'; return; }
		actionMessage = null; actionError = null;
		const fields = new FormData(form);
		const payload: Record<string, unknown> = { scope: validatedScope, kind, findingId: actionFinding.id };
		for (const key of ['actualAt', 'hypothesis', 'primaryMeasure', 'note'] as const) {
			const value = fields.get(key);
			if (typeof value !== 'string' || !value.trim()) continue;
			if (key === 'actualAt') {
				const instant = new Date(value);
				if (Number.isNaN(instant.getTime())) { actionError = 'Enter a valid action time before saving.'; return; }
				payload[key] = instant.toISOString();
			} else payload[key] = value.trim();
		}
		try {
			const response = await fetch(`${endpoint}/actions`, { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload) });
			if (!response.ok) throw new Error('action');
			actionMessage = kind === 'record' ? 'Action recorded. Its result remains unmeasured until the stored follow-up is ready.' : kind === 'dismiss' ? 'Suggestion dismissed. You can reverse it from private action history.' : 'Suggestion snoozed. You can reverse it from private action history.';
			actionMode = null; void loadReport(currentPage);
		} catch { actionError = 'The action could not be saved. No report finding was changed.'; }
	}
	async function reverseAction(action: IntelligenceAction) {
		if (!owner || !validatedScope) { actionError = 'Verified owner access is required for private action history.'; return; }
		actionError = null;
		try {
			const response = await fetch(`${endpoint}/actions`, { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ scope: validatedScope, kind: 'undo', actionId: action.id }) });
			if (!response.ok) throw new Error('undo');
			actionMessage = 'Action reversal recorded.'; void loadReport(currentPage);
		} catch { actionError = 'The action reversal could not be saved. Private history is unchanged.'; }
	}

	$effect(() => {
		scopeKey;
		selectedFinding = null; actionFinding = null; actionMode = null; expandedFindings = false;
		stopPolling(); answerAbort?.abort();
		void loadReport(0);
		return () => { reportAbort?.abort(); answerAbort?.abort(); stopPolling(); };
	});
</script>

<section class={`intelligence ${className}`} aria-labelledby={`${kind}-intelligence-heading`}>
	<div class="heading">
		<div><p class="kicker">Report intelligence</p><h2 id={`${kind}-intelligence-heading`}>Worth your attention</h2><p>Short evidence-led observations for this report. They do not rate photographic quality or prove a business result.</p></div>
		{#if report}<p class="freshness">Cutoff: {formatTime(report.cutoff)}<br />Saved: {formatTime(report.generatedAt)}</p>{/if}
	</div>

	{#if loading}
		<p class="state" role="status">Loading saved findings. The report above remains usable.</p>
	{:else if reportError}
		<div class="state unavailable" role="status"><strong>Intelligence is unavailable</strong><p>{reportError}</p><button type="button" onclick={() => void loadReport(currentPage)}>Try again</button></div>
	{:else if report}
		<p class="scope"><strong>Scope:</strong> {scopeLabel(report.scope)} · Coverage: {report.coverage}</p>
		{#if contextTarget}<p class="context-note"><strong>Inspector context:</strong> {contextLabel}. This helps choose a question; it does not silently narrow the report scope.</p>{/if}
		<div class="actions-review"><div><p class="kicker">Actions to review</p><p>Record an actual change, dismiss a suggestion, or snooze it. Nothing here publishes a promotion, changes a cover, or sends a message.</p></div><p>{owner ? 'Choose I did this on a finding.' : 'Verified owner access is required for private history.'}</p></div>

		{#if report.findings.length}
			<div class="content-grid">
				<div class="finding-list" aria-label="Prioritized findings">
					{#each visibleFindings as finding}
						<article class:selected={selectedFinding?.id === finding.id} class="finding">
							<div class="finding-topline"><span>{finding.status.replaceAll('_', ' ')}</span><span>{targetLabel(finding.target)}</span></div>
							<h3>{finding.title}</h3><p>{finding.explanation}</p><p class="proposal"><strong>Next step:</strong> {finding.action}</p>{#each actionsForFinding(finding) as action}<div class="follow-up"><p><strong>Recorded hypothesis:</strong> {action.hypothesis ?? 'Not supplied'}</p><p><strong>Follow-up:</strong> {action.followUpAt ? formatTime(action.followUpAt) : 'Not scheduled'}</p>{#if followUpFor(action)}<p><strong>Observed result:</strong> {followUpFor(action)?.explanation}</p>{:else}<p>The result is not measured yet.</p>{/if}</div>{/each}
							<details class="evidence"><summary>Read exact evidence</summary><dl><div><dt>Window</dt><dd>{evidenceWindows(finding.evidence)}</dd></div><div><dt>Unit</dt><dd>{finding.evidence.units}</dd></div><div><dt>Coverage</dt><dd>{finding.evidence.coverage}</dd></div><div><dt>Strength</dt><dd>{finding.evidence.strength}</dd></div><div><dt>Current</dt><dd>{number(finding.evidence.current)}</dd></div><div><dt>Previous</dt><dd>{number(finding.evidence.previous)}</dd></div><div><dt>Numerator</dt><dd>{number(finding.evidence.numerator)}</dd></div><div><dt>Denominator</dt><dd>{number(finding.evidence.denominator)}</dd></div><div><dt>Cutoff</dt><dd>{formatTime(finding.evidence.cutoff)}</dd></div>{#if finding.evidence.eligibility}<div><dt>Eligible group</dt><dd>{finding.evidence.eligibility}</dd></div>{/if}</dl><p><strong>Limitations:</strong></p><ul>{#each findingLimitations(finding) as limitation}<li>{limitation}</li>{/each}</ul><p class="links"><a href={finding.reportHref}>Open exact report evidence</a>{#each finding.evidenceLinks ?? [] as href}<a href={href}>Open linked evidence</a>{/each}</p></details>
							<div class="finding-actions"><button type="button" onclick={() => { selectedFinding = finding; void ask('Explain this finding using the captured report evidence.', finding); }}>Explain evidence</button><a href={finding.reportHref}>Open report</a>{#if owner}<button type="button" onclick={() => { actionFinding = finding; actionMode = 'record'; }}>I did this</button><button type="button" onclick={() => { actionFinding = finding; actionMode = 'dismiss'; }}>Dismiss</button><button type="button" onclick={() => { actionFinding = finding; actionMode = 'snooze'; }}>Snooze</button>{:else}<button type="button" onclick={() => { selectedFinding = finding; answer = localExplanation(finding, 'Explain this finding using the captured report evidence.'); }}>Public explanation</button>{/if}</div>
						</article>
					{/each}
					{#if !expandedFindings && report.findings.length > firstViewportLimit}<nav class="pager" aria-label="Findings on this page"><span>Showing {firstViewportLimit} of {report.findings.length} findings on this page</span><button type="button" onclick={() => expandedFindings = true}>Show all on this page</button></nav>{/if}
					{#if expandedFindings && report.pageCount > 1}<nav class="pager" aria-label="All findings pages"><span>Page {report.page + 1} of {report.pageCount}</span><div>{#if report.page > 0}<button type="button" onclick={() => void loadReport(report.page - 1)}>Previous</button>{/if}{#if report.page + 1 < report.pageCount}<button type="button" onclick={() => void loadReport(report.page + 1)}>Next</button>{/if}</div></nav>{/if}
				</div>

				<aside class="inspector" aria-live="polite" aria-labelledby={`${kind}-assistant-heading`}>
					<p class="kicker">Contextual inspector</p><h3 id={`${kind}-assistant-heading`}>{selectedFinding ? selectedFinding.title : 'Explain a visible finding'}</h3><p class="inspector-copy">Answers keep their captured dates, filters, and traffic policy. Changing the page filters never rewrites an existing answer.</p>
					<div class="presets"><button type="button" disabled={!selectedFinding} onclick={() => selectedFinding && void ask('What does this evidence support, and what remains uncertain?', selectedFinding)}>What does this support?</button><button type="button" disabled={!selectedFinding} onclick={() => selectedFinding && void ask('What should I inspect before acting?', selectedFinding)}>What should I inspect?</button>{#if kind === 'gallery'}<button type="button" disabled={!selectedFinding} onclick={() => selectedFinding && void ask(contextTarget?.kind === 'album' ? 'Compare this album' : 'Which photos should I consider promoting?', selectedFinding)}>{contextTarget?.kind === 'album' ? 'Compare this album' : 'Consider promotion'}</button>{:else}<button type="button" disabled={!selectedFinding} onclick={() => selectedFinding && void ask('Where are readers or demo visitors losing interest?', selectedFinding)}>Inspect this section</button>{/if}</div>
					{#if owner}<form class="question-form" onsubmit={(event) => { event.preventDefault(); void ask(question, selectedFinding); }}><label for={`${kind}-question`}>Ask about this report</label><textarea id={`${kind}-question`} bind:value={question} maxlength="500" placeholder="Ask about this report evidence. Raw visitor records are not available." disabled={answerLoading}></textarea><button type="submit" disabled={!question.trim() || answerLoading}>{answerLoading ? 'Working…' : 'Ask owner question'}</button></form>{:else}<p class="auth-note">Public readers can use the explanation buttons. Verified owner access is required for a free-text question or private action history.</p>{/if}
					{#if answerLoading || pendingPoll}<p class="state">Checking the bounded report operation. <button type="button" onclick={cancelAnswer}>Cancel</button></p>{/if}
					{#if answerError}<p class="answer-error" role="alert">{answerError}</p>{/if}
					{#if answer}<div class="answer"><p class="answer-status">{answer.status}</p><p>{answer.summary}</p><p class="scope"><strong>Answer scope:</strong> {scopeLabel(answer.scope)}</p>{#if scopeChanged}<button type="button" onclick={() => void ask(answer.question, selectedFinding)}>Rerun for the current scope</button>{/if}<p class="evidence">Calculated: {formatTime(answer.generatedAt)}</p>{#if answer.evidenceLinks.length}<p class="links">{#each answer.evidenceLinks as href}<a href={href}>Open exact evidence</a>{/each}</p>{/if}{#if answer.limitations.length}<p class="evidence"><strong>Limitations</strong></p><ul>{#each answer.limitations as limitation}<li>{limitation}</li>{/each}</ul>{/if}</div>{/if}
					{#if previousAnswer}<details class="previous-answer"><summary>Previous answer scope</summary><p>{scopeLabel(previousAnswer.scope)}</p><p>{previousAnswer.summary}</p></details>{/if}
				</aside>
			</div>
		{:else}<div class="state"><strong>No actionable findings for this scope</strong><p>This is not a zero-activity claim. The saved evidence may be sparse, suppressed, stale, or not yet capable of a safe recommendation.</p></div>{/if}

		<section class="briefs" aria-labelledby={`${kind}-briefs-heading`}><div><p class="kicker">Scheduled briefs</p><h3 id={`${kind}-briefs-heading`}>Daily and weekly review</h3></div>{#if report.briefs.length}<div class="brief-list">{#each report.briefs as brief}<article><strong>{brief.kind === 'daily' ? 'Daily brief' : brief.kind === 'weekly' ? 'Weekly brief' : 'Operational brief'}</strong><span>{brief.periodKey} · created {formatTime(brief.createdAt)}</span><p>Open the saved findings above for this report scope. This brief record stores its kind and period, not a separate body or finding list.</p></article>{/each}</div>{:else}<p class="brief-empty">No stored daily or weekly brief is available for this report scope. That does not mean there was no activity.</p>{/if}</section>

		{#if owner && report.actions.length}<section class="action-history" aria-labelledby={`${kind}-actions-heading`}><div><p class="kicker">Private history</p><h3 id={`${kind}-actions-heading`}>Recorded actions and follow-up</h3><p>Showing the bounded action history returned for this scope.</p></div><ul>{#each report.actions as item}<li><div><strong>{item.kind === 'record' ? 'I did this' : item.kind}</strong><span>{targetLabel(item.target)} · {formatTime(item.createdAt)}</span>{#if item.hypothesis}<p><strong>Hypothesis:</strong> {item.hypothesis}</p>{/if}{#if item.primaryMeasure}<p><strong>Primary measure:</strong> {item.primaryMeasure}</p>{/if}{#if item.followUpAt}<p><strong>Follow-up:</strong> {formatTime(item.followUpAt)}. Any follow-up finding appears beside the original report evidence above.</p>{/if}</div>{#if item.kind !== 'undo'}<button type="button" onclick={() => void reverseAction(item)}>Reverse</button>{/if}</li>{/each}</ul></section>{/if}
	{/if}

	{#if actionMode && actionFinding}
		<section class="action-sheet" aria-labelledby="action-sheet-title"><div class="action-sheet-heading"><div><p class="kicker">Private action record</p><h3 id="action-sheet-title">{actionMode === 'record' ? 'Record what changed' : actionMode === 'dismiss' ? 'Dismiss this suggestion' : 'Snooze this suggestion'}</h3><p>{actionFinding.title} · {targetLabel(actionFinding.target)}</p></div><button type="button" onclick={() => { actionMode = null; actionError = null; }}>Close</button></div>
			{#if actionMode === 'record'}<form onsubmit={(event) => { event.preventDefault(); void submitAction('record', event.currentTarget as HTMLFormElement); }}><label>Actual action time<input name="actualAt" type="datetime-local" required /></label><label>What do you expect to change?<input name="hypothesis" maxlength="500" required /></label><label>Declared primary measure<select name="primaryMeasure" required><option value="">Choose a measure</option><option value="album_opens">Album opens</option><option value="photo_opens">Photo opens</option><option value="downloads">Downloads</option><option value="favorites">Favorite additions</option><option value="shares">Shares</option><option value="page_views">Page views</option></select></label><label>Private note (optional)<textarea name="note" maxlength="1000"></textarea></label><p class="contract-gap">This service currently stores a finding-linked action and a fixed follow-up time. It does not yet support a standalone action or separate target type, observation window, channel/tag, or release fields.</p><button type="submit">Record action</button></form>{:else if actionMode === 'dismiss'}<form onsubmit={(event) => { event.preventDefault(); void submitAction('dismiss', event.currentTarget as HTMLFormElement); }}><label>Why is this not useful now?<input name="note" maxlength="1000" required /></label><button type="submit">Dismiss suggestion</button></form>{:else}<form onsubmit={(event) => { event.preventDefault(); void submitAction('snooze', event.currentTarget as HTMLFormElement); }}><label>Private note (optional)<input name="note" maxlength="1000" /></label><p class="contract-gap">Snooze timing is currently set by the server. You can reverse it from private action history.</p><button type="submit">Snooze suggestion</button></form>{/if}
			{#if actionError}<p class="answer-error" role="alert">{actionError}</p>{/if}{#if actionMessage}<p class="action-message" role="status">{actionMessage}</p>{/if}
		</section>
	{/if}
</section>

<style>
	.intelligence{margin-top:1.25rem;border-top:1px solid #d8e0ea;padding-top:1.25rem;color:#172033}.heading,.finding-topline,.finding-actions,.pager,.action-sheet-heading,.action-history li{display:flex;align-items:center;justify-content:space-between;gap:.75rem}.heading{align-items:end}.kicker{color:#174ea6;font-size:.68rem;font-weight:800;letter-spacing:.07em;margin:0 0 .35rem;text-transform:uppercase}h2,h3,p{margin-top:0}h2{font-size:1.2rem;letter-spacing:-.02em;margin-bottom:.3rem}h3{font-size:1rem;line-height:1.3;margin-bottom:.45rem}.heading>div>p:last-child,.inspector-copy,.scope,.freshness,.evidence,.auth-note,.context-note{color:#526176;font-size:.78rem;line-height:1.5}.freshness{margin:0;text-align:right}.scope,.context-note{margin:.8rem 0}.context-note{background:#eef5ff;border-left:3px solid #6195df;padding:.55rem .7rem}.content-grid{display:grid;gap:1rem;grid-template-columns:minmax(0,1.35fr) minmax(17rem,.8fr);align-items:start}.finding-list{display:grid;gap:.65rem}.finding,.inspector,.briefs,.state,.action-sheet,.action-history{background:#fff;border:1px solid #d8e0ea;border-radius:.75rem;padding:1rem}.finding.selected{border-color:#1769e0;box-shadow:inset 3px 0 #1769e0}.finding-topline{color:#64758a;font-size:.7rem;text-transform:capitalize}.finding p{color:#384b66;font-size:.84rem;line-height:1.5}.proposal{color:#172033!important}.follow-up{border-left:2px solid #91b7ee;margin:.65rem 0;padding-left:.7rem}.follow-up p{font-size:.78rem;margin:.25rem 0}.finding-actions{justify-content:start;flex-wrap:wrap;margin-top:.85rem}.inspector{position:sticky;top:1rem;background:#f4f7fb}.presets{display:flex;flex-wrap:wrap;gap:.45rem;margin:.8rem 0}.question-form,.action-sheet form{display:grid;gap:.6rem;margin-top:.9rem}.question-form label,.action-sheet label{display:grid;color:#33445c;font-size:.78rem;font-weight:700;gap:.35rem}button,.finding-actions a{border:1px solid #b8c8dc;border-radius:.45rem;background:#fff;color:#174ea6;cursor:pointer;font:inherit;font-size:.78rem;font-weight:700;padding:.5rem .65rem;text-decoration:none}button:hover,button:focus-visible,.finding-actions a:hover,.finding-actions a:focus-visible{border-color:#1769e0;background:#edf5ff}button:disabled{cursor:not-allowed;opacity:.55}button:focus-visible,a:focus-visible,textarea:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #1769e0;outline-offset:2px}textarea,input,select{border:1px solid #b8c8dc;border-radius:.45rem;background:#fff;color:#172033;font:inherit;min-height:2.45rem;padding:.55rem .65rem}textarea{min-height:5rem;resize:vertical}.question-form button,.action-sheet form button{background:#1769e0;border-color:#1769e0;color:#fff}.answer,.previous-answer{border-top:1px solid #d8e0ea;margin-top:.9rem;padding-top:.9rem}.answer-status{color:#174ea6;font-size:.72rem;font-weight:800;text-transform:capitalize}.answer ul,.finding details ul{color:#526176;font-size:.77rem;line-height:1.45;margin:.65rem 0 0;padding-left:1.1rem}.links{display:grid;gap:.35rem;margin:.65rem 0 0}.links a{color:#174ea6;font-size:.78rem;font-weight:700}.state{color:#526176;font-size:.84rem;line-height:1.5}.state p{margin:.3rem 0 0}.unavailable{border-color:#dba6a6}.answer-error{color:#a42424;font-size:.8rem;line-height:1.45}.pager{border-top:1px solid #d8e0ea;color:#526176;font-size:.78rem;padding-top:.8rem}.pager div{display:flex;gap:.4rem}.actions-review{align-items:start;background:#eef5ff;border-left:3px solid #6195df;color:#384b66;display:flex;font-size:.78rem;gap:1rem;justify-content:space-between;line-height:1.5;margin:.9rem 0;padding:.75rem .85rem}.actions-review p{margin:0}.briefs{display:grid;gap:.8rem;grid-template-columns:minmax(12rem,.45fr) minmax(0,1fr);margin-top:1rem}.brief-list{display:grid;gap:.5rem;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))}.brief-list article{border-left:2px solid #91b7ee;padding-left:.7rem}.brief-list strong,.brief-list span{display:block}.brief-list span,.brief-empty{color:#64758a;font-size:.72rem;margin-top:.15rem}.brief-list p{color:#526176;font-size:.78rem;line-height:1.45;margin:.4rem 0 0}.action-history{margin-top:1rem}.action-history ul{display:grid;gap:.65rem;list-style:none;margin:.8rem 0 0;padding:0}.action-history li{align-items:start;border-top:1px solid #e3e9f1;padding-top:.7rem}.action-history span,.action-history p{color:#526176;font-size:.78rem;line-height:1.45}.action-history p{margin:.25rem 0 0}.action-sheet{border-color:#9ebce8;margin-top:1rem;max-width:44rem}.action-sheet-heading{align-items:start}.action-sheet-heading p{color:#526176;font-size:.82rem;margin-bottom:0}.contract-gap{color:#526176;font-size:.78rem;line-height:1.5}.action-message{color:#195b33;font-size:.82rem;margin:.75rem 0 0}.evidence summary{cursor:pointer;color:#174ea6;font-weight:700}.evidence dl{display:grid;gap:.35rem;margin:.7rem 0}.evidence dl div{display:grid;gap:.6rem;grid-template-columns:7rem minmax(0,1fr)}.evidence dt{color:#64758a}.evidence dd{margin:0;overflow-wrap:anywhere}.evidence>p{margin:.7rem 0 0}@media(max-width:900px){.content-grid,.briefs{grid-template-columns:1fr}.inspector{position:static}}@media(max-width:600px){.heading,.actions-review,.action-history li{align-items:start;flex-direction:column}.freshness{text-align:left}.finding-actions button,.finding-actions a{flex:1 1 auto;text-align:center}.evidence dl div{grid-template-columns:1fr}}
</style>
