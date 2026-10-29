<!--
  Root Error Boundary

  Catches errors that occur anywhere in the application and displays
  a user-friendly error message.

  Reference: https://kit.svelte.dev/docs/errors
-->

<script lang="ts">
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { AlertCircle, Home, RefreshCw } from 'lucide-svelte';
	import Typography from '$lib/components/ui/Typography.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	function handleRefresh() {
		window.location.reload();
	}

</script>

<div class="error-page">
		<div class="error-inner" style="animation: fade-slide-up 0.3s ease-out forwards">
			<div class="error-content">
				<!-- Error Icon -->
				<AlertCircle class="w-8 h-8 text-red-500" aria-hidden="true" />

				<!-- Error Message -->
				<div class="error-copy">
					<p class="error-eyebrow">Error {$page.status}</p>
					<Typography variant="h1" class="error-title">
						{$page.status === 404 ? 'Page Not Found' : 'Something Went Wrong'}
					</Typography>

					<Typography variant="body" class="error-description">
						{#if $page.status === 404}
							The page you're looking for doesn't exist. It may have been moved or deleted.
						{:else if $page.error?.message}
							{$page.error.message}
						{:else}
							An unexpected error occurred. Please try refreshing the page or return to the
							homepage.
						{/if}
					</Typography>

				</div>

				<!-- Actions -->
				<div class="error-actions">
					<a class="error-home" href="{base}/">
						<Home class="w-4 h-4" />
						Gallery home
					</a>

					{#if $page.status !== 404}
						<Button variant="secondary" onclick={handleRefresh}>
							<RefreshCw class="w-4 h-4" />
							Refresh
						</Button>
					{/if}
				</div>
			</div>
		</div>
</div>

<style>
	.error-page { min-height: 100vh; display: grid; align-items: center; background: var(--color-charcoal-950); padding: 32px; }
	.error-inner { width: min(680px, 100%); margin-inline: auto; padding-block: 48px; border-block: 1px solid var(--color-charcoal-800); }
	.error-content { display: grid; gap: 22px; }
	.error-eyebrow { margin-bottom: 12px; color: var(--color-gold-500); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
	.error-copy :global(.error-title) { color: white; font-family: Montserrat, sans-serif; font-size: clamp(32px, 5vw, 46px); font-weight: 750; line-height: 1.08; letter-spacing: -.035em; }
	.error-copy :global(.error-description) { max-width: 560px; margin-top: 14px; color: var(--color-charcoal-300); line-height: 1.65; }
	.error-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
	.error-home { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 10px 16px; background: var(--color-gold-500); color: var(--color-charcoal-950); font-weight: 700; }
	.error-home:hover { background: var(--color-gold-400); }
	.error-home:focus-visible { outline: 2px solid var(--color-gold-500); outline-offset: 4px; }
	@media (max-width: 520px) { .error-page { padding: 20px; } .error-inner { padding-block: 36px; } }
</style>
