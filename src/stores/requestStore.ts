import { create } from 'zustand';
import type { Protocol, HttpMethod, BodyType, RawType, BodyFormField, KeyValueField } from '../types';

const EMPTY_KV: KeyValueField = { key: '', value: '', description: '', enabled: true };

export interface RequestState {
  protocol: Protocol;
  method: HttpMethod;
  url: string;
  headers: KeyValueField[];
  queryParams: KeyValueField[];
  bodyType: BodyType;
  bodyFormFields: BodyFormField[];
  body: string;
  rawType: RawType;
  binaryPath: string;

  setProtocol: (p: Protocol) => void;
  setMethod: (m: HttpMethod) => void;
  setUrl: (u: string) => void;
  setHeaders: (h: KeyValueField[]) => void;
  setQueryParams: (q: KeyValueField[]) => void;
  setBodyType: (t: BodyType) => void;
  setBodyFormFields: (f: BodyFormField[]) => void;
  setBody: (b: string) => void;
  setRawType: (t: RawType) => void;
  setBinaryPath: (p: string) => void;

  addHeader: () => void;
  removeHeader: (i: number) => void;
  addQueryParam: () => void;
  removeQueryParam: (i: number) => void;
  addBodyFormField: () => void;
  removeBodyFormField: (i: number) => void;

  loadFrom: (config: {
    protocol: Protocol;
    method?: string;
    url: string;
    headers?: string;
    params?: string;
    body?: string;
  }) => void;

  newRequest: () => void;

  getHeadersRecord: () => Record<string, string>;
  getQueryParamsRecord: () => Record<string, string>;
  getHeadersForStorage: () => string;
  getParamsForStorage: () => string;
  getBodyForStorage: () => string;
}

const EMPTY_FORM_FIELD: BodyFormField = { key: '', value: '', description: '', enabled: true };

export const useRequestStore = create<RequestState>((set, get) => ({
  protocol: 'http',
  method: 'GET',
  url: '',
  headers: [{ ...EMPTY_KV }],
  queryParams: [{ ...EMPTY_KV }],
  bodyType: 'form-data',
  bodyFormFields: [{ ...EMPTY_FORM_FIELD }],
  body: '',
  rawType: 'json',
  binaryPath: '',

  setProtocol: (protocol) => set({ protocol }),
  setMethod: (method) => set({ method }),
  setUrl: (url) => set({ url }),
  setHeaders: (headers) => set({ headers }),
  setQueryParams: (queryParams) => set({ queryParams }),
  setBodyType: (bodyType) => set({ bodyType }),
  setBodyFormFields: (bodyFormFields) => set({ bodyFormFields }),
  setBody: (body) => set({ body }),
  setRawType: (rawType) => set({ rawType }),
  setBinaryPath: (binaryPath) => set({ binaryPath }),

  addHeader: () =>
    set((s) => ({ headers: [...s.headers, { ...EMPTY_KV }] })),
  removeHeader: (i) =>
    set((s) => {
      const next = s.headers.filter((_, idx) => idx !== i);
      if (next.length === 0) next.push({ ...EMPTY_KV });
      return { headers: next };
    }),
  addQueryParam: () =>
    set((s) => ({ queryParams: [...s.queryParams, { ...EMPTY_KV }] })),
  removeQueryParam: (i) =>
    set((s) => {
      const next = s.queryParams.filter((_, idx) => idx !== i);
      if (next.length === 0) next.push({ ...EMPTY_KV });
      return { queryParams: next };
    }),
  addBodyFormField: () =>
    set((s) => ({ bodyFormFields: [...s.bodyFormFields, { ...EMPTY_FORM_FIELD }] })),
  removeBodyFormField: (i) =>
    set((s) => {
      const next = s.bodyFormFields.filter((_, idx) => idx !== i);
      if (next.length === 0) next.push({ ...EMPTY_FORM_FIELD });
      return { bodyFormFields: next };
    }),

  loadFrom: (config) => {
    const headers: KeyValueField[] = [{ ...EMPTY_KV }];
    const queryParams: KeyValueField[] = [{ ...EMPTY_KV }];
    let bodyType: BodyType = 'form-data';
    let bodyFormFields: BodyFormField[] = [{ ...EMPTY_FORM_FIELD }];
    let body = '';
    let rawType: RawType = 'json';
    let binaryPath = '';
    let baseUrl = config.url;

    if (config.headers) {
      try {
        const parsed = JSON.parse(config.headers);
        if (Array.isArray(parsed)) {
          const arr = parsed as Array<{ key?: string; value?: string; description?: string; enabled?: boolean }>;
          const valid = arr.filter((x) => x.key || x.value).map((x) => ({
            key: x.key ?? '',
            value: x.value ?? '',
            description: x.description ?? '',
            enabled: x.enabled ?? true,
          }));
          if (valid.length > 0) {
            headers.length = 0;
            valid.forEach((x) => headers.push({ ...EMPTY_KV, ...x }));
            headers.push({ ...EMPTY_KV });
          }
        } else {
          const obj = parsed as Record<string, string>;
          const entries = Object.entries(obj).filter(([k, v]) => k || v);
          if (entries.length > 0) {
            headers.length = 0;
            entries.forEach(([key, value]) =>
              headers.push({ key, value, description: '', enabled: true })
            );
            headers.push({ ...EMPTY_KV });
          }
        }
      } catch {
        // ignore
      }
    }

    if (config.params) {
      try {
        const parsed = JSON.parse(config.params) as Array<{ key?: string; value?: string; description?: string; enabled?: boolean }>;
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((x) => x.key || x.value).map((x) => ({
            key: x.key ?? '',
            value: x.value ?? '',
            description: x.description ?? '',
            enabled: x.enabled ?? true,
          }));
          if (valid.length > 0) {
            queryParams.length = 0;
            valid.forEach((x) => queryParams.push({ ...EMPTY_KV, ...x }));
            queryParams.push({ ...EMPTY_KV });
          }
        }
      } catch {
        // ignore
      }
    } else {
      try {
        const urlObj = new URL(config.url);
        if (urlObj.search) {
          baseUrl = urlObj.origin + urlObj.pathname;
          urlObj.searchParams.forEach((value, key) => {
            if (queryParams.length === 1 && !queryParams[0].key)
              queryParams.length = 0;
            queryParams.push({ key, value, description: '', enabled: true });
          });
          if (queryParams.length > 0) queryParams.push({ ...EMPTY_KV });
        }
      } catch {
        // invalid url, use as-is
      }
    }

    if (config.body) {
      try {
        const bodyConfig = JSON.parse(config.body) as {
          bodyType?: BodyType;
          bodyFormFields?: BodyFormField[];
          body?: string;
          rawType?: RawType;
          binaryPath?: string;
        };
        if (bodyConfig.bodyType) bodyType = bodyConfig.bodyType;
        if (bodyConfig.bodyFormFields?.length)
          bodyFormFields = bodyConfig.bodyFormFields.map((f) => ({ ...f, enabled: f.enabled ?? true }));
        if (bodyConfig.body != null) body = bodyConfig.body;
        if (bodyConfig.rawType) rawType = bodyConfig.rawType;
        if (bodyConfig.binaryPath) binaryPath = bodyConfig.binaryPath;
      } catch {
        body = config.body;
        bodyType = 'raw';
      }
    }

    set({
      protocol: config.protocol,
      method: (config.method as HttpMethod) || 'GET',
      url: baseUrl,
      headers,
      queryParams,
      bodyType,
      bodyFormFields,
      body,
      rawType,
      binaryPath,
    });
  },

  newRequest: () =>
    set({
      protocol: 'http',
      method: 'GET',
      url: '',
      headers: [{ ...EMPTY_KV }],
      queryParams: [{ ...EMPTY_KV }],
      bodyType: 'form-data',
      bodyFormFields: [{ ...EMPTY_FORM_FIELD }],
      body: '',
      rawType: 'json',
      binaryPath: '',
    }),

  getHeadersForStorage: () => JSON.stringify(get().headers),
  getParamsForStorage: () => JSON.stringify(get().queryParams),
  getBodyForStorage: () => {
    const { bodyType, bodyFormFields, body, rawType, binaryPath } = get();
    return JSON.stringify({
      bodyType,
      bodyFormFields,
      body,
      rawType,
      binaryPath,
    });
  },

  getHeadersRecord: () => {
    const { headers } = get();
    return headers
      .filter((h) => h.enabled !== false)
      .reduce<Record<string, string>>((acc, { key, value }) => {
        if (key.trim()) acc[key.trim()] = value;
        return acc;
      }, {});
  },
  getQueryParamsRecord: () => {
    const { queryParams } = get();
    return queryParams
      .filter((p) => p.enabled !== false)
      .reduce<Record<string, string>>((acc, { key, value }) => {
        if (key.trim()) acc[key.trim()] = value;
        return acc;
      }, {});
  },
}));
