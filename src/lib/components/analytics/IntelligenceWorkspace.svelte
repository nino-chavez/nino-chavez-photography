<script lang="ts">
	import { tick, untrack } from 'svelte';
	import ReportingSettings from './ReportingSettings.svelte';
	import PrivateIntelligenceControls from './PrivateIntelligenceControls.svelte';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { intelligenceEvidenceHref } from '$lib/analytics/report-paths';
	import type { IntelligencePreferences } from '$lib/analytics/intelligence-preferences';
	import {
		parseIntelligenceScope,
		type AssistantAnswer,
		type Finding,
		type FindingEvidence,
		type IntelligenceAction,
		type IntelligenceReport,
		type IntelligenceBriefSourceWindow,
		type IntelligenceScope
	} from '$lib/analytics/intelligence-contract';

	interface Props {
		scope: IntelligenceScope;
		/** Server-validated owner authorization. It is never inferred in this component. */
		owner: boolean;
		kind: 'gallery' | 'sites';
		contextTarget?: Finding['target'] | null;
		class?: string;
		/** Where the sign-in link returns to. Defaults to the report this panel belongs to. */
		signInNext?: string;
		/** A page button that wants the record-an-actual-change form open: raise this number to ask for it. */
		recordRequest?: number;
		/** Show only the owner's private record form and settings. For a scope that has no saved calculation to read. */
		recordOnly?: boolean;
	}
	let { scope, owner, kind, contextTarget = null, class: className = '', signInNext, recordRequest = 0, recordOnly = false }: Props = $props();
	const ownerSignInHref = $derived(`${base}/login?next=${encodeURIComponent(signInNext ?? (kind === 'sites' ? '/analytics/sites' : '/analytics/operator'))}`);

	type ActionMode = 'record' | 'dismiss' | 'snooze' | null;
	type PollResponse = { status: 'pending' | 'complete' | 'unavailable'; answer: AssistantAnswer | null };
	type PendingPoll = { requestId: string; scopeKey: string; startedAt: number; attempt: number };
	type ActionRecord = IntelligenceAction & {
		publicTarget?: Finding['target'] | null;
		changeType?: string | null;
		channel?: string | null;
		campaign?: string | null;
		release?: string | null;
		variant?: string | null;
		coarseOutcome?: string | null;
		outcome?: string | null;
		outcomeCount?: number | null;
		observationDays?: number | null;
	};
	type BriefRecord = IntelligenceReport['briefs'][number] & {
		title?: string | null;
		body?: string | null;
		findingRefs?: string[];
		findings?: Finding[];
		snapshotHref?: string | null;
	};

	const endpoint = `${base}/api/analytics/intelligence`;
	const firstViewportLimit = 3;
	const firstBriefLimit = 3;
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
	let pendingPoll = $state<PendingPoll | null>(null);
	let pollingPaused = $state(false);
	let actionFinding = $state<Finding | null>(null);
	let actionMode = $state<ActionMode>(null);
	let actionMessage = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let expandedHistory = $state(false);
	let expandedBriefs = $state(false);
	let preferences = $state<IntelligencePreferences | null>(null);
	let settings = $state<{ reload: () => Promise<void> }>();
	let refreshMessage = $state<string | null>(null);
	let refreshLoading = $state(false);
	let reportAbort: AbortController | null = null;
	let answerAbort: AbortController | null = null;
	let pollTimer: ReturnType<typeof setTimeout> | null = null;
	let reportRequestVersion = 0;
	let answerRequestVersion = 0;

	const validatedScope = $derived(parseIntelligenceScope(scope));
	const scopeKey = $derived(validatedScope ? JSON.stringify(validatedScope) : '');
	const answerScopeKey = $derived(answer ? JSON.stringify(answer.scope) : '');
	const scopeChanged = $derived(answer !== null && scopeKey !== answerScopeKey);
	const visibleFindings = $derived(expandedFindings ? (report?.findings ?? []) : (report?.findings ?? []).slice(0, firstViewportLimit));
	const actions = $derived((report?.actions ?? []) as ActionRecord[]);
	const requestedSnapshot = $derived(page.url.searchParams.get('intelligence_snapshot'));
	const briefs = $derived((report?.briefs ?? []) as BriefRecord[]);
	const visibleBriefs = $derived(expandedBriefs ? briefs : briefs.slice(0, firstBriefLimit));
	const visibleActions = $derived(expandedHistory ? actions : actions.slice(0, 5));
	const contextLabel = $derived(targetLabel(contextTarget));

	function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
	function validWindow(value: unknown): value is { start: string; end: string } { return object(value) && typeof value.start === 'string' && typeof value.end === 'string'; }
	function safeHref(value: unknown): value is string {
		return typeof value === 'string' && intelligenceEvidenceHref(page.url.hostname, value) !== null;
	}
	function savedSourceHref(window: IntelligenceBriefSourceWindow) {
		if (!window.snapshotId) return null;
		const params = new URLSearchParams({ intelligence_snapshot: window.snapshotId });
		if (window.scope.kind === 'sites') { params.set('period', String(window.scope.period)); params.set('section', window.scope.section); return evidenceHref(`/photography/analytics/sites?${params}`); }
		if (window.scope.kind === 'launch') return window.scope.albumKey ? evidenceHref(`/analytics/albums/${window.scope.albumKey}`) : null;
		for (const [key,value] of Object.entries(window.scope.query)) { if (value !== undefined) params.set(({albumKeys:'albums',compareStart:'compare_start',compareEnd:'compare_end',eventDate:'event_date',albumEventType:'event_type'} as Record<string,string>)[key] ?? key, Array.isArray(value) ? value.join(',') : String(value)); }
		params.set('period','custom'); return evidenceHref(`/analytics/operator?${params}`);
	}
	function evidenceHref(value: string) { return intelligenceEvidenceHref(page.url.hostname, value) ?? '#'; }
	function validEvidence(value: unknown): value is FindingEvidence {
		return object(value) && object(value.windows) && validWindow(value.windows.current)
			&& (value.windows.previous === undefined || value.windows.previous === null || validWindow(value.windows.previous))
			&& (typeof value.cutoff === 'string' || value.cutoff === null)
			&& ['complete', 'partial', 'unavailable'].includes(String(value.coverage)) && typeof value.units === 'string'
			&& ['strong', 'exploratory', 'limited'].includes(String(value.strength));
	}
	function validTarget(value: unknown): value is Finding['target'] {
		return object(value) && ['gallery', 'album', 'photo', 'site', 'page'].includes(String(value.kind))
			&& (value.id === undefined || value.id === null || typeof value.id === 'string')
			&& (value.albumKey === undefined || value.albumKey === null || typeof value.albumKey === 'string');
	}
	function validFinding(value: unknown): value is Finding {
		return object(value) && typeof value.id === 'string' && typeof value.rule === 'string' && validTarget(value.target)
			&& typeof value.title === 'string' && typeof value.explanation === 'string' && typeof value.action === 'string'
			&& safeHref(value.reportHref) && ['open', 'dismissed', 'snoozed', 'recorded', 'recovered', 'acknowledged'].includes(String(value.status)) && validEvidence(value.evidence)
			&& (value.evidenceLinks === undefined || (Array.isArray(value.evidenceLinks) && value.evidenceLinks.every(safeHref)));
	}
	function validAction(value: unknown): value is IntelligenceAction {
		return object(value) && typeof value.id === 'string' && ['record', 'dismiss', 'snooze', 'undo'].includes(String(value.kind))
			&& typeof value.createdAt === 'string' && (value.target === undefined || value.target === null || validTarget(value.target));
	}
	function validBriefSourceWindow(value: unknown): boolean {
		return object(value) && !!parseIntelligenceScope(value.scope) && (typeof value.cutoff === 'string' || value.cutoff === null)
			&& typeof value.timezone === 'string' && value.timezone.length > 0
			&& (value.current === undefined || value.current === null || validWindow(value.current))
			&& (value.previous === undefined || value.previous === null || validWindow(value.previous));
	}
	function validSuppression(value: unknown): boolean {
		return object(value) && typeof value.rule === 'string' && typeof value.reason === 'string'
			&& (value.target === undefined || validTarget(value.target));
	}
	function validBrief(value: unknown): value is BriefRecord {
		return object(value) && typeof value.id === 'string' && typeof value.periodKey === 'string' && typeof value.createdAt === 'string'
			&& ['daily', 'weekly', 'operational'].includes(String(value.kind))
			&& (value.title === undefined || value.title === null || typeof value.title === 'string')
			&& (value.body === undefined || value.body === null || typeof value.body === 'string')
			&& (value.snapshotHref === undefined || value.snapshotHref === null || safeHref(value.snapshotHref))
			&& (value.findings === undefined || (Array.isArray(value.findings) && value.findings.every(validFinding)))
			&& (value.sourceWindows === undefined || (Array.isArray(value.sourceWindows) && value.sourceWindows.every(validBriefSourceWindow)))
			&& (value.suppressions === undefined || (Array.isArray(value.suppressions) && value.suppressions.every(validSuppression)))
			&& (value.late === undefined || typeof value.late === 'boolean');
	}
	function validReport(value: unknown): value is IntelligenceReport {
		return object(value) && !!parseIntelligenceScope(value.scope) && typeof value.generatedAt === 'string'
			&& (typeof value.cutoff === 'string' || value.cutoff === null) && ['complete', 'partial', 'unavailable'].includes(String(value.coverage))
			&& Array.isArray(value.findings) && value.findings.every(validFinding) && Array.isArray(value.suppressions)
			&& value.suppressions.every(validSuppression)
			&& Array.isArray(value.actions) && value.actions.every(validAction) && Array.isArray(value.briefs) && value.briefs.every(validBrief)
			&& Number.isInteger(value.page) && Number.isInteger(value.pageCount)
			&& (value.briefsPage === undefined || Number.isInteger(value.briefsPage))
			&& (value.briefsPageCount === undefined || Number.isInteger(value.briefsPageCount))
			&& typeof value.owner === 'boolean';
	}
	function validAnswer(value: unknown): value is AssistantAnswer {
		return object(value) && !!parseIntelligenceScope(value.scope) && typeof value.question === 'string' && typeof value.operation === 'string'
			&& ['complete', 'pending', 'unavailable', 'unsupported'].includes(String(value.status)) && typeof value.summary === 'string'
			&& Array.isArray(value.findings) && value.findings.every(validFinding) && Array.isArray(value.evidenceLinks) && value.evidenceLinks.every(safeHref)
			&& Array.isArray(value.limitations) && value.limitations.every((limit) => typeof limit === 'string') && typeof value.generatedAt === 'string'
			&& (value.requestId === undefined || typeof value.requestId === 'string')
			&& (value.comparison === undefined || validComparison(value.comparison));
	}
	function validComparison(value: unknown): boolean {
		if (!object(value) || typeof value.available !== 'boolean' || !Array.isArray(value.criteria) || !value.criteria.every((v) => typeof v === 'string')) return false;
		const validRow = (v: unknown) => object(v) && typeof v.albumKey === 'string' && safeHref(v.href) && ['current', 'previous'].every((key) => v[key] === null || (typeof v[key] === 'number' && Number.isFinite(v[key]) && Number(v[key]) >= 0));
		return (value.target === undefined || validRow(value.target)) && (value.peers === undefined || (Array.isArray(value.peers) && value.peers.length <= 25 && value.peers.every(validRow)));
	}
	function validPollResponse(value: unknown): value is PollResponse { return object(value) && ['pending', 'complete', 'unavailable'].includes(String(value.status)) && (value.answer === null || validAnswer(value.answer)); }
	function number(value: number | undefined) { return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : 'Not supplied'; }
	function formatTime(value: string | null | undefined) {
		if (!value || Number.isNaN(Date.parse(value))) return 'Not supplied';
		return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago', timeZoneName: 'short' }).format(new Date(value));
	}
	function targetLabel(target: Finding['target'] | null | undefined) {
		if (!target) return 'Report scope';
		if (target.albumKey) return `Album ${target.albumKey}`;
		if (target.id) return target.kind === 'page' ? target.id : `${target.kind} ${target.id}`;
		return target.kind;
	}
	function actionTarget(action: ActionRecord) { return action.publicTarget ?? action.target; }
	function scopeLabel(value: IntelligenceScope) {
		if (value.kind === 'sites') return `Sites · ${value.period} days · ${value.section}`;
		if (value.kind === 'launch') return value.albumKey ? `Launch · album ${value.albumKey}` : 'Launches · every recent album';
		return `Gallery · ${value.query.start} to ${value.query.end} · ${value.query.traffic} traffic`;
	}
	function evidenceWindows(evidence: FindingEvidence) {
		const current = `Current: ${evidence.windows.current.start} to ${evidence.windows.current.end}`;
		return evidence.windows.previous ? `${current}. Previous: ${evidence.windows.previous.start} to ${evidence.windows.previous.end}` : current;
	}
	function briefWindowLabel(window: { start: string; end: string } | null | undefined) {
		return window ? `${window.start} to ${window.end}` : 'Not stored';
	}
	function isOperational(finding: Finding | null) {return !!finding && (finding.rule==='collection_health' || finding.rule==='rendering_download_reliability' && finding.id!=='download-unknown-terminal');}
	function findingLimitations(finding: Finding) { return report?.suppressions.filter((item) => item.rule === finding.rule).map((item) => item.reason) ?? []; }
	function sameTarget(left: Finding['target'] | null | undefined, right: Finding['target'] | null | undefined) { return left?.kind === right?.kind && left?.id === right?.id && left?.albumKey === right?.albumKey; }
	function actionsForFinding(finding: Finding) { return actions.filter((item) => item.findingId === finding.id && item.kind === 'record'); }
	function followUpFor(action: ActionRecord) { return report?.findings.find((finding) => finding.rule === 'follow_up' && sameTarget(finding.target, actionTarget(action))) ?? null; }
	function followUpState(action: ActionRecord) {
		const finding = followUpFor(action);
		if (finding) return `Result: ${finding.explanation}`;
		if (!action.followUpAt) return 'Follow-up not scheduled';
		if (Date.parse(action.followUpAt) > Date.now()) return `Pending until ${formatTime(action.followUpAt)}`;
		if (action.followUpStatus === 'inconclusive') return 'Inconclusive: the before or after window lacks complete evidence.';
		if (action.followUp) { const f = action.followUp; return `${f.before.toLocaleString()} before (${f.window.before.start} to ${f.window.before.end}); ${f.after.toLocaleString()} after (${f.window.after.start} to ${f.window.after.end}). ${f.concurrentChanges ? `${f.concurrentChanges} overlapping changes prevent attribution.` : 'Observed difference only; this does not establish cause.'}`; }
		return 'Ready to check; the saved evidence has not returned a result yet.';
	}
	function briefFindings(brief: BriefRecord) {
		if (brief.findings) return brief.findings;
		if (!brief.findingRefs) return [];
		return (report?.findings ?? []).filter((finding) => brief.findingRefs?.includes(finding.id));
	}
	function questionScope() {
		if (!validatedScope || validatedScope.kind !== 'gallery' || contextTarget?.kind !== 'album' || !contextTarget.albumKey) return validatedScope;
		return { kind: 'gallery' as const, query: { ...validatedScope.query, scope: 'album' as const, albumKeys: [contextTarget.albumKey] } };
	}
	function localExplanation(finding: Finding, questionText: string): AssistantAnswer {
		return { scope: questionScope() ?? validatedScope!, question: questionText, operation: 'public_finding_explanation', status: 'complete', summary: `${finding.explanation} ${finding.action}`, findings: [finding], evidenceLinks: [finding.reportHref, ...(finding.evidenceLinks ?? [])], limitations: ['This explains the visible public aggregate finding only. It does not run a new calculation or reveal private records.'], generatedAt: new Date().toISOString() };
	}
	async function json(response: Response): Promise<unknown> { try { return await response.json(); } catch { return null; } }
	function stopPolling() { if (pollTimer) clearTimeout(pollTimer); pollTimer = null; pendingPoll = null; }
	function schedulePoll(poll: PendingPoll) {
		if (pendingPoll?.requestId !== poll.requestId || pendingPoll.scopeKey !== poll.scopeKey) return;
		pollTimer = setTimeout(() => void pollAnswer(), Math.min(maximumPollDelayMs, initialPollMs * 2 ** poll.attempt));
	}
	async function loadReport(page = 0, actionsPage = report?.actionsPage ?? 0, briefsPage = report?.briefsPage ?? 0) {
		if (recordOnly) { loading = false; return; }
		if (!validatedScope) { reportError = 'This report has an invalid scope.'; loading = false; return; }
		reportAbort?.abort(); const controller = new AbortController(); reportAbort = controller; const version = ++reportRequestVersion;
		loading = true; reportError = null;
		try {
			const params = new URLSearchParams({ scope: scopeKey, page: String(page), actionsPage: String(actionsPage), briefsPage: String(briefsPage) });
			const savedId = requestedSnapshot;
			if (savedId) params.set('snapshotId', savedId);
			const response = await fetch(`${endpoint}?${params}`, { signal: controller.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
			const payload = await json(response); if (!response.ok || !validReport(payload)) throw new Error('report');
			if (version !== reportRequestVersion) return;
			report = payload; currentPage = payload.page; expandedFindings = false; expandedBriefs = false;
			if (!selectedFinding || !payload.findings.some((finding) => finding.id === selectedFinding?.id)) selectedFinding = payload.findings[0] ?? null;
		} catch {
			if (!controller.signal.aborted && version === reportRequestVersion) { report = null; reportError = 'Saved intelligence is unavailable right now. The rest of this report is still usable.'; }
		} finally { if (version === reportRequestVersion) loading = false; }
	}
	async function queueReport() {
		if (!owner || !validatedScope || refreshLoading) return; refreshLoading = true; refreshMessage = null;
		try { const response = await fetch(`${endpoint}/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scope: validatedScope }) }); if (!response.ok) throw new Error('queue'); refreshMessage = 'Calculation queued for this exact scope. The scheduled worker will prepare it; use Try again to read the result.'; }
		catch { refreshMessage = 'This calculation could not be queued. Your filters and saved reports are unchanged.'; }
		finally { refreshLoading = false; }
	}
	async function ask(questionText: string, finding: Finding | null = selectedFinding) {
		const frozenScope = questionScope(); if (!frozenScope) { answerError = 'This report has an invalid scope.'; return; }
		const cleanQuestion = questionText.trim(); if (!cleanQuestion) return; answerError = null; pollingPaused = false;
		if (!owner) { if (finding) answer = localExplanation(finding, cleanQuestion); else answerError = 'Public reports can explain a visible finding. Verified owner access is required for a new question.'; return; }
		if (answer && scopeChanged) previousAnswer = answer;
		answerAbort?.abort(); stopPolling(); const controller = new AbortController(); answerAbort = controller; const version = ++answerRequestVersion; answerLoading = true;
		try {
			const response = await fetch(endpoint, { method: 'POST', signal: controller.signal, cache: 'no-store', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ scope: frozenScope, question: cleanQuestion }) });
			const payload = await json(response); if (!response.ok || !validAnswer(payload)) throw new Error('answer');
			if (controller.signal.aborted || version !== answerRequestVersion) return; answer = payload;
			if (payload.status === 'pending' && payload.requestId) { pendingPoll = { requestId: payload.requestId, scopeKey: JSON.stringify(frozenScope), startedAt: Date.now(), attempt: 0 }; schedulePoll(pendingPoll); }
		} catch { if (!controller.signal.aborted && version === answerRequestVersion) answerError = 'The assistant could not complete that request. The saved report is unchanged.'; }
		finally { if (!controller.signal.aborted && version === answerRequestVersion) answerLoading = false; }
	}
	async function pollAnswer() {
		const poll = pendingPoll; if (!poll || !owner || !validatedScope || poll.scopeKey !== JSON.stringify(questionScope())) return;
		if (Date.now() - poll.startedAt > maximumPollMs) {
			stopPolling(); pollingPaused = true; answerLoading = false;
			if (answer) answer = { ...answer, status: 'pending', summary: 'This calculation is still queued for the captured report scope. It has not failed; check its status when the next reporting job has had time to run.' };
			return;
		}
		answerAbort?.abort(); const controller = new AbortController(); answerAbort = controller; const version = ++answerRequestVersion; answerLoading = true;
		try {
			const params = new URLSearchParams({ scope: poll.scopeKey, requestId: poll.requestId }); const response = await fetch(`${endpoint}?${params}`, { signal: controller.signal, headers: { accept: 'application/json' }, cache: 'no-store' });
			const payload = await json(response); if (!response.ok || !validPollResponse(payload)) throw new Error('poll');
			if (controller.signal.aborted || version !== answerRequestVersion || pendingPoll?.requestId !== poll.requestId) return;
			if (payload.status === 'pending') { if (answer) answer = { ...answer, status: 'pending', summary: 'This calculation is still running against the captured report scope.' }; pendingPoll = { ...poll, attempt: poll.attempt + 1 }; schedulePoll(pendingPoll); return; }
			stopPolling(); if (payload.status === 'complete' && payload.answer) answer = payload.answer;
			else if (answer) answer = { ...answer, status: 'unavailable', summary: 'The saved evidence cannot complete this request safely.', limitations: ['The bounded calculation did not return a usable answer.'] };
		} catch { if (!controller.signal.aborted && version === answerRequestVersion) { stopPolling(); answerError = 'The assistant status could not be checked. The saved report is unchanged.'; } }
		finally { if (!controller.signal.aborted && version === answerRequestVersion) answerLoading = false; }
	}
	function cancelAnswer() { answerAbort?.abort(); stopPolling(); answerLoading = false; pollingPaused = false; answerError = 'Request check cancelled. The server request, saved report, and any prior answer are unchanged.'; }
	function targetFromForm(fields: FormData): Finding['target'] | null {
		const kind = fields.get('targetKind'); const value = typeof fields.get('targetValue') === 'string' ? String(fields.get('targetValue')).trim() : '';
		if (!value && contextTarget) return contextTarget;
		if (kind === 'album' && value && value.length <= 180) return { kind, albumKey: value };
		if (kind === 'photo' && value && value.length <= 180) return { kind, id: value };
		if (kind === 'page' && safeHref(value)) return { kind, id: value };
		return null;
	}
	async function submitAction(kind: Exclude<IntelligenceAction['kind'], 'undo'>, form: HTMLFormElement) {
		if (!owner || !validatedScope) { actionError = 'Verified owner access is required for private action history.'; return; }
		if (!preferences || preferences.retention === 'undecided') { actionError = 'Choose private record retention in Reporting settings before saving a private action.'; return; }
		actionMessage = null; actionError = null; const fields = new FormData(form); const payload: Record<string, unknown> = { scope: validatedScope, kind };
		if (actionFinding) payload.findingId = actionFinding.id;
		if (kind === 'record') {
			const publicTarget = targetFromForm(fields); const actualAt = fields.get('actualAt'); const hypothesis = fields.get('hypothesis'); const primaryMeasure = fields.get('primaryMeasure'); const observationDays = Number(fields.get('observationDays'));
			if (!publicTarget || typeof actualAt !== 'string' || Number.isNaN(Date.parse(actualAt)) || typeof hypothesis !== 'string' || !hypothesis.trim() || typeof primaryMeasure !== 'string' || !primaryMeasure || ![7, 14, 30, 90].includes(observationDays)) { actionError = 'Choose a valid target, action time, hypothesis, primary measure, and observation window.'; return; }
			if (!actionFinding) payload.publicTarget = publicTarget;
			payload.actualAt = new Date(actualAt).toISOString(); payload.hypothesis = hypothesis.trim(); payload.primaryMeasure = primaryMeasure; payload.observationDays = observationDays;
			const outcomeCount = fields.get('outcomeCount'); if (typeof outcomeCount === 'string' && outcomeCount.trim()) { const count = Number(outcomeCount); if (!Number.isSafeInteger(count) || count < 0 || count > 100000) { actionError = 'Enter a whole outcome count from zero to 100,000.'; return; } payload.outcomeCount = count; }
			for (const key of ['changeType', 'channel', 'campaign', 'release', 'variant', 'outcome', 'note']) { const value = fields.get(key); if (typeof value === 'string' && value.trim()) payload[key] = value.trim(); }
		} else {
			if (!actionFinding) { actionError = 'Dismissal and snooze apply to a visible suggestion. Record an actual change for a standalone record.'; return; }
			const note = fields.get('note'); if (typeof note !== 'string' || !note.trim()) { actionError = 'Add a private reason before saving.'; return; } payload.note = note.trim();
		}
		try {
			const response = await fetch(`${endpoint}/actions`, { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(payload) });
			if (!response.ok) throw new Error('action');
			actionMessage = kind === 'record' ? 'Actual change recorded. Its declared outcome remains pending until the follow-up evidence is ready.' : kind === 'dismiss' ? 'Suggestion dismissed with a private reason.' : 'Suggestion snoozed with a private reason.';
			actionMode = null; void loadReport(currentPage);
		} catch { actionError = 'The action could not be saved. No private history was changed.'; }
	}
	async function reverseAction(action: ActionRecord) {
		if (!owner || !validatedScope) { actionError = 'Verified owner access is required for private action history.'; return; }
		actionError = null;
		try { const response = await fetch(`${endpoint}/actions`, { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ scope: validatedScope, kind: 'undo', actionId: action.id }) }); if (!response.ok) throw new Error('undo'); actionMessage = 'Action reversal recorded for this history row.'; void loadReport(currentPage); }
		catch { actionError = 'The action reversal could not be saved. Private history is unchanged.'; }
	}

	// A request from the page to open the private record form. Only the owner has one; the effect below closes it again when the scope changes.
	let handledRecordRequest = 0;
	$effect(() => {
		const requested = recordRequest;
		untrack(() => {
			if (requested > handledRecordRequest && owner) {
				handledRecordRequest = requested; actionFinding = null; actionMode = 'record';
				void tick().then(() => document.getElementById('action-sheet-title')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
			}
		});
	});

	$effect(() => {
		scopeKey; requestedSnapshot; selectedFinding = null; actionFinding = null; actionMode = null; expandedFindings = false; expandedHistory = false; expandedBriefs = false; untrack(() => { stopPolling(); answerAbort?.abort(); void loadReport(0, 0, 0); });
		return () => { reportAbort?.abort(); answerAbort?.abort(); stopPolling(); };
	});
</script>

<section class={`intelligence ${className}`} aria-labelledby={recordOnly ? undefined : `${kind}-intelligence-heading`} aria-label={recordOnly ? 'Record what you did' : undefined}>
	{#if !recordOnly}
	<div class="heading">
		<div><p class="kicker">Report intelligence</p><h2 id={`${kind}-intelligence-heading`}>Worth your attention</h2>{#if requestedSnapshot}<p class="context-note">You are reading saved evidence. The cutoff below belongs to that saved calculation.</p>{/if}<p>Short evidence-led observations for this report. They do not rate photographic quality or prove a business result.</p></div>
		{#if report && !requestedSnapshot && Date.now()-Date.parse(report.checkedAt ?? report.generatedAt)>30*60_000}<p class="context-note">This saved calculation is more than 30 minutes old. Check its cutoff and refresh before acting on a new change.</p>{/if}
		{#if report}<p class="freshness">Cutoff: {formatTime(report.cutoff)}<br />Saved: {formatTime(report.generatedAt)}{#if report.checkedAt && report.checkedAt !== report.generatedAt}<br />Checked unchanged: {formatTime(report.checkedAt)}{/if}</p>{/if}
	</div>
	{/if}

	{#if owner && (!recordOnly || actionMode)}
		<details class="reporting-settings" open={recordOnly || undefined}><summary>Reporting settings</summary><ReportingSettings {owner} bind:preferences bind:this={settings} id={kind} /></details>
	{:else if owner}
		<!-- not shown, but the saved retention is still read: saving a private action needs it -->
		<ReportingSettings {owner} bind:preferences bind:this={settings} visible={false} id={kind} />
	{/if}

	{#if recordOnly}
		<!-- no saved calculation exists for this scope: nothing to read, only the owner's record form below -->
	{:else if loading}
		<p class="state" role="status">Loading saved findings. The report above remains usable.</p>
	{:else if reportError}
		<div class="state unavailable" role="status"><strong>Intelligence is unavailable</strong><p>{reportError}</p><button type="button" onclick={() => void loadReport(currentPage)}>Try again</button>{#if owner}<button type="button" disabled={refreshLoading} onclick={() => void queueReport()}>Calculate this scope</button>{/if}{#if refreshMessage}<p role="status">{refreshMessage}</p>{/if}</div>
	{:else if report}
		<p class="scope"><strong>Scope:</strong> {scopeLabel(report.scope)} · Coverage: {report.coverage}</p>
		{#if contextTarget}<p class="context-note"><strong>Inspector context:</strong> {contextLabel}. This narrows an album question only when you explicitly ask it; it does not change the report.</p>{/if}
		<div class="actions-review"><div><p class="kicker">Actions to review</p><p>Record an actual change, dismiss a suggestion, or snooze it. Nothing here publishes a promotion, changes a cover, or sends a message.</p></div>{#if owner}<button type="button" onclick={() => { actionFinding = null; actionMode = 'record'; }}>Record a change</button>{:else}<p><a href={ownerSignInHref}>Sign in with a magic link</a> to use private history.</p>{/if}</div>

			<div class="content-grid">
				<div class="finding-list" aria-label="Prioritized findings">
					{#if report.findings.length}
					{#each visibleFindings as finding}
						<article class:selected={selectedFinding?.id === finding.id} class="finding">
							<div class="finding-topline"><span>{finding.severity === 'high' ? 'Repair first' : finding.severity === 'medium' ? 'Review next' : 'Consider'} · {finding.status.replaceAll('_', ' ')}</span><span>{targetLabel(finding.target)}</span></div><h3>{finding.title}</h3><p>{finding.explanation}</p><p class="proposal"><strong>Next step:</strong> {finding.action}</p>
							{#each actionsForFinding(finding) as item}<div class="follow-up"><p><strong>Recorded hypothesis:</strong> {item.hypothesis ?? 'Not supplied'}</p><p>{followUpState(item)}</p></div>{/each}
							<details class="evidence"><summary>Read exact evidence</summary><dl><div><dt>Window</dt><dd>{evidenceWindows(finding.evidence)}</dd></div><div><dt>Unit</dt><dd>{finding.evidence.units}</dd></div><div><dt>Coverage</dt><dd>{finding.evidence.coverage}</dd></div><div><dt>Strength</dt><dd>{finding.evidence.strength}</dd></div><div><dt>Current</dt><dd>{number(finding.evidence.current)}</dd></div><div><dt>Previous</dt><dd>{number(finding.evidence.previous)}</dd></div><div><dt>Numerator</dt><dd>{number(finding.evidence.numerator)}</dd></div><div><dt>Denominator</dt><dd>{number(finding.evidence.denominator)}</dd></div><div><dt>Cutoff</dt><dd>{formatTime(finding.evidence.cutoff)}</dd></div>{#if finding.evidence.eligibility}<div><dt>Eligible group</dt><dd>{finding.evidence.eligibility}</dd></div>{/if}</dl>{#if findingLimitations(finding).length}<p><strong>Limitations:</strong></p><ul>{#each findingLimitations(finding) as limitation}<li>{limitation}</li>{/each}</ul>{/if}<p class="links"><a href={evidenceHref(finding.reportHref)}>Open exact report evidence</a>{#each finding.evidenceLinks ?? [] as href}<a href={evidenceHref(href)}>Open linked evidence</a>{/each}</p></details>
							<div class="finding-actions"><button type="button" onclick={() => { selectedFinding = finding; void ask('Explain this finding using the captured report evidence.', finding); }}>Explain evidence</button><a href={evidenceHref(finding.reportHref)}>Open report</a>{#if owner}<button type="button" onclick={() => { actionFinding = finding; actionMode = 'record'; }}>I did this</button><button type="button" onclick={() => { actionFinding = finding; actionMode = 'dismiss'; }}>{isOperational(finding) ? 'Acknowledge' : 'Dismiss'}</button><button type="button" onclick={() => { actionFinding = finding; actionMode = 'snooze'; }}>Snooze</button>{:else}<button type="button" onclick={() => { selectedFinding = finding; answer = localExplanation(finding, 'Explain this finding using the captured report evidence.'); }}>Public explanation</button>{/if}</div>
						</article>
					{/each}
					{#if !expandedFindings && report.findings.length > firstViewportLimit}<nav class="pager" aria-label="Findings on this page"><span>Showing {firstViewportLimit} of {report.findings.length} findings on this page</span><button type="button" onclick={() => expandedFindings = true}>Show all on this page</button></nav>{/if}
					{#if expandedFindings && report.pageCount > 1}<nav class="pager" aria-label="All findings pages"><span>Page {report.page + 1} of {report.pageCount}</span><div>{#if report.page > 0}<button type="button" onclick={() => void loadReport((report?.page ?? 1) - 1)}>Previous</button>{/if}{#if report.page + 1 < report.pageCount}<button type="button" onclick={() => void loadReport((report?.page ?? 0) + 1)}>Next</button>{/if}</div></nav>{/if}
					{:else}<div class="state"><strong>No actionable findings for this scope</strong><p>The saved evidence does not support a recommendation yet. You can still inspect the report or ask a supported question.</p></div>{/if}
				</div>
				<aside class="inspector" aria-live="polite" aria-labelledby={`${kind}-assistant-heading`}>
					<p class="kicker">Contextual inspector</p><h3 id={`${kind}-assistant-heading`}>{selectedFinding ? selectedFinding.title : 'Inspect this report'}</h3><p class="inspector-copy">Answers keep their captured dates, filters, and traffic policy. Changing the page filters never rewrites an existing answer.</p>
					<div class="presets"><button type="button" disabled={!owner && !selectedFinding} onclick={() => void ask('What does this evidence support, and what remains uncertain?', selectedFinding)}>What does this support?</button><button type="button" disabled={!owner && !selectedFinding} onclick={() => void ask('What should I inspect before acting?', selectedFinding)}>What should I inspect?</button>{#if kind === 'gallery'}<button type="button" disabled={!owner && !selectedFinding} onclick={() => void ask(contextTarget?.kind === 'album' ? 'How is this album doing compared with similar albums?' : 'Which photos should I consider promoting?', selectedFinding)}>{contextTarget?.kind === 'album' ? 'Compare this album' : 'Consider promotion'}</button>{:else}<button type="button" disabled={!owner && !selectedFinding} onclick={() => void ask('Where are readers or demo visitors losing interest?', selectedFinding)}>Inspect this section</button>{/if}</div>
					{#if owner}<form class="question-form" onsubmit={(event) => { event.preventDefault(); void ask(question, selectedFinding); }}><label for={`${kind}-question`}>Ask about this report</label><textarea id={`${kind}-question`} bind:value={question} maxlength="500" placeholder="Ask about this report evidence. Raw visitor records are not available." disabled={answerLoading}></textarea><button type="submit" disabled={!question.trim() || answerLoading}>Ask owner question</button></form>{:else}<p class="auth-note">Public readers can explain visible findings. <a href={ownerSignInHref}>Sign in with a magic link</a> to ask questions and keep private action history.</p>{/if}
					{#if answerLoading || pendingPoll}<p class="state">Checking the bounded report operation. <button type="button" onclick={cancelAnswer}>Cancel client check</button></p>{/if}{#if pollingPaused}<p class="state">The request remains queued. <button type="button" onclick={() => { if (answer?.requestId) { pendingPoll = { requestId: answer.requestId, scopeKey: JSON.stringify(answer.scope), startedAt: Date.now(), attempt: 0 }; pollingPaused = false; void pollAnswer(); } }}>Check status</button></p>{/if}
					{#if answerError}<p class="answer-error" role="alert">{answerError}</p>{/if}
					{#if answer}<div class="answer"><p class="answer-status">{answer.status}</p><p>{answer.summary}</p><p class="scope"><strong>Frozen answer scope:</strong> {scopeLabel(answer.scope)}</p>{#if scopeChanged}<button type="button" onclick={() => void ask(answer?.question ?? '', selectedFinding)}>Rerun for the current scope</button>{/if}<p class="evidence">Calculated: {formatTime(answer.generatedAt)}</p>{#if answer.findings.length}<div class="answer-findings"><strong>Evidence returned</strong>{#each answer.findings as finding}<a href={evidenceHref(finding.reportHref)}>{finding.title}</a>{/each}</div>{/if}{#if answer.evidenceLinks.length}<p class="links">{#each answer.evidenceLinks as href}<a href={evidenceHref(href)}>Open exact evidence</a>{/each}</p>{/if}{#if answer.comparison}<div class="comparison"><h4>Album comparison</h4><p class="evidence">{answer.comparison.units?.replaceAll('_', ' ')} · {answer.comparison.sampleSize ?? 0} public peers · {answer.comparison.windows?.current.start} to {answer.comparison.windows?.current.end}</p><p class="evidence">Known matching facts: {answer.comparison.criteria.join('; ')}</p>{#if answer.comparison.target}<table><caption>Recorded actions in the selected calendar window</caption><thead><tr><th>Album</th><th>Current</th><th>Previous</th></tr></thead><tbody><tr><th><a href={evidenceHref(answer.comparison.target.href)}>Selected album</a></th><td>{answer.comparison.target.current ?? 'Unavailable'}</td><td>{answer.comparison.target.previous ?? 'Unavailable'}</td></tr>{#each answer.comparison.peers ?? [] as peer}<tr><th><a href={evidenceHref(peer.href)}>{peer.albumKey}</a></th><td>{peer.current ?? 'Unavailable'}</td><td>{peer.previous ?? 'Unavailable'}</td></tr>{/each}</tbody></table><p class="evidence">Peer median: {answer.comparison.median ?? 'Unavailable'}. {answer.comparison.reason ?? ''}</p>{/if}{#if answer.comparison.publicationAge}<p class="evidence"><strong>Same age after publication:</strong> {answer.comparison.publicationAge.days} days. {answer.comparison.publicationAge.available ? `Selected album ${answer.comparison.publicationAge.target}; peer median ${answer.comparison.publicationAge.median} across ${answer.comparison.publicationAge.sampleSize} complete peers.` : answer.comparison.publicationAge.reason ?? 'Insufficient complete peers.'}</p>{/if}</div>{/if}{#if answer.limitations.length}<p class="evidence"><strong>What remains uncertain</strong></p><ul>{#each answer.limitations as limitation}<li>{limitation}</li>{/each}</ul>{/if}</div>{/if}
					{#if previousAnswer}<details class="previous-answer"><summary>Previous answer scope</summary><p>{scopeLabel(previousAnswer.scope)}</p><p>{previousAnswer.summary}</p></details>{/if}
				</aside>
			</div>

		{#if owner}
			<section class="briefs" aria-labelledby={`${kind}-briefs-heading`}>
				<div><p class="kicker">Scheduled briefs</p><h3 id={`${kind}-briefs-heading`}>Daily and weekly review</h3></div>
				{#if briefs.length}
					<div class="brief-list">
						{#each visibleBriefs as brief}
							<article>
								<strong>{brief.title ?? (brief.kind === 'daily' ? 'Daily brief' : brief.kind === 'weekly' ? 'Weekly brief' : 'Operational brief')}</strong>
								<span>{brief.periodKey} · created {formatTime(brief.createdAt)}</span>
								{#if brief.body}<p>{brief.body}</p>{/if}
								{#if briefFindings(brief).length}<div class="links">{#each briefFindings(brief) as finding}<a href={evidenceHref(finding.reportHref)}>{finding.title}</a>{/each}</div>{/if}
								{#if brief.snapshotHref && safeHref(brief.snapshotHref)}<p class="links"><a href={evidenceHref(brief.snapshotHref)}>Open exact saved snapshot</a></p>{/if}
								{#if brief.sourceWindows?.length || brief.suppressions?.length || brief.late !== undefined}
									<details class="brief-evidence"><summary>Read stored brief evidence</summary>
										{#if brief.sourceWindows?.length}<dl>{#each brief.sourceWindows as window}<div><dt>Source scope</dt><dd>{scopeLabel(window.scope)}</dd></div><div><dt>Current window</dt><dd>{briefWindowLabel(window.current)}</dd></div><div><dt>Previous window</dt><dd>{briefWindowLabel(window.previous)}</dd></div><div><dt>Timezone</dt><dd>{window.timezone}</dd></div><div><dt>Cutoff</dt><dd>{formatTime(window.cutoff)}</dd></div>{#if savedSourceHref(window)}<div><dt>Saved evidence</dt><dd><a href={savedSourceHref(window)}>Open saved source report</a></dd></div>{/if}{/each}</dl>{/if}
										{#if brief.suppressions?.length}<p><strong>Stored limits</strong> · up to 50 shown; open the saved source reports for their full evidence.</p><ul>{#each brief.suppressions as suppression}<li>{suppression.rule}: {suppression.reason}</li>{/each}</ul>{/if}
										{#if brief.late !== undefined}<p><strong>Delivery timing:</strong> {brief.late ? 'Late delivery was recorded.' : 'No late delivery was recorded.'}</p>{/if}
									</details>
								{/if}
							</article>
						{/each}
						{#if !expandedBriefs && briefs.length > firstBriefLimit}<button type="button" onclick={() => expandedBriefs = true}>Show all on this brief page</button>{:else if expandedBriefs && briefs.length > firstBriefLimit}<button type="button" onclick={() => expandedBriefs = false}>Show recent briefs</button>{/if}
						{#if (report?.briefsPageCount ?? 1) > 1}<nav class="pager" aria-label="Scheduled brief pages"><span>Brief page {(report?.briefsPage ?? 0) + 1} of {report?.briefsPageCount}</span><div><button type="button" disabled={loading || !report?.briefsPage} onclick={() => void loadReport(report?.page ?? 0, report?.actionsPage ?? 0, (report?.briefsPage ?? 0) - 1)}>Previous briefs</button><button type="button" disabled={loading || (report?.briefsPage ?? 0) + 1 >= (report?.briefsPageCount ?? 1)} onclick={() => void loadReport(report?.page ?? 0, report?.actionsPage ?? 0, (report?.briefsPage ?? 0) + 1)}>Next briefs</button></div></nav>{/if}
					</div>
				{:else}<p class="brief-empty">No stored daily or weekly brief is available for this report scope. That does not mean there was no activity.</p>{/if}
			</section>
		{/if}

		{#if owner && actions.length}<section class="action-history" aria-labelledby={`${kind}-actions-heading`}><div><p class="kicker">Private history</p><h3 id={`${kind}-actions-heading`}>Recorded actions and follow-up</h3><p>Recent records are shown first. Use the history pages to review earlier changes.</p></div><ul>{#each visibleActions as item}<li><div><strong>{item.kind === 'record' ? 'Recorded change' : item.kind}</strong><span>{targetLabel(actionTarget(item))} · {formatTime(item.createdAt)}</span>{#if item.changeType}<p><strong>Change:</strong> {item.changeType.replaceAll('_', ' ')}</p>{/if}{#if item.hypothesis}<p><strong>Hypothesis:</strong> {item.hypothesis}</p>{/if}{#if item.primaryMeasure}<p><strong>Primary outcome:</strong> {item.primaryMeasure.replaceAll('_', ' ')}</p>{/if}{#if item.observationDays}<p><strong>Observation window:</strong> {item.observationDays} days</p>{/if}{#if item.followUpAt}<p><strong>Follow-up:</strong> {followUpState(item)}</p>{/if}{#if item.coarseOutcome ?? item.outcome}<p><strong>Recorded outcome:</strong> {item.coarseOutcome ?? item.outcome}</p>{/if}</div>{#if item.outcomeCount !== null && item.outcomeCount !== undefined}<p><strong>Recorded outcome count:</strong> {item.outcomeCount}</p>{/if}{#if item.kind === 'dismiss' || item.kind === 'snooze'}<button type="button" onclick={() => void reverseAction(item)}>Reverse this row</button>{/if}</li>{/each}</ul>{#if actions.length > visibleActions.length}<button type="button" onclick={() => expandedHistory = true}>Show all returned history</button>{:else if expandedHistory && actions.length > 5}<button type="button" onclick={() => expandedHistory = false}>Show recent history</button>{/if}{#if (report?.actionsPageCount ?? 1) > 1}<nav class="pager" aria-label="Private history pages"><span>History page {(report?.actionsPage ?? 0) + 1} of {report?.actionsPageCount}</span><div><button type="button" disabled={loading || !report?.actionsPage} onclick={() => void loadReport(report?.page ?? 0, (report?.actionsPage ?? 0) - 1)}>Previous history</button><button type="button" disabled={loading || (report?.actionsPage ?? 0) + 1 >= (report?.actionsPageCount ?? 1)} onclick={() => void loadReport(report?.page ?? 0, (report?.actionsPage ?? 0) + 1)}>Next history</button></div></nav>{/if}</section>{/if}
	{/if}

	{#if actionMode}
		<section class="action-sheet" aria-labelledby="action-sheet-title"><div class="action-sheet-heading"><div><p class="kicker">Private action record</p><h3 id="action-sheet-title">{actionMode === 'record' ? 'Record what changed' : actionMode === 'dismiss' ? (isOperational(actionFinding) ? 'Acknowledge this incident' : 'Dismiss this suggestion') : 'Snooze this suggestion'}</h3><p>{actionFinding ? `${actionFinding.title} · ${targetLabel(actionFinding.target)}` : `Use ${contextLabel} or choose a public album, photo, or page.`}</p></div><button type="button" onclick={() => { actionMode = null; actionError = null; }}>Close</button></div>
			{#if isOperational(actionFinding) && actionMode !== 'record'}<p class="context-note">Acknowledgement pauses this incident for 30 days; snooze pauses it for 7 days. It stays visible and is not marked repaired. Undo reopens it.</p>{/if}
			{#if actionMode === 'record'}<form onsubmit={(event) => { event.preventDefault(); void submitAction('record', event.currentTarget as HTMLFormElement); }}><div class="form-grid"><label>Target type<select name="targetKind"><option value="album">Album</option><option value="photo">Photo</option><option value="page">Page path</option></select></label><label>Target reference<input name="targetValue" maxlength="180" placeholder={contextTarget ? `Leave blank for ${contextLabel}` : 'Album key, photo ID, or /page path'} /></label><label>Actual action time<input name="actualAt" type="datetime-local" required /></label><label>Change type<select name="changeType" required><option value="">Choose a change</option><option value="promotion">Promotion</option><option value="cover">Album cover</option><option value="headline">Page headline</option><option value="cta">Call to action</option><option value="search_fix">Search repair</option><option value="download_repair">Download repair</option><option value="shooting">Photography experiment</option><option value="editing">Editing experiment</option><option value="other">Other actual change</option></select></label><label>Declared primary outcome<select name="primaryMeasure" required><option value="">Choose one measure</option><option value="album_opens">Album opens</option><option value="photo_opens">Photo opens</option><option value="downloads">Download actions</option><option value="favorites">Favorite additions</option><option value="shares">Share actions</option><option value="page_views">Page views</option></select></label><label>Observe for<select name="observationDays" required><option value="7">7 days</option><option value="14">14 days</option><option value="30" selected>30 days</option><option value="90">90 days</option></select></label><label>Channel (optional)<input name="channel" maxlength="80" placeholder="Actual channel only" /></label><label>Campaign (optional)<input name="campaign" maxlength="120" /></label><label>Release or placement (optional)<input name="release" maxlength="120" /></label><label>Variant (optional)<input name="variant" maxlength="120" /></label><label>Coarse outcome (optional)<select name="outcome"><option value="">Not recorded</option><option value="inquiry">Inquiry count</option><option value="booking">Booking count</option><option value="other">Other coarse outcome</option></select></label><label>Outcome count (optional)<input name="outcomeCount" type="number" min="0" max="100000" step="1" placeholder="Count only; no customer details" /></label></div><label>What do you expect to change?<textarea name="hypothesis" maxlength="500" required></textarea></label><label>Private note (optional)<textarea name="note" maxlength="1000"></textarea></label><p class="delivery-note">Record an actual change only. A saved draft, suggested promotion, or future plan is not a completed action. Inquiry and booking values stay coarse; do not add messages or customer details.</p><button type="submit">Record actual change</button></form>{:else}<form onsubmit={(event) => { event.preventDefault(); void submitAction(actionMode === 'dismiss' ? 'dismiss' : 'snooze', event.currentTarget as HTMLFormElement); }}><label>Private reason<textarea name="note" maxlength="1000" required></textarea></label><button type="submit">{actionMode === 'dismiss' ? 'Dismiss suggestion' : 'Snooze suggestion'}</button></form>{/if}
			{#if actionError}<p class="answer-error" role="alert">{actionError}</p>{/if}{#if actionMessage}<p class="action-message" role="status">{actionMessage}</p>{/if}
		</section>
	{/if}
	{#if !recordOnly}<PrivateIntelligenceControls {owner} {actions} onchanged={() => { void loadReport(currentPage); void settings?.reload(); }} />{/if}
</section>

<style>
.actions-review a,.auth-note a{color:#174ea6;font-weight:700;text-decoration:underline;text-underline-offset:.15em}

	.intelligence{margin-top:1.25rem;border-top:1px solid #d8e0ea;padding-top:1.25rem;color:#172033}.heading,.finding-topline,.finding-actions,.pager,.action-sheet-heading,.action-history li{display:flex;align-items:center;justify-content:space-between;gap:.75rem}.heading{align-items:end}.kicker{color:#174ea6;font-size:.68rem;font-weight:800;letter-spacing:.07em;margin:0 0 .35rem;text-transform:uppercase}h2,h3,p{margin-top:0}h2{font-size:1.2rem;letter-spacing:-.02em;margin-bottom:.3rem}h3{font-size:1rem;line-height:1.3;margin-bottom:.45rem}.heading>div>p:last-child,.inspector-copy,.scope,.freshness,.evidence,.auth-note,.context-note,.delivery-note{color:#526176;font-size:.78rem;line-height:1.5}.freshness{margin:0;text-align:right}.scope,.context-note{margin:.8rem 0}.context-note{background:#eef5ff;border-left:3px solid #6195df;padding:.55rem .7rem}.content-grid{display:grid;gap:1rem;grid-template-columns:minmax(0,1.35fr) minmax(17rem,.8fr);align-items:start}.finding-list{display:grid;gap:.65rem}.finding,.inspector,.briefs,.state,.action-sheet,.action-history{background:#fff;border:1px solid #d8e0ea;border-radius:.75rem;padding:1rem}.reporting-settings{margin:.9rem 0}.reporting-settings>summary{align-items:center;cursor:pointer;color:#174ea6;display:flex;font-weight:700;min-height:2.75rem}.finding.selected{border-color:#1769e0;box-shadow:inset 3px 0 #1769e0}.finding-topline{color:#64758a;font-size:.7rem;text-transform:capitalize}.finding p{color:#384b66;font-size:.84rem;line-height:1.5}.proposal{color:#172033!important}.follow-up{border-left:2px solid #91b7ee;margin:.65rem 0;padding-left:.7rem}.follow-up p{font-size:.78rem;margin:.25rem 0}.finding-actions{justify-content:start;flex-wrap:wrap;margin-top:.85rem}.inspector{position:sticky;top:1rem;background:#f4f7fb}.presets{display:flex;flex-wrap:wrap;gap:.45rem;margin:.8rem 0}.question-form,.action-sheet form{display:grid;gap:.6rem;margin-top:.9rem}.question-form label,.action-sheet label{display:grid;color:#33445c;font-size:.78rem;font-weight:700;gap:.35rem}button,.finding-actions a{border:1px solid #b8c8dc;border-radius:.45rem;background:#fff;color:#174ea6;cursor:pointer;font:inherit;font-size:.78rem;font-weight:700;min-height:2.75rem;padding:.5rem .65rem;text-decoration:none}button:hover,button:focus-visible,.finding-actions a:hover,.finding-actions a:focus-visible{border-color:#1769e0;background:#edf5ff}button:disabled{cursor:not-allowed;opacity:.55}button:focus-visible,a:focus-visible,textarea:focus-visible,input:focus-visible,input:focus-within,select:focus-visible{outline:3px solid #1769e0;outline-offset:2px}textarea,input,select{border:1px solid #b8c8dc;border-radius:.45rem;background:#fff;color:#172033;font:inherit;max-width:100%;min-height:2.75rem;min-width:0;padding:.55rem .65rem}textarea{min-height:5rem;resize:vertical}.question-form button,.action-sheet form button{background:#1769e0;border-color:#1769e0;color:#fff}.form-grid{display:grid;gap:.6rem;grid-template-columns:repeat(2,minmax(0,1fr))}.answer,.previous-answer{border-top:1px solid #d8e0ea;margin-top:.9rem;padding-top:.9rem}.answer-status{color:#174ea6;font-size:.72rem;font-weight:800;text-transform:capitalize}.answer ul,.finding details ul{color:#526176;font-size:.77rem;line-height:1.45;margin:.65rem 0 0;padding-left:1.1rem}.comparison{overflow-x:auto}.comparison table{width:100%;border-collapse:collapse;font-size:.78rem}.comparison caption{text-align:left;color:#526176;margin:.5rem 0}.comparison th,.comparison td{text-align:left;border-bottom:1px solid #d8e0ea;padding:.5rem}.comparison a{color:#174ea6}.answer-findings{display:grid;gap:.35rem;margin-top:.75rem}.answer-findings a,.links a{color:#174ea6;font-size:.78rem;font-weight:700}.links{display:grid;gap:.35rem;margin:.65rem 0 0}.state{color:#526176;font-size:.84rem;line-height:1.5}.state p{margin:.3rem 0 0}.unavailable{border-color:#dba6a6}.answer-error{color:#a42424;font-size:.8rem;line-height:1.45}.pager{border-top:1px solid #d8e0ea;color:#526176;font-size:.78rem;padding-top:.8rem}.pager div{display:flex;gap:.4rem}.actions-review{align-items:start;background:#eef5ff;border-left:3px solid #6195df;color:#384b66;display:flex;font-size:.78rem;gap:1rem;justify-content:space-between;line-height:1.5;margin:.9rem 0;padding:.75rem .85rem}.actions-review p{margin:0}.briefs{display:grid;gap:.8rem;grid-template-columns:minmax(12rem,.45fr) minmax(0,1fr);margin-top:1rem}.brief-list{display:grid;gap:.5rem;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))}.brief-list article{border-left:2px solid #91b7ee;padding-left:.7rem}.brief-list strong,.brief-list span{display:block}.brief-list span,.brief-empty,.brief-windows{color:#64758a;font-size:.72rem;margin-top:.15rem}.brief-list p{color:#526176;font-size:.78rem;line-height:1.45;margin:.4rem 0 0}.action-history{margin-top:1rem}.action-history li > div > span { display: block; margin-top: .2rem; }
	.action-history ul{display:grid;gap:.65rem;list-style:none;margin:.8rem 0;padding:0}.action-history li{align-items:start;border-top:1px solid #e3e9f1;padding-top:.7rem}.action-history span,.action-history p{color:#526176;font-size:.78rem;line-height:1.45}.action-history p{margin:.25rem 0 0}.action-sheet{border-color:#9ebce8;margin-top:1rem;max-width:52rem}.action-sheet-heading{align-items:start}.action-sheet-heading p{color:#526176;font-size:.82rem;margin-bottom:0}.action-message{color:#195b33;font-size:.82rem;margin:.75rem 0 0}.evidence summary{cursor:pointer;color:#174ea6;font-weight:700}.evidence dl{display:grid;gap:.35rem;margin:.7rem 0}.evidence dl div{display:grid;gap:.6rem;grid-template-columns:7rem minmax(0,1fr)}.evidence dt{color:#64758a}.evidence dd{margin:0;overflow-wrap:anywhere}.evidence>p{margin:.7rem 0 0}@media(max-width:900px){.content-grid,.briefs{grid-template-columns:1fr}.inspector{position:static}}@media(max-width:600px){.heading,.actions-review,.action-history li{align-items:start;flex-direction:column}.freshness{text-align:left}.finding-actions button,.finding-actions a{flex:1 1 auto;text-align:center}.evidence dl div,.form-grid{grid-template-columns:minmax(0,1fr)}}
	.brief-evidence{margin-top:.65rem}.brief-evidence summary{cursor:pointer;color:#174ea6;font-size:.78rem;font-weight:700}.brief-evidence dl{display:grid;gap:.35rem;margin:.7rem 0}.brief-evidence dl div{display:grid;gap:.6rem;grid-template-columns:7rem minmax(0,1fr)}.brief-evidence dt{color:#64758a}.brief-evidence dd{margin:0;overflow-wrap:anywhere}.brief-evidence>p{margin:.7rem 0 0}.brief-evidence ul{color:#526176;font-size:.77rem;line-height:1.45;margin:.65rem 0 0;padding-left:1.1rem}
</style>
