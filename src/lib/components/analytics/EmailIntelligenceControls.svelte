<script lang="ts">
	import { base } from '$app/paths';
	import { validEmailIntelligenceDeliveryState, type EmailIntelligenceDeliveryState } from '$lib/analytics/intelligence-email-preferences';

	const endpoint = `${base}/api/analytics/intelligence/delivery`;
	let state = $state<EmailIntelligenceDeliveryState | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let message = $state<string | null>(null);
	let failure = $state<string | null>(null);

	async function readJson(response: Response): Promise<unknown> {
		return response.json().catch(() => null);
	}
	async function load() {
		loading = true; failure = null;
		try {
			const response = await fetch(endpoint, { headers: { accept: 'application/json' }, cache: 'no-store' });
			const payload = await readJson(response);
			if (!response.ok || !validEmailIntelligenceDeliveryState(payload)) throw new Error('delivery settings');
			state = payload;
		} catch { state = null; failure = 'Email delivery settings are unavailable. No delivery preference changed.'; }
		finally { loading = false; }
	}
	async function save(enabled: boolean) {
		saving = true; failure = null; message = null;
		try {
			const response = await fetch(endpoint, {
				method: 'POST', cache: 'no-store', headers: { 'content-type': 'application/json', accept: 'application/json' },
				body: JSON.stringify(enabled ? { enabled: true, confirm: 'activate_verified_email' } : { enabled: false, confirm: 'disable_email' })
			});
			if (!response.ok) throw new Error('delivery settings');
			await load();
			message = enabled ? 'Email delivery is activated for the confirmed owner email.' : 'Email delivery is disabled.';
		} catch { failure = enabled ? 'Email delivery was not activated. No message was sent.' : 'Email delivery was not disabled.'; }
		finally { saving = false; }
	}

	void load();
</script>

<section class="email-delivery" aria-labelledby="email-delivery-heading">
	<div><p class="kicker">Optional email delivery</p><h4 id="email-delivery-heading">Send future private briefs to your confirmed email</h4></div>
	{#if loading && !state}<p class="state" role="status">Checking email delivery settings.</p>
	{:else if state}
		{#if state.destination}<p><strong>Confirmed destination:</strong> {state.destination}</p>{:else}<p>Confirm the owner account email before email delivery can be activated.</p>{/if}
		{#if !state.retentionChosen}<p>Choose private record retention above before activating email delivery.</p>{/if}
		{#if !state.configured}<p>Email delivery is unavailable because the server sender is not configured. You can still keep it disabled.</p>{/if}
		{#if state.enabled}
			<p>Email delivery is active. This page does not send a message.</p>
			<button type="button" disabled={saving} onclick={() => void save(false)}>Disable email delivery</button>
		{:else}
			<button type="button" disabled={saving || !state.configured || !state.retentionChosen || !state.emailVerified} onclick={() => void save(true)}>Enable email delivery</button>
			<p>Enabling records your explicit choice. A provider acceptance for a future brief is not proof that it reached this inbox.</p>
		{/if}
	{:else}<div class="state unavailable"><p>{failure ?? 'Email delivery settings are unavailable.'}</p><button type="button" onclick={() => void load()}>Try email settings again</button></div>{/if}
	{#if failure && state}<p class="answer-error" role="alert">{failure}</p>{/if}
	{#if message}<p class="action-message" role="status">{message}</p>{/if}
</section>

<style>
	.email-delivery { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border, #d6d3d1); }
	.email-delivery h4 { margin: .15rem 0 .5rem; }
	.email-delivery p { margin: .45rem 0; }
</style>
