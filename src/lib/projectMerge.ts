import type {
  BodyFormField,
  BodyType,
  KeyValueField,
  ProjectEnvironment,
  ProjectGlobalConfig,
  ProjectGlobalVariable,
  ProjectGlobalVariableTarget,
} from '../types';

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export const DEFAULT_PROJECT_ENVIRONMENTS: ProjectEnvironment[] = [
  { id: 'dev', name: '开发', baseUrl: '', headers: [], variables: [] },
  { id: 'test', name: '测试', baseUrl: '', headers: [], variables: [] },
  { id: 'prod', name: '生产', baseUrl: '', headers: [], variables: [] },
];

/** 将 `{{varName}}` 替换为 vars 中的值；未定义的占位符保留原样 */
export function substituteInString(input: string, vars: Record<string, string>): string {
  return input.replace(PLACEHOLDER_RE, (match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
    return match;
  });
}

export function keyValueFieldsToRecord(fields: KeyValueField[]): Record<string, string> {
  return fields
    .filter((f) => f.enabled !== false)
    .reduce<Record<string, string>>((acc, { key, value }) => {
      const k = key.trim();
      if (k) acc[k] = value;
      return acc;
    }, {});
}

/** 项目全局 Headers 与接口 Headers 合并为 Record；同名 key 接口覆盖项目 */
export function mergeHeaderRecords(
  globalHeaders: Record<string, string>,
  endpointHeaders: Record<string, string>
): Record<string, string> {
  return { ...globalHeaders, ...endpointHeaders };
}

export function substituteRecordValues(
  record: Record<string, string>,
  vars: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    out[k] = substituteInString(v, vars);
  }
  return out;
}

function normalizeKeyValueFields(value: unknown): KeyValueField[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is Partial<KeyValueField> => !!x && typeof x === 'object')
    .map((x) => ({
      key: typeof x.key === 'string' ? x.key : '',
      value: typeof x.value === 'string' ? x.value : '',
      description: typeof x.description === 'string' ? x.description : '',
      enabled: x.enabled !== false,
      ...(x.queryEmptyShowsEquals === true ? { queryEmptyShowsEquals: true } : {}),
    }));
}

function normalizeProjectGlobalVariables(value: unknown): ProjectGlobalVariable[] {
  return normalizeKeyValueFields(value).map((row, idx) => {
    const raw = Array.isArray(value) ? value[idx] : null;
    const target =
      raw && typeof raw === 'object' && (raw as Record<string, unknown>).target === 'params'
        ? 'params'
        : 'body';
    return { ...row, target };
  });
}

function normalizeEnvironments(value: unknown): ProjectEnvironment[] {
  if (!Array.isArray(value)) {
    return DEFAULT_PROJECT_ENVIRONMENTS.map((x) => ({ ...x, variables: [] }));
  }
  const envs = value
    .filter((x): x is Partial<ProjectEnvironment> => !!x && typeof x === 'object')
    .map((x, idx) => ({
      id: typeof x.id === 'string' && x.id.trim() ? x.id.trim() : `env-${idx + 1}`,
      name: typeof x.name === 'string' && x.name.trim() ? x.name.trim() : `环境 ${idx + 1}`,
      baseUrl: typeof x.baseUrl === 'string' ? x.baseUrl : undefined,
      headers: Array.isArray(x.headers) ? normalizeKeyValueFields(x.headers) : undefined,
      variables: normalizeProjectGlobalVariables(x.variables),
    }));
  return envs.length > 0 ? envs : DEFAULT_PROJECT_ENVIRONMENTS.map((x) => ({ ...x, variables: [] }));
}

export function getActiveProjectEnvironment(config: ProjectGlobalConfig | null | undefined): ProjectEnvironment | null {
  const envs = config?.environments ?? [];
  if (envs.length === 0) return null;
  return envs.find((env) => env.id === config?.activeEnvironmentId) ?? envs[0] ?? null;
}

function hasConfiguredVariables(rows: ProjectGlobalVariable[] | undefined): boolean {
  return (rows ?? []).some((row) => row.key.trim() || row.value);
}

function hasConfiguredKeyValueFields(rows: KeyValueField[] | undefined): boolean {
  return (rows ?? []).some((row) => row.key.trim() || row.value);
}

export function getProjectVariableRows(config: ProjectGlobalConfig | null | undefined): ProjectGlobalVariable[] {
  const active = getActiveProjectEnvironment(config);
  if (hasConfiguredVariables(active?.variables)) return active?.variables ?? [];
  return config?.variables ?? [];
}

export function getProjectVariablesRecord(config: ProjectGlobalConfig | null | undefined): Record<string, string> {
  return keyValueFieldsToRecord(getProjectVariableRows(config));
}

export function getProjectHeaderRows(config: ProjectGlobalConfig | null | undefined): KeyValueField[] {
  const active = getActiveProjectEnvironment(config);
  if (hasConfiguredKeyValueFields(active?.headers)) return active?.headers ?? [];
  return config?.headers ?? [];
}

export function getProjectHeadersForSend(config: ProjectGlobalConfig | null | undefined): KeyValueField[] {
  return getProjectHeaderRows(config);
}

export function getProjectBaseUrl(config: ProjectGlobalConfig | null | undefined): string {
  const active = getActiveProjectEnvironment(config);
  return active?.baseUrl?.trim() ? active.baseUrl : config?.baseUrl ?? '';
}

export function getProjectBaseUrlForSend(config: ProjectGlobalConfig | null | undefined): string {
  return getProjectBaseUrl(config);
}

export function getProjectVariableRowsForSend(
  config: ProjectGlobalConfig | null | undefined,
  target?: ProjectGlobalVariableTarget
): ProjectGlobalVariable[] {
  const rowsByKey = new Map<string, ProjectGlobalVariable>();
  const append = (rows: ProjectGlobalVariable[]) => {
    for (const row of rows) {
      if (row.enabled === false) continue;
      const key = row.key.trim();
      if (!key) continue;
      rowsByKey.set(key, {
        ...row,
        key,
        target: row.target ?? 'body',
      });
    }
  };
  append(getProjectVariableRows(config));
  const rows = [...rowsByKey.values()];
  return target ? rows.filter((row) => (row.target ?? 'body') === target) : rows;
}

/**
 * 将项目全局变量中「接口 Body 未出现的 key」合并为 form-data / urlencoded 的文本字段（排在前面），
 * 效果类似在 Body 里多填了几行键值；同名 key 以接口表单为准，不重复发送。
 */
export function mergeGlobalVariablesIntoBodyFormFields(
  variableRows: ProjectGlobalVariable[],
  endpointFields: BodyFormField[]
): BodyFormField[] {
  const endpointKeys = new Set(
    endpointFields
      .filter((f) => f.enabled !== false)
      .map((f) => f.key.trim())
      .filter(Boolean)
  );
  const extra: BodyFormField[] = [];
  for (const row of variableRows) {
    if (row.enabled === false) continue;
    const k = row.key.trim();
    if (!k) continue;
    if (endpointKeys.has(k)) continue;
    extra.push({
      key: k,
      value: row.value,
      description: row.description ?? '',
      enabled: true,
      type: 'text',
    });
  }
  return [...extra, ...endpointFields];
}

export function mergeGlobalVariablesIntoQueryParams(
  variableRows: ProjectGlobalVariable[],
  endpointParams: Record<string, string>
): Record<string, string> {
  const globalParams: Record<string, string> = {};
  for (const row of variableRows) {
    if (row.enabled === false) continue;
    const key = row.key.trim();
    if (!key) continue;
    globalParams[key] = row.value;
  }
  return { ...globalParams, ...endpointParams };
}

function isAbsoluteUrl(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value);
}

export function resolveUrlWithBaseUrl(endpointUrl: string, baseUrl: string): string {
  const endpoint = endpointUrl.trim();
  const base = baseUrl.trim();
  if (!base) return endpointUrl;
  if (!endpoint) return base;
  if (isAbsoluteUrl(endpoint)) return endpoint;
  if (endpoint.startsWith('?')) return `${base}${endpoint}`;
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${b}${p}`;
}

export function parseProjectGlobalConfig(json: string | null | undefined): ProjectGlobalConfig {
  if (!json?.trim()) {
    const environments = DEFAULT_PROJECT_ENVIRONMENTS.map((x) => ({ ...x, variables: [] }));
    return { headers: [], baseUrl: '', variables: [], environments, activeEnvironmentId: environments[0].id };
  }
  try {
    const o = JSON.parse(json) as Partial<ProjectGlobalConfig>;
    const environments = normalizeEnvironments(o.environments);
    const activeEnvironmentId =
      typeof o.activeEnvironmentId === 'string' &&
      environments.some((env) => env.id === o.activeEnvironmentId)
        ? o.activeEnvironmentId
        : environments[0].id;
    return {
      headers: normalizeKeyValueFields(o.headers),
      baseUrl: typeof o.baseUrl === 'string' ? o.baseUrl : '',
      variables: normalizeProjectGlobalVariables(o.variables),
      environments,
      activeEnvironmentId,
    };
  } catch {
    const environments = DEFAULT_PROJECT_ENVIRONMENTS.map((x) => ({ ...x, variables: [] }));
    return { headers: [], baseUrl: '', variables: [], environments, activeEnvironmentId: environments[0].id };
  }
}

export function serializeProjectGlobalConfig(config: ProjectGlobalConfig): string {
  const environments =
    config.environments && config.environments.length > 0
      ? config.environments
      : DEFAULT_PROJECT_ENVIRONMENTS.map((x) => ({ ...x, variables: [] }));
  return JSON.stringify({
    headers: config.headers ?? [],
    baseUrl: config.baseUrl ?? '',
    variables: config.variables ?? [],
    environments: environments.map((env) => ({ ...env, variables: env.variables ?? [] })),
    activeEnvironmentId: config.activeEnvironmentId ?? environments[0]?.id ?? 'dev',
  });
}

export interface RequestResolutionInput {
  url: string;
  headers: KeyValueField[];
  queryParams: KeyValueField[];
  bodyType: BodyType;
  bodyFormFields: BodyFormField[];
  body: string;
  binaryPath: string;
}

export interface ResolvedForSend {
  url: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body: string;
  bodyFormFields: BodyFormField[];
  binaryPath: string;
}

/**
 * 合并项目全局 Headers，解析变量；Query / URL / Body 字符串与表单文本值做占位符替换。
 * form-data / x-www-form-urlencoded 下还会把全局变量中接口未声明的 key 合并为默认表单项（与 Body 里 form 行类似）。
 * 文件字段、binaryPath 不替换。
 */
export function buildResolvedForSend(
  input: RequestResolutionInput,
  globalConfig: ProjectGlobalConfig | null
): ResolvedForSend {
  const vars = getProjectVariablesRecord(globalConfig);
  const globalH = keyValueFieldsToRecord(getProjectHeadersForSend(globalConfig));
  const endpointH = keyValueFieldsToRecord(input.headers);
  const mergedHeaders = mergeHeaderRecords(globalH, endpointH);
  const headers = substituteRecordValues(mergedHeaders, vars);

  const queryRecord = keyValueFieldsToRecord(input.queryParams);
  const globalQueryParams = mergeGlobalVariablesIntoQueryParams(
    getProjectVariableRowsForSend(globalConfig, 'params'),
    queryRecord
  );
  const queryParams = substituteRecordValues(globalQueryParams, vars);

  const url = resolveUrlWithBaseUrl(
    substituteInString(input.url, vars),
    substituteInString(getProjectBaseUrlForSend(globalConfig), vars)
  );

  let body = input.body;
  if (input.bodyType === 'raw') {
    body = substituteInString(input.body, vars);
  }

  let bodyFormFields = input.bodyFormFields;
  if (input.bodyType === 'form-data' || input.bodyType === 'x-www-form-urlencoded') {
    bodyFormFields = mergeGlobalVariablesIntoBodyFormFields(
      getProjectVariableRowsForSend(globalConfig, 'body'),
      input.bodyFormFields
    );
    bodyFormFields = bodyFormFields.map((f) => {
      if (f.enabled === false) return f;
      if (f.type === 'file') return f;
      return { ...f, value: substituteInString(f.value, vars) };
    });
  }

  return {
    url,
    headers,
    queryParams,
    body,
    bodyFormFields,
    binaryPath: input.binaryPath,
  };
}
