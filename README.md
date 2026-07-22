# Apix

Apix 是一个轻量级跨平台 API 客户端，面向日常接口调试、项目接口沉淀和离线接口文档导出。项目基于 Tauri 2、React、TypeScript 和 Vite 构建，数据默认保存在本地 SQLite 中。

## 核心功能

- **HTTP 请求调试**：支持 GET、POST、PUT、PATCH、DELETE、HEAD、OPTIONS。
- **请求参数编辑**：URL 与 Params 表双向同步，Params、Headers、Body 字段支持启用/禁用与描述。
- **Body 类型**：支持 `form-data`、`x-www-form-urlencoded`、`raw`、`binary`；`raw` 支持 JSON、Text、XML；`form-data` 支持多文件字段。
- **复制命令**：可根据当前请求生成并复制 cURL；SSE 生成 `curl -N`，WebSocket 生成 wscat 示例提示。
- **WebSocket**：支持连接、断开、消息收发和实时消息列表。
- **SSE**：支持 Server-Sent Events 流式接收，按事件持续追加消息。
- **响应查看**：展示状态码、耗时、响应头、响应体；JSON 使用结构化视图，HTML 支持预览/源码切换，文本支持搜索和复制。
- **错误日志**：可开启报错收集，在响应区查看、复制、清空 HTTP / WS / SSE 调试错误。
- **历史记录**：自动保存最近 100 条请求记录，可按协议筛选、回填和删除。
- **收藏**：保存常用请求配置，发送收藏草稿时会回写最新内容。
- **项目管理**：以“项目 → 模块 → 接口”的树形结构管理接口，支持搜索、展开/折叠、重命名、删除、复制接口、移动接口、拖拽排序。
- **项目全局配置**：按环境维护 Base URL、Headers 与变量，发送请求前自动合并并解析变量。
- **导入导出**：支持 Apix 项目 JSON 导入/导出，支持 OpenAPI 3.x / Swagger 2.0 的 JSON 或 YAML 导入，并可导出离线接口文档 HTML。
- **界面体验**：支持明暗主题、侧栏宽度调整、请求/响应区域高度调整、响应区展开，以及 `⌘ + Enter` / `Ctrl + Enter` 发送请求。

## 项目与全局变量

侧栏切换到 **项目** Tab 后，可以维护本地 SQLite 中的项目结构：**项目 → 模块 → 接口**。

- 点击项目名称进入 **项目全局** 页面，维护全局 Base URL、Headers、共享变量和环境变量。
- 点击模块名称会把侧栏顶部的 **+ 新建** 目标设置为该模块。
- 点击已保存接口会把请求配置加载到主编辑区；如果接口保存过最近一次 HTTP 响应，也会同步恢复响应内容。
- 在项目上下文中发送 HTTP / WebSocket / SSE 时，会先保存当前接口草稿，再合并项目全局配置。

### 环境配置

每个项目默认包含开发、测试、生产三个环境。每个环境可以分别维护：

- 全局 Base URL
- 全局 Headers
- 变量列表

切换环境后，请求发送会使用当前环境的配置。若当前环境未配置 Headers 或变量，会兼容回退到旧版项目级配置。

### 合并与替换规则

- 接口 URL 为相对路径时，会与当前环境的 Base URL 拼接；绝对 URL 不会被 Base URL 覆盖。
- 全局 Headers 会与接口 Headers 合并，同名 key 以接口 Headers 为准。
- 可在 URL、Query、Headers 的值、Raw Body、表单文本字段中使用 `{{变量名}}`。
- 占位符支持首尾空格，例如 `{{ api_base }}`；未定义变量会原样保留。
- 环境变量优先于旧版项目共享变量。
- 变量可配置发送位置：Query 参数或 Body 表单字段。
- 文件上传字段与 binary 文件路径不会做变量替换。
- `form-data` 与 `x-www-form-urlencoded` 下，发送位置为 Body 的全局变量会作为默认表单字段合并；同名字段以接口 Body 为准。

## 导入与导出

### Apix 项目文件

项目可以导出为 `.apix-project.json`，内容包含：

- 项目名称与全局配置
- 选中的模块
- 模块下的接口配置
- 接口最近一次 HTTP 响应信息

导入时可以选择：

- 新建项目：名称冲突时自动追加后缀。
- 合并到已有项目：追加模块与接口，不覆盖目标项目的全局 Headers 和变量。

### OpenAPI / Swagger

支持导入 OpenAPI 3.x 或 Swagger 2.0 的 JSON / YAML 文件。导入时会：

- 使用 `info.title` 作为项目名。
- 使用 `servers[0].url` 或 Swagger 2.0 的 `schemes + host + basePath` 作为 Base URL。
- 按 tag 生成模块，按 path + method 生成接口。
- 将 path 参数转换为 `{{变量名}}`。
- 提取 query/header 参数和 JSON 请求体示例。

### 离线 HTML 文档

项目可导出为接口文档 HTML，并支持选择导出的模块。文档会包含完整 URL、Headers、Query 参数、Body、最近一次响应，以及复制 URL / cURL 的按钮。

## 数据存储

Apix 使用 Tauri SQL 插件管理本地 SQLite 数据库 `apix.db`。当前持久化的数据包括：

- 请求历史
- 收藏
- 项目
- 模块
- 接口
- 项目全局配置
- 接口最近一次 HTTP 响应

历史记录最多保留最近 100 条。

## 开发

### 环境要求

- Node.js 与 npm
- Rust 工具链
- Tauri 2 所需的系统依赖

### 安装依赖

```bash
npm install
```

### 启动桌面开发模式

完整功能依赖 Tauri 插件，日常开发推荐使用：

```bash
npm run tauri dev
```

### 启动前端开发服务

仅调试前端界面时可使用：

```bash
npm run dev
```

## 构建

构建前端产物：

```bash
npm run build
```

构建桌面应用：

```bash
npm run tauri build
```

## 测试

运行全部测试：

```bash
npm run test
```

监听模式：

```bash
npm run test:watch
```

## 提交规范

日常提交采用 Conventional Commits，type 用英文、说明用中文，例如 `feat: 新增环境切换`、`fix: 修复请求头合并`。类型与示例见 [docs/commit-conventions.md](./docs/commit-conventions.md)。GitHub Release 说明会按提交 type 自动分组生成。

## 发布

发布脚本会先校验工作区干净且与远端同步，再跑本地测试与构建，然后同步项目版本号、提交版本文件、推送当前分支并创建版本 tag。版本 bump 的提交信息为 `chore: release v<version>`。tag 会触发 GitHub Release 工作流。

```bash
# 默认递增 patch 版本
npm run release

# 指定更高的稳定版本
npm run release -- 1.2.0

# 使用当前版本重新打 tag 并强推（用于重跑 Release）
npm run release -- --current
```

只校验版本一致性：

```bash
npm run release:check -- --version 0.1.1
```

## 技术栈

- Tauri 2
- React 19 + TypeScript + Vite
- Zustand
- Vitest + Testing Library
- `@tauri-apps/plugin-http`
- `@tauri-apps/plugin-upload`
- `@tauri-apps/plugin-websocket`
- `@tauri-apps/plugin-sql`
- `@tauri-apps/plugin-dialog`
- `@tauri-apps/plugin-fs`
- `@tauri-apps/plugin-opener`
- `react-json-view-lite`
- `yaml`
