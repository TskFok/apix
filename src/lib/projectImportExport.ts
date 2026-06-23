import {
  addApiEndpoint,
  addModule,
  addProject,
  getProject,
  listEndpointsByModuleIds,
  listModules,
  listProjects,
  updateApiEndpoint,
  updateProject,
} from './db';

export const APIX_PROJECT_EXPORT_FORMAT = 'apix-project' as const;
export const APIX_PROJECT_EXPORT_VERSION = 1;

/** 导出文件中单条接口（无数据库 id） */
export interface ApixExportedEndpoint {
  name: string;
  protocol: string;
  method: string | null;
  url: string;
  headers: string;
  params: string | null;
  body: string | null;
  sort_order: number;
  response_status?: number | null;
  response_time_ms?: number | null;
  response_headers?: string | null;
  response_body?: string | null;
}

export interface ApixExportedModule {
  name: string;
  sort_order: number;
  endpoints: ApixExportedEndpoint[];
}

export interface ApixProjectExportFile {
  format: typeof APIX_PROJECT_EXPORT_FORMAT;
  version: number;
  exportedAt: number;
  project: {
    name: string;
    global_config: string;
  };
  modules: ApixExportedModule[];
}

function endpointToExported(row: {
  name: string;
  protocol: string;
  method: string | null;
  url: string;
  headers: string;
  params: string | null;
  body: string | null;
  sort_order: number;
  response_status?: number | null;
  response_time_ms?: number | null;
  response_headers?: string | null;
  response_body?: string | null;
}): ApixExportedEndpoint {
  return {
    name: row.name,
    protocol: row.protocol,
    method: row.method,
    url: row.url,
    headers: row.headers,
    params: row.params,
    body: row.body,
    sort_order: row.sort_order,
    response_status: row.response_status ?? null,
    response_time_ms: row.response_time_ms ?? null,
    response_headers: row.response_headers ?? null,
    response_body: row.response_body ?? null,
  };
}

export type BuildProjectExportOptions = {
  /** 要导出的模块 id；传空数组表示仅导出项目信息、不包含任何模块。未传或 undefined 表示导出全部模块 */
  moduleIds?: number[];
};

/** 构建可 JSON 序列化的项目导出对象 */
export async function buildProjectExportPayload(
  projectId: number,
  options?: BuildProjectExportOptions
): Promise<ApixProjectExportFile | null> {
  const proj = await getProject(projectId);
  if (!proj) return null;
  const modules = await listModules(projectId);
  let toExport = modules;
  if (options && options.moduleIds !== undefined) {
    const ids = options.moduleIds;
    if (ids.length === 0) {
      toExport = [];
    } else {
      const set = new Set(ids);
      toExport = modules.filter((m) => set.has(m.id));
    }
  }
  const modulesOut: ApixExportedModule[] = [];
  const endpointsByModule = await listEndpointsByModuleIds(toExport.map((m) => m.id));
  for (const m of toExport) {
    const eps = endpointsByModule[m.id] ?? [];
    modulesOut.push({
      name: m.name,
      sort_order: m.sort_order,
      endpoints: eps.map(endpointToExported),
    });
  }
  return {
    format: APIX_PROJECT_EXPORT_FORMAT,
    version: APIX_PROJECT_EXPORT_VERSION,
    exportedAt: Date.now(),
    project: {
      name: proj.name,
      global_config: proj.global_config,
    },
    modules: modulesOut,
  };
}

export function serializeProjectExport(payload: ApixProjectExportFile): string {
  return JSON.stringify(payload, null, 2);
}

export class ProjectImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectImportError';
  }
}

export function parseProjectExportJson(text: string): ApixProjectExportFile {
  let o: unknown;
  try {
    o = JSON.parse(text) as unknown;
  } catch {
    throw new ProjectImportError('文件不是合法 JSON');
  }
  if (!o || typeof o !== 'object') throw new ProjectImportError('根节点须为对象');
  const r = o as Record<string, unknown>;
  if (r.format !== APIX_PROJECT_EXPORT_FORMAT) {
    throw new ProjectImportError('不是 Apix 项目导出文件（format 不匹配）');
  }
  if (r.version !== APIX_PROJECT_EXPORT_VERSION) {
    throw new ProjectImportError(`不支持的导出版本：${String(r.version)}（当前为 ${APIX_PROJECT_EXPORT_VERSION}）`);
  }
  const project = r.project;
  if (!project || typeof project !== 'object') throw new ProjectImportError('缺少 project');
  const p = project as Record<string, unknown>;
  if (typeof p.name !== 'string' || !p.name.trim()) throw new ProjectImportError('project.name 无效');
  if (typeof p.global_config !== 'string') throw new ProjectImportError('project.global_config 须为字符串');

  const mods = r.modules;
  if (!Array.isArray(mods)) throw new ProjectImportError('modules 须为数组');
  const modules: ApixExportedModule[] = [];
  for (let i = 0; i < mods.length; i++) {
    const mi = mods[i];
    if (!mi || typeof mi !== 'object') throw new ProjectImportError(`modules[${i}] 无效`);
    const m = mi as Record<string, unknown>;
    if (typeof m.name !== 'string') throw new ProjectImportError(`modules[${i}].name 无效`);
    if (typeof m.sort_order !== 'number') throw new ProjectImportError(`modules[${i}].sort_order 无效`);
    const eps = m.endpoints;
    if (!Array.isArray(eps)) throw new ProjectImportError(`modules[${i}].endpoints 须为数组`);
    const endpoints: ApixExportedEndpoint[] = [];
    for (let j = 0; j < eps.length; j++) {
      const ej = eps[j];
      if (!ej || typeof ej !== 'object') throw new ProjectImportError(`modules[${i}].endpoints[${j}] 无效`);
      const e = ej as Record<string, unknown>;
      if (typeof e.name !== 'string') throw new ProjectImportError(`endpoint name 无效`);
      if (typeof e.protocol !== 'string') throw new ProjectImportError(`endpoint protocol 无效`);
      if (e.method != null && typeof e.method !== 'string') throw new ProjectImportError(`endpoint method 无效`);
      if (typeof e.url !== 'string') throw new ProjectImportError(`endpoint url 无效`);
      if (typeof e.headers !== 'string') throw new ProjectImportError(`endpoint headers 无效`);
      if (e.params != null && typeof e.params !== 'string') throw new ProjectImportError(`endpoint params 无效`);
      if (e.body != null && typeof e.body !== 'string') throw new ProjectImportError(`endpoint body 无效`);
      if (typeof e.sort_order !== 'number') throw new ProjectImportError(`endpoint sort_order 无效`);
      endpoints.push({
        name: e.name,
        protocol: e.protocol,
        method: e.method ?? null,
        url: e.url,
        headers: e.headers,
        params: e.params != null ? e.params : null,
        body: e.body != null ? e.body : null,
        sort_order: e.sort_order,
        response_status:
          e.response_status === null || e.response_status === undefined
            ? null
            : typeof e.response_status === 'number'
              ? e.response_status
              : null,
        response_time_ms:
          e.response_time_ms === null || e.response_time_ms === undefined
            ? null
            : typeof e.response_time_ms === 'number'
              ? e.response_time_ms
              : null,
        response_headers:
          e.response_headers === null || e.response_headers === undefined
            ? null
            : typeof e.response_headers === 'string'
              ? e.response_headers
              : null,
        response_body:
          e.response_body === null || e.response_body === undefined
            ? null
            : typeof e.response_body === 'string'
              ? e.response_body
              : null,
      });
    }
    modules.push({
      name: m.name,
      sort_order: m.sort_order,
      endpoints,
    });
  }

  return {
    format: APIX_PROJECT_EXPORT_FORMAT,
    version: APIX_PROJECT_EXPORT_VERSION,
    exportedAt: typeof r.exportedAt === 'number' ? r.exportedAt : Date.now(),
    project: {
      name: p.name.trim(),
      global_config: p.global_config,
    },
    modules,
  };
}

async function uniqueProjectName(base: string): Promise<string> {
  const all = await listProjects();
  const names = new Set(all.map((p) => p.name));
  if (!names.has(base)) return base;
  let i = 1;
  while (names.has(`${base} (${i})`)) i += 1;
  return `${base} (${i})`;
}

async function insertEndpoint(moduleId: number, ep: ApixExportedEndpoint): Promise<void> {
  const id = await addApiEndpoint(
    moduleId,
    ep.name,
    ep.protocol,
    ep.method,
    ep.url,
    ep.headers,
    ep.params,
    ep.body,
    ep.sort_order
  );
  if (id <= 0) return;
  const hasResponse =
    ep.response_status != null ||
    ep.response_time_ms != null ||
    (ep.response_headers != null && ep.response_headers.length > 0) ||
    (ep.response_body != null && ep.response_body.length > 0);
  if (hasResponse) {
    await updateApiEndpoint(id, {
      response_status: ep.response_status ?? null,
      response_time_ms: ep.response_time_ms ?? null,
      response_headers: ep.response_headers ?? null,
      response_body: ep.response_body ?? null,
    });
  }
}

/** 导入为新建项目，返回新项目 id */
export async function importProjectAsNew(payload: ApixProjectExportFile): Promise<number> {
  const name = await uniqueProjectName(payload.project.name);
  const projectId = await addProject(name);
  if (projectId <= 0) throw new ProjectImportError('创建项目失败');
  await updateProject(projectId, { global_config: payload.project.global_config });
  for (const m of payload.modules) {
    const moduleId = await addModule(projectId, m.name, m.sort_order);
    if (moduleId <= 0) continue;
    for (const ep of m.endpoints) {
      await insertEndpoint(moduleId, ep);
    }
  }
  return projectId;
}

/** 合并到已有项目（追加模块与接口） */
export async function importProjectMergeInto(targetProjectId: number, payload: ApixProjectExportFile): Promise<void> {
  const proj = await getProject(targetProjectId);
  if (!proj) throw new ProjectImportError('目标项目不存在');
  for (const m of payload.modules) {
    const moduleId = await addModule(targetProjectId, m.name, m.sort_order);
    if (moduleId <= 0) continue;
    for (const ep of m.endpoints) {
      await insertEndpoint(moduleId, ep);
    }
  }
}
