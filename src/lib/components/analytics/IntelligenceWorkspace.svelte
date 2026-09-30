<script lang="ts">
	import { base } from '$app/paths';

	type Scope = Record<string, unknown>;
	type Evidence = {
		windows?: string[];
		cutoff?: string | null;
		coverage?: string | null;
		units?: string | null;
		numerator?: number | null;
		denominator?: number | null;
		current?: number | null;
		previous?: number | null;
		strength?: string | null;
	};
	type Finding = {
		id: string;
		title: string;
		explanation: string;
		action: string;
		reportHref: string;
		status: string;
		rule?: string;
		target?: string | null;
		evidence: Evidence;
	};
	type Brief = { id?: string; title?: string; summary?: string; period?: string; status?: string; findingIds?: string[] };
	type Report = {
		generatedAt: string;
		cutoff: string | null;
		coverage: string | null;
		findings: Finding[];
		suppressions: unknown[];
		actions: unknown[];
		briefs: Brief[];
		page: number;
		pageCount: number;
		owner: boolean;
	};
	type Answer = {
		scope: Scope;
		question: string;
		operation: string;
		status: 'complete' | 'pending' | 'unavailable' | 'unsupported';
		summary: string;
		findings: Finding[];
		evidenceLinks: string[];
		limitations: string[];
		generatedAt: string;
		requestId?: string;
	};

	interface Props {
		scope: Scope;
		owner: boolean;
		kind: 'gallery' | 'sites';
		class?: string;
	}
	let { scope, owner, kind, class: className = '' }: Props = $props();

	let report = $state<Report | null>(null);
	let loading = $state(true);
	let reportError = $state<string | null>(null);
	let selectedFinding = $state<Finding | null>(null);
	let answer = $state<Answer | null>(null);
	let answerLoading = $state(false);
	let answerError = $state<string | null>(null);
	let question = $state('');
	let actionMessage = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let actionFinding = $state<Finding | null>(null);
	let actionMode = $state<'record' | 'dismiss' | 'snooze' | null>(null);
	let requestVersion = 0;
	let reportAbort: AbortController | null = null;
	let answerAbort: AbortController | null = null;
	let answerPollTimer: ReturnType<typeof setTimeout> | null = null;
	let currentPage = $state(0);
	let expandedFindings = $state(false);

	const scopeKey = $derived(JSON.stringify(scope));
	const endpoint = `${base}/api/analytics/intelligence`;
	const publicFindingLimit = 3;
	const displayFindings = $derived(expandedFindings ? (report?.findings ?? []) : (report?.findings ?? []).slice(0, publicFindingLimit));
	const scopeChanged = $derived(answer !== null && JSON.stringify(answer.scope) !== scopeKey);
	const effectiveOwner = $derived(owner && (report?.owner ?? owner));

	function plainError(response: Response, fallback: string) {
		return response.text().then((text) => text.trim().slice(0, 280) || fallback).catch(() => fallback);
	}
	function number(value: number | null | undefined) {
		return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : 'Unavailable';
	}
	function formatTime(value: string | null | undefined) {
		if (!value) return 'Unavailable';
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? 'Unavailable' : new Intl.DateTimeFormat('en-US', {
			month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: 'America/Chicago'
		}).format(date);
	}
	function scopeLabel(value: Scope) {
		if (value.kind === 'gallery') {
			const query = value.query as Record<string, unknown> | undefined;
			return `Gallery · ${String(query?.start ?? 'unknown')} to ${String(query?.end ?? 'unknown')} · ${String(query?.traffic ?? 'report traffic policy')}`;
		}
		return `Sites · ${String(value.period ?? 'unknown')} days · ${String(value.section ?? 'all sections')}`;
	}
	function evidenceLine(evidence: Evidence) {
		const parts = [
			evidence.windows?.filter(Boolean).join(' and '),
			evidence.units ? `Unit: ${evidence.units}` : null,
			evidence.coverage ? `Coverage: ${evidence.coverage}` : null,
			evidence.strength ? `Evidence: ${evidence.strength}` : null
		].filter((value): value is string => Boolean(value));
		return parts.join(' · ');
	}
	function localExplanation(finding: Finding, preset: string): Answer {
		return {
			scope: JSON.parse(scopeKey) as Scope,
			question: preset,
			operation: 'public_finding_explanation',
			status: 'complete',
			summary: `${finding.explanation} ${finding.action}`,
			findings: [finding],
			evidenceLinks: [finding.reportHref],
			limitations: ['This is a public explanation of the visible aggregate finding. It does not include private notes, raw events, visitor identities, or a new calculation.'],
			generatedAt: new Date().toISOString()
		};
	}

	async function loadReport(page = 0) {
		reportAbort?.abort();
		const controller = new AbortController();
		reportAbort = controller;
		const version = ++requestVersion;
		loading = true;
		reportError = null;
		try {
			const params = new URLSearchParams({ scope: scopeKey, page: String(page) });
			const response = await fetch(`${endpoint}?${params}`, { signal: controller.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
			if (!response.ok) throw new Error(await plainError(response, 'The intelligence report is unavailable.'));
			const payload = await response.json() as Report;
			if (version !== requestVersion) return;
			report = payload;
		currentPage = payload.page ?? page;
		if (page === 0) expandedFindings = false;
			if (!selectedFinding && payload.findings[0]) selectedFinding = payload.findings[0];
		} catch (cause) {
			if (controller.signal.aborted || version !== requestVersion) return;
			report = null;
			reportError = cause instanceof Error ? cause.message : 'The intelligence report is unavailable.';
		} finally {
			if (version === requestVersion) loading = false;
		}
	}

	async function ask(questionText: string, finding: Finding | null = selectedFinding) {
		answerError = null;
		if (!effectiveOwner) {
			if (finding) answer = localExplanation(finding, questionText);
			else answerError = 'Sign in as the owner to ask a private question. Public reports can explain a visible finding.';
			return;
		}
		answerAbort?.abort();
		if (answerPollTimer) clearTimeout(answerPollTimer);
		const controller = new AbortController();
		answerAbort = controller;
		answerLoading = true;
		try {
			const response = await fetch(endpoint, {
				method: 'POST', signal: controller.signal, cache: 'no-store',
				headers: { 'content-type': 'application/json', accept: 'application/json' },
				body: JSON.stringify({ scope: JSON.parse(scopeKey), question: questionText })
			});
			if (!response.ok) throw new Error(await plainError(response, 'The assistant could not answer this question.'));
			const payload = await response.json() as Answer;
			if (!controller.signal.aborted) {
				answer = payload;
				if (payload.status === 'pending' && payload.requestId) queueAnswerPoll(payload.requestId);
			}
		} catch (cause) {
			if (!controller.signal.aborted) answerError = cause instanceof Error ? cause.message : 'The assistant could not answer this question.';
		} finally {
			if (!controller.signal.aborted) answerLoading = false;
		}
	}

	function cancelAnswer() {
		answerAbort?.abort();
		if (answerPollTimer) clearTimeout(answerPollTimer);
		answerPollTimer = null;
		answerLoading = false;
		answerError = 'Request cancelled. The report and its visible findings are unchanged.';
	}

	function queueAnswerPoll(requestId: string) {
		if (answerPollTimer) clearTimeout(answerPollTimer);
		answerPollTimer = setTimeout(() => void pollAnswer(requestId), 900);
	}

	async function pollAnswer(requestId: string) {
		if (!effectiveOwner) return;
		answerAbort?.abort();
		const controller = new AbortController();
		answerAbort = controller;
		answerLoading = true;
		try {
			const params = new URLSearchParams({ scope: scopeKey, requestId });
			const response = await fetch(`${endpoint}?${params}`, { signal: controller.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
			if (!response.ok) throw new Error(await plainError(response, 'The assistant request is unavailable.'));
			const payload = await response.json() as Answer;
			if (controller.signal.aborted) return;
			answer = payload;
			if (payload.status === 'pending' && payload.requestId) queueAnswerPoll(payload.requestId);
		} catch (cause) {
			if (!controller.signal.aborted) answerError = cause instanceof Error ? cause.message : 'The assistant request is unavailable.';
		} finally {
			if (!controller.signal.aborted) answerLoading = false;
		}
	}

	async function submitAction(kind: 'record' | 'dismiss' | 'snooze' | 'undo', form?: HTMLFormElement) {
		actionMessage = null;
		actionError = null;
		if (!effectiveOwner || !actionFinding) {
			actionError = 'Sign in as the verified owner to record or change a private action.';
			return;
		}
		const fields = form ? new FormData(form) : new FormData();
		const payload: Record<string, unknown> = { scope: JSON.parse(scopeKey), kind, findingId: actionFinding.id };
		for (const [key, value] of fields.entries()) if (typeof value === 'string' && value.trim()) payload[key] = value.trim();
		try {
			const response = await fetch(`${endpoint}/actions`, {
				method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload)
			});
			if (!response.ok) throw new Error(await plainError(response, 'The action could not be recorded.'));
			actionMessage = kind === 'record' ? 'Action recorded. Its result remains unmeasured until the follow-up window has evidence.' : `${kind[0].toUpperCase()}${kind.slice(1)} recorded.`;
			actionMode = null;
			void loadReport(currentPage);
		} catch (cause) {
			actionError = cause instanceof Error ? cause.message : 'The action could not be recorded.';
		}
	}

	$effect(() => {
		scopeKey;
		selectedFinding = null;
		actionFinding = null;
		actionMode = null;
		expandedFindings = false;
		void loadReport(0);
		return () => { reportAbort?.abort(); answerAbort?.abort(); if (answerPollTimer) clearTimeout(answerPollTimer); };
	});
</script>

<section class={`intelligence ${className}`} aria-labelledby={`${kind}-intelligence-heading`}>
	<div class="heading">
		<div>
			<p class="kicker">Report intelligence</p>
			<h2 id={`${kind}-intelligence-heading`}>Worth your attention</h2>
			<p>Evidence-backed observations for this report. They do not rate photographic quality or prove a business result.</p>
		</div>
		{#if report}<p class="freshness">Cutoff: {formatTime(report.cutoff)}<br />Generated: {formatTime(report.generatedAt)}</p>{/if}
	</div>

	{#if loading}
		<p class="state" role="status">Loading saved findings without holding up this report…</p>
	{:else if reportError}
		<div class="state unavailable" role="status"><strong>Intelligence is unavailable</strong><p>{reportError}</p><button type="button" onclick={() => void loadReport(currentPage)}>Try again</button></div>
	{:else if report}
		<p class="scope"><strong>Scope:</strong> {scopeLabel(scope)}{report.coverage ? ` · Coverage: ${report.coverage}` : ''}</p>
		<div class="actions-review"><div><p class="kicker">Actions to review</p><p>Record an actual change, dismiss a suggestion with a reason, or set a follow-up. These private records never change the public report.</p></div>{#if effectiveOwner}<p>Choose <strong>I did this</strong> on a finding to begin.</p>{:else}<p>Owner sign-in is required to change action history.</p>{/if}</div>
		{#if report.findings.length}
			<div class="content-grid">
				<div class="finding-list" aria-label="Prioritized findings">
					{#each displayFindings as finding}
						<article class:selected={selectedFinding?.id === finding.id} class="finding">
							<div class="finding-topline"><span>{finding.status.replaceAll('_', ' ')}</span>{#if finding.target}<span>{finding.target}</span>{/if}</div>
							<h3>{finding.title}</h3>
							<p>{finding.explanation}</p>
							<p class="proposal"><strong>Next step:</strong> {finding.action}</p>
							<p class="evidence">{evidenceLine(finding.evidence) || 'The stored finding did not include enough evidence detail to strengthen this recommendation.'}</p>
							{#if finding.evidence.numerator !== undefined || finding.evidence.denominator !== undefined}<p class="evidence">Observed: {number(finding.evidence.numerator)}{finding.evidence.denominator !== undefined ? ` of ${number(finding.evidence.denominator)}` : ''}</p>{/if}
							<div class="finding-actions">
								<button type="button" onclick={() => { selectedFinding = finding; void ask('Explain this finding using the current report evidence.', finding); }}>Explain evidence</button>
								<a href={finding.reportHref}>Open report evidence</a>
								{#if effectiveOwner}<button type="button" onclick={() => { actionFinding = finding; actionMode = 'record'; }}>I did this</button>{:else}<button type="button" onclick={() => { selectedFinding = finding; answer = localExplanation(finding, 'Explain this finding using the current report evidence.'); }}>Public explanation</button>{/if}
							</div>
						</article>
					{/each}
					{#if !expandedFindings && report.findings.length > publicFindingLimit}<nav class="pager" aria-label="Complete findings"><span>Showing the first {publicFindingLimit} findings</span><button type="button" onclick={() => expandedFindings = true}>Show this page's findings</button></nav>{/if}
					{#if expandedFindings && report.pageCount > 1}<nav class="pager" aria-label="Complete findings"><span>Page {report.page + 1} of {report.pageCount}</span><div>{#if report.page > 0}<button type="button" onclick={() => void loadReport(report.page - 1)}>Previous</button>{/if}{#if report.page + 1 < report.pageCount}<button type="button" onclick={() => void loadReport(report.page + 1)}>Next</button>{/if}</div></nav>{/if}
				</div>

				<aside class="inspector" aria-live="polite" aria-labelledby={`${kind}-assistant-heading`}>
					<p class="kicker">Contextual inspector</p>
					<h3 id={`${kind}-assistant-heading`}>{selectedFinding ? selectedFinding.title : 'Explain a visible finding'}</h3>
					<p class="inspector-copy">Choose a visible finding first. The assistant keeps the selected period, filters, and traffic policy with its answer.</p>
					<div class="presets">
						<button type="button" disabled={!selectedFinding} onclick={() => selectedFinding && void ask('What does this evidence support, and what remains uncertain?', selectedFinding)}>What does this support?</button>
						<button type="button" disabled={!selectedFinding} onclick={() => selectedFinding && void ask('What should I inspect before acting?', selectedFinding)}>What should I inspect?</button>
						{#if kind === 'gallery'}<button type="button" disabled={!selectedFinding} onclick={() => selectedFinding && void ask('How does this album compare with the stored comparable evidence?', selectedFinding)}>Compare this album</button>{:else}<button type="button" disabled={!selectedFinding} onclick={() => selectedFinding && void ask('Where should I inspect the selected site section next?', selectedFinding)}>Inspect this section</button>{/if}
					</div>
					{#if effectiveOwner}
						<form class="question-form" onsubmit={(event) => { event.preventDefault(); const text = question.trim(); if (text) void ask(text); }}>
							<label for={`${kind}-question`}>Ask about this report</label>
							<textarea id={`${kind}-question`} bind:value={question} maxlength="500" placeholder="Ask about this evidence, not raw visitor records." disabled={answerLoading}></textarea>
							<button type="submit" disabled={!question.trim() || answerLoading}>{answerLoading ? 'Working…' : 'Ask owner question'}</button>
						</form>
					{:else}
						<p class="auth-note">Sign in as the owner to ask free-text questions or record an action. Public reports still show the visible aggregate evidence.</p>
					{/if}
					{#if answerLoading}<p class="state">Checking the bounded report operation… <button type="button" onclick={cancelAnswer}>Cancel</button></p>{/if}
					{#if answerError}<p class="answer-error" role="alert">{answerError}</p>{/if}
					{#if answer}
						<div class="answer"><p class="answer-status">{answer.status.replaceAll('_', ' ')}</p><p>{answer.summary}</p><p class="scope"><strong>Answer scope:</strong> {scopeLabel(answer.scope)}</p>{#if scopeChanged}<button type="button" onclick={() => void ask(answer.question, selectedFinding)}>Filters changed. Rerun for this scope.</button>{/if}<p class="evidence">Calculated: {formatTime(answer.generatedAt)}</p>{#if answer.evidenceLinks.length}<p class="links">{#each answer.evidenceLinks as href}<a href={href}>Open exact evidence</a>{/each}</p>{/if}{#if answer.limitations.length}<ul>{#each answer.limitations as limitation}<li>{limitation}</li>{/each}</ul>{/if}</div>
					{/if}
				</aside>
			</div>
		{:else}
			<div class="state"><strong>No actionable findings for this scope</strong><p>This is not a zero-activity claim. It can mean the saved evidence is sparse, suppressed, or has no supported action yet.</p></div>
		{/if}

		{#if report.briefs.length}<section class="briefs" aria-labelledby={`${kind}-briefs-heading`}><div><p class="kicker">Scheduled briefs</p><h3 id={`${kind}-briefs-heading`}>Daily and weekly review</h3></div><div class="brief-list">{#each report.briefs as brief}<article><strong>{brief.title ?? 'Stored brief'}</strong><span>{brief.period ?? brief.status ?? 'Period not supplied'}</span><p>{brief.summary ?? 'No brief summary was supplied. This does not imply zero activity.'}</p></article>{/each}</div></section>{/if}
	{/if}

	{#if actionMode && actionFinding}
		<section class="action-sheet" aria-labelledby="action-sheet-title">
			<div class="action-sheet-heading"><div><p class="kicker">Private action record</p><h3 id="action-sheet-title">{actionMode === 'record' ? 'Record what changed' : actionMode === 'dismiss' ? 'Dismiss this suggestion' : 'Snooze this suggestion'}</h3><p>{actionFinding.title}</p></div><button type="button" onclick={() => { actionMode = null; actionError = null; }}>Close</button></div>
			{#if !effectiveOwner}<p class="auth-note">Owner verification is required because this changes private action history. The public report remains available without it.</p>
			{:else if actionMode === 'record'}<form onsubmit={(event) => { event.preventDefault(); void submitAction('record', event.currentTarget as HTMLFormElement); }}><label>Actual action time<input name="actualAt" type="datetime-local" required /></label><label>What do you expect to change?<input name="hypothesis" maxlength="280" required /></label><label>Primary measure<select name="primaryMeasure" required><option value="">Choose a measure</option><option value="album_opens">Album opens</option><option value="photo_opens">Photo opens</option><option value="download_requests">Download requests</option><option value="favorites">Favorite additions</option><option value="contact_link_clicks">Contact-link clicks</option></select></label><label>Follow up on<input name="followUpAt" type="date" required /></label><label>Private note (optional)<textarea name="note" maxlength="500"></textarea></label><button type="submit">Record action</button></form>
			{:else if actionMode === 'dismiss'}<form onsubmit={(event) => { event.preventDefault(); void submitAction('dismiss', event.currentTarget as HTMLFormElement); }}><label>Why is this not useful now?<input name="note" maxlength="280" required /></label><button type="submit">Dismiss suggestion</button></form>
			{:else}<form onsubmit={(event) => { event.preventDefault(); void submitAction('snooze', event.currentTarget as HTMLFormElement); }}><label>Review again on<input name="followUpAt" type="date" required /></label><label>Note (optional)<input name="note" maxlength="280" /></label><button type="submit">Snooze suggestion</button></form>{/if}
			{#if actionError}<p class="answer-error" role="alert">{actionError}</p>{/if}{#if actionMessage}<p class="action-message">{actionMessage}</p>{/if}
			{#if effectiveOwner}<div class="secondary-actions"><button type="button" onclick={() => { actionMode = 'dismiss'; }}>Dismiss</button><button type="button" onclick={() => { actionMode = 'snooze'; }}>Snooze</button><button type="button" onclick={() => void submitAction('undo')}>Undo latest action</button></div>{/if}
		</section>
	{/if}
</section>

<style>
	.intelligence { margin-top: 1.25rem; border-top: 1px solid #d8e0ea; padding-top: 1.25rem; color: #172033; }
	.heading, .finding-topline, .finding-actions, .pager, .action-sheet-heading, .secondary-actions { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
	.heading { align-items: end; }
	.kicker { color: #174ea6; font-size: .68rem; font-weight: 800; letter-spacing: .07em; margin: 0 0 .35rem; text-transform: uppercase; }
	h2, h3, p { margin-top: 0; }
	h2 { font-size: 1.2rem; letter-spacing: -.02em; margin-bottom: .3rem; }
	h3 { font-size: 1rem; line-height: 1.3; margin-bottom: .45rem; }
	.heading > div > p:last-child, .inspector-copy, .scope, .freshness, .evidence, .auth-note { color: #526176; font-size: .78rem; line-height: 1.5; }
	.freshness { margin: 0; text-align: right; }
	.scope { margin: .8rem 0; }
	.content-grid { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1.35fr) minmax(17rem, .8fr); align-items: start; }
	.finding-list { display: grid; gap: .65rem; }
	.finding, .inspector, .briefs, .state, .action-sheet { background: #fff; border: 1px solid #d8e0ea; border-radius: .75rem; padding: 1rem; }
	.finding.selected { border-color: #1769e0; box-shadow: inset 3px 0 #1769e0; }
	.finding-topline { color: #64758a; font-size: .7rem; text-transform: capitalize; }
	.finding-topline span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.finding p { color: #384b66; font-size: .84rem; line-height: 1.5; }
	.proposal { color: #172033 !important; }
	.evidence { margin: .5rem 0 0; }
	button, .finding-actions a { border: 1px solid #b8c8dc; border-radius: .45rem; background: #fff; color: #174ea6; cursor: pointer; font: inherit; font-size: .78rem; font-weight: 700; padding: .5rem .65rem; text-decoration: none; }
	button:hover, button:focus-visible, .finding-actions a:hover, .finding-actions a:focus-visible { border-color: #1769e0; background: #edf5ff; }
	button:disabled { cursor: not-allowed; opacity: .55; }
	button:focus-visible, a:focus-visible, textarea:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #1769e0; outline-offset: 2px; }
	.finding-actions { justify-content: start; flex-wrap: wrap; margin-top: .85rem; }
	.inspector { position: sticky; top: 1rem; background: #f4f7fb; }
	.presets { display: flex; flex-wrap: wrap; gap: .45rem; margin: .8rem 0; }
	.question-form, .action-sheet form { display: grid; gap: .6rem; margin-top: .9rem; }
	.question-form label, .action-sheet label { display: grid; color: #33445c; font-size: .78rem; font-weight: 700; gap: .35rem; }
	textarea, input, select { border: 1px solid #b8c8dc; border-radius: .45rem; background: #fff; color: #172033; font: inherit; min-height: 2.45rem; padding: .55rem .65rem; }
	textarea { min-height: 5rem; resize: vertical; }
	.question-form button, .action-sheet form button { background: #1769e0; border-color: #1769e0; color: #fff; }
	.answer { border-top: 1px solid #d8e0ea; margin-top: .9rem; padding-top: .9rem; }
	.answer-status { color: #174ea6; font-size: .72rem; font-weight: 800; text-transform: capitalize; }
	.answer ul { color: #526176; font-size: .77rem; line-height: 1.45; margin: .65rem 0 0; padding-left: 1.1rem; }
	.links { display: grid; gap: .35rem; margin: .65rem 0 0; }
	.links a { color: #174ea6; font-size: .78rem; font-weight: 700; }
	.state { color: #526176; font-size: .84rem; line-height: 1.5; }
	.state p { margin: .3rem 0 0; }
	.unavailable { border-color: #dba6a6; }
	.answer-error { color: #a42424; font-size: .8rem; line-height: 1.45; }
	.pager { border-top: 1px solid #d8e0ea; color: #526176; font-size: .78rem; padding-top: .8rem; }
	.pager div { display: flex; gap: .4rem; }
	.briefs { display: grid; gap: .8rem; grid-template-columns: minmax(12rem, .45fr) minmax(0, 1fr); margin-top: 1rem; }
	.actions-review { align-items: start; background: #eef5ff; border-left: 3px solid #6195df; color: #384b66; display: flex; font-size: .78rem; gap: 1rem; justify-content: space-between; line-height: 1.5; margin: .9rem 0; padding: .75rem .85rem; }
	.actions-review p { margin: 0; }
	.brief-list { display: grid; gap: .5rem; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); }
	.brief-list article { border-left: 2px solid #91b7ee; padding-left: .7rem; }
	.brief-list strong, .brief-list span { display: block; }
	.brief-list span { color: #64758a; font-size: .72rem; margin-top: .15rem; }
	.brief-list p { color: #526176; font-size: .78rem; line-height: 1.45; margin: .4rem 0 0; }
	.action-sheet { border-color: #9ebce8; margin-top: 1rem; max-width: 44rem; }
	.action-sheet-heading { align-items: start; }
	.action-sheet-heading p { color: #526176; font-size: .82rem; margin-bottom: 0; }
	.action-message { color: #195b33; font-size: .82rem; margin: .75rem 0 0; }
	.secondary-actions { justify-content: start; flex-wrap: wrap; margin-top: 1rem; }
	@media (max-width: 900px) { .content-grid, .briefs { grid-template-columns: 1fr; } .inspector { position: static; } }
	@media (max-width: 600px) { .heading, .actions-review { align-items: start; flex-direction: column; } .freshness { text-align: left; } .finding-actions button, .finding-actions a { flex: 1 1 auto; text-align: center; } }
</style>
