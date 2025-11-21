<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { MessageSquare, X, CornerDownLeft, Loader } from 'lucide-svelte';
	import PhotoGrid from './PhotoGrid.svelte';

	interface Message {
		id: string;
		role: 'user' | 'assistant';
		content: string;
		toolInvocations?: Array<{
			toolName: string;
			result?: {
				photos?: Array<{
					image_key: string;
					thumbnail_url: string;
					sport_type: string;
					play_type: string;
					photo_category: string;
				}>;
			};
		}>;
	}

	let isOpen = $state(false);
	let chatContainer = $state<HTMLDivElement>();
	let inputElement = $state<HTMLTextAreaElement>();
	let input = $state('');
	let messages = $state<Message[]>([
		{
			id: 'welcome',
			role: 'assistant',
			content: `Hi! I'm Shot Bot 📸

I can help you explore Nino's volleyball photography collection. Try asking me to:

• "Show me powerful spikes"
• "Find celebration moments"
• "Photos with peak intensity"
• "Serves with determination"

What are you looking for?`
		}
	]);
	let isLoading = $state(false);

	// Handle form submission
	async function handleSubmit(event: Event) {
		event.preventDefault();
		if (!input.trim() || isLoading) return;

		const userMessage: Message = {
			id: crypto.randomUUID(),
			role: 'user',
			content: input
		};

		messages = [...messages, userMessage];
		const currentInput = input;
		input = '';
		isLoading = true;

		try {
			const response = await fetch('/api/chat', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					messages: messages.map((m) => ({
						role: m.role,
						content: m.content
					}))
				})
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				console.error('Server error details:', errorData);
				throw new Error(errorData.error || 'Failed to get response');
			}

			const reader = response.body?.getReader();
			const decoder = new TextDecoder();
			let assistantMessage: Message = {
				id: crypto.randomUUID(),
				role: 'assistant',
				content: ''
			};
			messages = [...messages, assistantMessage];

			if (reader) {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					const chunk = decoder.decode(value);
					const lines = chunk.split('\n');

					for (const line of lines) {
						if (line.startsWith('0:')) {
							// Text chunk
							const text = line.slice(2).trim();
							if (text) {
								assistantMessage.content += text;
								messages = [...messages];
							}
						} else if (line.startsWith('9:')) {
							// Tool invocation or result
							try {
								const data = JSON.parse(line.slice(2));
								if (data.toolInvocations) {
									assistantMessage.toolInvocations = data.toolInvocations;
									messages = [...messages];
								}
							} catch (e) {
								// Ignore parse errors
							}
						}
					}
				}
			}
		} catch (error) {
			console.error('Chat error:', error);
			messages = [
				...messages,
				{
					id: crypto.randomUUID(),
					role: 'assistant',
					content: 'Sorry, I encountered an error. Please try again.'
				}
			];
		} finally {
			isLoading = false;
		}
	}

	// Automatically scroll to the bottom when new messages are added
	$effect(() => {
		if (messages.length > 0 && isOpen) {
			scrollToBottom();
		}
	});

	function toggleChat() {
		isOpen = !isOpen;
		if (isOpen) {
			tick().then(() => {
				inputElement?.focus();
			});
		}
	}

	async function scrollToBottom() {
		await tick();
		if (chatContainer) {
			chatContainer.scrollTop = chatContainer.scrollHeight;
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSubmit(event as unknown as Event);
		}
	}

	onMount(() => {
		// Open the chat after 3 seconds for discoverability on first visit
		setTimeout(() => {
			if (!isOpen) {
				// We can add a more subtle animation later
			}
		}, 3000);
	});
</script>

<div class="fixed bottom-6 right-6 z-50 font-mono">
	{#if !isOpen}
		<button
			onclick={toggleChat}
			class="group relative p-4 rounded-full bg-black text-white shadow-2xl hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 border-2 border-white/10"
			aria-label="Open chat"
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
			transition:fly={{ y: 20, duration: 300 }}
		>
			<!-- Viewfinder Corners -->
			<div class="pointer-events-none absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-white/30"></div>
			<div class="pointer-events-none absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-white/30"></div>
			<div class="pointer-events-none absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-white/30"></div>
			<div class="pointer-events-none absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-white/30"></div>

			<!-- Header -->
			<header class="flex items-center justify-between p-4 border-b border-white/10 bg-black/40">
				<div class="flex items-center gap-3">
					<h3 class="font-bold text-lg tracking-wider uppercase">Shot Bot</h3>
					<div class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20">
						<div class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
						<span class="text-[10px] font-bold text-red-500 tracking-widest">REC</span>
					</div>
				</div>
				<button
					onclick={toggleChat}
					class="p-2 rounded-full hover:bg-white/10 transition-colors"
				>
					<X size={18} />
				</button>
			</header>

			<!-- Message List -->
			<div class="flex-1 overflow-y-auto p-6 space-y-6" bind:this={chatContainer}>
				{#each messages as message}
					<div class={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
						<div
							class={`max-w-[85%] p-3 text-sm md:text-base relative ${
								message.role === 'user'
									? 'bg-white/10 text-white border border-white/20'
									: 'text-zinc-300'
							}`}
						>
							<!-- Technical markers for messages -->
							{#if message.role === 'user'}
								<div class="absolute -right-1 -top-1 w-2 h-2 border-t border-r border-white/40"></div>
								<div class="absolute -left-1 -bottom-1 w-2 h-2 border-b border-l border-white/40"></div>
							{/if}

							{#if message.content}
								<p class="leading-relaxed">{message.content}</p>
							{/if}

							{#if message.toolInvocations}
								{#each message.toolInvocations as toolCall}
									{#if toolCall.toolName === 'searchPhotos' && toolCall.result?.photos?.length}
										<div class="mt-4 -mx-2">
											<PhotoGrid photos={toolCall.result.photos} />
										</div>
									{:else if toolCall.toolName === 'searchPhotos'}
                                        <p class="mt-2 text-xs font-mono text-zinc-500 uppercase tracking-wider">[NO_MATCHES_FOUND]</p>
                                    {/if}
								{/each}
							{/if}
						</div>
					</div>
				{/each}

				{#if isLoading}
					<div class="flex gap-2 justify-start">
						<div class="flex items-center gap-2 text-zinc-500 text-xs font-mono uppercase tracking-widest">
							<Loader size={12} class="animate-spin" />
							<span>Processing...</span>
						</div>
					</div>
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
							class="w-full bg-white/5 border border-white/10 resize-none p-3 pr-10 rounded-sm focus:outline-none focus:border-white/30 focus:bg-white/10 text-sm transition-all placeholder:text-zinc-600"
							rows="1"
							oninput={() => {
								if (inputElement) {
									inputElement.style.height = 'auto';
									inputElement.style.height = `${inputElement.scrollHeight}px`;
								}
							}}
						></textarea>
						<!-- ISO/Aperture decoration -->
						<div class="absolute right-2 bottom-2 text-[10px] text-zinc-600 font-mono pointer-events-none">
							ISO 800
						</div>
					</div>
					
					<button
						type="submit"
						class="w-12 h-12 rounded-full border-2 border-white/20 flex items-center justify-center bg-transparent hover:bg-white/5 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
						aria-label="Capture"
						disabled={isLoading || !input.trim()}
					>
						<div class="w-10 h-10 rounded-full bg-white group-hover:bg-red-500 transition-colors"></div>
					</button>
				</form>
			</div>
		</div>
	{/if}
</div>
