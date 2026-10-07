<script lang="ts">
	import { enhance } from '$app/forms';
	import { CLASS_LABELS, CORRECTION_NOTE_MAX, LEGACY_CLASSES, V2_CLASSES, type CorrectionRow, type CorrectionsView, type EventChoice } from '$lib/analytics/corrections';

	/**
	 * Correcting how a retained event is classified, for the signed-in owner. Each correction is a new version
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
	const choiceText = (event: EventChoice) => `${event.album} · ${event.what} · ${event.at}${event.source ? ` · ${event.source}` : ''}`;
	const classText = (value: string) => CLASS_LABELS[value as keyof typeof CLASS_LABELS] ?? value.replaceAll('_', ' ');

	const kinds = $derived([
		{
			key: 'legacy', title: 'Traffic events', fieldId: 'legacy-event', classes: LEGACY_CLASSES, set: corrections.legacy,
			record: '?/correctClassification', reverse: '?/undoClassification', recordLabel: 'Record correction', reverseLabel: 'Reverse latest',
			error: form?.correctionError, done: form?.corrected ? 'Correction recorded.' : form?.correctionUndone ? 'Reversal recorded.' : null,
			unavailable: 'Retained events could not be read just now.', none: 'No retained events fall in these days.',
			intro: 'Each correction creates a new version and reconciles the affected day. Events are the ones in the days above.', reasonLabel: 'Reason'
		},
		{
			key: 'v2', title: 'Version 2 events', fieldId: 'v2-event', classes: V2_CLASSES, set: corrections.v2,
			record: '?/correctV2Classification', reverse: '?/undoV2Classification', recordLabel: 'Record version 2 correction', reverseLabel: 'Reverse latest',
			error: form?.v2CorrectionError, done: form?.v2Corrected ? 'Correction recorded.' : form?.v2CorrectionUndone ? 'Reversal recorded.' : null,
			unavailable: 'Version 2 events could not be read just now.', none: 'No retained version 2 events fall in these days.',
			intro: 'This changes the first-party version 2 counts at once and holds back any export still waiting. If the original event was already sent to the provider, a server-made control carries only its identifier, version and classification.', reasonLabel: 'Private evidence'
		}
	] as const);
</script>

<div class="corrections">
	<p class="lead">Reclassify a retained event, with a reason, and reverse it later. Only you can see or change this, and only the classification changes: the event itself is kept.</p>
	<div class="pager" aria-label="Retained events">
		{#if corrections.page > 0}<a href={pageHref(corrections.page - 1)}>Newer events</a>{/if}
		<span>Events page {corrections.page + 1}</span>
		{#if corrections.hasMore}<a href={pageHref(corrections.page + 1)}>Older events</a>{/if}
	</div>

	{#each kinds as kind (kind.key)}
		<section class="kind" aria-labelledby={`${kind.fieldId}-title`}>
			<h3 id={`${kind.fieldId}-title`}>{kind.title}</h3>
			<p class="note">{kind.intro}</p>
			{#if !kind.set.eventsAvailable}<p class="alert" role="alert">{kind.unavailable}</p>{:else if !kind.set.events.length}<p class="note">{kind.none}</p>{/if}
			<form method="POST" action={kind.record} use:enhance class="record">
				<label class="entry wide"><span>Retained event</span>
					<select id={kind.fieldId} name="eventId" required><option value="">Choose an event</option>{#each kind.set.events as event (event.id)}<option value={event.id}>{choiceText(event)}</option>{/each}</select>
				</label>
				<label class="entry"><span>Classification</span>
					<select name="classification">{#each kind.classes as value (value)}<option {value}>{classText(value)}</option>{/each}</select>
				</label>
				<label class="entry wide"><span>{kind.reasonLabel}</span><input name="note" maxlength={CORRECTION_NOTE_MAX} required /></label>
				<button type="submit">{kind.recordLabel}</button>
			</form>
			{#if kind.error}<p class="alert" role="alert">{String(kind.error)}</p>{/if}
			{#if kind.done}<p class="ok" role="status">{kind.done}</p>{/if}

			{#if !kind.set.logAvailable}
				<p class="alert" role="alert">The correction history could not be read just now.</p>
			{:else if kind.set.log.length}
				<ul class="history" aria-label={`${kind.title}: the latest corrections, newest first`}>
					{#each kind.set.log as row (`${row.eventId}-${row.version}`)}
						{@render logRow(row, kind.reverse, kind.reverseLabel)}
					{/each}
				</ul>
			{:else}
				<p class="note">No corrections have been recorded yet.</p>
			{/if}
		</section>
	{/each}
</div>

{#snippet logRow(row: CorrectionRow, action: string, label: string)}
	<li>
		<p class="event">{row.context}</p>
		<p class="when">{stamp(row.correctedAt)}</p>
		<p class="what"><strong>{classText(row.classification)}</strong> · version {row.version}</p>
		<p class="why">{row.note}</p>
		{#if row.canReverse}
			<form method="POST" {action} use:enhance><input type="hidden" name="eventId" value={row.eventId} /><button type="submit" class="link">{label}<span class="sr-only"> for {row.context}</span></button></form>
		{:else}<p class="muted">{row.reversed ? 'Reversal recorded' : 'Earlier version'}</p>{/if}
	</li>
{/snippet}

<style>
	.corrections { display: grid; gap: .9rem; min-width: 0; }
	.lead, .note { color: var(--muted, #526176); font-size: .88rem; line-height: 1.5; margin: 0; max-width: 62rem; }
	.pager { align-items: center; display: flex; flex-wrap: wrap; gap: .3rem 1rem; font-size: .88rem; }
	.pager a { align-items: center; color: var(--blue-ink, #174ea6); display: inline-flex; min-height: 2.75rem; text-underline-offset: 3px; }
	.kind { border-top: 1px solid var(--line, #d8e0ea); display: grid; gap: .6rem; min-width: 0; padding-top: .8rem; }
	h3 { font-size: .95rem; font-weight: 700; margin: 0; }
	.record { align-items: end; display: grid; gap: .5rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr)); }
	.entry { color: var(--muted, #526176); display: grid; font-size: .8rem; font-weight: 650; gap: .2rem; min-width: 0; }
	.wide { grid-column: span 2; }
	@media (max-width: 639px) { .wide { grid-column: 1 / -1; } }
	select, input:not([type='hidden']) { background: #fff; border: 1px solid #8fa1b8; border-radius: .4rem; color: var(--ink, #172033); font: inherit; font-size: .9rem; min-height: 2.75rem; min-width: 0; padding: 0 .6rem; width: 100%; }
	button { align-items: center; background: var(--blue-ink, #174ea6); border: 1px solid var(--blue-ink, #174ea6); border-radius: .5rem; color: #fff; cursor: pointer; display: inline-flex; font: inherit; font-size: .85rem; font-weight: 650; justify-content: center; min-height: 2.75rem; padding: 0 .9rem; }
	button.link { background: none; border: 0; color: var(--blue-ink, #174ea6); min-width: 2.75rem; padding: 0 .4rem; text-decoration: underline; text-underline-offset: 3px; }
	select:focus-visible, input:focus-visible, button:focus-visible, a:focus-visible { outline: 3px solid var(--blue-ink, #174ea6); outline-offset: 2px; }
	.alert { background: #fdf0ef; border-radius: .5rem; color: #8f1d1d; font-size: .85rem; line-height: 1.45; margin: 0; padding: .55rem .7rem; }
	.ok { color: #195b33; font-size: .85rem; margin: 0; }
	.history { display: grid; gap: 0; list-style: none; margin: 0; padding: 0; }
	.history li { border-top: 1px solid #e6ecf3; display: grid; gap: .1rem; padding: .6rem 0; }
	.history li:first-child { border-top: 0; }
	.history p { font-size: .88rem; line-height: 1.45; margin: 0; overflow-wrap: anywhere; }
	.event { font-weight: 650; }
	.when { color: var(--muted, #526176); font-size: .78rem; }
	.why { white-space: pre-wrap; }
	.muted { color: var(--muted, #526176); }
	.sr-only { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
	@media (forced-colors: active) { select, input, button { border: 1px solid CanvasText; } }
	@media (prefers-contrast: more) { .lead, .note, .entry, .when, .muted { color: #2b3748; } }
</style>
