<script lang="ts">
	import { enhance } from '$app/forms';
	import { CHANNEL_MAX, NOTE_MAX, type SharingNote } from '$lib/analytics/sharing-notes';

	/**
	 * The owner's private notes on where and when one album was shared. Only the signed-in owner is ever given
	 * this; the page does not render it for a visitor. `today` is the report's current day in Chicago time, the
	 * default for a new note.
	 */
	interface Props {
		notes: SharingNote[];
		available: boolean;
		today: string;
		form: Record<string, unknown> | null | undefined;
	}
	let { notes, available, today, form }: Props = $props();

	const day = (value: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
	const done = $derived(form?.noteAdded ? 'Note saved.' : form?.noteUpdated ? 'Note updated.' : form?.noteDeleted ? 'Note deleted.' : null);
</script>

<section id="sharing" class="sharing" aria-labelledby="sharing-title">
	<h2 id="sharing-title">Where you shared this album</h2>
	<p class="note">Private notes that only you can see. Write down where and when you shared the album, so a rise in arrivals can be read against what you did. A tag on a link counts arrivals; it does not say what caused them.</p>

	{#if !available}
		<p class="alert" role="alert">Your notes could not be read just now. They are not gone; reload in a few minutes.</p>
	{:else if notes.length}
		<ul class="list">
			{#each notes as item (item.id)}
				<li>
					<p class="when">{day(item.activityDate)} · {item.channel}</p>
					<p class="text">{item.note}</p>
					<div class="actions">
						<details>
							<summary>Edit<span class="sr-only"> the note from {day(item.activityDate)}, {item.channel}</span></summary>
							<form method="POST" action="?/updateNote" use:enhance class="edit">
								<input type="hidden" name="id" value={item.id} />
								<label class="entry"><span>Channel</span><input name="channel" maxlength={CHANNEL_MAX} required value={item.channel} /></label>
								<label class="entry"><span>What happened</span><textarea name="note" maxlength={NOTE_MAX} required rows="3" value={item.note}></textarea></label>
								<button type="submit">Update note</button>
							</form>
						</details>
						<form method="POST" action="?/deleteNote" use:enhance>
							<input type="hidden" name="id" value={item.id} />
							<button type="submit" class="danger">Delete<span class="sr-only"> the note from {day(item.activityDate)}, {item.channel}</span></button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="note">No notes yet for this album.</p>
	{/if}

	<form method="POST" action="?/addNote" use:enhance class="add">
		<h3>Add a note</h3>
		<div class="fields">
			<label class="entry"><span>Day</span><input type="date" name="activityDate" value={today} required /></label>
			<label class="entry"><span>Channel</span><input name="channel" maxlength={CHANNEL_MAX} required placeholder="Instagram story" /></label>
		</div>
		<label class="entry"><span>What happened</span><textarea name="note" maxlength={NOTE_MAX} required rows="3"></textarea></label>
		<button type="submit">Save note</button>
	</form>
	{#if form?.noteError}<p class="alert" role="alert">{String(form.noteError)}</p>{/if}
	{#if done}<p class="ok" role="status">{done}</p>{/if}
</section>

<style>
	.sharing { display: grid; gap: .6rem; min-width: 0; }
	h2 { font-size: 1.05rem; font-weight: 700; margin: 0; }
	h3 { font-size: .95rem; font-weight: 700; margin: 0; }
	.note { color: var(--muted, #526176); font-size: .85rem; line-height: 1.5; margin: 0; max-width: 46rem; }
	.list { display: grid; gap: .7rem; list-style: none; margin: 0; padding: 0; }
	.list li { border-left: 3px solid var(--blue-ink, #174ea6); padding-left: .7rem; }
	.when { color: var(--muted, #526176); font-size: .8rem; font-weight: 650; margin: 0; }
	.text { font-size: .95rem; line-height: 1.5; margin: .15rem 0 0; overflow-wrap: anywhere; white-space: pre-wrap; }
	.actions { align-items: start; display: flex; flex-wrap: wrap; gap: .2rem 1rem; }
	summary { align-items: center; color: var(--blue-ink, #174ea6); cursor: pointer; display: flex; font-weight: 650; min-height: 2.75rem; min-width: 2.75rem; }
	.edit, .add { display: grid; gap: .5rem; max-width: 40rem; }
	.add { border-top: 1px solid var(--line, #d8e0ea); margin-top: .4rem; padding-top: .8rem; }
	.fields { display: grid; gap: .5rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); }
	.entry { color: var(--muted, #526176); display: grid; font-size: .8rem; font-weight: 650; gap: .2rem; min-width: 0; }
	input:not([type='hidden']), textarea { background: #fff; border: 1px solid #8fa1b8; border-radius: .4rem; color: var(--ink, #172033); font: inherit; font-size: .92rem; min-height: 2.75rem; min-width: 0; padding: .45rem .6rem; width: 100%; }
	button { align-items: center; background: var(--blue-ink, #174ea6); border: 1px solid var(--blue-ink, #174ea6); border-radius: .5rem; color: #fff; cursor: pointer; display: inline-flex; font: inherit; font-size: .85rem; font-weight: 650; justify-self: start; min-height: 2.75rem; padding: 0 .9rem; }
	button.danger { background: #fff; border-color: #8f1d1d; color: #8f1d1d; }
	input:focus-visible, textarea:focus-visible, button:focus-visible, summary:focus-visible { outline: 3px solid var(--blue-ink, #174ea6); outline-offset: 2px; }
	.alert { background: #fdf0ef; border-radius: .5rem; color: #8f1d1d; font-size: .85rem; line-height: 1.45; margin: 0; padding: .55rem .7rem; }
	.ok { color: #195b33; font-size: .85rem; margin: 0; }
	.sr-only { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
	@media (forced-colors: active) { input, textarea, button { border: 1px solid CanvasText; } }
	@media (prefers-contrast: more) { .note, .when, .entry { color: #2b3748; } }
</style>
