<!--
  Button Component - Interactive buttons with design tokens

  Usage:
  <Button variant="primary" onclick={handleClick}>Submit</Button>
  <Button variant="secondary" size="sm">Cancel</Button>
  <Button variant="ghost" disabled>Loading...</Button>
-->

<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline';
	type ButtonSize = 'sm' | 'md' | 'lg';

	interface Props extends HTMLAttributes<HTMLButtonElement> {
		variant?: ButtonVariant;
		size?: ButtonSize;
		disabled?: boolean;
		loading?: boolean;
		class?: string;
		type?: 'button' | 'submit' | 'reset';
		onclick?: (event: MouseEvent) => void;
		children?: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		disabled = false,
		loading = false,
		class: className,
		type = 'button',
		onclick,
		children,
		...restProps
	}: Props = $props();

	// Disable button when loading
	const isDisabled = $derived(disabled || loading);

	// Variant styles — primary/secondary use the elevated component classes
	// (.btn-gold / .btn-charcoal in app.css) which own their gradient, depth, and
	// transition. Don't add `transition-*`/`bg-*`/`font-*` utilities to those two —
	// Tailwind's utilities layer would override the component-layer transition.
	const variantClasses: Record<ButtonVariant, string> = {
		primary: 'btn-gold disabled:opacity-50 disabled:cursor-not-allowed',
		secondary: 'btn-charcoal disabled:opacity-50 disabled:cursor-not-allowed',
		ghost:
			'bg-transparent hover:bg-charcoal-800 text-charcoal-300 hover:text-white font-medium transition-colors disabled:text-charcoal-400 disabled:cursor-not-allowed',
		outline:
			'bg-transparent border-2 border-gold-500/70 text-gold-400 hover:border-gold-400 hover:bg-gold-500 hover:text-charcoal-950 font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed',
	};

	// Size styles - All sizes ensure minimum 44px touch targets for mobile accessibility
	const sizeClasses: Record<ButtonSize, string> = {
		sm: 'px-3 py-2.5 text-sm min-h-[44px]',
		md: 'px-6 py-3 text-base min-h-[44px]',
		lg: 'px-8 py-4 text-lg min-h-[44px]',
	};

	// Base classes (shared across all variants). No transition/font/bg here — those
	// are owned per-variant so the elevated component classes aren't overridden.
	const baseClasses =
		'inline-flex items-center justify-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 focus-visible:ring-offset-charcoal-950';

	// Combine all classes (reactive to prop changes)
	let combinedClasses = $derived(cn(
		baseClasses,
		variantClasses[variant],
		sizeClasses[size],
		className,
	));
</script>

<button
	{type}
	disabled={isDisabled}
	class={combinedClasses}
	{onclick}
	{...restProps}
>
	{#if loading}
		<svg
			class="animate-spin w-4 h-4"
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			aria-hidden="true"
		>
			<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
			<path
				class="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
			/>
		</svg>
	{/if}
	{@render children?.()}
</button>
