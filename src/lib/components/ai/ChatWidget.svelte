<script lang="ts">
	import { tick } from 'svelte';
	import { base } from '$app/paths';
	import { fly } from 'svelte/transition';
	import { Chat } from '@ai-sdk/svelte';
	import { DefaultChatTransport } from 'ai';
	import { MessageSquare, X, Loader } from 'lucide-svelte';
	import PhotoGrid from './PhotoGrid.svelte';
	import type { ChatPhotoResult } from '$lib/ai/chat-photo-result';

	/** The `searchPhotos` tool's output, as /api/chat shapes it. */
	interface SearchOutput {
		photos?: ChatPhotoResult[];
		error?: string;
	}

	/** Each one sends as typed; every one of them maps to a search the tool can answer. */
	const SUGGESTIONS = [
		'Show me powerful spikes',
		'Find celebration moments',
		'Backlit serves',
		'Photos of player #12'
	];

	const chat = new Chat({
		transport: new DefaultChatTransport({ api: `${base}/api/chat` })
	});

	let isOpen = $state(false);
	let chatContainer = $state<HTMLDivElement>();
	let inputElement = $state<HTMLTextAreaElement>();
	let input = $state('');

	let busy = $derived(chat.status === 'submitted' || chat.status === 'streaming');
	// Show the waiting line until the reply has something on screen.
	let waiting = $derived.by(() => {
		if (!busy) return false;
		const last = chat.messages.at(-1);
		if (!last || last.role !== 'assistant') return true;
		return !last.parts.some(
			(p) => (p.type === 'text' && p.text.trim()) || (p.type === 'tool-searchPhotos' && p.state === 'output-available')
		);
	});
	let searching = $derived(
		chat.messages.at(-1)?.parts.some(
			(p) => p.type === 'tool-searchPhotos' && (p.state === 'input-streaming' || p.state === 'input-available')
		) ?? false
	);

	/** The route answers 400/429/503 with `{ error }`; the transport hands that body over as the message. */
	let errorText = $derived.by(() => {
		if (!chat.error) return '';
		try {
			const parsed = JSON.parse(chat.error.message);
			if (typeof parsed?.error === 'string') return parsed.error;
		} catch {
			// Not JSON: a network failure or a stream error, both covered by the line below.
		}
		return 'Shot Bot could not answer just now. Please try again.';
	});

	function send(text: string) {
		const trimmed = text.trim();
		if (!trimmed || busy) return;
		chat.clearError();
		chat.sendMessage({ text: trimmed });
		input = '';
		if (inputElement) inputElement.style.height = 'auto';
	}

	function handleSubmit(event: Event) {
		event.preventDefault();
		send(input);
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			send(input);
		}
	}

	function toggleChat() {
		isOpen = !isOpen;
		if (isOpen) tick().then(() => inputElement?.focus());
	}

	// Keep the newest reply in view as it streams in.
	$effect(() => {
		void chat.messages.length;
		void chat.messages.at(-1)?.parts.length;
		void waiting;
		if (isOpen) tick().then(() => chatContainer && (chatContainer.scrollTop = chatContainer.scrollHeight));
	});
</script>

<div class="fixed bottom-6 right-6 z-50 font-mono">
	{#if !isOpen}
		<button
			onclick={toggleChat}
			class="group relative p-4 rounded-full bg-black text-white shadow-2xl hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 border-2 border-white/10"
			aria-label="Open Shot Bot photo search"
			in:fly={{ y: 20, duration: 300 }}
		>
			<div class="absolute inset-0 rounded-full border border-white/20"></div>
			<div class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.6)]"></div>
			<MessageSquare size={24} />
		</button>
	{/if}

	{#if isOpen}
		<div
			class="w-[calc(100vw-3rem)] max-w-md h-[70vh] max-h-[700px] flex flex-col rounded-sm shadow-2xl bg-zinc-900/95 text-white backdrop-blur-2xl border border-white/10 relative overflow-hidden"
			role="dialog"
			aria-label="Shot Bot photo search"
			transition:fly={{ y: 20, duration: 300 }}
		>
			<!-- Viewfinder corners: inside the panel's 16px padding, so they frame the content without crossing the header or the input. -->
			<div class="pointer-events-none absolute top-1.5 left-1.5 w-5 h-5 border-t-2 border-l-2 border-white/30"></div>
			<div class="pointer-events-none absolute top-1.5 right-1.5 w-5 h-5 border-t-2 border-r-2 border-white/30"></div>
			<div class="pointer-events-none absolute bottom-1.5 left-1.5 w-5 h-5 border-b-2 border-l-2 border-white/30"></div>
			<div class="pointer-events-none absolute bottom-1.5 right-1.5 w-5 h-5 border-b-2 border-r-2 border-white/30"></div>

			<!-- Header -->
			<header class="flex items-center justify-between p-4 border-b border-white/10 bg-black/40">
				<div class="flex items-center gap-3">
					<h3 class="font-bold text-lg tracking-wider uppercase">Shot Bot</h3>
					<div class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20" aria-hidden="true">
						<div class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
						<span class="text-[10px] font-bold text-red-500 tracking-widest">REC</span>
					</div>
				</div>
				<button
					onclick={toggleChat}
					class="p-2 rounded-full hover:bg-white/10 transition-colors"
					aria-label="Close Shot Bot"
				>
					<X size={18} />
				</button>
			</header>

			<!-- Message List -->
			<div class="flex-1 overflow-y-auto p-6 space-y-6" bind:this={chatContainer} aria-live="polite">
				<!-- Welcome: shown, never sent to the model. -->
				<div class="text-sm md:text-base text-zinc-300 leading-relaxed">
					<p>Hi, I'm Shot Bot. Describe a shot and I'll find it in Nino's volleyball photos.</p>
					{#if chat.messages.length === 0}
						<div class="mt-4 flex flex-wrap gap-2">
							{#each SUGGESTIONS as suggestion (suggestion)}
								<button
									type="button"
									onclick={() => send(suggestion)}
									class="px-3 py-1.5 text-xs border border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/40 rounded-sm transition-colors text-left"
								>
									{suggestion}
								</button>
							{/each}
						</div>
					{/if}
				</div>

				{#each chat.messages as message (message.id)}
					<div class={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
						<div
							class={`p-3 text-sm md:text-base relative ${
								message.role === 'user'
									? 'max-w-[85%] bg-white/10 text-white border border-white/20'
									: 'w-full text-zinc-300'
							}`}
						>
							{#if message.role === 'user'}
								<div class="absolute -right-1 -top-1 w-2 h-2 border-t border-r border-white/40"></div>
								<div class="absolute -left-1 -bottom-1 w-2 h-2 border-b border-l border-white/40"></div>
							{/if}

							{#each message.parts as part, i (i)}
								{#if part.type === 'text' && part.text.trim()}
									<p class="leading-relaxed whitespace-pre-line">{part.text}</p>
								{:else if part.type === 'tool-searchPhotos' && part.state === 'output-available'}
									{@const output = part.output as SearchOutput}
									{#if output.photos?.length}
										<div class="mt-4 -mx-2">
											<PhotoGrid photos={output.photos} />
										</div>
									{:else if output.error}
										<p class="mt-2 text-xs text-zinc-500">Search is unavailable right now. Please try again.</p>
									{/if}
								{:else if part.type === 'tool-searchPhotos' && part.state === 'output-error'}
									<p class="mt-2 text-xs text-zinc-500">Search is unavailable right now. Please try again.</p>
								{/if}
							{/each}
						</div>
					</div>
				{/each}

				{#if waiting}
					<div class="flex gap-2 justify-start">
						<div class="flex items-center gap-2 text-zinc-500 text-xs font-mono uppercase tracking-widest">
							<Loader size={12} class="animate-spin" />
							<span>{searching ? 'Searching photos' : 'Thinking'}</span>
						</div>
					</div>
				{/if}

				{#if errorText}
					<p class="text-sm text-red-300" role="alert">{errorText}</p>
				{/if}
			</div>

			<!-- Input Form -->
			<div class="p-4 border-t border-white/10 bg-black/40">
				<form onsubmit={handleSubmit} class="flex items-center gap-3">
					<div class="flex-1 relative">
						<textarea
							bind:this={inputElement}
							bind:value={input}
							onkeydown={handleKeyDown}
							placeholder="Describe the shot..."
							aria-label="Describe the shot you want"
							class="w-full bg-white/5 border border-white/10 resize-none p-3 sm:pr-14 rounded-sm focus:outline-none focus:border-white/30 focus:bg-white/10 text-base md:text-sm transition-all placeholder:text-zinc-600"
							rows="1"
							oninput={() => {
								if (inputElement) {
									inputElement.style.height = 'auto';
									inputElement.style.height = `${inputElement.scrollHeight}px`;
								}
							}}
						></textarea>
						<!-- ISO/Aperture decoration -->
						<div class="hidden sm:block absolute right-2 bottom-2 text-[10px] text-zinc-600 font-mono pointer-events-none" aria-hidden="true">
							ISO 800
						</div>
					</div>

					<button
						type="submit"
						class="w-12 h-12 rounded-full border-2 border-white/20 flex items-center justify-center bg-transparent hover:bg-white/5 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
						aria-label="Search"
						disabled={busy || !input.trim()}
					>
						<div class="w-10 h-10 rounded-full bg-white group-hover:bg-red-500 transition-colors"></div>
					</button>
				</form>
			</div>
		</div>
	{/if}
</div>
