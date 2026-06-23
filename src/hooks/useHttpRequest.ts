import { useCallback } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { useRequestStore } from '../stores/requestStore';
import { useResponseStore } from '../stores/responseStore';
import { sendHttpRequest, buildUrl } from '../lib/http';
import { addHistory, updateHistory } from '../lib/db';
import {
  persistProjectEndpointIfNeeded,
  persistProjectHttpResponseIfNeeded,
} from '../lib/persistProjectEndpoint';
import { persistFavoriteDraftIfNeeded, resolveRemarkForHistoryPersistence } from '../lib/historyFavoritePersist';
import { appendErrorLog } from '../lib/errorLog';
import type { BodyFormField, BodyType, HttpMethod } from '../types';

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
  const { getHeadersForStorage, getParamsForStorage, getBodyForStorage } = useRequestStore();
  const setHttpResponse = useResponseStore((s) => s.setHttpResponse);
  const refreshHistory = useResponseStore((s) => s.refreshHistory);
  const refreshFavorites = useResponseStore((s) => s.refreshFavorites);

  const send = useCallback(async () => {
    const {
      method,
      url,
      bodyType,
      rawType,
    } = useRequestStore.getState();
    let resolvedUrl = url;
    let resolvedHeaders: Record<string, string> = {};

    if (!url.trim()) return;

    await persistProjectEndpointIfNeeded();

    const resolved = useRequestStore.getState().getResolvedForSend();
    if (!resolved.url.trim()) return;

    setHttpResponse({ loading: true, error: undefined });

    try {
      const headers = { ...resolved.headers };
      const fullUrl = buildUrl(resolved.url, resolved.queryParams);
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
      });

      setHttpResponse({
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
        body: res.body,
        timeMs: res.timeMs,
        loading: false,
      });

      await persistProjectHttpResponseIfNeeded({
        status: res.status,
        headers: res.headers,
        body: res.body,
        timeMs: res.timeMs,
      });

      const stAfter = useRequestStore.getState();
      const remark = await resolveRemarkForHistoryPersistence(stAfter.currentHistoryId, stAfter.endpointRemark);
      if (stAfter.currentHistoryId != null) {
        await updateHistory(
          stAfter.currentHistoryId,
          'http',
          method,
          url,
          getHeadersForStorage(),
          getParamsForStorage(),
          getBodyForStorage(),
          res.status,
          res.timeMs,
          JSON.stringify(res.headers),
          res.body,
          remark
        );
      } else {
        await persistFavoriteDraftIfNeeded(
          stAfter.currentFavoriteId,
          {
            url,
            protocol: 'http',
            method,
            headers: getHeadersForStorage(),
            params: getParamsForStorage(),
            body: getBodyForStorage(),
            endpointRemark: stAfter.endpointRemark,
          },
          refreshFavorites
        );
        await addHistory(
          'http',
          method,
          url,
          getHeadersForStorage(),
          getParamsForStorage(),
          getBodyForStorage(),
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
      setHttpResponse({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
      const stErr = useRequestStore.getState();
      const remarkErr = await resolveRemarkForHistoryPersistence(stErr.currentHistoryId, stErr.endpointRemark);
      if (stErr.currentHistoryId != null) {
        await updateHistory(
          stErr.currentHistoryId,
          'http',
          method,
          url,
          getHeadersForStorage(),
          getParamsForStorage(),
          getBodyForStorage(),
          undefined,
          undefined,
          undefined,
          undefined,
          remarkErr
        );
      } else {
        await persistFavoriteDraftIfNeeded(
          stErr.currentFavoriteId,
          {
            url,
            protocol: 'http',
            method,
            headers: getHeadersForStorage(),
            params: getParamsForStorage(),
            body: getBodyForStorage(),
            endpointRemark: stErr.endpointRemark,
          },
          refreshFavorites
        );
        await addHistory(
          'http',
          method,
          url,
          getHeadersForStorage(),
          getParamsForStorage(),
          getBodyForStorage(),
          undefined,
          undefined,
          undefined,
          undefined,
          remarkErr
        );
      }
      refreshHistory();
    }
  }, [getHeadersForStorage, getParamsForStorage, getBodyForStorage, setHttpResponse, refreshHistory, refreshFavorites]);

  return { send };
}
