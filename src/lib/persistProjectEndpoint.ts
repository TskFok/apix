import { useRequestStore } from '../stores/requestStore';
import { useResponseStore } from '../stores/responseStore';
import { addApiEndpoint, updateApiEndpoint, getModuleById } from './db';

export interface PersistableHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  timeMs?: number;
}

/**
 * HTTP 请求成功且当前为项目内接口（非历史/收藏抑制）时，将响应写入 api_endpoints。
 */
export async function persistProjectHttpResponseIfNeeded(
  response: PersistableHttpResponse
): Promise<void> {
  const s = useRequestStore.getState();
  if (s.suppressPersistToProject || s.protocol !== 'http') return;
  const id = s.currentEndpointId;
  if (id == null) return;
  try {
    await updateApiEndpoint(id, {
      response_status: response.status,
      response_time_ms: response.timeMs ?? null,
      response_headers: JSON.stringify(response.headers),
      response_body: response.body,
    });
    useResponseStore.getState().refreshProjects();
  } catch (e) {
    console.error('persistProjectHttpResponseIfNeeded', e);
  }
}

/** 由 URL 推导接口显示名（新建接口时使用） */
export function defaultEndpointNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop();
    return seg || '未命名接口';
  } catch {
    return url.trim() ? url.trim().slice(0, 40) : '未命名接口';
  }
}

/** 发送保存接口时：有备注用备注作标题，否则用 URL 推导的默认名 */
export function resolveEndpointDisplayName(url: string, remark: string): string {
  const t = remark.trim();
  if (t) return t;
  return defaultEndpointNameFromUrl(url);
}

/** 更新历史记录时：有备注写备注，否则保留库中已有备注 */
export function resolveHistoryRemarkForUpdate(
  existingRemark: string | null | undefined,
  endpointRemark: string
): string | null {
  const t = endpointRemark.trim();
  if (t) return t;
  const e = (existingRemark ?? '').trim();
  return e || null;
}

/** 更新收藏时：有备注作为名称，否则保留原名，再否则 URL 默认名 */
export function resolveFavoriteNameForUpdate(
  existingName: string | null | undefined,
  url: string,
  endpointRemark: string
): string {
  const t = endpointRemark.trim();
  if (t) return t;
  const e = (existingName ?? '').trim();
  if (e) return e;
  return defaultEndpointNameFromUrl(url);
}

/**
 * 若当前请求已关联模块（侧栏项目树），将当前表单写入 api_endpoints。
 * 已有 endpointId 则更新（不修改接口名称）；否则插入并回写 endpointId。
 */
export async function persistProjectEndpointIfNeeded(): Promise<void> {
  const s = useRequestStore.getState();
  if (s.suppressPersistToProject) return;
  const moduleId = s.currentModuleId;
  if (moduleId == null || !s.url.trim()) return;

  const protocol = s.protocol;
  const method = protocol === 'http' ? s.method : null;
  const headers = s.getHeadersForStorage();
  const params = s.getParamsForStorage();
  const body = s.getBodyForStorage();

  try {
    const remark = s.endpointRemark ?? '';
    if (s.currentEndpointId != null) {
      const trimmed = remark.trim();
      await updateApiEndpoint(s.currentEndpointId, {
        ...(trimmed ? { name: trimmed } : {}),
        protocol,
        method,
        url: s.url,
        headers,
        params,
        body,
      });
    } else {
      const name = resolveEndpointDisplayName(s.url, remark);
      const id = await addApiEndpoint(moduleId, name, protocol, method, s.url, headers, params, body);
      let projectId = s.currentProjectId;
      if (projectId == null) {
        const mod = await getModuleById(moduleId);
        projectId = mod?.project_id ?? null;
      }
      if (projectId != null) {
        await s.setProjectContext({
          projectId,
          moduleId,
          endpointId: id,
          globalConfig: s.projectGlobalConfig ?? { headers: [], variables: [] },
        });
        useResponseStore.getState().setPendingTreeExpand({ projectId, moduleId });
      }
    }
    useResponseStore.getState().refreshProjects();
  } catch (e) {
    console.error('persistProjectEndpointIfNeeded', e);
  }
}
