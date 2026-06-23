import { create } from 'zustand';
import { useSettingsStore } from './settingsStore';

export type ErrorLogSource = 'http' | 'ws' | 'sse' | 'runtime' | 'promise' | 'unknown';

export interface ErrorLogEntry {
  id: string;
  timestamp: number;
  source: ErrorLogSource;
  message: string;
  name?: string;
  stack?: string;
  detail?: string;
  context?: Record<string, unknown>;
}

const MAX_ERROR_LOG_ENTRIES = 500;

export const useErrorLogStore = create<{
  entries: ErrorLogEntry[];
  addEntry: (entry: Omit<ErrorLogEntry, 'id' | 'timestamp'> & { timestamp?: number }) => void;
  clearEntries: () => void;
}>((set) => ({
  entries: [],
  addEntry: (entry) => {
    if (!useSettingsStore.getState().collectErrorLogs) return;
    const next: ErrorLogEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: entry.timestamp ?? Date.now(),
    };
    set((state) => ({
      entries: [next, ...state.entries].slice(0, MAX_ERROR_LOG_ENTRIES),
    }));
  },
  clearEntries: () => set({ entries: [] }),
}));
