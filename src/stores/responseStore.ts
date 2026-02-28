import { create } from 'zustand';
import type { StreamMessage } from '../types';

export interface HttpResponseState {
  status?: number;
  statusText?: string;
  headers: Record<string, string>;
  body: string;
  timeMs?: number;
  loading: boolean;
  error?: string;
}

export interface StreamState {
  connected: boolean;
  messages: StreamMessage[];
  loading: boolean;
  error?: string;
}

export const useResponseStore = create<{
  mode: 'http' | 'stream';
  http: HttpResponseState;
  stream: StreamState;
  historyRefreshTrigger: number;
  favoritesRefreshTrigger: number;
  setHttpResponse: (r: Partial<HttpResponseState>) => void;
  setStreamState: (s: Partial<StreamState>) => void;
  addStreamMessage: (m: Omit<StreamMessage, 'id'>) => void;
  clearStreamMessages: () => void;
  setMode: (m: 'http' | 'stream') => void;
  reset: () => void;
  refreshHistory: () => void;
  refreshFavorites: () => void;
}>((set) => ({
  mode: 'http',
  historyRefreshTrigger: 0,
  favoritesRefreshTrigger: 0,
  http: {
    headers: {},
    body: '',
    loading: false,
  },
  stream: {
    connected: false,
    messages: [],
    loading: false,
  },

  setHttpResponse: (r) =>
    set((s) => ({
      http: { ...s.http, ...r },
    })),
  setStreamState: (s) =>
    set((state) => ({
      stream: { ...state.stream, ...s },
    })),
  addStreamMessage: (m) =>
    set((s) => ({
      stream: {
        ...s.stream,
        messages: [
          ...s.stream.messages,
          { ...m, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
        ],
      },
    })),
  clearStreamMessages: () =>
    set((s) => ({
      stream: { ...s.stream, messages: [] },
    })),
  setMode: (mode) => set({ mode }),
  refreshHistory: () =>
    set((s) => ({ historyRefreshTrigger: s.historyRefreshTrigger + 1 })),
  refreshFavorites: () =>
    set((s) => ({ favoritesRefreshTrigger: s.favoritesRefreshTrigger + 1 })),
  reset: () =>
    set({
      http: { headers: {}, body: '', loading: false },
      stream: { connected: false, messages: [], loading: false },
    }),
}));
