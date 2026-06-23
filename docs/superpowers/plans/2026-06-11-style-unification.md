# Apix Style Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Apix 主界面、侧栏、请求区、响应区、项目树、弹窗和亮/暗主题统一到一套克制的桌面工具视觉体系。

**Architecture:** 保持 React 组件结构不变，优先通过 CSS token 和现有选择器收敛视觉语言。所有颜色、边框、圆角、阴影、焦点态、状态色都从 `src/App.css` 的全局 token 派生，组件级 CSS 通过同名 token 与主界面对齐。

**Tech Stack:** Vite, React 19, TypeScript, Tauri, plain CSS, Vitest, in-app Browser.

---

## File Structure

- Modify: `src/App.css`
  - 负责全局 token、亮/暗主题变量、页面布局、请求区、响应区、项目树、历史/收藏、项目全局配置和通用控件样式。
- Modify: `src/components/Modal/Modal.css`
  - 负责通用弹窗外观，改为使用 `src/App.css` 暴露的 token。
- Modify: `src/components/FileSelectModal/FileSelectModal.css`
  - 负责文件选择弹窗外观，改为使用统一 token。
- Test: no new unit test file.
  - 本次主要是 CSS 视觉统一，自动化验证使用 `npm run build` 和 `npm test`，视觉验证使用浏览器检查亮色/暗色主题和关键弹窗。

## Task 1: Foundation Tokens And Focus States

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Replace the existing `:root` base block with tokenized values**

Find the current `:root` block near the top of `src/App.css` and replace it with:

```css
:root {
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text);
  background-color: var(--color-bg);
  -webkit-font-smoothing: antialiased;

  --color-bg: #f4f6fa;
  --color-surface: #ffffff;
  --color-surface-subtle: #f8fafc;
  --color-surface-muted: #eef2f7;
  --color-surface-hover: #f1f5f9;
  --color-surface-active: #eff6ff;
  --color-border: #d9e1ec;
  --color-border-subtle: #e7edf5;
  --color-border-strong: #bfcbda;
  --color-text: #172033;
  --color-text-strong: #0f172a;
  --color-muted: #64748b;
  --color-muted-strong: #475569;
  --color-disabled-bg: #e5eaf1;
  --color-disabled-text: #94a3b8;
  --color-primary: #2463eb;
  --color-primary-hover: #1d4ed8;
  --color-primary-soft: #eff6ff;
  --color-primary-border: #bfdbfe;
  --color-primary-text: #1d4ed8;
  --color-danger: #dc2626;
  --color-danger-hover: #b91c1c;
  --color-danger-soft: #fef2f2;
  --color-danger-border: #fecaca;
  --color-success: #16a34a;
  --color-success-soft: #f0fdf4;
  --color-success-border: #bbf7d0;
  --color-warning: #d97706;
  --color-warning-soft: #fffbeb;
  --color-warning-border: #fde68a;
  --color-info-soft: #eef5ff;
  --color-info-border: #c7d7fe;
  --color-overlay: rgba(15, 23, 42, 0.42);
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-pill: 999px;
  --control-h-sm: 28px;
  --control-h-md: 34px;
  --control-h-lg: 40px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --shadow-popover: 0 12px 30px rgba(15, 23, 42, 0.14);
  --shadow-active: 0 0 0 3px rgba(36, 99, 235, 0.14);
  --focus-ring: 0 0 0 3px rgba(36, 99, 235, 0.22);
  --transition-fast: 160ms ease;
}
```

- [ ] **Step 2: Replace the global focus-removal rule**

Remove this rule:

```css
input:focus,
textarea:focus,
select:focus,
button:focus {
  outline: none !important;
  box-shadow: none !important;
}
```

Add this rule in its place:

```css
button:focus,
input:focus,
textarea:focus,
select:focus {
  outline: none;
}

button:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible,
[tabindex]:focus-visible {
  box-shadow: var(--focus-ring);
  border-color: var(--color-primary);
}
```

- [ ] **Step 3: Add dark theme token overrides**

At the beginning of the existing `html[data-theme="dark"]` block, before nested selectors, add:

```css
html[data-theme="dark"] {
  --color-bg: #151922;
  --color-surface: #202631;
  --color-surface-subtle: #252d3a;
  --color-surface-muted: #2c3544;
  --color-surface-hover: #303a4a;
  --color-surface-active: #18345c;
  --color-border: #384454;
  --color-border-subtle: #303a49;
  --color-border-strong: #4b5a70;
  --color-text: #e5e7eb;
  --color-text-strong: #f8fafc;
  --color-muted: #9aa7ba;
  --color-muted-strong: #cbd5e1;
  --color-disabled-bg: #2b3340;
  --color-disabled-text: #6b788c;
  --color-primary: #60a5fa;
  --color-primary-hover: #93c5fd;
  --color-primary-soft: #172b49;
  --color-primary-border: #315a92;
  --color-primary-text: #bfdbfe;
  --color-danger: #f87171;
  --color-danger-hover: #fca5a5;
  --color-danger-soft: #3a2024;
  --color-danger-border: #7f1d1d;
  --color-success: #4ade80;
  --color-success-soft: #143522;
  --color-success-border: #166534;
  --color-warning: #fbbf24;
  --color-warning-soft: #35240f;
  --color-warning-border: #92400e;
  --color-info-soft: #172b49;
  --color-info-border: #315a92;
  --color-overlay: rgba(0, 0, 0, 0.56);
  --shadow-popover: 0 14px 36px rgba(0, 0, 0, 0.42);
  --shadow-active: 0 0 0 3px rgba(96, 165, 250, 0.18);
  --focus-ring: 0 0 0 3px rgba(96, 165, 250, 0.28);
}
```

If this creates two `html[data-theme="dark"]` openers, merge the token declarations into the existing opener instead of duplicating the selector.

- [ ] **Step 4: Run syntax verification**

Run: `npm run build`

Expected: TypeScript and Vite build complete without CSS syntax errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.css
git commit -m "统一样式基础变量与焦点态"
```

## Task 2: Layout, Panels, Controls, And Tabs

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Tokenize app shell and panel surfaces**

Replace repeated app shell colors with tokenized values:

```css
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--color-bg);
  color: var(--color-text);
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.sidebar {
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px;
  background: var(--color-bg);
}

.request-builder,
.response-area,
.project-globals-panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}
```

- [ ] **Step 2: Tokenize primary and secondary buttons**

Update the button groups that currently use raw `#2463eb`, `#1d5dd6`, `#ddd`, `#fff`, and `#ccc`:

```css
.new-request-btn,
.sidebar-new-request-btn,
.send-btn,
.save-current-btn {
  min-height: var(--control-h-md);
  padding: 7px 14px;
  font-size: 0.9rem;
  font-weight: 600;
  background: var(--color-primary);
  color: #fff;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast);
}

.new-request-btn:hover,
.sidebar-new-request-btn:hover,
.send-btn:hover:not(:disabled),
.save-current-btn:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.send-btn:disabled,
.request-copy-curl-btn:disabled,
.response-copy-body-btn:disabled {
  background: var(--color-disabled-bg);
  border-color: var(--color-border);
  color: var(--color-disabled-text);
  cursor: not-allowed;
  opacity: 1;
}

.clear-btn,
.delete-btn,
.form-add-btn,
.project-tree-add-root,
button.project-tree-bulk-btn,
.project-tree-mini-btn,
.request-copy-curl-btn,
.response-copy-body-btn,
.response-log-clear-btn {
  background: var(--color-surface-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-muted-strong);
  cursor: pointer;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.clear-btn:hover,
.delete-btn:hover,
.form-add-btn:hover,
.project-tree-add-root:hover,
button.project-tree-bulk-btn:hover,
.project-tree-mini-btn:hover,
.request-copy-curl-btn:hover:not(:disabled),
.response-copy-body-btn:hover:not(:disabled),
.response-log-clear-btn:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-primary-border);
  color: var(--color-primary-text);
}
```

- [ ] **Step 3: Tokenize inputs and selects**

Add a shared control rule after input reset styles:

```css
input,
textarea,
select {
  color: var(--color-text);
  background: var(--color-surface);
  border-color: var(--color-border);
}

.idle-timeout-select,
.method-select,
.url-input,
.request-remark-input,
.binary-path-input,
.ws-send input,
.save-row input,
.project-import-select,
.project-tree-search input,
.project-env-name-field input,
.project-global-base-url-field input,
.project-move-search input {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast),
    background-color var(--transition-fast);
}
```

- [ ] **Step 4: Tokenize tab systems**

Update sidebar, protocol, request, response, and HTML tabs:

```css
.sidebar-tabs,
.request-tabs,
.response-toolbar,
.stream-viewer-toolbar,
.response-search-bar,
.response-html-tabs {
  border-color: var(--color-border);
  background: var(--color-surface-subtle);
}

.sidebar-tab,
.request-tabs button,
.response-html-tab {
  color: var(--color-muted);
}

.sidebar-tab:hover,
.request-tabs button:hover,
.response-html-tab:hover {
  color: var(--color-text-strong);
}

.sidebar-tab.active,
.request-tabs button.active,
.response-html-tab.active {
  color: var(--color-primary-text);
  border-bottom-color: var(--color-primary);
}

.protocol-tab {
  border: 1px solid var(--color-border);
  background: var(--color-surface-subtle);
  color: var(--color-muted-strong);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}

.protocol-tab.active {
  background: var(--color-surface);
  border-bottom-color: var(--color-surface);
  color: var(--color-primary-text);
}

.response-tabs {
  background: var(--color-surface-muted);
  border-radius: var(--radius-lg);
  padding: 4px;
}

.response-tab {
  color: var(--color-muted);
  border-radius: var(--radius-md);
}

.response-tab.active {
  background: var(--color-surface);
  color: var(--color-primary-text);
  box-shadow: var(--shadow-active);
}
```

- [ ] **Step 5: Run build**

Run: `npm run build`

Expected: build passes.

- [ ] **Step 6: Commit**

```bash
git add src/App.css
git commit -m "统一主界面面板与控件样式"
```

## Task 3: Tables, Chips, Lists, And Project Tree

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Tokenize form field table**

Update form table colors:

```css
.form-fields-table {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-surface);
  padding: 0 0 3px 0;
}

.form-fields-header,
.form-field-row {
  border-bottom: 1px solid var(--color-border-subtle);
}

.form-fields-header {
  background: var(--color-surface-subtle);
  color: var(--color-muted-strong);
}

.form-fields-header .col-checkbox,
.form-field-row .col-checkbox,
.form-fields-header .col-key,
.form-fields-header .col-value,
.form-fields-header .col-desc,
.form-field-row .col-key,
.form-field-row .col-value,
.form-field-row .col-desc,
.project-global-variable-meta select {
  border-right-color: var(--color-border-subtle);
}

.project-global-variable-meta select:focus,
.project-global-variable-meta input:focus,
.form-field-row .col-key .col-key-input:focus,
.form-field-row .col-value .col-value-input:focus,
.form-field-row .col-desc .col-desc-input:focus {
  box-shadow: inset 0 0 0 1px var(--color-primary);
}
```

- [ ] **Step 2: Tokenize chips and method/status labels**

Replace method, protocol, file, environment summary, and error source chips:

```css
.item-protocol,
.project-tree-panel .project-endpoint-item .item-protocol,
.response-error-log-source,
.project-env-summary span,
.project-move-current-pill {
  border: 1px solid var(--color-border);
  background: var(--color-surface-muted);
  color: var(--color-muted-strong);
  border-radius: var(--radius-pill);
  font-weight: 600;
}

.file-item,
.file-select-chip {
  background: var(--color-primary-soft);
  border: 1px solid var(--color-primary-border);
  border-radius: var(--radius-md);
  color: var(--color-primary-text);
}

.item-method.method-get {
  background: var(--color-success-soft);
  color: var(--color-success);
}

.item-method.method-post {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
}

.item-method.method-put,
.item-method.method-patch,
.item-method.method-head,
.item-method.method-options {
  background: var(--color-warning-soft);
  color: var(--color-warning);
}

.item-method.method-delete {
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
```

- [ ] **Step 3: Tokenize history, favorites, and project tree rows**

Use one list item visual style:

```css
.history-item,
.favorite-item,
.project-endpoint-item {
  background: var(--color-surface-subtle);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--color-text);
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.history-item:hover,
.favorite-item:hover,
.project-endpoint-item:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-primary-border);
}

button.project-tree-name-btn:hover,
button.project-tree-module-name-btn:hover {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
}

.project-tree-children {
  border-left: 1px solid var(--color-border);
}

.favorite-item-name,
.item-name {
  color: var(--color-text-strong);
}

.favorite-item-url,
.item-url,
.item-time,
.project-tree-header-hint {
  color: var(--color-muted);
}
```

- [ ] **Step 4: Tokenize danger actions**

Use one danger button style:

```css
.project-tree-mini-btn.danger,
.project-endpoint-action-btn--danger {
  color: var(--color-danger);
  border-color: var(--color-danger-border);
}

.project-tree-mini-btn.danger:hover,
.project-endpoint-action-btn--danger:hover,
.form-field-row .remove-btn:hover,
.item-delete-btn:hover,
.file-item-remove:hover,
.file-select-chip-remove:hover,
.file-select-clear:hover {
  background: var(--color-danger-soft);
  border-color: var(--color-danger-border);
  color: var(--color-danger-hover);
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`

Expected: all existing Vitest tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/App.css
git commit -m "统一列表表格与项目树样式"
```

## Task 4: Response Area, Loading, Empty, Error, And Stream States

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Tokenize response toolbar, badges, and buttons**

Replace response-specific gradients and raw colors:

```css
.response-toolbar {
  background: var(--color-surface-subtle);
  border-bottom: 1px solid var(--color-border);
}

.response-badge {
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.response-badge-ok {
  background: var(--color-success-soft);
  color: var(--color-success);
  border-color: var(--color-success-border);
}

.response-badge-redirect {
  background: var(--color-primary-soft);
  color: var(--color-primary-text);
  border-color: var(--color-primary-border);
}

.response-badge-client-err {
  background: var(--color-danger-soft);
  color: var(--color-danger);
  border-color: var(--color-danger-border);
}

.response-badge-server-err {
  background: var(--color-warning-soft);
  color: var(--color-warning);
  border-color: var(--color-warning-border);
}

.response-badge-time {
  background: var(--color-surface-muted);
  color: var(--color-muted-strong);
}
```

- [ ] **Step 2: Tokenize response content panels**

Update response panels and code blocks:

```css
.response-headers-panel,
.response-body-panel,
.response-errors-panel {
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.response-header-row {
  border-bottom: 1px solid var(--color-border-subtle);
}

.response-header-row:nth-child(even) {
  background: var(--color-surface-subtle);
}

.response-header-key {
  color: var(--color-primary-text);
}

.response-header-value,
.response-error-log-message,
.response-body-json,
.response-body-raw {
  color: var(--color-text);
}

.response-body-json,
.response-body-raw,
.response-body-html-preview {
  background: var(--color-surface);
}

.response-error-log-detail,
.response-error-log-stack,
.response-error-log-context,
.msg-content pre {
  background: var(--color-surface-subtle);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
```

- [ ] **Step 3: Tokenize empty, loading, error, stream states**

Use semantic tokens:

```css
.response-spinner {
  border: 3px solid var(--color-surface-muted);
  border-top-color: var(--color-primary);
  border-radius: 50%;
}

.response-loading-text,
.response-empty,
.muted,
.status-disconnected,
.message-count,
.msg-time {
  color: var(--color-muted);
}

.response-error-card,
.stream-inline-error {
  background: var(--color-danger-soft);
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-lg);
}

.response-error-icon {
  background: var(--color-danger);
  color: #fff;
  border-radius: var(--radius-md);
}

.response-error-title,
.response-error-msg,
.stream-inline-error .error-msg {
  color: var(--color-danger);
}

.stream-msg {
  border-radius: var(--radius-md);
}

.stream-msg-in {
  background: var(--color-primary-soft);
  border-left: 3px solid var(--color-primary);
}

.stream-msg-out {
  background: var(--color-success-soft);
  border-left: 3px solid var(--color-success);
}
```

- [ ] **Step 4: Run build**

Run: `npm run build`

Expected: build passes.

- [ ] **Step 5: Commit**

```bash
git add src/App.css
git commit -m "统一响应区与状态样式"
```

## Task 5: Modal And File Select Modal

**Files:**
- Modify: `src/components/Modal/Modal.css`
- Modify: `src/components/FileSelectModal/FileSelectModal.css`

- [ ] **Step 1: Tokenize common modal**

Replace the content of `src/components/Modal/Modal.css` with token-based equivalents while keeping class names:

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--color-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-dialog {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 24px;
  min-width: 320px;
  max-width: 90vw;
  box-shadow: var(--shadow-popover);
}

.modal-title {
  margin: 0 0 16px;
  color: var(--color-text-strong);
  font-size: 1rem;
}

.modal-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 14px;
  margin-bottom: 20px;
  box-sizing: border-box;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.modal-btn {
  min-height: var(--control-h-md);
  padding: 7px 18px;
  border-radius: var(--radius-md);
  font-size: 14px;
  cursor: pointer;
  border: 1px solid var(--color-border);
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.modal-btn-cancel {
  background: var(--color-surface-subtle);
  color: var(--color-muted-strong);
}

.modal-btn-cancel:hover {
  background: var(--color-surface-hover);
}

.modal-btn-confirm {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.modal-btn-confirm:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}
```

- [ ] **Step 2: Tokenize file select modal**

In `src/components/FileSelectModal/FileSelectModal.css`, replace raw colors with the same token families. The final class behavior must match this shape:

```css
.file-select-overlay {
  background: var(--color-overlay);
}

.file-select-modal {
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-popover);
}

.file-select-header {
  border-bottom: 1px solid var(--color-border);
}

.file-select-title {
  color: var(--color-text-strong);
}

.file-select-close,
.file-select-clear,
.file-select-chip-remove {
  background: transparent;
  color: var(--color-muted);
  border-radius: var(--radius-sm);
}

.file-select-close:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-strong);
}

.file-select-input-wrap {
  border: 1px solid var(--color-primary-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-active);
}

.file-select-input-wrap:has(.file-select-placeholder) {
  border-color: var(--color-border);
  box-shadow: none;
}

.file-select-placeholder {
  color: var(--color-muted);
}

.file-select-local-btn {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-subtle);
  color: var(--color-muted-strong);
}

.file-select-local-btn:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-border-strong);
}

.file-select-plus {
  color: var(--color-primary-text);
}
```

Keep layout declarations such as `position`, `display`, `width`, `max-height`, `padding`, `gap`, `overflow`, `flex`, and chip sizing from the original file.

- [ ] **Step 3: Remove redundant dark-only modal overrides**

Delete dark theme blocks from both modal CSS files when the tokenized base rules already cover them:

```css
html[data-theme="dark"] .modal-dialog { ... }
html[data-theme="dark"] .modal-title { ... }
html[data-theme="dark"] .modal-input { ... }
html[data-theme="dark"] .modal-btn-cancel { ... }
html[data-theme="dark"] .file-select-modal { ... }
html[data-theme="dark"] .file-select-header { ... }
html[data-theme="dark"] .file-select-title { ... }
html[data-theme="dark"] .file-select-body { ... }
html[data-theme="dark"] .file-select-input-wrap { ... }
html[data-theme="dark"] .file-select-chip { ... }
html[data-theme="dark"] .file-select-local-btn { ... }
```

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/Modal/Modal.css src/components/FileSelectModal/FileSelectModal.css
git commit -m "统一弹窗与文件选择样式"
```

## Task 6: Cleanup Dark Overrides And Verify Browser UI

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: Remove redundant raw-color dark overrides**

Inside `html[data-theme="dark"]`, delete overrides that only repeat tokenized base styling. Keep overrides only when they express a different layout or a semantic state not covered by tokenized base rules.

Examples to delete after tokenization:

```css
.sidebar-new-request-btn { background: #2463eb; }
.sidebar-new-request-btn:hover { background: #1d5dd6; }
.request-copy-curl-btn { color: #e2e8f0; background: #2a2a2a; border-color: #444; }
.response-copy-body-btn { color: #e2e8f0; background: #2a2a2a; border-color: #444; }
.form-add-btn { background: #333; border-color: #444; color: #e0e0e0; }
.project-tree-add-root { background: #2a2a2a; border-color: #444; color: #e0e0e0; }
```

Keep syntax-highlighting overrides for `.apix-json-*` if they remain more readable than generic tokens.

- [ ] **Step 2: Run app locally**

If Vite is already running on `http://127.0.0.1:1422/`, reuse it and reload the browser.

If not running, start it:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: app loads at `http://127.0.0.1:1422/` or the configured Vite port.

- [ ] **Step 3: Browser check light theme**

In the in-app Browser at `http://127.0.0.1:1422/`:

1. Ensure `document.documentElement.getAttribute('data-theme')` is `light`.
2. Check the visible shell: header, sidebar, request panel, response panel.
3. Tab through controls and confirm focus rings are visible.
4. Confirm no text overlaps in header controls, request URL row, response toolbar, and project tree toolbar.

Expected: all visible surfaces use matching border, radius, hover, and text colors.

- [ ] **Step 4: Browser check dark theme**

Click the theme toggle button.

Expected:

1. `document.documentElement.getAttribute('data-theme')` is `dark`.
2. Header, sidebar, request panel, response panel, tabs, input fields, and buttons are dark surfaces from the same palette.
3. Primary and danger states remain readable.
4. Focus rings remain visible.

- [ ] **Step 5: Browser check modals**

Open these UI surfaces:

1. Click `+ 项目` to open the shared modal.
2. In request Body form-data mode, open file selector if available.
3. If project movement/export modals are reachable with existing data, inspect them; otherwise verify their CSS selectors are tokenized in `src/App.css`.

Expected: modal overlay, panel, header, input, buttons, chips, and hover states match the rest of the app.

- [ ] **Step 6: Commit**

```bash
git add src/App.css
git commit -m "清理暗色主题覆盖并完成视觉统一"
```

## Task 7: Final Verification

**Files:**
- No source edits expected unless verification finds an issue.

- [ ] **Step 1: Run build**

Run: `npm run build`

Expected: command exits 0.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: command exits 0.

- [ ] **Step 3: Inspect git diff**

Run: `git diff --stat HEAD`

Expected: only style-related files are changed after the last commit if any verification fix was needed.

- [ ] **Step 4: If verification required fixes, commit them**

Only if source changes remain:

```bash
git add src/App.css src/components/Modal/Modal.css src/components/FileSelectModal/FileSelectModal.css
git commit -m "修复样式统一验证问题"
```

- [ ] **Step 5: Final status**

Run: `git status --short`

Expected: no unexpected untracked or modified files except ignored `.superpowers/` runtime files.

## Self-Review

- Spec coverage: token体系、亮/暗主题、主界面、侧栏、请求区、响应区、项目树、弹窗、焦点态和验证步骤均有对应任务。
- 占位词扫描：计划中没有需要执行者自行补全的占位内容。
- Type consistency: this plan changes CSS only; class names match existing selectors in `src/App.css`, `src/components/Modal/Modal.css`, and `src/components/FileSelectModal/FileSelectModal.css`.
