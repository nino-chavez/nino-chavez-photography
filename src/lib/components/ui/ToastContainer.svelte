<!--
  Toast Container Component

  Renders all active toast notifications from the toast store.
  Should be placed in root layout to be available globally.
-->

<script lang="ts">
	import { toast } from '$lib/stores/toast.svelte';
	import Toast from './Toast.svelte';

	const toasts = $derived(toast.items);
</script>

<!-- One viewport owner; individual notices remain in normal stack flow. -->
<div
	class="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[10000] mx-auto flex max-h-[42vh] w-auto max-w-md flex-col-reverse gap-3 overflow-y-auto pointer-events-none sm:inset-x-auto sm:right-6 sm:bottom-6"
	data-toast-container
>
	{#each toasts as item (item.id)}
		<div class="pointer-events-auto" data-toast-stack-item>
			<Toast
				variant={item.variant}
				icon={item.icon}
				duration={0}
				actionLabel={item.action?.label}
				onAction={() => toast.invokeAction(item.id)}
				onClose={() => toast.remove(item.id)}
			>
				{item.message}
			</Toast>
		</div>
	{/each}
</div>
