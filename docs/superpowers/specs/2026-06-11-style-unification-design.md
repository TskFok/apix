# Apix 样式统一设计

## 背景

当前 Apix 是 Vite + React + Tauri 的单页 API 客户端，主界面样式主要集中在 `src/App.css`，少量弹窗样式分散在组件级 CSS 中。页面已经具备亮色和暗色主题，但颜色、圆角、边框、焦点态、按钮形态和状态色在不同区域存在割裂：

- 主界面同时使用 `#ddd`、`#e0e0e0`、slate 色阶和多组蓝色。
- 圆角混用 `4px`、`6px`、`8px`、`10px`、`12px`、`999px`，缺少清晰规则。
- 按钮、标签页、表格、响应区、项目树、弹窗各有独立视觉语言。
- 全局移除了输入、选择框和按钮的焦点态，不利于键盘操作和可访问性。
- 暗色主题靠分散覆盖维护，新增界面容易漏配。

## 目标

将现有页面统一为克制、密集、适合桌面工具的视觉风格。改动应优先收敛 CSS，不重构业务状态和数据流。

成功标准：

- 主界面、侧栏、请求区、响应区、项目树、弹窗、文件选择弹窗在亮色和暗色主题下使用同一套视觉 token。
- 控件高度、圆角、边框、hover、active、disabled、focus-visible 状态一致。
- 保留现有布局密度和功能，不引入营销化、装饰化或大幅重排。
- 恢复可见焦点态，满足键盘用户可判断当前位置的基本要求。
- `npm run build` 和现有测试通过。

## 方案

采用“统一 token + 渐进替换”。

先在 `src/App.css` 的 `:root` 和 `html[data-theme='dark']` 中定义视觉 token，再把现有选择器逐步替换为 token。组件结构暂不抽象为新的 React UI 组件，避免在一次视觉统一中扩大行为风险。

核心 token：

- 颜色：`--color-bg`、`--color-surface`、`--color-surface-subtle`、`--color-surface-hover`、`--color-border`、`--color-border-strong`、`--color-text`、`--color-muted`、`--color-primary`、`--color-primary-hover`、`--color-danger`、`--color-success`、`--color-warning`。
- 形态：`--radius-sm`、`--radius-md`、`--radius-lg`、`--radius-pill`。
- 尺寸：`--control-h-sm`、`--control-h-md`、`--space-*`。
- 反馈：`--focus-ring`、`--shadow-popover`、`--shadow-active`。

圆角规则：

- 面板和弹窗：`8px`。
- 输入框、普通按钮、表格容器：`6px`。
- 小图标按钮：`6px`。
- 胶囊开关、状态标签：`999px`。
- 不再使用 `10px`、`12px` 作为常规圆角，只在确有层级差异时保留弹窗阴影。

## 范围

本次统一覆盖：

- `src/App.css` 中的全局、布局、主界面、请求区、响应区、项目树、项目全局配置、搜索、错误日志、历史和收藏样式。
- `src/components/Modal/Modal.css`。
- `src/components/FileSelectModal/FileSelectModal.css`。

本次不覆盖：

- 导出的 API 文档 HTML 样式。它是独立产物，允许使用独立但相近的文档风格。
- 业务逻辑、数据库、请求发送、项目导入导出格式。
- 大规模拆分 CSS 文件或抽象 React 基础组件。

## 交互与可访问性

- 移除“全局强制取消 focus outline/box-shadow”的规则，改为统一 `:focus-visible` 样式。
- 图标按钮保持已有 `aria-label` 或 `FastTooltip`，视觉上统一尺寸和 hover 状态。
- Disabled 控件使用 token 化的低对比表面、文本和边框，不再混用 `#ccc`。
- 状态色保留 GET/POST/错误/成功等语义，但调整为同一套浅色和暗色 token。

## 实施顺序

1. 新增 token，并让亮色、暗色主题共享同一命名体系。
2. 替换全局基础样式、页面背景、面板和分隔线。
3. 统一按钮、输入框、select、标签页、图标按钮和焦点态。
4. 统一请求参数表格、文件 chip、项目树、历史/收藏列表。
5. 统一响应区、错误卡片、日志列表和状态 badge。
6. 统一 Modal 和 FileSelectModal。
7. 用浏览器分别检查亮色和暗色主题，确认无明显割裂、文本不重叠、焦点态可见。
8. 运行 `npm run build` 和 `npm test`。

## 风险

- `src/App.css` 已超过 4000 行，替换 token 时容易遗漏局部选择器。缓解方式是分区替换并用浏览器采集关键控件样式。
- 部分 CSS 使用嵌套写法，构建链路当前支持，但修改时需要保持语法兼容。
- 暗色主题覆盖较多，若只替换亮色 token 会造成暗色回退异常。暗色 token 必须同步定义。
- 视觉统一可能影响测试截图以外的交互感知，但现有测试以行为为主，需通过浏览器手动检查补足。

## 验证

- 自动化：`npm run build`、`npm test`。
- 浏览器检查：打开 `http://127.0.0.1:1422/`，检查亮色和暗色主题下的主界面、侧栏项目树、请求表格、响应区、弹窗和文件选择弹窗。
- 样式抽样：采集关键控件的 `background`、`borderColor`、`borderRadius`、`boxShadow`，确认来自统一 token 体系。
