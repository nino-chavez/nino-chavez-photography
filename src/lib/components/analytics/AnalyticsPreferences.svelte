<script lang="ts">
	import { getAnalyticsPreferences, saveAnalyticsPreferences, type AnalyticsPreferenceState } from '$lib/analytics/visit';
	import { base } from '$app/paths';

	let preferences = $state<AnalyticsPreferenceState>(getAnalyticsPreferences());
	let saving = $state(false);
	let message = $state('');

	async function persist(): Promise<void> {
		saveAnalyticsPreferences(preferences);
		saving = true;
		try {
			const response = await fetch(`${base}/api/analytics/preferences`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(preferences) });
			message = response.ok ? 'Analytics preference saved for this browser.' : 'The local preference is saved; server exclusion could not be updated.';
		} catch { message = 'The local preference is saved; server exclusion could not be updated.'; }
		finally { saving = false; }
	}
</script>

<section aria-labelledby="analytics-preferences-title" class="rounded-lg border border-charcoal-800 bg-charcoal-900 p-4">
	<h2 id="analytics-preferences-title" class="text-base font-medium text-charcoal-100">Analytics preference</h2>
	<p class="mt-1 text-sm text-charcoal-400">Linked analytics is optional. It uses random browser and visit IDs. Turning it off stops future linked collection and provider export.</p>
	<label class="mt-3 flex gap-3 text-sm text-charcoal-200"><input type="checkbox" bind:checked={preferences.linkedAnalytics} onchange={persist} disabled={saving} /> Allow linked analytics</label>
	<label class="mt-3 flex gap-3 text-sm text-charcoal-200"><input type="checkbox" bind:checked={preferences.excludeThisBrowser} onchange={persist} disabled={saving} /> Exclude this browser from audience analytics</label>
	{#if message}<p class="mt-3 text-sm text-charcoal-400" aria-live="polite">{message}</p>{/if}
</section>
