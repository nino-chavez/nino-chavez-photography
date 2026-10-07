<script lang="ts">
	import { tick } from 'svelte';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { intelligenceEvidenceHref, settingsPath } from '$lib/analytics/report-paths';
	import type { Finding, IntelligenceScope } from '$lib/analytics/intelligence-contract';
	import type { FindingsCheck } from '$lib/analytics/home';

	interface Props {
		findings: Finding[];
		/** Home shows each finding under its launch card, with the evidence folded away. */
		compact?: boolean;
		/** When the scheduler last checked these findings, in words. Late or unknown is said, not hidden. */
		checked?: FindingsCheck | null;
		/** Heading level of each finding's title. */
		level?: 3 | 4;
		/** Server-verified owner. Only the owner sees dismiss and snooze. */
		owner?: boolean;
		/** The launch scope the findings were read from; dismissals are recorded against it. */
		scope?: IntelligenceScope | null;
	}
	let { findings, compact = false, checked = null, level = 3, owner = false, scope = null }: Props = $props();

	const hostname = $derived(page.url.hostname);
	const href = (value: string) => intelligenceEvidenceHref(hostname, value);
	const KIND: Record<string, string> = {
		launch_reach: 'Launch reach',
		launch_finished: 'Launch over',
		seen_rarely_opened: 'Worth a look',
		launch_failures: 'Something failed',
		collection_health: 'Data gap'
	};
	const kind = (finding: Finding) => KIND[finding.rule] ?? 'Finding';
	const linkText = (link: string) => link.startsWith('/photo/') ? 'Open the photo' : link.includes('#downloads') ? 'See the downloaded photos' : link.includes('#compare') ? 'See the launch comparison' : link.includes('#photos') ? 'See the photos' : link.includes('#launch-chart') ? 'See the daily chart' : 'Open the evidence';
	const links = (finding: Finding) => [...new Set([finding.reportHref, ...(finding.evidenceLinks ?? [])])].flatMap((link) => { const target = href(link); return target ? [{ target, text: linkText(link) }] : []; });

	// Owner-only: dismiss with a private reason, or snooze for 7 days, through the existing actions endpoint.
	type Settle = 'dismiss' | 'snooze';
	let hidden = $state<string[]>([]);
	let acting = $state<{ id: string; kind: Settle } | null>(null);
	let saving = $state(false);
	let note = $state('');
	let message = $state<{ text: string; undo: { actionId: string; findingId: string } | null; settings: boolean } | null>(null);
	const shown = $derived(findings.filter((finding) => !hidden.includes(finding.id)));
	const endpoint = `${base}/api/analytics/intelligence/actions`;

	async function post(body: Record<string, unknown>): Promise<{ ok: boolean; status: number; actionId: string | null }> {
		try {
			const response = await fetch(endpoint, { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
			const payload = await response.json().catch(() => null) as { action?: { id?: unknown } } | null;
			return { ok: response.ok, status: response.status, actionId: typeof payload?.action?.id === 'string' ? payload.action.id : null };
		} catch { return { ok: false, status: 0, actionId: null }; }
	}
	async function settle(finding: Finding, settleKind: Settle) {
		if (!owner || !scope || !note.trim() || saving) return;
		saving = true;
		const result = await post({ scope, kind: settleKind, findingId: finding.id, note: note.trim() });
		saving = false;
		if (!result.ok) {
			message = result.status === 409
				? { text: 'Choose how long private records are kept before dismissing or snoozing. Nothing was saved.', undo: null, settings: true }
				: { text: 'This could not be saved. Nothing changed.', undo: null, settings: false };
			return;
		}
		hidden = [...hidden, finding.id];
		acting = null; note = '';
		message = { text: settleKind === 'dismiss' ? `Dismissed: “${finding.title}”. It stays hidden unless its numbers change.` : `Snoozed for 7 days: “${finding.title}”.`, undo: result.actionId ? { actionId: result.actionId, findingId: finding.id } : null, settings: false };
	}
	/** The control that opened the form is replaced by it, so focus moves to the reason box rather than being lost. */
	async function open(finding: Finding, settleKind: Settle) {
		acting = { id: finding.id, kind: settleKind }; note = ''; message = null;
		await tick();
		document.getElementById(`reason-${finding.id}`)?.focus();
	}
	async function undo() {
		const target = message?.undo; if (!target || !scope || saving) return;
		saving = true;
		const result = await post({ scope, kind: 'undo', actionId: target.actionId });
		saving = false;
		if (!result.ok) { message = { text: 'The undo could not be saved. The finding stays hidden.', undo: target, settings: false }; return; }
		hidden = hidden.filter((id) => id !== target.findingId);
		message = { text: 'Undone. The finding is back.', undo: null, settings: false };
	}
</script>

<ul class="findings" class:compact>
	{#each shown as finding (finding.id)}
		<li class="finding" data-severity={finding.severity ?? 'low'}>
			<p class="kind">{kind(finding)}</p>
			<svelte:element this={`h${level}`} class="title">{finding.title}</svelte:element>
			<p class="what">{finding.explanation}</p>
			{#if !compact && finding.why}<p class="why">{finding.why}</p>{/if}
			{#if !compact}<p class="next"><strong>Next step:</strong> {finding.action}</p>{/if}
			{#if compact}
				<details>
					<summary>Next step, evidence and limits<span class="sr-only"> for: {finding.title}</span></summary>
					<p class="next"><strong>Next step:</strong> {finding.action}</p>
					{#if finding.why}<p class="why">{finding.why}</p>{/if}
					{#if finding.evidenceText}<p class="evidence"><strong>Evidence:</strong> {finding.evidenceText}</p>{/if}
					{#if finding.limits?.length}<ul class="limits">{#each finding.limits as limit (limit)}<li>{limit}</li>{/each}</ul>{/if}
					<p class="links">{#each links(finding) as link (link.target)}<a href={link.target}>{link.text}<span class="sr-only"> for: {finding.title}</span></a>{/each}</p>
				</details>
			{:else}
				{#if finding.evidenceText}<p class="evidence"><strong>Evidence:</strong> {finding.evidenceText}</p>{/if}
				{#if finding.limits?.length}
					<p class="limits-title">What this cannot tell you</p>
					<ul class="limits">{#each finding.limits as limit (limit)}<li>{limit}</li>{/each}</ul>
				{/if}
				<p class="links">{#each links(finding) as link (link.target)}<a href={link.target}>{link.text}<span class="sr-only"> for: {finding.title}</span></a>{/each}</p>
			{/if}
			{#if owner && scope}
				{#if acting?.id === finding.id}
					<form class="settle" onsubmit={(event) => { event.preventDefault(); void settle(finding, acting!.kind); }}>
						<label for={`reason-${finding.id}`}>{acting.kind === 'dismiss' ? 'Why dismiss it? (private)' : 'Why snooze it for 7 days? (private)'}</label>
						<textarea id={`reason-${finding.id}`} bind:value={note} maxlength="1000" required rows="2"></textarea>
						<div class="buttons">
							<button type="submit" class="primary" disabled={saving || !note.trim()}>{acting.kind === 'dismiss' ? 'Dismiss' : 'Snooze 7 days'}</button>
							<button type="button" onclick={() => { acting = null; note = ''; }}>Cancel</button>
						</div>
					</form>
				{:else}
					<div class="buttons owner">
						<button type="button" onclick={() => void open(finding, 'dismiss')}>Dismiss<span class="sr-only">: {finding.title}</span></button>
						<button type="button" onclick={() => void open(finding, 'snooze')}>Snooze 7 days<span class="sr-only">: {finding.title}</span></button>
					</div>
				{/if}
			{/if}
		</li>
	{/each}
</ul>
{#if owner}
	<p class="status" role="status">{#if message}{message.text}{#if message.settings}{' '}<a href={settingsPath(hostname)}>Open settings</a>{/if}{#if message.undo}{' '}<button type="button" class="inline" onclick={() => void undo()} disabled={saving}>Undo</button>{/if}{/if}</p>
{/if}
{#if checked && shown.length && (!compact || checked.late)}<p class="checked" class:late={checked.late}>{#if !compact}Worked out from complete days only.{' '}{/if}{checked.text}</p>{/if}

<style>
	.findings { display: grid; gap: .6rem; list-style: none; margin: 0; padding: 0; }
	/* On a wide report two findings sit side by side, so neither stretches into a long empty band. */
	@media (min-width: 1024px) { .findings:not(.compact) { align-items: start; grid-template-columns: repeat(auto-fit, minmax(26rem, 1fr)); } }
	.finding { background: #fff; border: 1px solid #d8e0ea; border-left: 4px solid #1458c4; border-radius: .7rem; min-width: 0; padding: .75rem .9rem; }
	.finding[data-severity='high'] { border-left-color: #9a4a00; }
	.finding[data-severity='low'] { border-left-color: #6b7f99; }
	.kind { color: #174ea6; font-size: .7rem; font-weight: 800; letter-spacing: .08em; margin: 0 0 .2rem; text-transform: uppercase; }
	.finding[data-severity='high'] .kind { color: #8a4200; }
	.title { font-size: 1rem; font-weight: 700; line-height: 1.35; margin: 0 0 .3rem; overflow-wrap: anywhere; }
	p { line-height: 1.5; margin: 0 0 .35rem; max-width: 46rem; }
	.what { font-size: .93rem; }
	.why, .evidence { color: #3d4c63; font-size: .86rem; }
	.next { font-size: .9rem; }
	.limits-title { color: #172033; font-size: .8rem; font-weight: 700; margin-top: .4rem; }
	.limits { color: #526176; font-size: .8rem; line-height: 1.45; list-style: disc; margin: .1rem 0 .4rem; max-width: 46rem; padding-left: 1.1rem; }
	.links { display: flex; flex-wrap: wrap; gap: 0 1rem; margin: .2rem 0 0; }
	.links a { align-items: center; color: #174ea6; display: inline-flex; font-size: .86rem; font-weight: 700; min-height: 2.75rem; text-underline-offset: 3px; }
	a:focus-visible, summary:focus-visible, button:focus-visible, textarea:focus-visible { outline: 3px solid #174ea6; outline-offset: 2px; }
	details { margin-top: .1rem; }
	summary { align-items: center; color: #174ea6; cursor: pointer; display: flex; font-size: .86rem; font-weight: 700; gap: .55rem; list-style: none; min-height: 2.75rem; }
	summary::-webkit-details-marker { display: none; }
	/* A flex summary loses the browser's triangle, so the open and closed states get their own chevron. */
	summary::after { border: solid currentColor; border-width: 0 2px 2px 0; content: ''; height: .4rem; margin-top: -.2rem; transform: rotate(45deg); width: .4rem; }
	details[open] > summary::after { margin-top: .2rem; transform: rotate(-135deg); }
	.buttons { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .4rem; }
	button { background: #fff; border: 1px solid #8fa1b8; border-radius: .5rem; color: #174ea6; cursor: pointer; font: inherit; font-size: .84rem; font-weight: 700; min-height: 2.75rem; padding: .4rem .8rem; }
	button:hover:not(:disabled) { background: #eef4fc; }
	button:disabled { cursor: default; opacity: .6; }
	button.primary { background: #1458c4; border-color: #1458c4; color: #fff; }
	button.inline { margin-left: .3rem; }
	.settle { border-top: 1px solid #e1e8f0; display: grid; gap: .35rem; margin-top: .5rem; padding-top: .5rem; }
	.settle label { color: #33445c; font-size: .82rem; font-weight: 700; }
	textarea { border: 1px solid #8fa1b8; border-radius: .45rem; color: #172033; font: inherit; font-size: .88rem; max-width: 100%; min-height: 2.75rem; padding: .45rem .6rem; resize: vertical; }
	.status { color: #195b33; font-size: .84rem; margin: .4rem 0 0; }
	.status:empty { display: none; }
	.status a { color: #174ea6; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
	.compact .finding { padding: .55rem .75rem; }
	.compact .title { font-size: .95rem; }
	.compact .what, .compact .next { font-size: .87rem; }
	.checked { color: #526176; font-size: .8rem; margin: .5rem 0 0; }
	.checked.late { border-left: 3px solid #9a4a00; color: #6e3500; font-weight: 650; padding-left: .5rem; }
	.sr-only { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
	@media (forced-colors: active) { .finding { border: 1px solid CanvasText; border-left-width: 4px; } }
	@media (prefers-contrast: more) { .why, .evidence, .limits, .checked { color: #2b3748; } .finding { border-color: #5c6b80; } }
</style>
