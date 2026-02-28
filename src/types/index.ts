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
