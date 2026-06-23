import { create } from 'zustand';
import type {
  Protocol,
  HttpMethod,
  BodyType,
  RawType,
  BodyFormField,
  KeyValueField,
  ProjectGlobalConfig,
} from '../types';
import {
  DEFAULT_PROJECT_ENVIRONMENTS,
  buildResolvedForSend,
  serializeProjectGlobalConfig,
  type ResolvedForSend,
} from '../lib/projectMerge';
import { updateProject } from '../lib/db';
import { useResponseStore } from './responseStore';

const EMPTY_KV: KeyValueField = { key: '', value: '', description: '', enabled: true };

/** 串行化全局配置的 DB 写入，避免与防抖保存并发导致 SQLITE_BUSY 或读写过期快照 */
let projectGlobalsFlushTail: Promise<void> = Promise.resolve();

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
  currentHistoryId: number | null;
  /** 侧栏收藏中选中的条目；发送时回写收藏内容 */
  currentFavoriteId: number | null;
  /**
   * 为 true 时表示请求来自历史/收藏面板：发送时不写入项目 api_endpoints，
   * 仅更新历史或收藏（由 hooks 处理）。
   */
  suppressPersistToProject: boolean;
  /** 当前项目上下文；有值时发送请求会合并全局 Headers 并解析 {{变量}} */
  currentProjectId: number | null;
  currentModuleId: number | null;
  currentEndpointId: number | null;
  projectGlobalConfig: ProjectGlobalConfig | null;
  /** request：接口调试；project_settings：右侧主区显示项目全局 Headers / 变量 */
  mainWorkspace: 'request' | 'project_settings';
  /** 侧栏「+ 新建」在项目 Tab 下写入的默认模块（点击模块名称设置，点到其他模块则更新） */
  newEndpointTargetModule: { projectId: number; moduleId: number } | null;
  setNewEndpointTargetModule: (t: { projectId: number; moduleId: number } | null) => void;
  /** 地址栏旁备注；发送并写入项目接口时作为标题（有值），否则用 URL 默认推导名 */
  endpointRemark: string;
  setEndpointRemark: (v: string) => void;
  /**
   * 地址栏查询串是否以 & 结尾（用户正在输入下一参数）；不参与持久化，仅用于展示回显。
   */
  queryTrailingAmpersand: boolean;
  setQueryTrailingAmpersand: (v: boolean) => void;

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
  setCurrentHistoryId: (id: number | null) => void;
  setCurrentFavoriteId: (id: number | null) => void;
  setSuppressPersistToProject: (v: boolean) => void;
  setProjectContext: (ctx: {
    projectId: number | null;
    moduleId?: number | null;
    endpointId?: number | null;
    globalConfig?: ProjectGlobalConfig | null;
  }) => Promise<void>;
  clearProjectContext: () => Promise<void>;
  updateProjectGlobalConfig: (config: ProjectGlobalConfig) => void;
  switchProjectEnvironment: (environmentId: string) => Promise<void>;
  /** 写入当前项目全局配置到 DB；无需保存时返回 true，成功 true，失败 false */
  flushProjectGlobalsDraft: () => Promise<boolean>;
  /** 右侧主区进入项目全局设置（清空当前请求表单与模块/接口上下文） */
  enterProjectSettingsView: (projectId: number, globalConfig: ProjectGlobalConfig) => Promise<void>;

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
    /** 从项目树打开接口时传入当前名称，便于查看或发送时改名 */
    endpointRemark?: string;
  }) => Promise<void>;

  newRequest: () => Promise<void>;
  /** 在当前项目/模块下新建接口草稿：清空表单与 endpointId，保留项目全局配置上下文 */
  newEndpointDraft: () => Promise<void>;

  getHeadersRecord: () => Record<string, string>;
  getQueryParamsRecord: () => Record<string, string>;
  getHeadersForStorage: () => string;
  getParamsForStorage: () => string;
  getBodyForStorage: () => string;
  /** 合并项目全局配置并替换占位符后的发送用快照 */
  getResolvedForSend: () => ResolvedForSend;
}

const EMPTY_FORM_FIELD: BodyFormField = { key: '', value: '', description: '', enabled: true };

function getAvailableProjectEnvironments(config: ProjectGlobalConfig) {
  return config.environments && config.environments.length > 0
    ? config.environments
    : DEFAULT_PROJECT_ENVIRONMENTS.map((env) => ({
        ...env,
        headers: [...(env.headers ?? [])],
        variables: [...env.variables],
      }));
}

function keepActiveEnvironmentForSameProject(
  projectId: number | null,
  config: ProjectGlobalConfig | null,
  previous: RequestState
): ProjectGlobalConfig | null {
  if (projectId == null || !config) return null;
  if (previous.currentProjectId !== projectId || !previous.projectGlobalConfig?.activeEnvironmentId) {
    return config;
  }
  const activeEnvironmentId = previous.projectGlobalConfig.activeEnvironmentId;
  const environments = getAvailableProjectEnvironments(config);
  if (!environments.some((env) => env.id === activeEnvironmentId)) return config;
  return {
    ...config,
    environments,
    activeEnvironmentId,
  };
}

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
  currentHistoryId: null,
  currentFavoriteId: null,
  suppressPersistToProject: false,
  currentProjectId: null,
  currentModuleId: null,
  currentEndpointId: null,
  projectGlobalConfig: null,
  mainWorkspace: 'request',
  newEndpointTargetModule: null,
  endpointRemark: '',
  setEndpointRemark: (endpointRemark) => set({ endpointRemark }),
  queryTrailingAmpersand: false,
  setQueryTrailingAmpersand: (queryTrailingAmpersand) => set({ queryTrailingAmpersand }),

  setNewEndpointTargetModule: (newEndpointTargetModule) => set({ newEndpointTargetModule }),

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
  setCurrentHistoryId: (currentHistoryId) => set({ currentHistoryId }),
  setCurrentFavoriteId: (currentFavoriteId) => set({ currentFavoriteId }),
  setSuppressPersistToProject: (suppressPersistToProject) => set({ suppressPersistToProject }),

  flushProjectGlobalsDraft: (): Promise<boolean> => {
    const run = projectGlobalsFlushTail.then(async (): Promise<boolean> => {
      const s = get();
      if (s.currentProjectId == null || !s.projectGlobalConfig) {
        return true;
      }
      const headers = s.projectGlobalConfig.headers.filter((x) => x.key || x.value);
      const variables = s.projectGlobalConfig.variables.filter((x) => x.key || x.value);
      const environments = (s.projectGlobalConfig.environments ?? []).map((env) => ({
        ...env,
        baseUrl: env.baseUrl ?? '',
        headers: (env.headers ?? []).filter((x) => x.key || x.value),
        variables: (env.variables ?? []).filter((x) => x.key || x.value),
      }));
      const config = {
        ...s.projectGlobalConfig,
        baseUrl: s.projectGlobalConfig.baseUrl ?? '',
        headers,
        variables,
        environments,
      };
      try {
        await updateProject(s.currentProjectId, {
          global_config: serializeProjectGlobalConfig(config),
        });
        set({ projectGlobalConfig: config });
        useResponseStore.getState().refreshProjects();
        return true;
      } catch (e) {
        console.error('flushProjectGlobalsDraft', e);
        return false;
      }
    });
    projectGlobalsFlushTail = run.then(() => {}).catch(() => {});
    return run;
  },

  setProjectContext: async ({ projectId, moduleId, endpointId, globalConfig }) => {
    await get().flushProjectGlobalsDraft();
    set((s) => ({
      mainWorkspace: 'request',
      currentProjectId: projectId,
      currentModuleId: moduleId ?? null,
      currentEndpointId: endpointId ?? null,
      projectGlobalConfig: keepActiveEnvironmentForSameProject(
        projectId,
        projectId != null ? (globalConfig ?? { headers: [], baseUrl: '', variables: [] }) : null,
        s
      ),
      suppressPersistToProject: false,
      currentFavoriteId: null,
    }));
  },

  clearProjectContext: async () => {
    await get().flushProjectGlobalsDraft();
    const s = get();
    const shouldClearTarget =
      s.currentProjectId != null &&
      s.newEndpointTargetModule != null &&
      s.newEndpointTargetModule.projectId === s.currentProjectId;
    set({
      currentProjectId: null,
      currentModuleId: null,
      currentEndpointId: null,
      projectGlobalConfig: null,
      mainWorkspace: 'request',
      endpointRemark: '',
      suppressPersistToProject: false,
      currentFavoriteId: null,
      ...(shouldClearTarget ? { newEndpointTargetModule: null } : {}),
    });
  },

  updateProjectGlobalConfig: (projectGlobalConfig) => set({ projectGlobalConfig }),

  switchProjectEnvironment: async (environmentId) => {
    const s = get();
    if (s.currentProjectId == null || !s.projectGlobalConfig) return;
    const environments = getAvailableProjectEnvironments(s.projectGlobalConfig);
    if (!environments.some((env) => env.id === environmentId)) return;
    const projectId = s.currentProjectId;
    const nextConfig = {
      ...s.projectGlobalConfig,
      environments,
      activeEnvironmentId: environmentId,
    };
    set({ projectGlobalConfig: nextConfig });
    try {
      await updateProject(projectId, {
        global_config: serializeProjectGlobalConfig(nextConfig),
      });
      useResponseStore.getState().refreshProjects();
    } catch (e) {
      console.error('switchProjectEnvironment', e);
    }
  },

  enterProjectSettingsView: async (projectId, globalConfig) => {
    await get().flushProjectGlobalsDraft();
    set({
      mainWorkspace: 'project_settings',
      currentProjectId: projectId,
      currentModuleId: null,
      currentEndpointId: null,
      newEndpointTargetModule: null,
      projectGlobalConfig: globalConfig,
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
      currentHistoryId: null,
      endpointRemark: '',
      suppressPersistToProject: false,
      currentFavoriteId: null,
      queryTrailingAmpersand: false,
    });
  },

  addHeader: () =>
    set((s) => ({ headers: [...s.headers, { ...EMPTY_KV }] })),
  removeHeader: (i) =>
    set((s) => {
      const next = s.headers.filter((_, idx) => idx !== i);
      if (next.length === 0) next.push({ ...EMPTY_KV });
      return { headers: next };
    }),
  addQueryParam: () =>
    set((s) => ({ queryParams: [...s.queryParams, { ...EMPTY_KV }], queryTrailingAmpersand: false })),
  removeQueryParam: (i) =>
    set((s) => {
      const next = s.queryParams.filter((_, idx) => idx !== i);
      if (next.length === 0) next.push({ ...EMPTY_KV });
      return { queryParams: next, queryTrailingAmpersand: false };
    }),
  addBodyFormField: () =>
    set((s) => ({ bodyFormFields: [...s.bodyFormFields, { ...EMPTY_FORM_FIELD }] })),
  removeBodyFormField: (i) =>
    set((s) => {
      const next = s.bodyFormFields.filter((_, idx) => idx !== i);
      if (next.length === 0) next.push({ ...EMPTY_FORM_FIELD });
      return { bodyFormFields: next };
    }),

  loadFrom: async (config) => {
    await get().flushProjectGlobalsDraft();
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
      mainWorkspace: 'request',
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
      endpointRemark: config.endpointRemark ?? '',
      queryTrailingAmpersand: false,
    });
  },

  newRequest: async () => {
    await get().flushProjectGlobalsDraft();
    set({
      mainWorkspace: 'request',
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
      currentHistoryId: null,
      currentProjectId: null,
      currentModuleId: null,
      currentEndpointId: null,
      projectGlobalConfig: null,
      endpointRemark: '',
      suppressPersistToProject: false,
      currentFavoriteId: null,
      queryTrailingAmpersand: false,
    });
  },

  newEndpointDraft: async () => {
    await get().flushProjectGlobalsDraft();
    set((s) => ({
      mainWorkspace: 'request',
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
      currentHistoryId: null,
      currentEndpointId: null,
      currentProjectId: s.currentProjectId,
      currentModuleId: s.currentModuleId,
      projectGlobalConfig: s.projectGlobalConfig,
      endpointRemark: '',
      suppressPersistToProject: false,
      currentFavoriteId: null,
      queryTrailingAmpersand: false,
    }));
  },

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

  getResolvedForSend: () => {
    const s = get();
    const global =
      s.currentProjectId != null
        ? (s.projectGlobalConfig ?? { headers: [], baseUrl: '', variables: [] })
        : null;
    return buildResolvedForSend(
      {
        url: s.url,
        headers: s.headers,
        queryParams: s.queryParams,
        bodyType: s.bodyType,
        bodyFormFields: s.bodyFormFields,
        body: s.body,
        binaryPath: s.binaryPath,
      },
      global
    );
  },
}));
