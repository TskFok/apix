# 忽略 TLS 证书校验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 HTTP 请求提供默认关闭且可持久化的忽略 TLS 证书校验开关，使已过期证书的服务可正常返回数据。

**Architecture:** 全局设置 store 保存开关，顶部设置区负责交互。HTTP hook 读取设置并传给 `sendHttpRequest`，后者将布尔值序列化进 Tauri 命令；Rust 根据该值创建 reqwest 客户端。

**Tech Stack:** React 19、TypeScript、Zustand、Vitest、Tauri 2、Rust、reqwest 0.12。

## Global Constraints

- 开关名为“忽略证书校验”，默认 `false`，使用现有 `apix-idle-timeout` 本地持久化项。
- 开启后跳过全部 TLS 证书校验，包含过期、自签名和主机名不匹配；仅用于受信任的调试环境。
- 仅影响 HTTP，WebSocket 和 SSE 保持不变。
- 不新增依赖，且不得在循环遍历中查询 SQL。
- 提交遵循 Conventional Commits，type 为英文、说明为中文。

---

## File Structure

- `src/stores/settingsStore.ts`：持久化 TLS 校验开关。
- `src/stores/settingsStore.test.ts`：验证默认值和 setter。
- `src/App.tsx`、`src/App.test.tsx`：渲染并验证顶部设置开关及安全提示。
- `src/hooks/useHttpRequest.ts`：读取全局开关并传给 HTTP 封装。
- `src/lib/http.ts`、`src/lib/http.test.ts`：序列化并验证 Tauri payload。
- `src-tauri/src/lib.rs`：反序列化开关并配置 reqwest 客户端。

### Task 1: 设置状态与顶部开关

**Files:**
- Modify: `src/stores/settingsStore.ts`
- Modify: `src/stores/settingsStore.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Produces: `ignoreTlsCertificateErrors: boolean`。
- Produces: `setIgnoreTlsCertificateErrors(enabled: boolean): void`。
- Produces: `role="switch"` 且 `aria-label="忽略证书校验"` 的顶部 HTTP 开关。

- [ ] **Step 1: 写入失败的 store 测试**

```ts
it('默认校验证书，并允许更新忽略证书校验设置', () => {
  const state = useSettingsStore.getState();
  expect(state.ignoreTlsCertificateErrors).toBe(false);
  state.setIgnoreTlsCertificateErrors(true);
  expect(useSettingsStore.getState().ignoreTlsCertificateErrors).toBe(true);
});
```

- [ ] **Step 2: 确认测试失败**

Run: `npm test -- src/stores/settingsStore.test.ts`

Expected: FAIL，字段或 setter 尚不存在。

- [ ] **Step 3: 写入最小 store 实现**

```ts
ignoreTlsCertificateErrors: boolean;
setIgnoreTlsCertificateErrors: (enabled: boolean) => void;

ignoreTlsCertificateErrors: false,
setIgnoreTlsCertificateErrors: (ignoreTlsCertificateErrors) =>
  set({ ignoreTlsCertificateErrors }),
```

- [ ] **Step 4: 确认 store 测试通过**

Run: `npm test -- src/stores/settingsStore.test.ts`

Expected: PASS。

- [ ] **Step 5: 写入失败的界面测试**

在 `src/App.test.tsx` 渲染 `App` 后验证并点击：

```tsx
const checkbox = screen.getByRole('switch', { name: '忽略证书校验' });
expect(checkbox).not.toBeChecked();
fireEvent.click(checkbox);
expect(checkbox).toBeChecked();
expect(useSettingsStore.getState().ignoreTlsCertificateErrors).toBe(true);
```

- [ ] **Step 6: 确认界面测试失败**

Run: `npm test -- src/App.test.tsx`

Expected: FAIL，找不到“忽略证书校验”复选框。

- [ ] **Step 7: 写入最小界面实现**

在 `App` 中订阅设置并使用现有 `error-collect-label` 开关样式：

```tsx
const ignoreTlsCertificateErrors = useSettingsStore((s) => s.ignoreTlsCertificateErrors);
const setIgnoreTlsCertificateErrors = useSettingsStore((s) => s.setIgnoreTlsCertificateErrors);

<FastTooltip label="仅用于受信任的调试环境；开启后会忽略过期、自签名及主机名不匹配等证书错误">
  <label className={`error-collect-label ${ignoreTlsCertificateErrors ? 'is-active' : ''}`}>
    <input type="checkbox" role="switch" aria-label="忽略证书校验" aria-checked={ignoreTlsCertificateErrors} checked={ignoreTlsCertificateErrors} onChange={(e) => setIgnoreTlsCertificateErrors(e.target.checked)} />
    <span className="error-collect-switch" aria-hidden="true"><span className="error-collect-switch-thumb" /></span>
    <span className="error-collect-text">忽略证书</span>
    <span className="error-collect-state" aria-hidden="true">{ignoreTlsCertificateErrors ? '开' : '关'}</span>
  </label>
</FastTooltip>
```

- [ ] **Step 8: 确认前端测试通过并提交**

Run: `npm test -- src/stores/settingsStore.test.ts src/App.test.tsx`

Expected: PASS。

```bash
git add src/stores/settingsStore.ts src/stores/settingsStore.test.ts src/App.tsx src/App.test.tsx
git commit -m "feat: 增加忽略证书校验开关"
```

### Task 2: 将开关传递到 Tauri HTTP 命令

**Files:**
- Modify: `src/hooks/useHttpRequest.ts`
- Modify: `src/lib/http.ts`
- Modify: `src/lib/http.test.ts`

**Interfaces:**
- Consumes: `useSettingsStore.getState().ignoreTlsCertificateErrors`。
- Produces: `HttpRequestOptions.ignoreTlsCertificateErrors?: boolean`。
- Produces: payload 的 `ignore_tls_certificate_errors: boolean`。

- [ ] **Step 1: 写入失败的 HTTP 封装测试**

在 `src/lib/http.test.ts` mock `@tauri-apps/api/core` 的 `invoke`，令其返回完整 `RustHttpResponse`，并新增：

```ts
await sendHttpRequest({
  method: 'GET',
  url: 'https://expired.example.test',
  ignoreTlsCertificateErrors: true,
});
expect(invoke).toHaveBeenCalledWith('http_request', {
  payload: expect.objectContaining({
    method: 'GET',
    url: 'https://expired.example.test',
    ignore_tls_certificate_errors: true,
  }),
});
```

- [ ] **Step 2: 确认 HTTP 封装测试失败**

Run: `npm test -- src/lib/http.test.ts`

Expected: FAIL，选项类型或 payload 缺少字段。

- [ ] **Step 3: 写入最小前端请求实现**

```ts
export interface HttpRequestOptions {
  // 保留现有字段
  ignoreTlsCertificateErrors?: boolean;
}

const { method, url, headers = {}, body, ignoreTlsCertificateErrors = false } = options;

payload: {
  // 保留现有字段
  ignore_tls_certificate_errors: ignoreTlsCertificateErrors,
}
```

在 `useHttpRequest` 的 `send` 内读取一次设置，并调用：

```ts
sendHttpRequest({ method, url: fullUrl, headers, body: requestBody, ignoreTlsCertificateErrors });
```

- [ ] **Step 4: 确认 HTTP 封装测试通过并提交**

Run: `npm test -- src/lib/http.test.ts`

Expected: PASS，已有 URL 测试仍通过。

```bash
git add src/hooks/useHttpRequest.ts src/lib/http.ts src/lib/http.test.ts
git commit -m "feat: 请求传递证书校验设置"
```

### Task 3: Rust 请求客户端应用设置

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `HttpRequestPayload.ignore_tls_certificate_errors: bool`，缺省 `false`。
- Produces: `build_http_client(ignore_tls_certificate_errors: bool) -> Result<reqwest::Client, reqwest::Error>`。

- [ ] **Step 1: 写入失败的 Rust 测试**

在 `#[cfg(test)]` 模块加入：

```rust
#[test]
fn http_request_payload_defaults_to_certificate_validation() {
    let payload: HttpRequestPayload = serde_json::from_str(
        r#"{"method":"GET","url":"https://example.com","headers":{},"body_base64":null}"#,
    ).unwrap();
    assert!(!payload.ignore_tls_certificate_errors);
}

#[test]
fn builds_http_client_when_certificate_validation_is_ignored() {
    assert!(build_http_client(true).is_ok());
}
```

- [ ] **Step 2: 确认 Rust 测试失败**

Run: `cargo test http_request_payload_defaults_to_certificate_validation`

Expected: FAIL，字段与 `build_http_client` 尚不存在。

- [ ] **Step 3: 写入最小 Rust 实现**

```rust
#[serde(default)]
ignore_tls_certificate_errors: bool,

fn build_http_client(ignore_tls_certificate_errors: bool) -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(ignore_tls_certificate_errors)
        .build()
}
```

将 `http_request` 原有客户端构造替换为：

```rust
let client = build_http_client(payload.ignore_tls_certificate_errors)
    .map_err(|e| e.to_string())?;
```

- [ ] **Step 4: 确认 Rust 测试通过并全量验证**

Run: `cargo test http_request_payload_defaults_to_certificate_validation && npm test && npm run build && cargo test`

Expected: 全部通过。

- [ ] **Step 5: 提交 Rust 支持**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: 支持忽略无效 TLS 证书"
```
