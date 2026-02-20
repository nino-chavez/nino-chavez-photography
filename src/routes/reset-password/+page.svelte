<script lang="ts">
	import { base } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	interface Props {
		form?: ActionData;
	}

	let { form }: Props = $props();
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
	<div class="max-w-md w-full space-y-8">
		<div>
			<h2 class="text-center text-3xl font-bold text-gray-900">Reset Password</h2>
			<p class="mt-2 text-center text-sm text-gray-600">Enter your new password below</p>
		</div>

		<form class="mt-8 space-y-6" method="POST" use:enhance>
			<div class="rounded-md shadow-sm space-y-4">
				<div>
					<label for="password" class="sr-only">New password</label>
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="new-password"
						required
						minlength={8}
						class="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
						placeholder="New password"
					/>
				</div>
				<div>
					<label for="confirmPassword" class="sr-only">Confirm password</label>
					<input
						id="confirmPassword"
						name="confirmPassword"
						type="password"
						autocomplete="new-password"
						required
						minlength={8}
						class="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
						placeholder="Confirm new password"
					/>
				</div>
			</div>

			{#if form?.error}
				<div class="rounded-md bg-red-50 p-4">
					<p class="text-sm font-medium text-red-800">{form.error}</p>
				</div>
			{/if}

			<div>
				<button
					type="submit"
					class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
				>
					Update password
				</button>
			</div>
		</form>

		<div class="text-center">
			<a href="{base}/login" class="text-sm text-blue-600 hover:text-blue-500"> &larr; Back to login </a>
		</div>
	</div>
</div>
