import { fetch } from '@tauri-apps/plugin-http';

export async function openSSERequest(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<Response> {
  const response = await fetch(url, {
    method: 'GET',
    headers,
    signal,
    maxRedirections: 0,
  });

  if (response.status >= 300 && response.status < 400) {
    try {
      await response.body?.cancel();
    } catch {
      // 资源释放失败不能掩盖重定向安全错误。
    }
    throw new Error(`SSE 请求已阻止重定向（HTTP ${response.status}），请直接使用目标地址`);
  }

  return response;
}
