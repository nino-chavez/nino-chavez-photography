<!--
  Accessibility Settings Page

  Provides user controls for accessibility preferences.
  Phase 1 Implementation (WCAG Compliance):
  - Disable quality dimming
  - Always show emotion labels
  - High contrast mode
  - Quality score overlays
-->

<script lang="ts">
	import { base } from '$app/paths';
	import { accessibility } from '$lib/stores/accessibility.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { Eye, EyeOff, Tag, Contrast, BarChart3, RotateCcw } from 'lucide-svelte';

	// Track if preferences have changed
	let hasChanges = $state(false);

	function handleReset() {
		if (confirm('Reset all accessibility settings to defaults?')) {
			accessibility.resetToDefaults();
			hasChanges = false;
		}
	}
</script>

<svelte:head>
	<title>Accessibility Settings - Nino Chavez Gallery</title>
	<!-- Per-visitor page: nothing here is the same for two people, so there is
	     nothing to index. Follow is kept so the gallery links still carry. -->
	<meta name="robots" content="noindex, follow" />
</svelte:head>

<header class="accessibility-opening">
		<div class="accessibility-title-row">
			<div>
				<p class="accessibility-eyebrow">Display preferences</p>
				<h1>Accessibility settings</h1>
				<p class="accessibility-deck">
					Adjust how gallery effects appear in this browser.
				</p>
			</div>
			<a href="{base}/" class="accessibility-back">
				← Back to Gallery
			</a>
		</div>
</header>

<!-- Main Content -->
<main class="accessibility-content">

	<!-- Introduction -->
	<Card class="setting-section setting-intro">
		<h2 class="text-lg font-semibold mb-3 text-gold-400">About These Settings</h2>
		<p class="text-sm text-charcoal-300 leading-relaxed">
			The gallery uses visual effects like colored halos, shimmer animations, and photo dimming
			to encode information. These settings provide "escape hatches" if any effects impact
			your experience. All settings are saved to your browser.
		</p>
	</Card>

	<!-- Quality Dimming -->
	<Card class="setting-section">
		<div class="flex items-start gap-4">
			<div class="mt-1 text-gold-400">
				{#if accessibility.disableQualityDimming}
					<Eye class="w-5 h-5" />
				{:else}
					<EyeOff class="w-5 h-5" />
				{/if}
			</div>
			<div class="flex-1">
				<h3 class="text-base font-semibold mb-2">Disable Quality Dimming</h3>
				<p class="text-sm text-charcoal-400 mb-4 leading-relaxed">
					By default, lower-quality photos (scored below 6/10) are slightly blurred and dimmed.
					Enable this setting to show all photos at full brightness. Recommended for users with
					low vision or display brightness limitations.
				</p>
				<label class="flex items-center gap-3 cursor-pointer">
					<input
						type="checkbox"
						checked={accessibility.disableQualityDimming}
						onchange={() => {
							accessibility.toggleQualityDimming();
							hasChanges = true;
						}}
						class="w-5 h-5 rounded border-charcoal-700 bg-charcoal-800
						       text-gold-500 focus:ring-2 focus:ring-gold-500/50
						       focus:ring-offset-2 focus:ring-offset-charcoal-950"
					/>
					<span class="text-sm font-medium">
						{accessibility.disableQualityDimming ? 'Enabled' : 'Disabled'}
					</span>
				</label>
			</div>
		</div>
	</Card>

	<!-- Emotion Labels -->
	<Card class="setting-section">
		<div class="flex items-start gap-4">
			<div class="mt-1 text-gold-400">
				<Tag class="w-5 h-5" />
			</div>
			<div class="flex-1">
				<h3 class="text-base font-semibold mb-2">Always Show Emotion Labels</h3>
				<p class="text-sm text-charcoal-400 mb-4 leading-relaxed">
					Emotion halos use colored glows to indicate photo emotion (Triumph, Intensity, Focus, etc.).
					By default, text labels appear only on hover. Enable this to always show emotion text alongside
					the colored icon. <strong>WCAG 1.4.1 compliant:</strong> ensures color is not the only
					means of conveying information.
				</p>
				<label class="flex items-center gap-3 cursor-pointer">
					<input
						type="checkbox"
						checked={accessibility.alwaysShowEmotionLabels}
						onchange={() => {
							accessibility.toggleEmotionLabels();
							hasChanges = true;
						}}
						class="w-5 h-5 rounded border-charcoal-700 bg-charcoal-800
						       text-gold-500 focus:ring-2 focus:ring-gold-500/50
						       focus:ring-offset-2 focus:ring-offset-charcoal-950"
					/>
					<span class="text-sm font-medium">
						{accessibility.alwaysShowEmotionLabels ? 'Enabled' : 'Disabled'}
					</span>
				</label>
			</div>
		</div>
	</Card>

	<!-- High Contrast Mode -->
	<Card class="setting-section">
		<div class="flex items-start gap-4">
			<div class="mt-1 text-gold-400">
				<Contrast class="w-5 h-5" />
			</div>
			<div class="flex-1">
				<h3 class="text-base font-semibold mb-2">High Contrast Mode</h3>
				<p class="text-sm text-charcoal-400 mb-4 leading-relaxed">
					Enhances visual contrast for emotion halos and quality indicators. Uses stronger borders
					and patterns instead of subtle shadows. Automatically enabled if your OS reports
					<code class="text-xs bg-charcoal-800 px-1 py-0.5 rounded">prefers-contrast: more</code>.
				</p>
				<label class="flex items-center gap-3 cursor-pointer">
					<input
						type="checkbox"
						checked={accessibility.highContrastMode}
						onchange={() => {
							accessibility.toggleHighContrast();
							hasChanges = true;
						}}
						class="w-5 h-5 rounded border-charcoal-700 bg-charcoal-800
						       text-gold-500 focus:ring-2 focus:ring-gold-500/50
						       focus:ring-offset-2 focus:ring-offset-charcoal-950"
					/>
					<span class="text-sm font-medium">
						{accessibility.highContrastMode ? 'Enabled' : 'Disabled'}
					</span>
				</label>
			</div>
		</div>
	</Card>

	<!-- Quality Scores -->
	<Card class="setting-section">
		<div class="flex items-start gap-4">
			<div class="mt-1 text-gold-400">
				<BarChart3 class="w-5 h-5" />
			</div>
			<div class="flex-1">
				<h3 class="text-base font-semibold mb-2">Show Quality Scores</h3>
				<p class="text-sm text-charcoal-400 mb-4 leading-relaxed">
					Display numeric quality scores (0-10) as text overlays on photos. Useful for understanding
					why certain photos have visual treatments applied (shimmer for 9+, dimming for &lt;6).
				</p>
				<label class="flex items-center gap-3 cursor-pointer">
					<input
						type="checkbox"
						checked={accessibility.showQualityScores}
						onchange={() => {
							accessibility.toggleQualityScores();
							hasChanges = true;
						}}
						class="w-5 h-5 rounded border-charcoal-700 bg-charcoal-800
						       text-gold-500 focus:ring-2 focus:ring-gold-500/50
						       focus:ring-offset-2 focus:ring-offset-charcoal-950"
					/>
					<span class="text-sm font-medium">
						{accessibility.showQualityScores ? 'Enabled' : 'Disabled'}
					</span>
				</label>
			</div>
		</div>
	</Card>

	<!-- System Preferences Detection -->
	<Card class="setting-section">
		<h3 class="text-base font-semibold mb-3">System Preferences</h3>
		<p class="text-sm text-charcoal-400 mb-4 leading-relaxed">
			The gallery automatically respects your OS accessibility settings:
		</p>
		<ul class="text-sm text-charcoal-400 space-y-2">
			<li class="flex items-start gap-2">
				<span class="text-gold-400 mt-0.5">✓</span>
				<span>
					<code class="text-xs bg-charcoal-800 px-1 py-0.5 rounded">prefers-reduced-motion</code>
					disables animations
				</span>
			</li>
			<li class="flex items-start gap-2">
				<span class="text-gold-400 mt-0.5">✓</span>
				<span>
					<code class="text-xs bg-charcoal-800 px-1 py-0.5 rounded">prefers-contrast: more</code>
					enables high contrast mode
				</span>
			</li>
		</ul>
		{#if accessibility.disableAnimations}
			<div class="mt-4 p-3 bg-gold-500/10 border border-gold-500/30 rounded-lg">
				<p class="text-xs text-gold-400">
					<strong>Note:</strong> Animations are currently disabled based on your system preference.
				</p>
			</div>
		{/if}
	</Card>

	<!-- Actions -->
	<div class="flex items-center justify-between gap-4 pt-4">
		<Button variant="secondary" size="md" onclick={handleReset}>
			<RotateCcw class="w-4 h-4" />
			Reset to Defaults
		</Button>

		{#if hasChanges}
			<p class="text-xs text-gold-400">
				Settings saved automatically
			</p>
		{/if}
	</div>

	<!-- Footer Info -->
	<Card class="setting-section setting-help">
		<h3 class="text-sm font-semibold mb-2 text-charcoal-300">Need More Help?</h3>
		<p class="text-xs text-charcoal-400 leading-relaxed">
			These settings are designed to provide flexible options for users with different
			accessibility needs. If you encounter any issues or have suggestions for additional
			accessibility features, please <a href="mailto:nino@ninochavez.co" class="text-gold-500 hover:text-gold-400 transition-colors">email Nino</a>.
		</p>
	</Card>
</main>

<style>
	.accessibility-opening, .accessibility-content { width: min(920px, calc(100% - 64px)); margin-inline: auto; }
	.accessibility-opening { padding-block: 40px 28px; border-bottom: 1px solid var(--color-charcoal-800); }
	.accessibility-title-row { display: flex; align-items: end; justify-content: space-between; gap: 24px; }
	.accessibility-eyebrow { margin-bottom: 14px; color: var(--color-gold-500); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
	.accessibility-opening h1 { margin: 0; color: white; font-family: Montserrat, sans-serif; font-size: clamp(32px, 4vw, 46px); font-weight: 750; line-height: 1.08; letter-spacing: -.035em; }
	.accessibility-deck { margin-top: 12px; color: var(--color-charcoal-300); font-size: 16px; }
	.accessibility-back { display: inline-flex; align-items: center; min-height: 44px; color: var(--color-charcoal-300); font-size: 14px; white-space: nowrap; }
	.accessibility-back:hover { color: var(--color-gold-400); }
	.accessibility-content { display: grid; gap: 0; padding-block: 10px 72px; }
	.accessibility-content :global(.setting-section) { padding: 26px 0; border: 0; border-bottom: 1px solid var(--color-charcoal-800); border-radius: 0; background: transparent; box-shadow: none; }
	.accessibility-content :global(.setting-intro) { border-top: 0; }
	.accessibility-content :global(.setting-help) { margin-top: 14px; }
	@media (max-width: 640px) {
		.accessibility-opening, .accessibility-content { width: calc(100% - 40px); }
		.accessibility-opening { padding-block: 24px 22px; }
		.accessibility-title-row { align-items: start; flex-direction: column; gap: 10px; }
		.accessibility-back { white-space: normal; }
	}
</style>
