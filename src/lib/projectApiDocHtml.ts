import type { ApixExportedEndpoint, ApixProjectExportFile } from './projectImportExport';
import { keyValueFieldsToRecord, type ResolvedForSend } from './projectMerge';
import { buildUrl } from './http';
import { buildCurlCommandFromRequest } from './buildCurlCommand';
import type { BodyFormField, BodyType, HttpMethod, KeyValueField, RawType } from '../types';

/**
 * 与 Apix 发送 HTTP/WS/SSE 时一致：地址栏 URL + Params 表（有非空值的键）合并为最终查询串。
 */
export function endpointEffectiveRequestUrl(ep: ApixExportedEndpoint): string {
  const q = keyValueFieldsToRecord(parseKvFields(ep.params));
  return buildUrl(ep.url.trim(), q);
}

function parseMethodForCurl(ep: ApixExportedEndpoint): HttpMethod {
  const m = (ep.method ?? 'GET').toUpperCase();
  if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(m)) {
    return m as HttpMethod;
  }
  return 'GET';
}

function endpointToResolvedForCurl(ep: ApixExportedEndpoint): ResolvedForSend {
  const parsed = parseBodyJson(ep.body);
  return {
    url: ep.url.trim(),
    headers: keyValueFieldsToRecord(parseKvFields(ep.headers)),
    queryParams: keyValueFieldsToRecord(parseKvFields(ep.params)),
    body: parsed?.body ?? '',
    bodyFormFields: parsed?.bodyFormFields ?? [],
    binaryPath: parsed?.binaryPath?.trim() ?? '',
  };
}

/** 与 Apix 内「复制 cURL」等价（无项目全局变量替换；文档场景下发请求一致字段）。 */
export function buildEndpointDocCurl(ep: ApixExportedEndpoint): string {
  const parsed = parseBodyJson(ep.body);
  return buildCurlCommandFromRequest({
    protocol: ep.protocol as 'http' | 'ws' | 'sse',
    method: parseMethodForCurl(ep),
    resolved: endpointToResolvedForCurl(ep),
    bodyType: parsed?.bodyType ?? 'raw',
    rawType: parsed?.rawType ?? 'json',
  });
}

/** 用于 HTML 文本 / 属性转义 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 双引号属性值内使用（如 data-url / data-curl）；换行转为 &#10; 供多行 cURL / WS 提示 */
function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r\n|\r|\n/g, '&#10;');
}

function parseKvFields(json: string | null | undefined): KeyValueField[] {
  if (json == null || !String(json).trim()) return [];
  try {
    const arr = JSON.parse(json) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => x && typeof x === 'object') as KeyValueField[];
  } catch {
    return [];
  }
}

interface ParsedBody {
  bodyType: BodyType;
  bodyFormFields: BodyFormField[];
  body: string;
  rawType: RawType;
  binaryPath?: string;
}

function parseBodyJson(body: string | null | undefined): ParsedBody | null {
  if (body == null || !String(body).trim()) return null;
  try {
    const o = JSON.parse(body) as Partial<ParsedBody>;
    return {
      bodyType: (o.bodyType as BodyType) ?? 'raw',
      bodyFormFields: Array.isArray(o.bodyFormFields) ? (o.bodyFormFields as BodyFormField[]) : [],
      body: typeof o.body === 'string' ? o.body : '',
      rawType: (o.rawType as RawType) ?? 'json',
      binaryPath: typeof o.binaryPath === 'string' ? o.binaryPath : undefined,
    };
  } catch {
    return null;
  }
}

function slugId(s: string, i: number): string {
  const base = s
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0._\-\u4e00-\u9fff]/g, '');
  return `m-${base || 'mod'}-${i}`;
}

export interface UrlBreakdown {
  ok: boolean;
  origin: string;
  pathname: string;
  searchParams: { key: string; value: string }[];
}

/** 解析 URL，便于单入口脚本（如 api.php?s=...）展示查询路由 */
export function breakdownUrl(raw: string): UrlBreakdown {
  const t = raw.trim();
  if (!t) return { ok: false, origin: '', pathname: '', searchParams: [] };
  try {
    const u = new URL(t);
    const searchParams: { key: string; value: string }[] = [];
    u.searchParams.forEach((value, key) => {
      searchParams.push({ key, value });
    });
    return { ok: true, origin: u.origin, pathname: u.pathname || '/', searchParams };
  } catch {
    return { ok: false, origin: '', pathname: '', searchParams: [] };
  }
}

function kvTableRows(fields: KeyValueField[]): string {
  const rows = fields.filter((f) => f.enabled !== false && f.key.trim());
  if (rows.length === 0) return '';
  return rows
    .map(
      (f) =>
        `<tr><td><code>${escapeHtml(f.key.trim())}</code></td><td>${escapeHtml(f.value)}</td><td>${escapeHtml(f.description ?? '')}</td></tr>`
    )
    .join('');
}

function kvTable(fields: KeyValueField[], caption: string): string {
  const body = kvTableRows(fields);
  if (!body) return '';
  return `<h4 class="sub">${escapeHtml(caption)}</h4><table class="kv"><thead><tr><th>键</th><th>值</th><th>说明</th></tr></thead><tbody>${body}</tbody></table>`;
}

function bodySection(body: string | null): string {
  const parsed = parseBodyJson(body);
  if (!parsed) return '';
  const { bodyType, bodyFormFields, body: raw, rawType, binaryPath } = parsed;
  if (bodyType === 'raw') {
    if (!raw.trim()) return `<p class="muted">Body：raw（${escapeHtml(rawType)}）— 空</p>`;
    return `<h4 class="sub">Body（raw · ${escapeHtml(rawType)}）</h4><pre class="code">${escapeHtml(raw)}</pre>`;
  }
  if (bodyType === 'binary') {
    const p = binaryPath?.trim() ? escapeHtml(binaryPath) : '（未指定路径）';
    return `<p><strong>Body</strong>：binary — 本地路径 ${p}</p>`;
  }
  const fields = bodyFormFields.filter((f) => f.enabled !== false && f.key.trim());
  if (fields.length === 0) {
    return `<p class="muted">Body：${escapeHtml(bodyType)} — 无字段</p>`;
  }
  const rows = fields
    .map((f) => {
      const file = f.type === 'file';
      const fileCell = file
        ? escapeHtml(
            f.files?.length
              ? f.files.map((x) => `${x.name}: ${x.path}`).join('; ')
              : f.filePath ?? '（未选文件）'
          )
        : escapeHtml(f.value);
      return `<tr><td><code>${escapeHtml(f.key.trim())}</code></td><td class="break-all">${fileCell}</td><td>${escapeHtml(f.description ?? '')}</td><td>${file ? 'file' : 'text'}</td></tr>`;
    })
    .join('');
  return `<h4 class="sub">Body（${escapeHtml(bodyType)}）</h4><table class="kv"><thead><tr><th>键</th><th>值</th><th>说明</th><th>类型</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function urlBlockWithCopyButtons(mergedUrl: string, ep: ApixExportedEndpoint): string {
  const urlAttr = escapeHtmlAttr(mergedUrl);
  const curl = buildEndpointDocCurl(ep);
  const curlAttr = escapeHtmlAttr(curl);
  return `<div class="url-block">
<div class="url-toolbar">
<button type="button" class="copy-url-btn" data-url="${urlAttr}" aria-label="复制完整 URL（已含 Params 查询参数）" title="复制完整 URL（已合并地址栏与 Params 表）">复制 URL</button>
<button type="button" class="copy-curl-btn" data-curl="${curlAttr}" aria-label="复制 cURL 命令" title="复制与 Apix 等价的 cURL（合并 URL、Headers、Body）">复制 cURL</button>
</div>
<pre class="url code break-all">${escapeHtml(mergedUrl)}</pre>
</div>`;
}

function hasStoredHttpResponse(ep: ApixExportedEndpoint): boolean {
  if (ep.response_status != null) return true;
  if (ep.response_time_ms != null) return true;
  if (ep.response_headers?.trim()) return true;
  if (ep.response_body != null && ep.response_body.trim()) return true;
  return false;
}

function parseResponseHeadersRecord(json: string | null | undefined): Record<string, string> | null {
  if (json == null || !String(json).trim()) return null;
  try {
    const o = JSON.parse(json) as unknown;
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      out[String(k)] = v == null ? '' : String(v);
    }
    return out;
  } catch {
    return null;
  }
}

/** 最近一次 HTTP 响应（Apix 持久化字段）的 HTML 片段；无数据时返回空串 */
export function buildLastResponseDocSection(ep: ApixExportedEndpoint): string {
  if (!hasStoredHttpResponse(ep)) return '';

  const metaBits: string[] = [];
  if (ep.response_status != null) metaBits.push(`HTTP ${ep.response_status}`);
  if (ep.response_time_ms != null) metaBits.push(`${ep.response_time_ms} ms`);

  const blocks: string[] = [];
  if (metaBits.length > 0) {
    blocks.push(`<p class="resp-meta">${escapeHtml(metaBits.join(' · '))}</p>`);
  }

  const headers = parseResponseHeadersRecord(ep.response_headers);
  if (headers && Object.keys(headers).length > 0) {
    const rows = Object.entries(headers)
      .map(
        ([k, v]) =>
          `<tr><td><code>${escapeHtml(k)}</code></td><td class="break-all">${escapeHtml(v)}</td></tr>`
      )
      .join('');
    blocks.push(
      `<h4 class="sub">响应头</h4><table class="kv"><thead><tr><th>名称</th><th>值</th></tr></thead><tbody>${rows}</tbody></table>`
    );
  } else if (ep.response_headers?.trim()) {
    blocks.push(
      `<h4 class="sub">响应头</h4><pre class="code">${escapeHtml(ep.response_headers!)}</pre>`
    );
  }

  const bodyRaw = ep.response_body ?? '';
  if (bodyRaw.trim()) {
    blocks.push(`<h4 class="sub">响应体</h4><pre class="code">${escapeHtml(bodyRaw)}</pre>`);
  }

  if (blocks.length === 0) return '';

  return `<details class="last-response" open>
<summary>最近一次响应</summary>
${blocks.join('\n')}
</details>`;
}

function urlBreakdownHtml(url: string): string {
  const bd = breakdownUrl(url);
  if (!bd.ok) {
    return `<p class="muted">无法解析为绝对 URL（仍可在上方查看原始地址栏内容）。相对地址请结合环境拼接。</p>`;
  }
  const qpRows =
    bd.searchParams.length === 0
      ? `<tr><td colspan="2" class="muted">（合并后 URL 无查询参数，或 Params 表仅含空值项）</td></tr>`
      : bd.searchParams
          .map(
            (q) =>
              `<tr><td><code>${escapeHtml(q.key)}</code></td><td><code class="break-all">${escapeHtml(q.value)}</code></td></tr>`
          )
          .join('');
  return `<details class="breakdown" open>
<summary>地址分解</summary>
<table class="kv tight">
<tbody>
<tr><th scope="row">Origin</th><td><code>${escapeHtml(bd.origin)}</code></td></tr>
<tr><th scope="row">Path</th><td><code>${escapeHtml(bd.pathname)}</code></td></tr>
</tbody></table>
<h4 class="sub">合并后 URL 中的查询参数</h4>
<table class="kv"><thead><tr><th>参数名</th><th>值</th></tr></thead><tbody>${qpRows}</tbody></table>
</details>`;
}

function endpointArticle(ep: ApixExportedEndpoint, moduleName: string): string {
  const method = (ep.protocol === 'http' ? ep.method ?? 'GET' : ep.method ?? '—').toUpperCase();
  const headers = parseKvFields(ep.headers);
  const params = parseKvFields(ep.params);
  const hdrBlock = kvTable(headers, 'Headers');
  const paramBlock = kvTable(params, 'Query 参数表（Apix Params 页；与地址栏合并规则以客户端为准）');
  const bodyBlock = ep.protocol === 'http' ? bodySection(ep.body) : '';
  const lastResp = buildLastResponseDocSection(ep);

  const mergedUrl = endpointEffectiveRequestUrl(ep);

  if (ep.protocol !== 'http') {
    return `<article class="endpoint stream">
<header><span class="pill">${escapeHtml(ep.protocol)}</span><h3>${escapeHtml(ep.name)}</h3></header>
<p><strong>地址</strong></p>
${urlBlockWithCopyButtons(mergedUrl, ep)}
<p class="muted">已与 Params 表合并；本文档以 HTTP 为主，WebSocket / SSE 请在 Apix 内调试。</p>
${lastResp}
</article>`;
  }

  return `<article class="endpoint">
<header><span class="method ${escapeHtml(method.toLowerCase())}">${escapeHtml(method)}</span><h3>${escapeHtml(ep.name)}</h3><span class="mod-tag">${escapeHtml(moduleName)}</span></header>
<p class="url-label">完整 URL（地址栏 + Params 表合并，与发送一致）</p>
${urlBlockWithCopyButtons(mergedUrl, ep)}
${urlBreakdownHtml(mergedUrl)}
${hdrBlock}
${paramBlock}
${bodyBlock}
${lastResp}
</article>`;
}

const DOC_STYLES = `
:root { color-scheme: light dark; --bg: #f6f7f9; --card: #fff; --text: #1a1d26; --muted: #5c6578; --bd: #e2e5eb; --acc: #2563eb; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #11141a; --card: #1a1f28; --text: #e8eaef; --muted: #9aa3b5; --bd: #2a3140; --acc: #60a5fa; }
}
* { box-sizing: border-box; }
body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", sans-serif; margin: 0; padding: 1.5rem; background: var(--bg); color: var(--text); line-height: 1.5; font-size: 15px; }
header.doc-head { margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid var(--bd); }
header.doc-head h1 { margin: 0 0 0.5rem; font-size: 1.75rem; }
header.doc-head .meta { color: var(--muted); margin: 0; max-width: 52rem; }
.toc { margin-bottom: 2rem; padding: 1rem; background: var(--card); border: 1px solid var(--bd); border-radius: 8px; }
.toc h2 { margin: 0 0 0.75rem; font-size: 1rem; }
.toc ul { margin: 0; padding-left: 1.25rem; }
.toc a { color: var(--acc); }
section.module { margin-bottom: 2.5rem; }
section.module > h2 { font-size: 1.25rem; margin: 0 0 1rem; padding-bottom: 0.35rem; border-bottom: 2px solid var(--acc); }
article.endpoint { background: var(--card); border: 1px solid var(--bd); border-radius: 10px; padding: 1rem 1.15rem; margin-bottom: 1.25rem; }
article.endpoint header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem 0.75rem; margin-bottom: 0.75rem; }
article.endpoint header h3 { margin: 0; font-size: 1.1rem; flex: 1 1 auto; }
.mod-tag { font-size: 0.75rem; color: var(--muted); border: 1px solid var(--bd); padding: 0.15rem 0.45rem; border-radius: 4px; }
.method { font-weight: 700; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; background: var(--bd); }
.method.get { background: #dbeafe; color: #1e40af; }
.method.post { background: #dcfce7; color: #166534; }
.method.put { background: #ffedd5; color: #9a3412; }
.method.patch { background: #fae8ff; color: #7e22ce; }
.method.delete { background: #fee2e2; color: #991b1b; }
@media (prefers-color-scheme: dark) {
  .method.get { background: #1e3a5f; color: #93c5fd; }
  .method.post { background: #14532d; color: #86efac; }
  .method.put { background: #7c2d12; color: #fdba74; }
  .method.patch { background: #581c87; color: #e9d5ff; }
  .method.delete { background: #7f1d1d; color: #fecaca; }
}
.pill { font-size: 0.75rem; padding: 0.2rem 0.45rem; border-radius: 4px; background: var(--bd); }
.url-label { margin: 0 0 0.35rem; font-size: 0.85rem; font-weight: 600; color: var(--muted); }
.url-block { margin: 0 0 0.75rem; }
.url-toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 0.35rem; }
.copy-url-btn, .copy-curl-btn {
  font-size: 0.8rem;
  padding: 0.28rem 0.65rem;
  border-radius: 6px;
  border: 1px solid var(--bd);
  background: var(--card);
  color: var(--acc);
  cursor: pointer;
  font-family: inherit;
}
.copy-curl-btn { color: var(--text); }
.copy-url-btn:hover:not(:disabled), .copy-curl-btn:hover:not(:disabled) { filter: brightness(0.95); }
.copy-url-btn:disabled, .copy-curl-btn:disabled { opacity: 0.75; cursor: default; }
.url-block pre.url { margin: 0; }
pre.url { margin: 0 0 0.75rem; padding: 0.85rem; background: rgba(0,0,0,0.04); border-radius: 8px; border: 1px solid var(--bd); overflow-x: auto; font-size: 0.85rem; }
@media (prefers-color-scheme: dark) { pre.url { background: rgba(255,255,255,0.05); } }
pre.code { margin: 0.5rem 0 0; padding: 0.85rem; background: rgba(0,0,0,0.04); border-radius: 8px; border: 1px solid var(--bd); overflow-x: auto; font-size: 0.8rem; white-space: pre-wrap; word-break: break-word; }
.break-all { word-break: break-all; white-space: pre-wrap; }
details.breakdown { margin: 0.75rem 0; padding: 0.75rem; background: rgba(0,0,0,0.02); border-radius: 8px; border: 1px dashed var(--bd); }
details.breakdown summary { cursor: pointer; font-weight: 600; margin-bottom: 0.5rem; }
details.last-response { margin: 0.85rem 0 0; padding: 0.75rem; background: rgba(0,0,0,0.02); border-radius: 8px; border: 1px solid var(--bd); }
details.last-response summary { cursor: pointer; font-weight: 600; margin-bottom: 0.5rem; }
.resp-meta { margin: 0 0 0.65rem; font-size: 0.9rem; color: var(--muted); }
h4.sub { margin: 0.85rem 0 0.4rem; font-size: 0.9rem; color: var(--muted); }
table.kv { width: 100%; border-collapse: collapse; font-size: 0.88rem; margin: 0.25rem 0 0.75rem; }
table.kv.tight { margin-top: 0; }
table.kv th, table.kv td { border: 1px solid var(--bd); padding: 0.45rem 0.55rem; text-align: left; vertical-align: top; }
table.kv thead th { background: rgba(0,0,0,0.03); font-weight: 600; }
table.kv th[scope="row"] { width: 6rem; white-space: nowrap; }
.muted { color: var(--muted); font-size: 0.9rem; }
.skipped { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--bd); color: var(--muted); font-size: 0.9rem; }
`;

/** 一键复制 URL / cURL（支持 file:// 下 execCommand 回退） */
const COPY_CLIPBOARD_SCRIPT = `
(function(){
  function fallbackCopy(text){
    var ta=document.createElement('textarea');
    ta.value=text;
    ta.setAttribute('readonly','');
    ta.style.position='fixed';
    ta.style.left='-9999px';
    document.body.appendChild(ta);
    ta.select();
    try{document.execCommand('copy');}catch(e){}
    document.body.removeChild(ta);
  }
  function flash(btn){
    var lab=btn.getAttribute('data-label-bak');
    if(!lab){lab=btn.textContent;btn.setAttribute('data-label-bak',lab);}
    btn.textContent='已复制';
    btn.disabled=true;
    setTimeout(function(){btn.textContent=btn.getAttribute('data-label-bak');btn.disabled=false;},1600);
  }
  document.body.addEventListener('click',function(ev){
    var t=ev.target;
    if(!t||!t.closest)return;
    var btnCurl=t.closest('.copy-curl-btn');
    if(btnCurl){
      var curl=btnCurl.getAttribute('data-curl');
      if(curl==null||curl==='')return;
      ev.preventDefault();
      function doneC(){flash(btnCurl);}
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(curl).then(doneC).catch(function(){fallbackCopy(curl);doneC();});
      }else{fallbackCopy(curl);doneC();}
      return;
    }
    var btnUrl=t.closest('.copy-url-btn');
    if(!btnUrl)return;
    var url=btnUrl.getAttribute('data-url');
    if(url==null||url==='')return;
    ev.preventDefault();
    function doneU(){flash(btnUrl);}
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(doneU).catch(function(){fallbackCopy(url);doneU();});
    }else{fallbackCopy(url);doneU();}
  });
})();
`;

/**
 * 生成独立 HTML 接口文档：以「完整 URL + 查询参数表」为核心，适配单入口、查询串路由等形态（非 Swagger）。
 */
export function buildProjectApiDocHtml(payload: ApixProjectExportFile): string {
  const title = escapeHtml(payload.project.name);
  const exported = new Date(payload.exportedAt).toISOString();

  const toc: string[] = [];
  const sections: string[] = [];
  let httpCount = 0;
  let nonHttp: { name: string; protocol: string }[] = [];

  payload.modules
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .forEach((mod, mi) => {
      const id = slugId(mod.name, mi);
      toc.push(`<li><a href="#${id}">${escapeHtml(mod.name)}</a></li>`);
      const articles = mod.endpoints
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((ep) => {
          if (ep.protocol === 'http') httpCount++;
          else nonHttp.push({ name: ep.name, protocol: ep.protocol });
          return endpointArticle(ep, mod.name);
        })
        .join('\n');
      sections.push(`<section class="module" id="${id}"><h2>${escapeHtml(mod.name)}</h2>${articles}</section>`);
    });

  const skippedNote =
    nonHttp.length > 0
      ? `<div class="skipped"><p>另有 <strong>${nonHttp.length}</strong> 条非 HTTP 接口未按 HTTP 详表展开：${escapeHtml(nonHttp.map((x) => `${x.name}(${x.protocol})`).join('、'))}。</p></div>`
      : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title} · 接口文档</title>
  <style>${DOC_STYLES}</style>
</head>
<body>
  <header class="doc-head">
    <h1>${title}</h1>
    <p class="meta">由 Apix 导出 · ${escapeHtml(exported)} · 共 <strong>${httpCount}</strong> 条 HTTP 接口。本文档按「完整 URL + 查询参数」展示，适合 <code>api.php?s=模块/动作</code> 等入口，无需按 REST 路径拆分。</p>
  </header>
  <nav class="toc">
    <h2>目录</h2>
    <ul>${toc.join('')}</ul>
  </nav>
  ${sections.join('\n')}
  ${skippedNote}
  <script>
${COPY_CLIPBOARD_SCRIPT}
  </script>
</body>
</html>`;
}
