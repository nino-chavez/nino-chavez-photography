<script lang="ts">
	import { page } from '$app/stores';
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	interface Props {
		form?: ActionData;
	}

	let { form }: Props = $props();

	let mode = $state<'password' | 'magicLink' | 'forgotPassword'>('password');

	let callbackError = $derived($page.url.searchParams.get('error'));

	// Show success for magic link or forgot password submissions
	let showSuccess = $derived(form?.success === true);
	let successMessage = $derived(
		form?.action === 'magicLink'
			? 'Check your email for a magic link to sign in.'
			: form?.action === 'forgotPassword'
				? 'Check your email for a password reset link.'
				: ''
	);
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
	<div class="max-w-md w-full space-y-8">
		<div>
			<h2 class="text-center text-3xl font-bold text-gray-900">Admin Login</h2>
			<p class="mt-2 text-center text-sm text-gray-600">
				{#if mode === 'password'}
					Sign in to access the tag moderation dashboard
				{:else if mode === 'magicLink'}
					We'll send you a magic link to sign in
				{:else}
					Enter your email to reset your password
				{/if}
			</p>
		</div>

		{#if callbackError}
			<div class="rounded-md bg-red-50 p-4">
				<p class="text-sm font-medium text-red-800">Authentication failed. Please try again.</p>
			</div>
		{/if}

		{#if showSuccess}
			<div class="rounded-md bg-green-50 p-4">
				<p class="text-sm font-medium text-green-800">{successMessage}</p>
			</div>
		{/if}

		{#if mode === 'password'}
			<form class="mt-8 space-y-6" method="POST" action="?/login" use:enhance>
				<div class="rounded-md shadow-sm space-y-4">
					<div>
						<label for="email" class="sr-only">Email address</label>
						<input
							id="email"
							name="email"
							type="email"
							autocomplete="email"
							required
							class="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
							placeholder="Email address"
						/>
					</div>
					<div>
						<label for="password" class="sr-only">Password</label>
						<input
							id="password"
							name="password"
							type="password"
							autocomplete="current-password"
							required
							class="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
							placeholder="Password"
						/>
					</div>
				</div>

				{#if form?.error && form?.action === 'login'}
					<div class="rounded-md bg-red-50 p-4">
						<p class="text-sm font-medium text-red-800">{form.error}</p>
					</div>
				{/if}

				<div>
					<button
						type="submit"
						class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
					>
						Sign in
					</button>
				</div>

				<div class="flex items-center justify-between text-sm">
					<button type="button" onclick={() => (mode = 'forgotPassword')} class="text-blue-600 hover:text-blue-500">
						Forgot your password?
					</button>
					<button type="button" onclick={() => (mode = 'magicLink')} class="text-blue-600 hover:text-blue-500">
						Use magic link
					</button>
				</div>
			</form>
		{:else if mode === 'magicLink'}
			<form class="mt-8 space-y-6" method="POST" action="?/magicLink" use:enhance>
				<div>
					<label for="magic-email" class="sr-only">Email address</label>
					<input
						id="magic-email"
						name="email"
						type="email"
						autocomplete="email"
						required
						class="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
						placeholder="Email address"
					/>
				</div>

				{#if form?.error && form?.action === 'magicLink'}
					<div class="rounded-md bg-red-50 p-4">
						<p class="text-sm font-medium text-red-800">{form.error}</p>
					</div>
				{/if}

				<div>
					<button
						type="submit"
						class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
					>
						Send magic link
					</button>
				</div>

				<div class="text-center">
					<button type="button" onclick={() => (mode = 'password')} class="text-sm text-blue-600 hover:text-blue-500">
						Back to password login
					</button>
				</div>
			</form>
		{:else}
			<form class="mt-8 space-y-6" method="POST" action="?/forgotPassword" use:enhance>
				<div>
					<label for="reset-email" class="sr-only">Email address</label>
					<input
						id="reset-email"
						name="email"
						type="email"
						autocomplete="email"
						required
						class="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
						placeholder="Email address"
					/>
				</div>

				{#if form?.error && form?.action === 'forgotPassword'}
					<div class="rounded-md bg-red-50 p-4">
						<p class="text-sm font-medium text-red-800">{form.error}</p>
					</div>
				{/if}

				<div>
					<button
						type="submit"
						class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
					>
						Send reset link
					</button>
				</div>

				<div class="text-center">
					<button type="button" onclick={() => (mode = 'password')} class="text-sm text-blue-600 hover:text-blue-500">
						Back to password login
					</button>
				</div>
			</form>
		{/if}

		<div class="text-center">
			<a href="{base}/" class="text-sm text-blue-600 hover:text-blue-500"> &larr; Back to gallery </a>
		</div>
	</div>
</div>
