import { useCallback, useRef } from 'react';
import WebSocket from '@tauri-apps/plugin-websocket';
import { useRequestStore } from '../stores/requestStore';
import { useResponseStore } from '../stores/responseStore';
import { useSettingsStore } from '../stores/settingsStore';
import { addHistory } from '../lib/db';
import { buildUrl } from '../lib/http';

let wsInstance: Awaited<ReturnType<typeof WebSocket.connect>> | null = null;
let removeListener: (() => void) | undefined;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;

const IDLE_CHECK_INTERVAL_MS = 30_000; // 每 30 秒检查一次

export function useWebSocket() {
  const { url, getQueryParamsRecord, getHeadersForStorage, getParamsForStorage } = useRequestStore();
  const {
    setStreamState,
    addStreamMessage,
    clearStreamMessages,
    refreshHistory,
  } = useResponseStore();
  const idleTimeoutMs = useSettingsStore((s) => s.idleTimeoutMs);
  const connectedAtRef = useRef<number>(0);
  const lastActivityRef = useRef<number>(0);
  const disconnectRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const disconnect = useCallback(async () => {
    if (idleCheckInterval) {
      clearInterval(idleCheckInterval);
      idleCheckInterval = null;
    }
    if (wsInstance) {
      removeListener?.();
      await wsInstance.disconnect();
      wsInstance = null;
      setStreamState({ connected: false });

      const elapsed = Date.now() - connectedAtRef.current;
      await addHistory(
        'ws',
        null,
        url,
        getHeadersForStorage(),
        getParamsForStorage(),
        null,
        undefined,
        elapsed
      );
      refreshHistory();
    }
  }, [url, getQueryParamsRecord, getHeadersForStorage, getParamsForStorage, setStreamState, refreshHistory]);

  disconnectRef.current = disconnect;

  const connect = useCallback(async () => {
    if (!url.trim()) return;

    setStreamState({ loading: true, error: undefined });
    clearStreamMessages();

    try {
      const fullUrl = buildUrl(url, getQueryParamsRecord());
      const ws = await WebSocket.connect(fullUrl);
      wsInstance = ws;
      connectedAtRef.current = Date.now();
      lastActivityRef.current = Date.now();

      removeListener = ws.addListener((msg) => {
        lastActivityRef.current = Date.now();
        const content =
          typeof msg === 'string' ? msg : JSON.stringify(msg);
        addStreamMessage({
          direction: 'in',
          timestamp: Date.now(),
          content,
        });
      });

      setStreamState({
        connected: true,
        loading: false,
      });

      if (idleTimeoutMs > 0) {
        idleCheckInterval = setInterval(() => {
          const idle = Date.now() - lastActivityRef.current;
          if (idle >= idleTimeoutMs) {
            disconnectRef.current();
          }
        }, IDLE_CHECK_INTERVAL_MS);
      }
    } catch (err) {
      setStreamState({
        connected: false,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [url, getQueryParamsRecord, idleTimeoutMs, setStreamState, addStreamMessage, clearStreamMessages]);

  const send = useCallback(
    async (message: string) => {
      if (wsInstance && message.trim()) {
        lastActivityRef.current = Date.now();
        await wsInstance.send(message);
        addStreamMessage({
          direction: 'out',
          timestamp: Date.now(),
          content: message,
        });
      }
    },
    [addStreamMessage]
  );

  return { connect, disconnect, send };
}
