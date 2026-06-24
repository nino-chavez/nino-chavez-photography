<!--
  Card Component - Container with charcoal background and border

  Usage:
  <Card>
    <h2>Card Title</h2>
    <p>Card content...</p>
  </Card>

  <Card variant="elevated" padding="lg">
    <p>Elevated card with large padding</p>
  </Card>
-->

<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type CardVariant = 'default' | 'elevated' | 'bordered';
	type CardPadding = 'none' | 'sm' | 'md' | 'lg';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		variant?: CardVariant;
		padding?: CardPadding;
		class?: string;
		children?: Snippet;
	}

	let {
		variant = 'default',
		padding = 'md',
		class: className,
		children,
		...restProps
	}: Props = $props();

	// Variant styles — `elevated` uses the shared raised-surface treatment
	// (hairline highlight + two-layer shadow); `default` keeps just the hairline.
	const variantClasses: Record<CardVariant, string> = {
		default:
			'bg-charcoal-900 border border-charcoal-800 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]',
		elevated: 'surface-raised',
		bordered: 'bg-charcoal-950 border-2 border-charcoal-700',
	};

	// Padding styles
	const paddingClasses: Record<CardPadding, string> = {
		none: 'p-0',
		sm: 'p-4',
		md: 'p-6',
		lg: 'p-8',
	};

	// Base classes
	const baseClasses = 'rounded-lg';

	// Combine all classes (reactive to prop changes)
	let combinedClasses = $derived(cn(
		baseClasses,
		variantClasses[variant],
		paddingClasses[padding],
		className,
	));
</script>

<div class={combinedClasses} {...restProps}>
	{@render children?.()}
</div>
