# cURL 命令导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户粘贴常见 HTTP cURL 命令后，自动回填 Apix 当前请求的 URL、方法、Headers 与 Body。

**Architecture:** 新建纯函数解析器，将有限 shell tokenizer 与受支持的 cURL 参数转换为独立的 `ParsedCurlCommand`。`RequestBuilder` 使用现有 `Modal` 收集命令，在解析成功后一次性调用请求 store 的 setter 回填表单；失败时保持原请求不变。

**Tech Stack:** TypeScript、React 19、Zustand、Vitest、Testing Library。

## Global Constraints

- 仅支持 HTTP cURL 的 URL、`-X` / `--request`、`-H` / `--header`、`-d` / `--data` / `--data-raw` / `--data-binary`、`-F` / `--form`。
- 必须支持单引号、双引号、反斜杠转义和反斜杠多行续行；绝不执行 shell 内容。
- 不支持的运行参数必须被忽略；非 cURL 或缺少 URL 时不得覆盖请求表单。
- `-F` 优先于 data 选择 `form-data`；`--data-binary @path` 选择 `binary`。
- 不新增三方依赖，保持现有通用弹窗与请求表格交互模式。

---

### Task 1: 建立并验证纯 cURL 解析器

**Files:**
- Create: `src/lib/parseCurlCommand.ts`
- Create: `src/lib/parseCurlCommand.test.ts`

**Interfaces:**
- Produces: `tokenizeCurlCommand(input: string): string[]`
- Produces: `parseCurlCommand(input: string): ParsedCurlCommand | null`
- Produces: `ParsedCurlCommand`，包含 `method: HttpMethod`、`url: string`、`headers: KeyValueField[]`、`bodyType: BodyType`、`bodyFormFields: BodyFormField[]`、`body: string`、`rawType: RawType`、`binaryPath: string`。
- Consumes: `BodyFormField`、`BodyType`、`HttpMethod`、`KeyValueField`、`RawType`（来自 `src/types/index.ts`）。

- [ ] **Step 1: 写入失败测试，明确 tokenizer、HTTP 映射与失败规则**

在 `src/lib/parseCurlCommand.test.ts` 新建下列测试。空行使用与请求 store 一致的 `{ key: '', value: '', description: '', enabled: true }`，form 空行额外带 `type: 'text'`。

```ts
import { describe, expect, it } from 'vitest';
import { parseCurlCommand, tokenizeCurlCommand } from './parseCurlCommand';

describe('tokenizeCurlCommand', () => {
  it('处理引号、转义空格和反斜杠续行', () => {
    const command = [
      'curl',
      "-H 'X-Name: hello world'",
      '--data-raw "{\\"name\\": \\"A B\\"}"',
      'https://api.example.com/users',
    ].join(' \\\n');
    expect(tokenizeCurlCommand(command))
      .toEqual(['curl', '-H', 'X-Name: hello world', '--data-raw', '{"name": "A B"}', 'https://api.example.com/users']);
  });
});

describe('parseCurlCommand', () => {
  it('回填 POST JSON、请求头与 URL', () => {
    expect(parseCurlCommand("curl -X POST -H 'Content-Type: application/json' -H 'Authorization: Bearer token' --data-raw '{\"name\":\"Ada\"}' 'https://api.example.com/users?source=cli'"))
      .toMatchObject({
        method: 'POST',
        url: 'https://api.example.com/users?source=cli',
        bodyType: 'raw',
        body: '{"name":"Ada"}',
        rawType: 'json',
        binaryPath: '',
        headers: [
          { key: 'Content-Type', value: 'application/json', description: '', enabled: true },
          { key: 'Authorization', value: 'Bearer token', description: '', enabled: true },
        ],
      });
  });

  it('无显式方法时根据数据推断 POST，否则推断 GET', () => {
    expect(parseCurlCommand("curl -d 'a=1' https://api.example.com/form")?.method).toBe('POST');
    expect(parseCurlCommand('curl https://api.example.com/health')?.method).toBe('GET');
  });

  it('将 multipart 文本与文件字段回填为 form-data', () => {
    expect(parseCurlCommand("curl -F 'name=Ada' -F 'avatar=@/tmp/ada.png' https://api.example.com/users"))
      .toMatchObject({
        method: 'POST',
        bodyType: 'form-data',
        bodyFormFields: [
          { key: 'name', value: 'Ada', description: '', enabled: true, type: 'text' },
          { key: 'avatar', value: 'ada.png', description: '', enabled: true, type: 'file', files: [{ path: '/tmp/ada.png', name: 'ada.png' }] },
        ],
      });
  });

  it('将 data-binary 文件映射为 binary Body', () => {
    expect(parseCurlCommand('curl --data-binary @/tmp/import.csv https://api.example.com/import'))
      .toMatchObject({ bodyType: 'binary', binaryPath: '/tmp/import.csv', method: 'POST' });
  });

  it('按 Content-Type 推断 XML 和 Text，并在无 URL 时返回 null', () => {
    expect(parseCurlCommand("curl -H 'Content-Type: application/soap+xml' -d '<x />' https://api.example.com")?.rawType).toBe('xml');
    expect(parseCurlCommand("curl -H 'Content-Type: text/csv' -d 'a,b' https://api.example.com")?.rawType).toBe('text');
    expect(parseCurlCommand("curl -X POST -d '{}' ")).toBeNull();
    expect(parseCurlCommand('not-a-curl https://api.example.com')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试，确认因为模块缺失而失败**

Run: `npm test -- src/lib/parseCurlCommand.test.ts`

Expected: FAIL，错误说明找不到 `./parseCurlCommand` 模块；不得因测试语法错误失败。

- [ ] **Step 3: 实现最小 tokenizer 与解析器**

在 `src/lib/parseCurlCommand.ts` 添加以下实现。flag 读取必须支持 flag 与值分开，以及 `--request=POST`、`--header=Name:value`、`--data=value` 形式；未知 flag 的值不应被识别为 URL，仅选择以 `http://` 或 `https://` 开头的 token 作为 URL。

```ts
import type { BodyFormField, BodyType, HttpMethod, KeyValueField, RawType } from '../types';

const EMPTY_KV: KeyValueField = { key: '', value: '', description: '', enabled: true };
const EMPTY_FORM: BodyFormField = { key: '', value: '', description: '', enabled: true, type: 'text' };
const METHODS = new Set<HttpMethod>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

export interface ParsedCurlCommand {
  method: HttpMethod;
  url: string;
  headers: KeyValueField[];
  bodyType: BodyType;
  bodyFormFields: BodyFormField[];
  body: string;
  rawType: RawType;
  binaryPath: string;
}

export function tokenizeCurlCommand(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let escaping = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (escaping) {
      if (char !== '\n' && char !== '\r') current += char;
      escaping = false;
    } else if (char === '\\') {
      escaping = true;
    } else if (quote) {
      if (char === quote) quote = null;
      else current += char;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) { tokens.push(current); current = ''; }
    } else {
      current += char;
    }
  }
  if (escaping) current += '\\';
  if (current) tokens.push(current);
  return tokens;
}

function splitHeader(value: string): KeyValueField | null {
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  return { ...EMPTY_KV, key: value.slice(0, separator).trim(), value: value.slice(separator + 1).trim() };
}

function rawTypeFromHeaders(headers: KeyValueField[]): RawType {
  const contentType = headers.find((header) => header.key.toLowerCase() === 'content-type')?.value.toLowerCase() ?? '';
  if (contentType.includes('json')) return 'json';
  if (contentType.includes('xml')) return 'xml';
  return 'text';
}

function formField(value: string): BodyFormField | null {
  const separator = value.indexOf('=');
  if (separator < 1) return null;
  const key = value.slice(0, separator).trim();
  const data = value.slice(separator + 1);
  if (!key) return null;
  if (data.startsWith('@')) {
    const path = data.slice(1);
    const name = path.replace(/^.*[/\\]/, '');
    return { ...EMPTY_FORM, key, value: name, type: 'file', files: path ? [{ path, name }] : [] };
  }
  return { ...EMPTY_FORM, key, value: data };
}

function readFlagValue(token: string, tokens: string[], index: number, shortFlag: string, longFlag: string): [string | null, number] | null {
  if (token === shortFlag || token === longFlag) return [tokens[index + 1] ?? null, 1];
  if (token.startsWith(`${longFlag}=`)) return [token.slice(longFlag.length + 1), 0];
  if (token.startsWith(shortFlag) && token.length > shortFlag.length) return [token.slice(shortFlag.length), 0];
  return null;
}

export function parseCurlCommand(input: string): ParsedCurlCommand | null {
  const tokens = tokenizeCurlCommand(input);
  if (tokens[0]?.toLowerCase() !== 'curl') return null;
  let method: HttpMethod | null = null;
  const headers: KeyValueField[] = [];
  const forms: BodyFormField[] = [];
  let data = '';
  let binaryPath = '';
  let hasData = false;
  let url = '';
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    const request = readFlagValue(token, tokens, index, '-X', '--request');
    const header = readFlagValue(token, tokens, index, '-H', '--header');
    const form = readFlagValue(token, tokens, index, '-F', '--form');
    const dataFlag = ['--data-binary', '--data-raw', '--data', '-d'].find((flag) => token === flag || token.startsWith(`${flag}=`) || (flag === '-d' && token.startsWith('-d') && token.length > 2));
    if (request) { const value = request[0]?.toUpperCase() as HttpMethod; if (METHODS.has(value)) method = value; index += request[1]; continue; }
    if (header) { const value = header[0]; if (value) { const parsed = splitHeader(value); if (parsed) headers.push(parsed); } index += header[1]; continue; }
    if (form) { const value = form[0]; if (value) { const parsed = formField(value); if (parsed) forms.push(parsed); } index += form[1]; continue; }
    if (dataFlag) {
      const value = token === dataFlag ? tokens[index + 1] ?? '' : token.startsWith(`${dataFlag}=`) ? token.slice(dataFlag.length + 1) : token.slice(2);
      hasData = true;
      if (dataFlag === '--data-binary' && value.startsWith('@')) binaryPath = value.slice(1); else data = value;
      if (token === dataFlag) index += 1;
      continue;
    }
    if (/^https?:\/\//i.test(token)) url = token;
  }
  if (!url) return null;
  const bodyType: BodyType = forms.length > 0 ? 'form-data' : binaryPath ? 'binary' : hasData ? 'raw' : 'form-data';
  return {
    method: method ?? ((forms.length > 0 || hasData) ? 'POST' : 'GET'), url,
    headers: [...headers, { ...EMPTY_KV }], bodyType,
    bodyFormFields: forms.length > 0 ? [...forms, { ...EMPTY_FORM }] : [{ ...EMPTY_FORM }],
    body: data, rawType: rawTypeFromHeaders(headers), binaryPath,
  };
}
```

- [ ] **Step 4: 运行解析器测试，确认通过**

Run: `npm test -- src/lib/parseCurlCommand.test.ts`

Expected: PASS，全部测试通过。

- [ ] **Step 5: 提交解析器与测试**

```bash
git add src/lib/parseCurlCommand.ts src/lib/parseCurlCommand.test.ts
git commit -m "feat: 新增 cURL 命令解析器"
```

### Task 2: 将解析结果接入请求栏导入弹窗

**Files:**
- Modify: `src/components/RequestBuilder/RequestBuilder.tsx`
- Modify: `src/components/RequestBuilder/RequestBuilder.test.tsx`
- Modify: `src/components/Modal/Modal.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `parseCurlCommand(input: string): ParsedCurlCommand | null`。
- Consumes: `parseUrlToBaseAndParams(full: string): ParsedUrl`（已有函数）。
- Produces: 请求栏的“导入 cURL”按钮，以及成功时对请求 store 的全部相关字段回填。

- [ ] **Step 1: 写入失败组件测试，明确回填和不覆盖要求**

在 `src/components/RequestBuilder/RequestBuilder.test.tsx` 追加测试。使用现有 `render`、`screen`、`fireEvent` 与 `useRequestStore`。

```ts
it('从弹窗导入 cURL 并回填请求表单', () => {
  render(<RequestBuilder onSendHttp={noop} onConnectWs={noop} onDisconnectWs={noop} onConnectSse={noop} onDisconnectSse={noop} wsConnected={false} sseConnected={false} />);
  fireEvent.click(screen.getByRole('button', { name: '导入 cURL 命令' }));
  fireEvent.change(screen.getByPlaceholderText('curl -X POST ...'), {
    target: { value: "curl -X POST -H 'Content-Type: application/json' -d '{\"name\":\"Ada\"}' 'https://api.example.com/users?source=cli'" },
  });
  fireEvent.click(screen.getByRole('button', { name: '填充请求' }));
  const state = useRequestStore.getState();
  expect(state.method).toBe('POST');
  expect(state.url).toBe('https://api.example.com/users');
  expect(state.headers[0]).toMatchObject({ key: 'Content-Type', value: 'application/json' });
  expect(state.queryParams[0]).toMatchObject({ key: 'source', value: 'cli' });
  expect(state.bodyType).toBe('raw');
  expect(state.rawType).toBe('json');
  expect(state.body).toBe('{"name":"Ada"}');
});

it('导入无效 cURL 时保留当前请求', () => {
  useRequestStore.getState().setMethod('PATCH');
  render(<RequestBuilder onSendHttp={noop} onConnectWs={noop} onDisconnectWs={noop} onConnectSse={noop} onDisconnectSse={noop} wsConnected={false} sseConnected={false} />);
  fireEvent.click(screen.getByRole('button', { name: '导入 cURL 命令' }));
  fireEvent.change(screen.getByPlaceholderText('curl -X POST ...'), { target: { value: 'curl -X POST -d {}' } });
  fireEvent.click(screen.getByRole('button', { name: '填充请求' }));
  expect(useRequestStore.getState().method).toBe('PATCH');
  expect(useRequestStore.getState().url).toBe('https://example.com/api');
});
```

- [ ] **Step 2: 运行组件测试，确认缺少导入按钮而失败**

Run: `npm test -- src/components/RequestBuilder/RequestBuilder.test.tsx`

Expected: FAIL，错误说明无法找到名称为“导入 cURL 命令”的按钮。

- [ ] **Step 3: 在 RequestBuilder 中实现导入 UI 与原子回填逻辑**

1. 在顶部 import 中添加 `parseCurlCommand`。
2. 在 state 声明旁增加 `const [curlImportModalOpen, setCurlImportModalOpen] = useState(false);`。
3. 新建 `handleImportCurl(value: string)`：调用 `parseCurlCommand`；结果为 `null` 时直接返回；调用 `parseUrlToBaseAndParams(parsed.url)`，把 params 映射为 `{ key, value, description: '', enabled: true }`（空值且 `emptyValueHasTrailingEquals` 时加 `queryEmptyShowsEquals: true`），末尾追加空行；随后依次调用 `setProtocol('http')`、`setMethod`、`setUrl`、`setHeaders`、`setQueryParams`、`setQueryTrailingAmpersand`、`setBodyType`、`setBodyFormFields`、`setBody`、`setRawType`、`setBinaryPath`。URL 无参数时回填一个空 query 行。
4. 为现有 `Modal` 增加可选 `multiline` 属性；为 true 时渲染具有相同 `modal-input` 样式的 `textarea`，并用回调 ref 同时支持 input 与 textarea 的聚焦和取值。cURL 导入弹窗必须传入该属性，以支持反斜杠续行命令。
5. 在复制按钮之前添加：

```tsx
<FastTooltip label="粘贴 cURL 命令并填充当前请求">
  <button
    type="button"
    className="request-import-curl-btn"
    onClick={() => setCurlImportModalOpen(true)}
    aria-label="导入 cURL 命令"
  >
    导入 cURL
  </button>
</FastTooltip>
```

6. 在组件 JSX 末尾、既有 Body 导入 `Modal` 相邻处添加：

```tsx
<Modal
  open={curlImportModalOpen}
  title="导入 cURL 命令"
  onClose={() => setCurlImportModalOpen(false)}
  onConfirm={handleImportCurl}
  confirmLabel="填充请求"
  multiline
  placeholder="curl -X POST ..."
/>
```

7. 在 `src/App.css` 复用 `.request-copy-curl-btn` 的尺寸、边框、悬停样式，将选择器扩展为同时匹配 `.request-import-curl-btn`，避免新增视觉风格。

- [ ] **Step 4: 运行组件测试，确认通过**

Run: `npm test -- src/components/RequestBuilder/RequestBuilder.test.tsx`

Expected: PASS，全部 RequestBuilder 测试通过。

- [ ] **Step 5: 运行回归测试与生产构建**

Run: `npm test -- src/lib/parseCurlCommand.test.ts src/components/RequestBuilder/RequestBuilder.test.tsx && npm run build`

Expected: 两组 Vitest 测试均通过，且 TypeScript 与 Vite 构建以退出码 0 完成。

- [ ] **Step 6: 提交页面接入与测试**

```bash
git add src/components/RequestBuilder/RequestBuilder.tsx src/components/RequestBuilder/RequestBuilder.test.tsx src/App.css
git commit -m "feat: 支持从 cURL 填充请求"
```
