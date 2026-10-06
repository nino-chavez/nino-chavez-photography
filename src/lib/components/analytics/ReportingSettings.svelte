<script lang="ts">
	import { untrack } from 'svelte';
	import { base } from '$app/paths';
	import type { IntelligencePreferences } from '$lib/analytics/intelligence-preferences';
	import EmailIntelligenceControls from './EmailIntelligenceControls.svelte';

	/**
	 * How long private records are kept, and which in-dashboard reviews are on, with the optional email
	 * delivery. The owner's, never the visitors'. One owner for this form: the settings page and the
	 * gallery report's report-intelligence panel both mount it. It loads whenever `owner` is true,
	 * even when `visible` is false, because the panel needs the chosen retention before it saves an action.
	 */
	let { owner, preferences = $bindable(null), visible = true, id = 'reporting' }: {
		owner: boolean;
		preferences?: IntelligencePreferences | null;
		visible?: boolean;
		id?: string;
	} = $props();

	const endpoint = `${base}/api/analytics/intelligence/preferences`;
	let loading = $state(false);
	let error = $state<string | null>(null);
	let message = $state<string | null>(null);

	function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
	function validPreferences(value: unknown): value is IntelligencePreferences {
		return object(value) && ['undecided', 'until_deleted', '90_days', 'one_year'].includes(String(value.retention))
			&& typeof value.daily === 'boolean' && typeof value.weekly === 'boolean' && typeof value.externalEnabled === 'boolean'
			&& (value.destination === null || typeof value.destination === 'string') && typeof value.destinationVerified === 'boolean';
	}

	export async function reload() {
		if (!owner) return;
		loading = true; error = null;
		try {
			const response = await fetch(endpoint, { headers: { accept: 'application/json' }, cache: 'no-store' });
			const payload: unknown = await response.json().catch(() => null);
			if (!response.ok || !validPreferences(payload)) throw new Error('preferences');
			preferences = payload;
		} catch { preferences = null; error = 'Private reporting settings are unavailable. No preference or action was changed.'; }
		finally { loading = false; }
	}

	async function save(form: HTMLFormElement) {
		const fields = new FormData(form); const retention = fields.get('retention'); const daily = fields.get('daily') === 'on'; const weekly = fields.get('weekly') === 'on';
		if (typeof retention !== 'string' || retention === 'undecided') { error = 'Choose how long to keep private records before saving settings.'; return; }
		loading = true; error = null; message = null;
		try {
			const response = await fetch(endpoint, { method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ retention, daily, weekly }) });
			if (!response.ok) throw new Error('save preferences');
			preferences = { ...(preferences ?? { externalEnabled: false, destination: null, destinationVerified: false }), retention: retention as IntelligencePreferences['retention'], daily, weekly };
			message = 'Private reporting settings saved.';
		} catch { error = 'Settings were not saved. No reporting preference changed.'; }
		finally { loading = false; }
	}

	$effect(() => { if (owner) untrack(() => void reload()); else preferences = null; });
</script>

{#if visible}
	<div class="wrap"><section class="settings" aria-labelledby={`${id}-settings-heading`}>
		<div><p class="kicker">Private reporting settings</p><h3 id={`${id}-settings-heading`}>History and briefs</h3><p>These settings apply to private records only. Visitor privacy and public aggregate reporting follow their separate contracts.</p></div>
		{#if loading && !preferences}<p class="state" role="status">Loading private settings.</p>{:else if preferences}<form onsubmit={(event) => { event.preventDefault(); void save(event.currentTarget as HTMLFormElement); }}>
			<fieldset><legend>Keep private records for</legend><label><input type="radio" name="retention" value="until_deleted" checked={preferences.retention === 'until_deleted'} /> Until I delete them</label><label><input type="radio" name="retention" value="90_days" checked={preferences.retention === '90_days'} /> 90 days</label><label><input type="radio" name="retention" value="one_year" checked={preferences.retention === 'one_year'} /> One year</label></fieldset>
			<fieldset><legend>In-dashboard briefs</legend><label><input type="checkbox" name="daily" checked={preferences.daily} /> Daily review</label><label><input type="checkbox" name="weekly" checked={preferences.weekly} /> Weekly review</label></fieldset>
			<button type="submit" disabled={loading}>Save private settings</button>
			<EmailIntelligenceControls />
		</form>{:else}<div class="state unavailable"><p>{error ?? 'Private settings are unavailable.'}</p><button type="button" onclick={() => void reload()}>Try settings again</button></div>{/if}
		{#if error && preferences}<p class="answer-error" role="alert">{error}</p>{/if}{#if message}<p class="action-message" role="status">{message}</p>{/if}
	</section></div>
{/if}

<style>
	/* Two columns only when the card itself is wide: it sits in a half-width column on the settings page and full width in the report panel. */
	.wrap { container-type: inline-size; }
	.settings { background: #fff; border: 1px solid #d8e0ea; border-radius: .75rem; color: #172033; display: grid; gap: .4rem; grid-template-columns: minmax(0, 1fr); margin: 1rem 0; padding: 1rem; }
	@container (min-width: 46rem) { .settings { grid-template-columns: minmax(14rem, .55fr) minmax(0, 1fr); } }
	.kicker { color: #174ea6; font-size: .68rem; font-weight: 800; letter-spacing: .07em; margin: 0 0 .35rem; text-transform: uppercase; }
	h3 { font-size: 1rem; line-height: 1.3; margin: 0 0 .45rem; }
	p { color: #526176; font-size: .78rem; line-height: 1.5; margin-top: 0; }
	form { display: grid; gap: .6rem; margin-top: .9rem; }
	fieldset { border: 0; margin: 0; padding: 0; }
	legend { color: #33445c; font-size: .78rem; font-weight: 700; margin-bottom: .35rem; }
	label { color: #33445c; display: inline-flex; font-size: .78rem; font-weight: 700; gap: .35rem; margin-right: .8rem; min-height: 2.75rem; align-items: center; }
	input[type='radio'], input[type='checkbox'] { accent-color: #1769e0; height: 1.1rem; width: 1.1rem; }
	button { background: #1769e0; border: 1px solid #1769e0; border-radius: .4rem; color: #fff; cursor: pointer; font: inherit; font-size: .85rem; font-weight: 650; justify-self: start; min-height: 2.75rem; padding: 0 .9rem; }
	button:disabled { cursor: not-allowed; opacity: .62; }
	button:focus-visible, input:focus-visible { outline: 3px solid #174ea6; outline-offset: 2px; }
	.state, .answer-error, .action-message { font-size: .78rem; line-height: 1.5; }
	.answer-error { color: #a42424; }
	.action-message { color: #195b33; }
	@media (max-width: 900px) { label { display: flex; margin: .2rem 0; } }
</style>
