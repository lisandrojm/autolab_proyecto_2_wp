import { create } from "zustand";

export interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: Date;
}

interface AssistantState {
  isOpen: boolean;
  messages: Message[];
  openAssistant: () => void;
  closeAssistant: () => void;
  toggleAssistant: () => void;
  addMessage: (message: Message) => void;
  clearMessages: () => void;
  setMessages: (messages: Message[]) => void;
}

export const useAssistantStore = create<AssistantState>((set) => ({
  isOpen: false,
  messages: [],
  openAssistant: () => set({ isOpen: true }),
  closeAssistant: () => set({ isOpen: false }),
  toggleAssistant: () => set((state) => ({ isOpen: !state.isOpen })),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  clearMessages: () => set({ messages: [] }),
  setMessages: (messages) => set({ messages }),
}));
