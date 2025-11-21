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
	let messages = $state<Message[]>([]);
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
				throw new Error('Failed to get response');
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

<div class="fixed bottom-6 right-6 z-50">
	{#if !isOpen}
		<button
			onclick={toggleChat}
			class="p-4 rounded-full bg-black/70 text-white backdrop-blur-sm shadow-lg hover:bg-black/90 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-white/50"
			aria-label="Open chat"
			in:fly={{ y: 20, duration: 300 }}
		>
			<MessageSquare size={24} />
		</button>
	{/if}

	{#if isOpen}
		<div
			class="w-[calc(100vw-3rem)] max-w-md h-[70vh] max-h-[700px] flex flex-col rounded-2xl shadow-2xl bg-white/50 dark:bg-black/50 text-black dark:text-white backdrop-blur-2xl border border-white/20 dark:border-black/20"
			transition:fly={{ y: 20, duration: 300 }}
		>
			<!-- Header -->
			<header class="flex items-center justify-between p-4 border-b border-white/20 dark:border-black/20">
				<h3 class="font-bold text-lg">Focus Bot</h3>
				<button
					onclick={toggleChat}
					class="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
				>
					<X size={20} />
				</button>
			</header>

			<!-- Message List -->
			<div class="flex-1 overflow-y-auto p-4 space-y-4" bind:this={chatContainer}>
				{#each messages as message}
					<div class={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
						<div
							class={`max-w-[85%] rounded-xl p-3 text-sm md:text-base ${
								message.role === 'user'
									? 'bg-blue-600 text-white'
									: 'bg-gray-200 dark:bg-gray-800'
							}`}
						>
							{#if message.content}
								<p>{message.content}</p>
							{/if}

							{#if message.toolInvocations}
								{#each message.toolInvocations as toolCall}
									{#if toolCall.toolName === 'searchPhotos' && toolCall.result?.photos?.length}
										<PhotoGrid photos={toolCall.result.photos} />
									{:else if toolCall.toolName === 'searchPhotos'}
                                        <p class="mt-2 text-xs italic opacity-70">No matching photos found.</p>
                                    {/if}
								{/each}
							{/if}
						</div>
					</div>
				{/each}

				{#if isLoading}
					<div class="flex gap-2 justify-start">
						<div
							class="max-w-[85%] rounded-xl p-3 text-sm md:text-base bg-gray-200 dark:bg-gray-800 flex items-center gap-2"
						>
							<Loader size={16} class="animate-spin" />
							<span>Thinking...</span>
						</div>
					</div>
				{/if}
			</div>

			<!-- Input Form -->
			<div class="p-4 border-t border-white/20 dark:border-black/20">
				<form onsubmit={handleSubmit} class="flex items-center gap-2">
					<textarea
						bind:this={inputElement}
						bind:value={input}
						onkeydown={handleKeyDown}
						placeholder="Try 'Show me volleyball serves'..."
						class="flex-1 bg-transparent resize-none p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						rows="1"
						oninput={() => {
							if (inputElement) {
								inputElement.style.height = 'auto';
								inputElement.style.height = `${inputElement.scrollHeight}px`;
							}
						}}
					></textarea>
					<button
						type="submit"
						class="p-2 rounded-md bg-blue-600 text-white disabled:bg-blue-400 disabled:cursor-not-allowed"
						aria-label="Send message"
						disabled={isLoading || !input.trim()}
					>
						<CornerDownLeft size={20} />
					</button>
				</form>
			</div>
		</div>
	{/if}
</div>
