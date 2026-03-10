import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const IDLE_TIMEOUT_STORAGE_KEY = 'apix-idle-timeout';

const memoryStorage: Record<string, string> = {};
const getStorage = () => {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
      return localStorage;
    }
  } catch {
    // ignore
  }
  return {
    getItem: (key: string) => memoryStorage[key] ?? null,
    setItem: (key: string, value: string) => {
      memoryStorage[key] = value;
    },
    removeItem: (key: string) => {
      delete memoryStorage[key];
    },
  };
};

/** 空闲超时选项（毫秒） */
export const IDLE_TIMEOUT_OPTIONS = [
  { value: 0, label: '关闭' },
  { value: 60_000, label: '1 分钟' },
  { value: 5 * 60_000, label: '5 分钟' },
  { value: 10 * 60_000, label: '10 分钟' },
  { value: 30 * 60_000, label: '30 分钟' },
] as const;

export interface SettingsState {
  /** 空闲超时毫秒数，0 表示关闭 */
  idleTimeoutMs: number;
  setIdleTimeoutMs: (ms: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      idleTimeoutMs: 5 * 60_000, // 默认 5 分钟
      setIdleTimeoutMs: (idleTimeoutMs) => set({ idleTimeoutMs }),
    }),
    { name: IDLE_TIMEOUT_STORAGE_KEY, storage: createJSONStorage(getStorage) }
  )
);
