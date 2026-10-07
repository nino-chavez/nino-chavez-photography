<script lang="ts">
	import { enhance } from '$app/forms';
	import { CLASS_LABELS, CORRECTION_NOTE_MAX, LEGACY_CLASSES, V2_CLASSES, type CorrectionRow, type CorrectionsView, type EventChoice } from '$lib/analytics/corrections';

	/**
	 * Correcting how a recorded action is classed, for the signed-in owner. Each correction is a new version
	 * with a reason; the latest can be reversed, and nothing is erased. `pageHref` is where "newer" and "older"
	 * events go; `form` is what the last action returned.
	 */
	interface Props {
		corrections: CorrectionsView;
		form: Record<string, unknown> | null | undefined;
		pageHref: (page: number) => string;
	}
	let { corrections, form, pageHref }: Props = $props();

	const stamp = (value: string | null) => (value ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value)) : 'Not recorded');
	const classText = (value: string) => CLASS_LABELS[value as keyof typeof CLASS_LABELS] ?? value.replaceAll('_', ' ');

	const kinds = $derived([
		{
			key: 'legacy', title: 'Photo and album actions', fieldId: 'legacy-event', classes: LEGACY_CLASSES, set: corrections.legacy,
			record: '?/correctClassification', reverse: '?/undoClassification', recordLabel: 'Record correction', reverseLabel: 'Reverse latest',
			error: form?.correctionError, done: form?.corrected ? 'Correction recorded.' : form?.correctionUndone ? 'Reversal recorded.' : null,
			unavailable: 'The actions could not be read just now.', none: 'No actions were recorded in these days.',
			intro: 'These are the opens, favorites, downloads and shares behind the photo and album counts above. A correction changes that day’s counts when it is saved.', reasonLabel: 'Reason'
		},
		{
			key: 'v2', title: 'Detailed events', fieldId: 'v2-event', classes: V2_CLASSES, set: corrections.v2,
			record: '?/correctV2Classification', reverse: '?/undoV2Classification', recordLabel: 'Record correction', reverseLabel: 'Reverse latest',
			error: form?.v2CorrectionError, done: form?.v2Corrected ? 'Correction recorded.' : form?.v2CorrectionUndone ? 'Reversal recorded.' : null,
			unavailable: 'The detailed events could not be read just now.', none: 'No detailed events were recorded in these days.',
			intro: 'These are the detailed records behind the recorded event counts above. A correction changes those counts at once, and a record that has not yet gone to PostHog is held back. For a record PostHog already has, only its identifier, the new class and the version number are sent.', reasonLabel: 'Reason, kept private'
		}
	] as const);
</script>

<div class="corrections">
	<p class="lead">Every counted action has a class: audience, operator, test, known crawler, suspected automation or unclassified. Only audience and unclassified actions are in the counts above. If one has the wrong class, give it the right one, with a reason. Only you can see or change this. The action itself is kept, and the latest correction can be reversed.</p>
	<div class="pager" aria-label="Pages of actions">
		{#if corrections.page > 0}<a href={pageHref(corrections.page - 1)}>Newer actions</a>{/if}
		<span>Page {corrections.page + 1} of the actions in these days</span>
		{#if corrections.hasMore}<a href={pageHref(corrections.page + 1)}>Older actions</a>{/if}
	</div>

	{#each kinds as kind (kind.key)}
		<section class="kind" aria-labelledby={`${kind.fieldId}-title`}>
			<h3 id={`${kind.fieldId}-title`}>{kind.title}</h3>
			<p class="note">{kind.intro}</p>
			{#if !kind.set.eventsAvailable}<p class="alert" role="alert">{kind.unavailable}</p>{:else if !kind.set.events.length}<p class="note">{kind.none}</p>{/if}
			<form method="POST" action={kind.record} use:enhance class="record">
				<label class="entry wide"><span>Action to correct</span>
					<select id={kind.fieldId} name="eventId" required><option value="">Choose an action</option>{#each kind.set.events as event (event.id)}<option value={event.id}>{event.label}</option>{/each}</select>
				</label>
				<label class="entry"><span>New class</span>
					<select name="classification">{#each kind.classes as value (value)}<option {value}>{classText(value)}</option>{/each}</select>
				</label>
				<label class="entry wide"><span>{kind.reasonLabel}</span><input name="note" maxlength={CORRECTION_NOTE_MAX} required /></label>
				<button type="submit">{kind.recordLabel}</button>
			</form>
			{#if kind.error}<p class="alert" role="alert">{String(kind.error)}</p>{/if}
			{#if kind.done}<p class="ok" role="status">{kind.done}</p>{/if}

			{#if !kind.set.logAvailable}
				<p class="alert" role="alert">The corrections made so far could not be read just now.</p>
			{:else if kind.set.log.length}
				<h4 id={`${kind.fieldId}-history`}>Corrections made so far, newest first</h4>
				<ul class="history" aria-labelledby={`${kind.fieldId}-history`}>
					{#each kind.set.log as row (`${row.eventId}-${row.version}`)}
						{@render logRow(row, kind.reverse, kind.reverseLabel)}
					{/each}
				</ul>
			{:else}
				<p class="note">No corrections have been made yet.</p>
			{/if}
		</section>
	{/each}
</div>

{#snippet logRow(row: CorrectionRow, action: string, label: string)}
	<li>
		<p class="event">{row.context}</p>
		<p class="when">Corrected {stamp(row.correctedAt)} · {row.reference}</p>
		<p class="what">Now classed as <strong>{classText(row.classification)}</strong> · correction {row.version}</p>
		<p class="why">{row.note}</p>
		{#if row.canReverse}
			<form method="POST" {action} use:enhance><input type="hidden" name="eventId" value={row.eventId} /><button type="submit" class="link">{label}<span class="sr-only"> for {row.context}</span></button></form>
		{:else}<p class="muted">{row.reversed ? 'Reversed' : 'Replaced by a later correction'}</p>{/if}
	</li>
{/snippet}

<style>
	.corrections { display: grid; gap: .9rem; min-width: 0; }
	.lead, .note { color: var(--muted, #526176); font-size: .88rem; line-height: 1.5; margin: 0; max-width: 62rem; }
	.pager { align-items: center; display: flex; flex-wrap: wrap; gap: .3rem 1rem; font-size: .88rem; }
	.pager a { align-items: center; color: var(--blue-ink, #174ea6); display: inline-flex; min-height: 2.75rem; text-underline-offset: 3px; }
	.kind { border-top: 1px solid var(--line, #d8e0ea); display: grid; gap: .6rem; min-width: 0; padding-top: .8rem; }
	h3 { font-size: .95rem; font-weight: 700; margin: 0; }
	h4 { color: var(--muted, #526176); font-size: .82rem; font-weight: 700; margin: .3rem 0 0; }
	.record { align-items: end; display: grid; gap: .5rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr)); }
	.entry { color: var(--muted, #526176); display: grid; font-size: .8rem; font-weight: 650; gap: .2rem; min-width: 0; }
	.wide { grid-column: span 2; }
	@media (max-width: 639px) { .wide { grid-column: 1 / -1; } }
	select, input:not([type='hidden']) { background: #fff; border: 1px solid #8fa1b8; border-radius: .4rem; color: var(--ink, #172033); font: inherit; font-size: .9rem; min-height: 2.75rem; min-width: 0; padding: 0 .6rem; width: 100%; }
	/* WebKit keeps a native select at its own height unless the native look is dropped; the chevron stands in for it. */
	select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23526176' stroke-width='2'/%3E%3C/svg%3E"); background-position: right .7rem center; background-repeat: no-repeat; background-size: .75rem; padding-right: 2rem; }
	@media (forced-colors: active) { select { appearance: auto; background-image: none; padding-right: .6rem; } }
	button { align-items: center; background: var(--blue-ink, #174ea6); border: 1px solid var(--blue-ink, #174ea6); border-radius: .5rem; color: #fff; cursor: pointer; display: inline-flex; font: inherit; font-size: .85rem; font-weight: 650; justify-content: center; min-height: 2.75rem; padding: 0 .9rem; }
	button.link { background: none; border: 0; color: var(--blue-ink, #174ea6); min-width: 2.75rem; padding: 0 .4rem; text-decoration: underline; text-underline-offset: 3px; }
	select:focus-visible, input:focus-visible, button:focus-visible, a:focus-visible { outline: 3px solid var(--blue-ink, #174ea6); outline-offset: 2px; }
	.alert { background: #fdf0ef; border-radius: .5rem; color: #8f1d1d; font-size: .85rem; line-height: 1.45; margin: 0; padding: .55rem .7rem; }
	.ok { color: #195b33; font-size: .85rem; margin: 0; }
	.history { display: grid; gap: 0; list-style: none; margin: 0; padding: 0; }
	.history li { border-top: 1px solid #e6ecf3; display: grid; gap: .1rem; padding: .6rem 0; }
	.history li:first-child { border-top: 0; }
	.history p { font-size: .88rem; line-height: 1.45; margin: 0; overflow-wrap: break-word; }
	.event { font-weight: 650; }
	.when { color: var(--muted, #526176); font-size: .78rem; }
	.why { white-space: pre-wrap; }
	.muted { color: var(--muted, #526176); }
	.sr-only { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
	@media (forced-colors: active) { select, input, button { border: 1px solid CanvasText; } }
	@media (prefers-contrast: more) { .lead, .note, .entry, .when, .muted { color: #2b3748; } }
</style>
