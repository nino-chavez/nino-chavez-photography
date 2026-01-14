<!--
  Breadcrumb Component - Navigation path indicator

  Features:
  - Shows hierarchical navigation path
  - Links for all items except the last (current page)
  - Proper accessibility with ARIA labels
  - Responsive text truncation

  Usage:
  <Breadcrumb items={[
    { label: 'Albums', href: '/albums' },
    { label: 'Event Name', href: '/albums/event-key' },
    { label: 'Photo' }
  ]} />
-->

<script lang="ts">
	import { ChevronRight } from 'lucide-svelte';

	interface BreadcrumbItem {
		label: string;
		href?: string;
	}

	interface Props {
		items: BreadcrumbItem[];
		class?: string;
	}

	let { items, class: className = '' }: Props = $props();
</script>

<nav aria-label="Breadcrumb" class={className}>
	<ol class="flex items-center gap-2 text-sm flex-wrap">
		{#each items as item, i}
			<li class="flex items-center gap-2">
				{#if i > 0}
					<ChevronRight class="w-4 h-4 text-charcoal-600 flex-shrink-0" aria-hidden="true" />
				{/if}
				{#if item.href && i < items.length - 1}
					<a
						href={item.href}
						class="text-charcoal-400 hover:text-white transition-colors truncate max-w-[150px] sm:max-w-[200px]"
					>
						{item.label}
					</a>
				{:else}
					<span class="text-charcoal-300 font-medium truncate max-w-[150px] sm:max-w-[200px]">
						{item.label}
					</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
