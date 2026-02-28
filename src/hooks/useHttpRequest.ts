import { useCallback } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';
import { useRequestStore } from '../stores/requestStore';
import { useResponseStore } from '../stores/responseStore';
import { sendHttpRequest, buildUrl } from '../lib/http';
import { addHistory } from '../lib/db';

function getFieldFiles(field: { type?: string; filePath?: string; value?: string; files?: Array<{ path: string; name: string }> }): Array<{ path: string; name: string }> {
  if (field.type !== 'file') return [];
  if (field.files?.length) return field.files;
  if (field.filePath) return [{ path: field.filePath, name: field.value || field.filePath.replace(/^.*[/\\]/, '') }];
  return [];
}

async function buildFormDataBody(): Promise<FormData | undefined> {
  const { method, bodyFormFields } = useRequestStore.getState();
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

function buildRequestBody(): string | FormData | URLSearchParams | Uint8Array | undefined {
  const {
    method,
    bodyType,
    bodyFormFields,
    body,
    binaryPath,
  } = useRequestStore.getState();

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
  const { getHeadersRecord, getQueryParamsRecord, getHeadersForStorage, getParamsForStorage, getBodyForStorage } =
    useRequestStore();
  const setHttpResponse = useResponseStore((s) => s.setHttpResponse);
  const refreshHistory = useResponseStore((s) => s.refreshHistory);

  const send = useCallback(async () => {
    const {
      method,
      url,
      bodyType,
      binaryPath,
      body,
      rawType,
    } = useRequestStore.getState();

    if (!url.trim()) return;

    setHttpResponse({ loading: true, error: undefined });

    try {
      const headers = getHeadersRecord();
      const queryParams = getQueryParamsRecord();
      const fullUrl = buildUrl(url, queryParams);

      let requestBody: string | FormData | URLSearchParams | Uint8Array | undefined;

      if (bodyType === 'binary' && binaryPath) {
        const bytes = await readFile(binaryPath);
        requestBody = bytes;
      } else if (bodyType === 'form-data') {
        const hasFileField = useRequestStore
          .getState()
          .bodyFormFields.some((f) => f.enabled !== false && getFieldFiles(f).length > 0);
        requestBody = hasFileField ? await buildFormDataBody() : buildRequestBody();
      } else {
        requestBody = buildRequestBody();
      }

      if (bodyType === 'raw' && body && !headers['Content-Type']) {
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
        res.body
      );
      refreshHistory();
    } catch (err) {
      setHttpResponse({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
      await addHistory(
        'http',
        method,
        url,
        getHeadersForStorage(),
        getParamsForStorage(),
        getBodyForStorage()
      );
      refreshHistory();
    }
  }, [
    getHeadersRecord,
    getQueryParamsRecord,
    getHeadersForStorage,
    getParamsForStorage,
    getBodyForStorage,
    setHttpResponse,
    refreshHistory,
  ]);

  return { send };
}
