<!--
  Toast Notification Component

  Displays temporary notification messages for user actions.

  Features:
  - Auto-dismiss (default 3000ms)
  - Manual dismiss (close button)
  - Slide-in animation
  - Variant support (success, error, info, warning)
  - Icon support
  - Accessible (role="status", aria-live)

  Usage:
  ```svelte
  <Toast variant="success" icon={Heart} onClose={handleClose}>
    Added to Favorites (12 total)
  </Toast>
  ```
-->

<script lang="ts">
	import { X } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import type { ComponentType, Snippet } from 'svelte';

	interface Props {
		variant?: 'success' | 'error' | 'info' | 'warning';
		icon?: ComponentType;
		duration?: number; // milliseconds, 0 = no auto-dismiss
		onClose?: () => void;
		onAction?: () => void;
		actionLabel?: string;
		children?: Snippet;
	}

	let { variant = 'info', icon, duration = 3000, onClose, onAction, actionLabel, children }: Props = $props();

	let visible = $state(true);
	let timeoutId: number | null = null;

	const variantStyles = {
		success: 'bg-green-500/20 border-green-500/50 text-green-300',
		error: 'bg-red-500/20 border-red-500/50 text-red-300',
		info: 'bg-charcoal-800/95 border-charcoal-700 text-white',
		warning: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300'
	};

	function close() {
		visible = false;
		if (timeoutId) clearTimeout(timeoutId);
		onClose?.();
	}

	function handleAction() {
		onAction?.();
		close();
	}

	onMount(() => {
		if (duration > 0) {
			timeoutId = window.setTimeout(close, duration);
		}

		return () => {
			if (timeoutId) clearTimeout(timeoutId);
		};
	});
</script>

{#if visible}
	<div
		role={variant === 'error' ? 'alert' : 'status'}
		aria-live={variant === 'error' ? 'assertive' : 'polite'}
		data-toast-item
		class="toast-notice max-w-md"
	>
		<div
			class="flex items-start gap-3 px-4 py-3 rounded-lg border backdrop-blur-md shadow-lg
                       {variantStyles[variant]}"
		>
			<!-- Icon (optional) -->
			{#if icon}
				{@const IconComponent = icon}
				<div class="shrink-0 mt-0.5">
					<IconComponent class="w-5 h-5" />
				</div>
			{/if}

			<!-- Content -->
			<div class="flex-1 text-sm leading-relaxed">
				{@render children?.()}
			</div>

			{#if actionLabel && onAction}
				<button
					onclick={handleAction}
					class="shrink-0 rounded px-2 py-1 text-sm font-semibold underline decoration-2 underline-offset-4 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gallery-accent,#CBD8DF)]"
				>
					{actionLabel}
				</button>
			{/if}

			<!-- Close button -->
			<button
				onclick={close}
				class="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
				aria-label="Dismiss notification"
			>
				<X class="w-4 h-4" />
			</button>
		</div>

		<!-- Progress bar (if auto-dismiss) -->
		{#if duration > 0}
			<div class="h-1 bg-white/10 rounded-b-lg overflow-hidden mt-1">
				<div
					class="h-full bg-white/40 rounded-b-lg"
					style="animation: shrink {duration}ms linear forwards;"
				></div>
			</div>
		{/if}
	</div>
{/if}

<style>
	@keyframes shrink {
		from {
			width: 100%;
		}
		to {
			width: 0%;
		}
	}

	.toast-notice {
		animation: toast-in 160ms ease-out;
	}

	@keyframes toast-in {
		from { opacity: 0; transform: translateY(0.5rem); }
		to { opacity: 1; transform: translateY(0); }
	}

	@media (prefers-reduced-motion: reduce) {
		.toast-notice,
		.toast-notice * {
			animation: none !important;
			transition: none !important;
		}
	}
</style>
