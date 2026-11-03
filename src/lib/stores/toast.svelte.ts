/**
 * Toast Store
 *
 * Manages toast notifications globally across the application.
 *
 * Usage:
 * ```typescript
 * import { toast } from '$lib/stores/toast.svelte';
 *
 * // Show success toast
 * toast.success('Photo added to favorites!', { duration: 3000 });
 *
 * // Show error toast
 * toast.error('Failed to save photo', { duration: 5000 });
 *
 * // Show custom toast
 * toast.show({
 *   message: 'Processing...',
 *   variant: 'info',
 *   icon: LoaderCircle,
 *   duration: 0 // No auto-dismiss
 * });
 * ```
 */

import type { ComponentType } from 'svelte';

export interface ToastOptions {
	variant?: 'success' | 'error' | 'info' | 'warning';
	icon?: ComponentType;
	duration?: number;
	action?: ToastAction;
	/**
	 * Replaces the current notice for a single recoverable action. This keeps the
	 * latest Undo visible instead of allowing a rapid series of removals to bury it.
	 */
	replaceKey?: string;
}

export interface ToastAction {
	label: string;
	onAction: () => void;
}

export interface ToastItem extends ToastOptions {
	id: string;
	message: string;
}

const MAX_TOASTS = 3;

class ToastStore {
	private toasts = $state<ToastItem[]>([]);
	private nextId = 0;

	/**
	 * Get all active toasts
	 */
	get items(): ToastItem[] {
		return this.toasts;
	}

	/**
	 * Show a toast notification
	 */
	show(message: string, options: ToastOptions = {}): string {
		if (options.replaceKey) {
			this.toasts = this.toasts.filter((item) => item.replaceKey !== options.replaceKey);
		}

		const id = `toast-${this.nextId++}`;
		const nextToast: ToastItem = {
			id,
			message,
			variant: options.variant ?? 'info',
			icon: options.icon,
			duration: options.duration ?? 3000,
			action: options.action,
			replaceKey: options.replaceKey
		};

		// Actions are recoverable work. Preserve them and discard the oldest ordinary
		// notice first so a pending Undo never disappears just because a later save
		// succeeded.
		let items = [...this.toasts, nextToast];
		while (items.length > MAX_TOASTS) {
			const removableIndex = items.findIndex((item) => !item.action);
			if (removableIndex === -1) break;
			items.splice(removableIndex, 1);
		}
		this.toasts = items;

		// Auto-remove after duration (if specified)
		if (nextToast.duration && nextToast.duration > 0) {
			setTimeout(() => this.remove(id), nextToast.duration);
		}

		return id;
	}

	/**
	 * Show success toast (convenience method)
	 */
	success(message: string, options: Omit<ToastOptions, 'variant'> = {}): string {
		return this.show(message, { ...options, variant: 'success' });
	}

	/**
	 * Show error toast (convenience method)
	 */
	error(message: string, options: Omit<ToastOptions, 'variant'> = {}): string {
		return this.show(message, { ...options, variant: 'error' });
	}

	/**
	 * Show info toast (convenience method)
	 */
	info(message: string, options: Omit<ToastOptions, 'variant'> = {}): string {
		return this.show(message, { ...options, variant: 'info' });
	}

	/**
	 * Show warning toast (convenience method)
	 */
	warning(message: string, options: Omit<ToastOptions, 'variant'> = {}): string {
		return this.show(message, { ...options, variant: 'warning' });
	}

	/**
	 * Remove a specific toast
	 */
	remove(id: string): void {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}

	invokeAction(id: string): void {
		const item = this.toasts.find((toast) => toast.id === id);
		if (!item?.action) return;
		this.remove(id);
		item.action.onAction();
	}

	/**
	 * Clear all toasts
	 */
	clear(): void {
		this.toasts = [];
	}
}

/**
 * Global toast store instance
 */
export const toast = new ToastStore();
