import { writable } from 'svelte/store';
import type { ChatMessage } from '$lib/types/chat';

type ChatState = {
  isOpen: boolean;
  messages: ChatMessage[];
  isLoading: boolean;
};

function createChatStore() {
  const { subscribe, update } = writable<ChatState>({
    isOpen: false,
    messages: [
      {
        id: '1',
        role: 'assistant',
        content: "Welcome! I'm the gallery assistant. Looking for a specific athlete, or inquiring about tournament coverage?",
      },
    ],
    isLoading: false,
  });

  return {
    subscribe,
    toggle: () => {
      update((state) => ({ ...state, isOpen: !state.isOpen }));
    },
    addMessage: (message: Omit<ChatMessage, 'id'>) => {
      update((state) => ({
        ...state,
        messages: [...state.messages, { ...message, id: crypto.randomUUID() }],
      }));
    },
    setLoading: (loading: boolean) => {
      update((state) => ({ ...state, isLoading: loading }));
    },
  };
}

export const chat = createChatStore();
