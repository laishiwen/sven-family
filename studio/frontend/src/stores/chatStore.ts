import { create } from "zustand";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  streaming?: boolean;
  createdAt: Date;
}

interface Session {
  id: string;
  title: string;
  mode: "model" | "agent";
  agentId?: string;
  modelId?: string;
  createdAt: Date;
}

interface ChatState {
  sessions: Session[];
  currentSessionId: string | null;
  messages: Record<string, Message[]>;
  isStreaming: boolean;

  setSessions: (sessions: Session[]) => void;
  setCurrentSession: (id: string | null) => void;
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  setMessages: (sessionId: string, messages: Message[]) => void;
  addMessage: (sessionId: string, message: Message) => void;
  updateLastMessage: (sessionId: string, content: string) => void;
  setStreaming: (streaming: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  messages: {},
  isStreaming: false,

  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (id) => set({ currentSessionId: id }),
  addSession: (session) => set((s) => ({ sessions: [session, ...s.sessions] })),
  removeSession: (id) =>
    set((s) => ({
      sessions: s.sessions.filter((x) => x.id !== id),
      currentSessionId: s.currentSessionId === id ? null : s.currentSessionId,
    })),

  setMessages: (sessionId, messages) =>
    set((s) => ({ messages: { ...s.messages, [sessionId]: messages } })),

  addMessage: (sessionId, message) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [sessionId]: [...(s.messages[sessionId] || []), message],
      },
    })),

  updateLastMessage: (sessionId, content) =>
    set((s) => {
      const msgs = s.messages[sessionId] || [];
      if (msgs.length === 0) return s;
      const updated = [...msgs];
      const last = { ...updated[updated.length - 1] };
      last.content = content;
      updated[updated.length - 1] = last;
      return { messages: { ...s.messages, [sessionId]: updated } };
    }),

  setStreaming: (isStreaming) => set({ isStreaming }),
}));
