import { useCallback, useRef } from 'react';
import { fetch } from '@tauri-apps/plugin-http';
import { useRequestStore } from '../stores/requestStore';
import { useResponseStore } from '../stores/responseStore';
import { useSettingsStore } from '../stores/settingsStore';
import { addHistory, updateHistory } from '../lib/db';
import { buildUrl } from '../lib/http';
import { SSEParser } from '../lib/sse';
import { persistProjectEndpointIfNeeded } from '../lib/persistProjectEndpoint';
import { persistFavoriteDraftIfNeeded, resolveRemarkForHistoryPersistence } from '../lib/historyFavoritePersist';
import { appendErrorLog } from '../lib/errorLog';

let abortController: AbortController | null = null;
let sseIdleCheckInterval: ReturnType<typeof setInterval> | null = null;

const IDLE_CHECK_INTERVAL_MS = 30_000;

export function useSSE() {
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

  const connect = useCallback(async () => {
    if (!url.trim()) return;

    await persistProjectEndpointIfNeeded();

    abortController = new AbortController();
    setStreamState({ loading: true, error: undefined });
    clearStreamMessages();
    connectedAtRef.current = Date.now();
    lastActivityRef.current = Date.now();
    let resolvedUrl = url;

    try {
      const resolved = useRequestStore.getState().getResolvedForSend();
      const fullUrl = buildUrl(resolved.url, resolved.queryParams);
      resolvedUrl = fullUrl;
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        ...resolved.headers,
      };

      const response = await fetch(fullUrl, {
        method: 'GET',
        headers,
        signal: abortController.signal,
      });

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      setStreamState({ connected: true, loading: false });

      if (idleTimeoutMs > 0) {
        sseIdleCheckInterval = setInterval(() => {
          const idle = Date.now() - lastActivityRef.current;
          if (idle >= idleTimeoutMs && abortController) {
            abortController.abort();
          }
        }, IDLE_CHECK_INTERVAL_MS);
      }

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = new SSEParser();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            parser.parse(chunk, (event) => {
              lastActivityRef.current = Date.now();
              const content = event.data ?? JSON.stringify(event);
              addStreamMessage({
                direction: 'in',
                timestamp: Date.now(),
                content,
                event: event.event,
              });
            });
          }
          parser.flush((event) => {
            lastActivityRef.current = Date.now();
            const content = event.data ?? JSON.stringify(event);
            addStreamMessage({
              direction: 'in',
              timestamp: Date.now(),
              content,
              event: event.event,
            });
          });
        } finally {
          reader.releaseLock();
        }
      }

      setStreamState({ connected: false });
      const elapsed = Date.now() - connectedAtRef.current;
      const stOk = useRequestStore.getState();
      const remarkOk = await resolveRemarkForHistoryPersistence(stOk.currentHistoryId, stOk.endpointRemark);
      if (stOk.currentHistoryId != null) {
        await updateHistory(
          stOk.currentHistoryId,
          'sse',
          null,
          url,
          getHeadersForStorage(),
          getParamsForStorage(),
          null,
          response.status,
          elapsed,
          undefined,
          undefined,
          remarkOk
        );
      } else {
        await persistFavoriteDraftIfNeeded(
          stOk.currentFavoriteId,
          {
            url,
            protocol: 'sse',
            method: null,
            headers: getHeadersForStorage(),
            params: getParamsForStorage(),
            body: null,
            endpointRemark: stOk.endpointRemark,
          },
          refreshFavorites
        );
        await addHistory(
          'sse',
          null,
          url,
          getHeadersForStorage(),
          getParamsForStorage(),
          null,
          response.status,
          elapsed,
          undefined,
          undefined,
          remarkOk
        );
      }
      refreshHistory();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        const elapsed = Date.now() - connectedAtRef.current;
        const stAb = useRequestStore.getState();
        const remarkAb = await resolveRemarkForHistoryPersistence(stAb.currentHistoryId, stAb.endpointRemark);
        if (stAb.currentHistoryId != null) {
          await updateHistory(
            stAb.currentHistoryId,
            'sse',
            null,
            url,
            getHeadersForStorage(),
            getParamsForStorage(),
            null,
            undefined,
            elapsed,
            undefined,
            undefined,
            remarkAb
          );
        } else {
          await persistFavoriteDraftIfNeeded(
            stAb.currentFavoriteId,
            {
              url,
              protocol: 'sse',
              method: null,
              headers: getHeadersForStorage(),
              params: getParamsForStorage(),
              body: null,
              endpointRemark: stAb.endpointRemark,
            },
            refreshFavorites
          );
          await addHistory(
            'sse',
            null,
            url,
            getHeadersForStorage(),
            getParamsForStorage(),
            null,
            undefined,
            elapsed,
            undefined,
            undefined,
            remarkAb
          );
        }
        refreshHistory();
      } else {
        appendErrorLog('sse', err, {
          originalUrl: url,
          resolvedUrl,
        });
        setStreamState({
          connected: false,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      if (sseIdleCheckInterval) {
        clearInterval(sseIdleCheckInterval);
        sseIdleCheckInterval = null;
      }
      abortController = null;
      setStreamState({ connected: false });
    }
  }, [
    url,
    getHeadersForStorage,
    getParamsForStorage,
    idleTimeoutMs,
    setStreamState,
    addStreamMessage,
    clearStreamMessages,
    refreshHistory,
    refreshFavorites,
  ]);

  const disconnect = useCallback(() => {
    if (abortController) {
      abortController.abort();
    }
  }, []);

  return {
    connect,
    disconnect,
  };
}
