<script lang="ts">
	import { getAnalyticsPreferences, saveAnalyticsPreferences, subscribeAnalyticsPreferences, type AnalyticsPreferenceState } from '$lib/analytics/visit';
	import { onMount } from 'svelte';
	import { base } from '$app/paths';

	let preferences = $state<AnalyticsPreferenceState>(getAnalyticsPreferences());
	let onReportHost = $state(false);
	onMount(() => {
		onReportHost = location.hostname === 'analytics.ninochavez.co';
		if (onReportHost) return;
		fetch(`${base}/api/analytics/preferences`, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(next => { saveAnalyticsPreferences(next); savedPreferences = getAnalyticsPreferences(); preferences = { ...savedPreferences }; reading = false; }).catch(() => { message = 'Could not read your saved choices. Please reload before changing them.'; });
	});
	let reading = $state(true);
	let saving = $state(false);
	let message = $state('');
	let savedPreferences = $state<AnalyticsPreferenceState>(getAnalyticsPreferences());

	$effect(() => subscribeAnalyticsPreferences((next) => {
		savedPreferences = next;
		preferences = { ...next };
	}));

	async function persist(): Promise<void> {
		saving = true;
		try {
			const response = await fetch(`${base}/api/analytics/preferences`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(preferences) });
			if (!response.ok) throw new Error('preference_rejected');
			saveAnalyticsPreferences(preferences);
			savedPreferences = getAnalyticsPreferences();
			preferences = { ...savedPreferences };
			message = 'Analytics preference saved for this browser.';
		} catch {
			// Do not clear the local browser ID until the server has revoked queued exports.
			preferences = { ...savedPreferences };
			message = 'Your previous preference remains active. Please try again.';
		}
		finally { saving = false; }
	}
</script>

<section aria-labelledby="analytics-preferences-title" class="analytics-preferences">
	<p class="eyebrow">Your choice</p>
	<h2 id="analytics-preferences-title">Analytics preferences</h2>
	<p>Linked analytics is optional. It uses random browser and visit IDs. Turning it off stops new linked collection and cancels queued exports. Records already being sent or stored by the provider are not automatically deleted.</p>
	{#if onReportHost}<p><a href="https://ninochavez.co/photography/analytics-preferences" target="_blank" rel="noopener noreferrer">Set choices for ninochavez.co in this browser</a>. The report subdomain has separate cookies.</p>{:else}
	<label><input type="checkbox" bind:checked={preferences.linkedAnalytics} onchange={persist} disabled={saving || reading} /> <span>Allow linked analytics</span></label>
	<label><input type="checkbox" bind:checked={preferences.excludeThisBrowser} onchange={persist} disabled={saving || reading} /> <span>Exclude this browser from audience analytics</span></label>
	{/if}
	{#if message}<p class="status" aria-live="polite">{message}</p>{/if}
</section>

<style>
	.analytics-preferences { border: 1px solid #d8e0ea; border-radius: .8rem; background: #fff; padding: 1rem; color: #172033; }
	.eyebrow { margin: 0; color: #174ea6; font-size: .7rem; font-weight: 650; letter-spacing: .16em; text-transform: uppercase; }
	h2 { margin: .2rem 0 0; font-size: 1.2rem; font-weight: 650; }
	p { margin: .5rem 0 0; color: #526176; font-size: .875rem; line-height: 1.5; }
	label { display: flex; min-height: 2.75rem; align-items: center; gap: .65rem; margin-top: .55rem; color: #172033; font-size: .875rem; }
	input { width: 1.1rem; height: 1.1rem; accent-color: #1769e0; }
	input:focus-visible { outline: 2px solid #1769e0; outline-offset: 2px; }
	.status { color: #243b5a; }
</style>
