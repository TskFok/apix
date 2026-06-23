export type Protocol = 'http' | 'ws' | 'sse';

export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

export type BodyType = 'form-data' | 'x-www-form-urlencoded' | 'raw' | 'binary';
export type RawType = 'json' | 'text' | 'xml';

export interface BodyFormFile {
  path: string;
  name: string;
}

export interface BodyFormField {
  key: string;
  value: string;
  description: string;
  /** 未勾选时该行不参与请求 */
  enabled?: boolean;
  /** 'file' 表示该字段为文件 */
  type?: 'text' | 'file';
  /** @deprecated 使用 files 代替，loadFrom 时会迁移到 files */
  filePath?: string;
  /** 文件列表，支持多选；空数组时该行仍为文件类型但无文件 */
  files?: BodyFormFile[];
}

export interface KeyValueField {
  key: string;
  value: string;
  description: string;
  /** 未勾选时该行不参与请求 */
  enabled?: boolean;
  /**
   * 仅 Query 行：value 为空且地址栏原始片段为 `key=`（带等号）时为 true。
   * 用于展示时保留 `=`；`?key` 无等号时不应设此标记。
   */
  queryEmptyShowsEquals?: boolean;
}

export type ProjectGlobalVariableTarget = 'params' | 'body';

export interface ProjectGlobalVariable extends KeyValueField {
  /** 全局变量发送位置；旧数据缺省按 body 兼容 */
  target?: ProjectGlobalVariableTarget;
}

export interface BodyConfig {
  bodyType: BodyType;
  bodyFormFields: BodyFormField[];
  body: string;
  rawType: RawType;
  binaryPath?: string;
}

export interface RequestConfig {
  protocol: Protocol;
  method?: HttpMethod;
  url: string;
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body?: string;
  bodyType?: BodyType;
}

export interface HttpRequestState extends RequestConfig {
  protocol: 'http';
  method: HttpMethod;
}

export interface HistoryItem {
  id: number;
  protocol: Protocol;
  method?: string;
  url: string;
  headers: string;
  params?: string;
  body?: string;
  /** 地址栏备注；与请求表单同步持久化 */
  remark?: string | null;
  created_at: number;
  response_status?: number;
  response_time_ms?: number;
  response_headers?: string;
  response_body?: string;
}

export interface FavoriteItem {
  id: number;
  name: string;
  protocol: Protocol;
  method?: string;
  url: string;
  headers: string;
  params?: string;
  body?: string;
  created_at: number;
  updated_at: number;
}

export interface StreamMessage {
  id: string;
  direction: 'in' | 'out';
  timestamp: number;
  content: string;
  event?: string;
}

export interface SSERawEvent {
  event?: string;
  data?: string;
  id?: string;
}

export interface ProjectEnvironment {
  id: string;
  name: string;
  /** 当前环境专属全局 Base URL；为空时可回退到旧版项目级 baseUrl */
  baseUrl?: string;
  /** 当前环境专属全局 Headers；未定义时可回退到旧版项目级 headers */
  headers?: KeyValueField[];
  /** 当前环境专属共享变量；为空时可回退到旧版项目级 variables */
  variables: ProjectGlobalVariable[];
}

export type ProjectAuthConfig =
  | { type: 'none'; enabled?: boolean }
  | { type: 'bearer'; token: string; enabled?: boolean }
  | { type: 'basic'; username: string; password: string; enabled?: boolean }
  | { type: 'apiKey'; name: string; value: string; in: 'header' | 'query'; enabled?: boolean }
  | { type: 'cookie'; value: string; enabled?: boolean };

/** 项目级全局配置（存于 projects.global_config JSON） */
export interface ProjectGlobalConfig {
  headers: KeyValueField[];
  /** 全局 Base URL；接口 URL 为相对路径时会自动拼接 */
  baseUrl?: string;
  /** 旧版项目级共享变量；当前环境未配置变量时兼容回退 */
  variables: ProjectGlobalVariable[];
  environments?: ProjectEnvironment[];
  activeEnvironmentId?: string;
  /** 历史兼容字段；当前不再编辑或参与请求合并 */
  auth?: ProjectAuthConfig;
}

export interface ProjectRow {
  id: number;
  name: string;
  sort_order: number;
  global_config: string;
  created_at: number;
  updated_at: number;
}

export interface ModuleRow {
  id: number;
  project_id: number;
  name: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface ApiEndpointRow {
  id: number;
  module_id: number;
  name: string;
  protocol: Protocol;
  method: string | null;
  url: string;
  headers: string;
  params: string | null;
  body: string | null;
  /** 最近一次 HTTP 成功响应（项目内持久化） */
  response_status?: number | null;
  response_time_ms?: number | null;
  response_headers?: string | null;
  response_body?: string | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface ProjectSearchResult {
  kind: 'project' | 'module' | 'endpoint';
  projectId: number;
  projectName: string;
  moduleId?: number | null;
  moduleName?: string | null;
  endpointId?: number | null;
  endpointName?: string | null;
  protocol?: Protocol | null;
  method?: string | null;
  url?: string | null;
  matchText?: string | null;
}
