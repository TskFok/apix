import { useCallback, useRef } from 'react';
import WebSocket from '@tauri-apps/plugin-websocket';
import { useRequestStore } from '../stores/requestStore';
import { useResponseStore } from '../stores/responseStore';
import { useSettingsStore } from '../stores/settingsStore';
import { addHistory, updateHistory } from '../lib/db';
import { buildUrl } from '../lib/http';
import { persistProjectEndpointIfNeeded } from '../lib/persistProjectEndpoint';
import { persistFavoriteDraftIfNeeded, resolveRemarkForHistoryPersistence } from '../lib/historyFavoritePersist';
import { appendErrorLog } from '../lib/errorLog';

let wsInstance: Awaited<ReturnType<typeof WebSocket.connect>> | null = null;
let removeListener: (() => void) | undefined;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;

const IDLE_CHECK_INTERVAL_MS = 30_000; // 每 30 秒检查一次

export function useWebSocket() {
  const { url, getHeadersForStorage, getParamsForStorage } = useRequestStore();
  const {
    setStreamState,
    addStreamMessage,
    clearStreamMessages,
    refreshHistory,
    refreshFavorites,
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
      const st = useRequestStore.getState();
      const remark = await resolveRemarkForHistoryPersistence(st.currentHistoryId, st.endpointRemark);
      if (st.currentHistoryId != null) {
        await updateHistory(
          st.currentHistoryId,
          'ws',
          null,
          url,
          getHeadersForStorage(),
          getParamsForStorage(),
          null,
          undefined,
          elapsed,
          undefined,
          undefined,
          remark
        );
      } else {
        await persistFavoriteDraftIfNeeded(
          st.currentFavoriteId,
          {
            url,
            protocol: 'ws',
            method: null,
            headers: getHeadersForStorage(),
            params: getParamsForStorage(),
            body: null,
            endpointRemark: st.endpointRemark,
          },
          refreshFavorites
        );
        await addHistory(
          'ws',
          null,
          url,
          getHeadersForStorage(),
          getParamsForStorage(),
          null,
          undefined,
          elapsed,
          undefined,
          undefined,
          remark
        );
      }
      refreshHistory();
    }
  }, [url, getHeadersForStorage, getParamsForStorage, setStreamState, refreshHistory, refreshFavorites]);

  disconnectRef.current = disconnect;

  const connect = useCallback(async () => {
    if (!url.trim()) return;

    setStreamState({ loading: true, error: undefined });
    clearStreamMessages();
    let resolvedUrl = url;

    try {
      await persistProjectEndpointIfNeeded();
      const resolved = useRequestStore.getState().getResolvedForSend();
      const fullUrl = buildUrl(resolved.url, resolved.queryParams);
      resolvedUrl = fullUrl;
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
      appendErrorLog('ws', err, {
        originalUrl: url,
        resolvedUrl,
      });
      setStreamState({
        connected: false,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [url, idleTimeoutMs, setStreamState, addStreamMessage, clearStreamMessages]);

  const send = useCallback(
    async (message: string) => {
      if (wsInstance && message.trim()) {
        try {
          lastActivityRef.current = Date.now();
          await wsInstance.send(message);
          addStreamMessage({
            direction: 'out',
            timestamp: Date.now(),
            content: message,
          });
        } catch (err) {
          appendErrorLog('ws', err, {
            action: 'send',
            originalUrl: url,
            message,
          });
          setStreamState({
            connected: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },
    [addStreamMessage, setStreamState, url]
  );

  return { connect, disconnect, send };
}
