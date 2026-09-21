import { useCallback, useRef } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { useRequestStore } from '../stores/requestStore';
import { useResponseStore } from '../stores/responseStore';
import { useSettingsStore } from '../stores/settingsStore';
import { sendHttpRequest, buildUrl } from '../lib/http';
import { addHistory, updateHistory } from '../lib/db';
import {
  persistProjectEndpointIfNeeded,
  persistProjectHttpResponseIfNeeded,
} from '../lib/persistProjectEndpoint';
import { persistFavoriteDraftIfNeeded, resolveRemarkForHistoryPersistence } from '../lib/historyFavoritePersist';
import { appendErrorLog } from '../lib/errorLog';
import type { BodyFormField, BodyType, HttpMethod } from '../types';

interface HttpRequestSnapshot {
  method: HttpMethod;
  url: string;
  bodyType: BodyType;
  rawType: string;
  endpointRemark: string;
  currentHistoryId: number | null;
  currentFavoriteId: number | null;
  suppressPersistToProject: boolean;
  currentProjectId: number | null;
  currentModuleId: number | null;
  currentEndpointId: number | null;
  headersForStorage: string;
  paramsForStorage: string;
  bodyForStorage: string;
}

function isSnapshotStillSelected(
  snapshot: HttpRequestSnapshot,
  selectedEndpointId: number | null
): boolean {
  const current = useRequestStore.getState();
  return (
    current.protocol === 'http' &&
    current.method === snapshot.method &&
    current.url === snapshot.url &&
    current.currentHistoryId === snapshot.currentHistoryId &&
    current.currentFavoriteId === snapshot.currentFavoriteId &&
    current.suppressPersistToProject === snapshot.suppressPersistToProject &&
    current.currentProjectId === snapshot.currentProjectId &&
    current.currentModuleId === snapshot.currentModuleId &&
    current.currentEndpointId === selectedEndpointId
  );
}

async function enqueueLatestTargetWrite(
  latestRequestByTarget: Map<number, number>,
  targetId: number,
  requestId: number,
  persistTailRef: { current: Promise<void> },
  write: () => Promise<void>
): Promise<void> {
  const queuedWrite = persistTailRef.current.then(async () => {
    if (latestRequestByTarget.get(targetId) !== requestId) return;
    await write();
  });
  persistTailRef.current = queuedWrite.catch(() => {});
  await queuedWrite;
}

function getFieldFiles(field: {
  type?: string;
  filePath?: string;
  value?: string;
  files?: Array<{ path: string; name: string }>;
}): Array<{ path: string; name: string }> {
  if (field.type !== 'file') return [];
  if (field.files?.length) return field.files;
  if (field.filePath) return [{ path: field.filePath, name: field.value || field.filePath.replace(/^.*[/\\]/, '') }];
  return [];
}

async function buildFormDataBodyFrom(
  bodyFormFields: BodyFormField[],
  method: HttpMethod
): Promise<FormData | undefined> {
  if (method === 'GET' || method === 'HEAD') return undefined;

  const form = new FormData();
  for (const field of bodyFormFields.filter((f) => f.enabled !== false)) {
    if (!field.key.trim()) continue;
    const files = getFieldFiles(field);
    if (files.length > 0) {
      for (const { path, name } of files) {
        const bytes = await readFile(path);
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        form.append(field.key.trim(), blob, name);
      }
    } else {
      form.append(field.key.trim(), field.value);
    }
  }
  return form;
}

function buildRequestBodyFrom(
  method: HttpMethod,
  bodyType: BodyType,
  bodyFormFields: BodyFormField[],
  body: string,
  binaryPath: string
): string | FormData | URLSearchParams | Uint8Array | undefined {
  if (method === 'GET' || method === 'HEAD') return undefined;

  if (bodyType === 'form-data') {
    const enabledFields = bodyFormFields.filter((f) => f.enabled !== false);
    const hasFile = enabledFields.some((f) => getFieldFiles(f).length > 0);
    if (hasFile) {
      return undefined;
    }
    const form = new FormData();
    enabledFields.forEach(({ key, value }) => {
      if (key.trim()) form.append(key.trim(), value);
    });
    return form;
  }

  if (bodyType === 'x-www-form-urlencoded') {
    const params = new URLSearchParams();
    bodyFormFields
      .filter((f) => f.enabled !== false)
      .forEach(({ key, value }) => {
        if (key.trim()) params.set(key.trim(), value);
      });
    return params;
  }

  if (bodyType === 'raw') {
    return body || undefined;
  }

  if (bodyType === 'binary' && binaryPath) {
    return undefined;
  }

  return undefined;
}

function getContentTypeForRaw(rawType: string): string {
  switch (rawType) {
    case 'json':
      return 'application/json';
    case 'xml':
      return 'application/xml';
    default:
      return 'text/plain';
  }
}

export function useHttpRequest() {
  const setHttpResponse = useResponseStore((s) => s.setHttpResponse);
  const refreshHistory = useResponseStore((s) => s.refreshHistory);
  const refreshFavorites = useResponseStore((s) => s.refreshFavorites);
  const latestRequestIdRef = useRef(0);
  const latestProjectRequestByEndpointRef = useRef(new Map<number, number>());
  const latestHistoryRequestByIdRef = useRef(new Map<number, number>());
  const latestFavoriteRequestByIdRef = useRef(new Map<number, number>());
  const projectResponsePersistTailRef = useRef<Promise<void>>(Promise.resolve());
  const historyFavoritePersistTailRef = useRef<Promise<void>>(Promise.resolve());

  const send = useCallback(async () => {
    const requestState = useRequestStore.getState();
    const {
      method,
      url,
      bodyType,
      rawType,
    } = requestState;
    let resolvedUrl = url;
    let resolvedHeaders: Record<string, string> = {};

    if (!url.trim()) return;

    const resolved = requestState.getResolvedForSend();
    if (!resolved.url.trim()) return;

    const requestId = ++latestRequestIdRef.current;
    const snapshot: HttpRequestSnapshot = {
      method,
      url,
      bodyType,
      rawType,
      endpointRemark: requestState.endpointRemark,
      currentHistoryId: requestState.currentHistoryId,
      currentFavoriteId: requestState.currentFavoriteId,
      suppressPersistToProject: requestState.suppressPersistToProject,
      currentProjectId: requestState.currentProjectId,
      currentModuleId: requestState.currentModuleId,
      currentEndpointId: requestState.currentEndpointId,
      headersForStorage: requestState.getHeadersForStorage(),
      paramsForStorage: requestState.getParamsForStorage(),
      bodyForStorage: requestState.getBodyForStorage(),
    };

    if (
      !snapshot.suppressPersistToProject &&
      snapshot.currentEndpointId != null
    ) {
      latestProjectRequestByEndpointRef.current.set(snapshot.currentEndpointId, requestId);
    }
    if (snapshot.currentHistoryId != null) {
      latestHistoryRequestByIdRef.current.set(snapshot.currentHistoryId, requestId);
    } else if (snapshot.currentFavoriteId != null) {
      latestFavoriteRequestByIdRef.current.set(snapshot.currentFavoriteId, requestId);
    }

    setHttpResponse({ loading: true, error: undefined });

    const responseEndpointId = await persistProjectEndpointIfNeeded();
    const selectedEndpointId = responseEndpointId ?? snapshot.currentEndpointId;
    if (responseEndpointId != null) {
      const previousRequestId = latestProjectRequestByEndpointRef.current.get(responseEndpointId) ?? 0;
      if (requestId > previousRequestId) {
        latestProjectRequestByEndpointRef.current.set(responseEndpointId, requestId);
      }
    }

    try {
      const headers = { ...resolved.headers };
      const fullUrl = buildUrl(resolved.url, resolved.queryParams);
      const ignoreTlsCertificateErrors =
        useSettingsStore.getState().ignoreTlsCertificateErrors;
      resolvedUrl = fullUrl;
      resolvedHeaders = headers;

      let requestBody: string | FormData | URLSearchParams | Uint8Array | undefined;

      if (bodyType === 'binary' && resolved.binaryPath) {
        const bytes = await readFile(resolved.binaryPath);
        requestBody = bytes;
      } else if (bodyType === 'form-data') {
        const hasFileField = resolved.bodyFormFields.some(
          (f) => f.enabled !== false && getFieldFiles(f).length > 0
        );
        requestBody = hasFileField
          ? await buildFormDataBodyFrom(resolved.bodyFormFields, method)
          : buildRequestBodyFrom(method, bodyType, resolved.bodyFormFields, resolved.body, resolved.binaryPath);
      } else {
        requestBody = buildRequestBodyFrom(
          method,
          bodyType,
          resolved.bodyFormFields,
          resolved.body,
          resolved.binaryPath
        );
      }

      if (bodyType === 'raw' && resolved.body && !headers['Content-Type']) {
        headers['Content-Type'] = getContentTypeForRaw(rawType);
      }

      const res = await sendHttpRequest({
        method,
        url: fullUrl,
        headers,
        body: requestBody,
        ignoreTlsCertificateErrors,
      });

      if (latestRequestIdRef.current === requestId) {
        if (isSnapshotStillSelected(snapshot, selectedEndpointId)) {
          setHttpResponse({
            status: res.status,
            statusText: res.statusText,
            headers: res.headers,
            body: res.body,
            timeMs: res.timeMs,
            loading: false,
          });
        } else {
          setHttpResponse({ loading: false });
        }
      }

      if (
        responseEndpointId != null &&
        latestProjectRequestByEndpointRef.current.get(responseEndpointId) === requestId
      ) {
        const response = {
          status: res.status,
          headers: res.headers,
          body: res.body,
          timeMs: res.timeMs,
        };
        await enqueueLatestTargetWrite(
          latestProjectRequestByEndpointRef.current,
          responseEndpointId,
          requestId,
          projectResponsePersistTailRef,
          () => persistProjectHttpResponseIfNeeded(responseEndpointId, response)
        );
      }

      if (snapshot.currentHistoryId != null) {
        await enqueueLatestTargetWrite(
          latestHistoryRequestByIdRef.current,
          snapshot.currentHistoryId,
          requestId,
          historyFavoritePersistTailRef,
          async () => {
            const remark = await resolveRemarkForHistoryPersistence(
              snapshot.currentHistoryId,
              snapshot.endpointRemark
            );
            await updateHistory(
              snapshot.currentHistoryId!,
              'http',
              method,
              url,
              snapshot.headersForStorage,
              snapshot.paramsForStorage,
              snapshot.bodyForStorage,
              res.status,
              res.timeMs,
              JSON.stringify(res.headers),
              res.body,
              remark
            );
          }
        );
      } else {
        if (snapshot.currentFavoriteId != null) {
          await enqueueLatestTargetWrite(
            latestFavoriteRequestByIdRef.current,
            snapshot.currentFavoriteId,
            requestId,
            historyFavoritePersistTailRef,
            () => persistFavoriteDraftIfNeeded(
              snapshot.currentFavoriteId,
              {
                url,
                protocol: 'http',
                method,
                headers: snapshot.headersForStorage,
                params: snapshot.paramsForStorage,
                body: snapshot.bodyForStorage,
                endpointRemark: snapshot.endpointRemark,
              },
              refreshFavorites
            )
          );
        }
        const remark = await resolveRemarkForHistoryPersistence(null, snapshot.endpointRemark);
        await addHistory(
          'http',
          method,
          url,
          snapshot.headersForStorage,
          snapshot.paramsForStorage,
          snapshot.bodyForStorage,
          res.status,
          res.timeMs,
          JSON.stringify(res.headers),
          res.body,
          remark
        );
      }
      refreshHistory();
    } catch (err) {
      appendErrorLog('http', err, {
        method,
        originalUrl: url,
        resolvedUrl,
        bodyType,
        rawType,
        headers: resolvedHeaders,
      });
      if (latestRequestIdRef.current === requestId) {
        if (isSnapshotStillSelected(snapshot, selectedEndpointId)) {
          setHttpResponse({
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          });
        } else {
          setHttpResponse({ loading: false });
        }
      }
      if (snapshot.currentHistoryId != null) {
        await enqueueLatestTargetWrite(
          latestHistoryRequestByIdRef.current,
          snapshot.currentHistoryId,
          requestId,
          historyFavoritePersistTailRef,
          async () => {
            const remarkErr = await resolveRemarkForHistoryPersistence(
              snapshot.currentHistoryId,
              snapshot.endpointRemark
            );
            await updateHistory(
              snapshot.currentHistoryId!,
              'http',
              method,
              url,
              snapshot.headersForStorage,
              snapshot.paramsForStorage,
              snapshot.bodyForStorage,
              undefined,
              undefined,
              undefined,
              undefined,
              remarkErr
            );
          }
        );
      } else {
        if (snapshot.currentFavoriteId != null) {
          await enqueueLatestTargetWrite(
            latestFavoriteRequestByIdRef.current,
            snapshot.currentFavoriteId,
            requestId,
            historyFavoritePersistTailRef,
            () => persistFavoriteDraftIfNeeded(
              snapshot.currentFavoriteId,
              {
                url,
                protocol: 'http',
                method,
                headers: snapshot.headersForStorage,
                params: snapshot.paramsForStorage,
                body: snapshot.bodyForStorage,
                endpointRemark: snapshot.endpointRemark,
              },
              refreshFavorites
            )
          );
        }
        const remarkErr = await resolveRemarkForHistoryPersistence(null, snapshot.endpointRemark);
        await addHistory(
          'http',
          method,
          url,
          snapshot.headersForStorage,
          snapshot.paramsForStorage,
          snapshot.bodyForStorage,
          undefined,
          undefined,
          undefined,
          undefined,
          remarkErr
        );
      }
      refreshHistory();
    }
  }, [setHttpResponse, refreshHistory, refreshFavorites]);

  return { send };
}
