<script lang="ts">
	import { base } from '$app/paths';
	import type { IntelligenceAction } from '$lib/analytics/intelligence-contract';

	interface Props {
		/** Server-validated authorization. This is never inferred in the browser. */
		owner: boolean;
		actions: IntelligenceAction[];
		onchanged?: () => void;
	}
	let { owner, actions, onchanged }: Props = $props();

	const outcomesEndpoint = `${base}/api/analytics/intelligence/outcomes`;
	const historyEndpoint = `${base}/api/analytics/intelligence/history`;
	let expanded = $state(false);
	let actionId = $state('');
	let outcome = $state('');
	let outcomeCount = $state('');
	let note = $state('');
	let saving = $state(false);
	let deleting = $state(false);
	let deletionArmed = $state(false);
	let message = $state<string | null>(null);
	let failure = $state<string | null>(null);
	const recordActions = $derived(actions.filter((action) => action.kind === 'record'));

	function actionLabel(action: IntelligenceAction): string {
		const date = action.actualAt ? new Date(action.actualAt).toLocaleDateString() : new Date(action.createdAt).toLocaleDateString();
		return `${action.changeType ?? 'Recorded change'} · ${date}`;
	}

	async function requestMessage(response: Response, fallback: string): Promise<string> {
		try {
			const payload: unknown = await response.json();
			if (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string') return payload.message;
		} catch { /* Use the stable local message below. */ }
		return fallback;
	}

	async function saveOutcome(event: SubmitEvent) {
		event.preventDefault();
		message = null; failure = null;
		const count = outcomeCount.trim() === '' ? null : Number(outcomeCount);
		if (!actionId || !outcome) { failure = 'Choose a recorded change and the result you observed.'; return; }
		if (count !== null && (!Number.isSafeInteger(count) || count < 0 || count > 100000)) { failure = 'Use a whole number from 0 to 100,000.'; return; }
		if (note.trim().length > 500) { failure = 'Keep the note to 500 characters or fewer.'; return; }
		saving = true;
		try {
			const response = await fetch(outcomesEndpoint, {
				method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', accept: 'application/json' },
				body: JSON.stringify({ actionId, outcome, outcomeCount: count, note: note.trim() || null })
			});
			if (!response.ok) {
				failure = response.status === 409
					? 'Choose private record retention before saving an observed result.'
					: await requestMessage(response, 'Observed result could not be saved. Nothing changed.');
				return;
			}
			outcome = ''; outcomeCount = ''; note = '';
			message = 'Observed result saved.';
			onchanged?.();
		} catch { failure = 'Observed result could not be saved. Nothing changed.'; }
		finally { saving = false; }
	}

	async function deletePrivateHistory() {
		message = null; failure = null; deleting = true;
		try {
			const response = await fetch(historyEndpoint, {
				method: 'DELETE', cache: 'no-store', headers: { 'content-type': 'application/json', accept: 'application/json' },
				body: JSON.stringify({ confirm: 'delete_private_history' })
			});
			if (!response.ok) { failure = await requestMessage(response, 'Private history could not be deleted. Nothing changed.'); return; }
			deletionArmed = false;
			message = 'Private action and brief history deleted. Public traffic remains.';
			onchanged?.();
		} catch { failure = 'Private history could not be deleted. Nothing changed.'; }
		finally { deleting = false; }
	}
</script>

{#if owner}
	<section class="private-controls" aria-label="Private intelligence controls">
		<button class="disclosure" type="button" aria-expanded={expanded} onclick={() => { expanded = !expanded; }}>
			<span>Private results and history</span>
			<span class="disclosure-state">{expanded ? 'Hide' : 'Show'}</span>
		</button>

		{#if expanded}
			<div class="controls-body">
				<p class="intro">Save a coarse result after a recorded change. This does not change the action date, hypothesis, target, or observation window.</p>
				{#if recordActions.length}
					<form onsubmit={saveOutcome} class="outcome-form">
						<label>
							<span>Recorded change</span>
							<select bind:value={actionId} required disabled={saving}>
								<option value="">Choose a change</option>
								{#each recordActions as action (action.id)}<option value={action.id}>{actionLabel(action)}</option>{/each}
							</select>
						</label>
						<label>
							<span>Observed result</span>
							<select bind:value={outcome} required disabled={saving}>
								<option value="">Choose a result</option>
								<option value="unknown">Still unknown</option>
								<option value="inquiry">Inquiry</option>
								<option value="booking">Booking</option>
								<option value="other">Other</option>
							</select>
						</label>
						<label>
							<span>Count, if known</span>
							<input bind:value={outcomeCount} type="number" inputmode="numeric" min="0" max="100000" step="1" placeholder="0" disabled={saving} />
						</label>
						<label class="note-field">
							<span>Private note, optional</span>
							<textarea bind:value={note} maxlength="500" rows="2" disabled={saving}></textarea>
						</label>
						<button class="save" type="submit" disabled={saving}>{saving ? 'Saving result…' : 'Save observed result'}</button>
					</form>
				{:else}
					<p class="empty">Record a change first. You can add an observed result later without creating another change.</p>
				{/if}

				<div class="history-divider"></div>
				<div class="history-control">
					<div><h3>Delete private history</h3><p>Deletes private action, result, and brief history only. Public traffic and aggregate reports remain.</p></div>
					{#if deletionArmed}
						<div class="confirm-row"><span>Delete this private history?</span><button type="button" class="quiet" onclick={() => { deletionArmed = false; }}>Cancel</button><button type="button" class="delete" onclick={deletePrivateHistory} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete private history'}</button></div>
					{:else}
						<button type="button" class="clear" onclick={() => { deletionArmed = true; }}>Clear private history</button>
					{/if}
				</div>
				{#if failure}<p class="feedback failure" role="alert">{failure}</p>{/if}
				{#if message}<p class="feedback success" role="status">{message}</p>{/if}
			</div>
		{/if}
	</section>
{/if}

<style>
	.private-controls { border-top: 1px solid #cbd5e1; color: #18243a; }
	.disclosure { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .8rem 0; border: 0; background: transparent; color: inherit; font: inherit; font-weight: 650; text-align: left; cursor: pointer; }
	.disclosure:focus-visible, button:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
	.disclosure-state { color: #47627f; font-size: .88rem; font-weight: 500; }
	.controls-body { display: grid; gap: .9rem; padding: .1rem 0 1rem; }
	.intro, .empty, .history-control p, .feedback { margin: 0; font-size: .9rem; line-height: 1.45; }
	.intro, .empty, .history-control p { color: #4b5d74; max-width: 68ch; }
	.outcome-form { display: grid; grid-template-columns: minmax(11rem, 1.5fr) minmax(9rem, 1fr) minmax(7rem, .55fr); gap: .65rem; align-items: end; padding: .85rem; background: #f1f5f9; border: 1px solid #d8e2ee; border-radius: .5rem; }
	label { display: grid; gap: .28rem; color: #344760; font-size: .8rem; font-weight: 620; }
	select, input, textarea { width: 100%; box-sizing: border-box; border: 1px solid #aebfd2; border-radius: .3rem; background: #fff; color: #18243a; font: inherit; font-size: .9rem; padding: .45rem .5rem; }
	textarea { resize: vertical; }
	.note-field { grid-column: 1 / -1; }
	.save { justify-self: start; border: 1px solid #1d4ed8; border-radius: .3rem; background: #245bb6; color: #fff; font: inherit; font-size: .88rem; font-weight: 650; padding: .48rem .7rem; cursor: pointer; }
	.history-divider { border-top: 1px solid #d7e0eb; }
	.history-control { display: flex; align-items: end; justify-content: space-between; gap: 1rem; }
	.history-control h3 { margin: 0 0 .18rem; font-size: .95rem; }
	.clear, .quiet, .delete { border-radius: .3rem; font: inherit; font-size: .86rem; padding: .43rem .62rem; cursor: pointer; }
	.clear, .quiet { border: 1px solid #9fb1c7; background: #fff; color: #294560; }
	.confirm-row { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: .45rem; color: #7f1d1d; font-size: .85rem; font-weight: 600; }
	.delete { border: 1px solid #b42318; background: #b42318; color: #fff; }
	button:disabled, select:disabled, input:disabled, textarea:disabled { cursor: not-allowed; opacity: .62; }
	.feedback { padding: .55rem .65rem; border-radius: .3rem; }
	.failure { background: #fef2f2; color: #991b1b; }
	.success { background: #eff6ff; color: #1e3a5f; }
	@media (max-width: 680px) { .outcome-form { grid-template-columns: 1fr; } .note-field { grid-column: auto; } .history-control { align-items: start; flex-direction: column; } .confirm-row { justify-content: flex-start; } }
</style>
