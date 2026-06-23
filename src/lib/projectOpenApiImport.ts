import { parse as parseYaml } from 'yaml';
import type { BodyConfig, KeyValueField, ProjectGlobalConfig } from '../types';
import {
  APIX_PROJECT_EXPORT_FORMAT,
  APIX_PROJECT_EXPORT_VERSION,
  ProjectImportError,
  type ApixExportedEndpoint,
  type ApixExportedModule,
  type ApixProjectExportFile,
} from './projectImportExport';
import { serializeProjectGlobalConfig } from './projectMerge';

type HttpVerb = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';

const HTTP_VERBS: HttpVerb[] = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

const EMPTY_BODY_CONFIG: BodyConfig = {
  bodyType: 'form-data',
  bodyFormFields: [{ key: '', value: '', description: '', enabled: true, type: 'text' }],
  body: '',
  rawType: 'json',
  binaryPath: '',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseDocument(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    try {
      parsed = parseYaml(text);
    } catch {
      throw new ProjectImportError('OpenAPI/Swagger 文件不是合法 JSON 或 YAML');
    }
  }
  if (!isRecord(parsed)) throw new ProjectImportError('OpenAPI/Swagger 根节点须为对象');
  return parsed;
}

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function readTitle(doc: Record<string, unknown>): string {
  const info = isRecord(doc.info) ? doc.info : {};
  const title = typeof info.title === 'string' && info.title.trim() ? info.title.trim() : 'OpenAPI 导入项目';
  return title;
}

function readBaseUrl(doc: Record<string, unknown>): string {
  if (Array.isArray(doc.servers) && isRecord(doc.servers[0]) && typeof doc.servers[0].url === 'string') {
    return cleanBaseUrl(doc.servers[0].url);
  }
  if (typeof doc.host === 'string' && doc.host.trim()) {
    const schemes = Array.isArray(doc.schemes) ? doc.schemes : [];
    const scheme = typeof schemes[0] === 'string' ? schemes[0] : 'https';
    const basePath = typeof doc.basePath === 'string' ? doc.basePath : '';
    return cleanBaseUrl(`${scheme}://${doc.host}${basePath}`);
  }
  return '';
}

function keyValue(key: string, description = ''): KeyValueField {
  return { key, value: '', description, enabled: true };
}

function parameterDescription(param: Record<string, unknown>): string {
  return typeof param.description === 'string' ? param.description : '';
}

function collectParams(
  pathItem: Record<string, unknown>,
  operation: Record<string, unknown>
): { headers: KeyValueField[]; queryParams: KeyValueField[] } {
  const allParams = [
    ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
    ...(Array.isArray(operation.parameters) ? operation.parameters : []),
  ].filter(isRecord);
  const headers: KeyValueField[] = [];
  const queryParams: KeyValueField[] = [];
  for (const param of allParams) {
    if (typeof param.name !== 'string' || !param.name.trim()) continue;
    const row = keyValue(param.name.trim(), parameterDescription(param));
    if (param.in === 'header') headers.push(row);
    if (param.in === 'query') queryParams.push(row);
  }
  return { headers, queryParams };
}

function pathWithVariables(path: string): string {
  return path.replace(/\{([^}]+)\}/g, (_, name: string) => `{{${name.trim()}}}`);
}

function schemaExample(schema: unknown): unknown {
  if (!isRecord(schema)) return {};
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.type === 'array') return [schemaExample(schema.items)];
  if (schema.type === 'object' || isRecord(schema.properties)) {
    const out: Record<string, unknown> = {};
    const props = isRecord(schema.properties) ? schema.properties : {};
    for (const [key, value] of Object.entries(props)) {
      out[key] = schemaExample(value);
    }
    return out;
  }
  if (schema.type === 'integer' || schema.type === 'number') return 0;
  if (schema.type === 'boolean') return false;
  return '';
}

function bodyFromOperation(operation: Record<string, unknown>): string | null {
  const requestBody = isRecord(operation.requestBody) ? operation.requestBody : null;
  if (requestBody) {
    const content = isRecord(requestBody.content) ? requestBody.content : {};
    const jsonContent =
      (isRecord(content['application/json']) ? content['application/json'] : null) ??
      Object.values(content).find(isRecord) ??
      null;
    const schema = isRecord(jsonContent) ? jsonContent.schema : null;
    const example = isRecord(jsonContent) && jsonContent.example !== undefined ? jsonContent.example : schemaExample(schema);
    const config: BodyConfig = {
      ...EMPTY_BODY_CONFIG,
      bodyType: 'raw',
      body: JSON.stringify(example, null, 2),
      rawType: 'json',
    };
    return JSON.stringify(config);
  }

  const consumes = Array.isArray(operation.consumes) ? operation.consumes : [];
  const bodyParam = Array.isArray(operation.parameters)
    ? operation.parameters.filter(isRecord).find((p) => p.in === 'body')
    : null;
  if (bodyParam) {
    const config: BodyConfig = {
      ...EMPTY_BODY_CONFIG,
      bodyType: 'raw',
      body: JSON.stringify(schemaExample(bodyParam.schema), null, 2),
      rawType: consumes.includes('application/xml') ? 'xml' : 'json',
    };
    return JSON.stringify(config);
  }
  return null;
}

function endpointName(method: string, path: string, operation: Record<string, unknown>): string {
  for (const key of ['summary', 'operationId', 'description']) {
    const value = operation[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return `${method.toUpperCase()} ${path}`;
}

function moduleName(operation: Record<string, unknown>): string {
  if (Array.isArray(operation.tags) && typeof operation.tags[0] === 'string' && operation.tags[0].trim()) {
    return operation.tags[0].trim();
  }
  return '默认模块';
}

function buildGlobalConfig(baseUrl: string): string {
  const config: ProjectGlobalConfig = {
    headers: [],
    baseUrl,
    variables: [],
  };
  return serializeProjectGlobalConfig(config);
}

export function parseOpenApiToProjectExport(text: string): ApixProjectExportFile {
  const doc = parseDocument(text);
  if (typeof doc.openapi !== 'string' && typeof doc.swagger !== 'string') {
    throw new ProjectImportError('不是 OpenAPI 3.x 或 Swagger 2.0 文件');
  }
  const paths = isRecord(doc.paths) ? doc.paths : null;
  if (!paths) throw new ProjectImportError('缺少 paths');

  const modulesByName = new Map<string, ApixExportedModule>();
  const baseUrl = readBaseUrl(doc);
  let endpointSort = 0;

  for (const [path, pathValue] of Object.entries(paths)) {
    if (!isRecord(pathValue)) continue;
    for (const method of HTTP_VERBS) {
      const op = pathValue[method];
      if (!isRecord(op)) continue;
      const modName = moduleName(op);
      let mod = modulesByName.get(modName);
      if (!mod) {
        mod = { name: modName, sort_order: modulesByName.size, endpoints: [] };
        modulesByName.set(modName, mod);
      }
      const params = collectParams(pathValue, op);
      const endpoint: ApixExportedEndpoint = {
        name: endpointName(method, path, op),
        protocol: 'http',
        method: method.toUpperCase(),
        url: pathWithVariables(path),
        headers: JSON.stringify(params.headers),
        params: JSON.stringify(params.queryParams),
        body: bodyFromOperation(op),
        sort_order: endpointSort,
        response_status: null,
        response_time_ms: null,
        response_headers: null,
        response_body: null,
      };
      endpointSort += 1;
      mod.endpoints.push(endpoint);
    }
  }

  return {
    format: APIX_PROJECT_EXPORT_FORMAT,
    version: APIX_PROJECT_EXPORT_VERSION,
    exportedAt: Date.now(),
    project: {
      name: readTitle(doc),
      global_config: buildGlobalConfig(baseUrl),
    },
    modules: Array.from(modulesByName.values()),
  };
}
