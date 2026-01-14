<!--
  Badge Component - Status indicators and labels

  Features:
  - 6 semantic variants (default, success, warning, error, info, gold)
  - 2 sizes (sm, md)
  - Design system colors integration

  Usage:
  <Badge>Default</Badge>
  <Badge variant="success">Active</Badge>
  <Badge variant="gold" size="sm">Featured</Badge>
-->

<script lang="ts">
	import { cn } from '$lib/utils';
	import type { Snippet } from 'svelte';

	type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'gold';
	type BadgeSize = 'sm' | 'md';

	interface Props {
		variant?: BadgeVariant;
		size?: BadgeSize;
		class?: string;
		children?: Snippet;
	}

	let { variant = 'default', size = 'md', class: className, children }: Props = $props();

	const variantClasses: Record<BadgeVariant, string> = {
		default: 'bg-charcoal-800 text-charcoal-300',
		success: 'bg-green-500/20 text-green-400',
		warning: 'bg-amber-500/20 text-amber-400',
		error: 'bg-red-500/20 text-red-400',
		info: 'bg-blue-500/20 text-blue-400',
		gold: 'bg-gold-500/20 text-gold-400'
	};

	const sizeClasses: Record<BadgeSize, string> = {
		sm: 'px-2 py-0.5 text-xs',
		md: 'px-2.5 py-1 text-sm'
	};
</script>

<span
	class={cn(
		'inline-flex items-center font-medium rounded-full',
		variantClasses[variant],
		sizeClasses[size],
		className
	)}
>
	{@render children?.()}
</span>
