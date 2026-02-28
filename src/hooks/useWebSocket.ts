import { useCallback, useRef } from 'react';
import WebSocket from '@tauri-apps/plugin-websocket';
import { useRequestStore } from '../stores/requestStore';
import { useResponseStore } from '../stores/responseStore';
import { addHistory } from '../lib/db';
import { buildUrl } from '../lib/http';

let wsInstance: Awaited<ReturnType<typeof WebSocket.connect>> | null = null;
let removeListener: (() => void) | undefined;

export function useWebSocket() {
  const { url, getQueryParamsRecord, getHeadersForStorage, getParamsForStorage } = useRequestStore();
  const {
    setStreamState,
    addStreamMessage,
    clearStreamMessages,
    refreshHistory,
  } = useResponseStore();
  const connectedAtRef = useRef<number>(0);

  const connect = useCallback(async () => {
    if (!url.trim()) return;

    setStreamState({ loading: true, error: undefined });
    clearStreamMessages();

    try {
      const fullUrl = buildUrl(url, getQueryParamsRecord());
      const ws = await WebSocket.connect(fullUrl);
      wsInstance = ws;
      connectedAtRef.current = Date.now();

      removeListener = ws.addListener((msg) => {
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
    } catch (err) {
      setStreamState({
        connected: false,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [url, getQueryParamsRecord, setStreamState, addStreamMessage, clearStreamMessages]);

  const disconnect = useCallback(async () => {
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

  const send = useCallback(
    async (message: string) => {
      if (wsInstance && message.trim()) {
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
