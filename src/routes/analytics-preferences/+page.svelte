<script lang="ts">
 import AnalyticsPreferences from '$lib/components/analytics/AnalyticsPreferences.svelte';
</script>
<svelte:head><title>Analytics choices — Nino Chavez</title><meta name="robots" content="noindex" /></svelte:head>
<div class="choices"><h1>Analytics choices for ninochavez.co</h1><p>These choices apply to the profile, writing, demos and photography in this browser. They do not follow your email address or Chrome profile to another browser.</p><AnalyticsPreferences /><p>Cloudflare’s separate cookieless traffic totals may still include your visits. <a href="https://ninochavez.co/privacy">Read the privacy notice</a>.</p></div>


<style>
 .choices{max-width:48rem;margin:0 auto;padding:clamp(1.5rem,4vw,3.5rem) max(1rem,env(safe-area-inset-left));color:#f4f4f5}
 .choices h1{font-family:Inter,system-ui,sans-serif;font-size:clamp(1.8rem,4vw,2.8rem);font-weight:650;line-height:1.13;letter-spacing:-.04em;overflow-wrap:anywhere}
 .choices>p{color:#a1a1aa;font-size:1rem;line-height:1.65}
 .choices>p a{color:#D4AF37;text-underline-offset:.2em}
</style>
