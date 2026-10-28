# 依赖安全审计（2026-10-28）

本次检查项目的 npm 锁文件和 Tauri/Rust 锁文件，使用 npm 官方漏洞服务，并刷新 RustSec 数据库。数据库最新提交为 `99670cfc0bc574433034b75876a4b791ccaa2efb`（2026-10-27），包含 1380 条公告。结论仅覆盖已公开的依赖漏洞，不代表应用没有其他安全问题。

## 审计结果

| 检查 | 修复前 | 修复后 |
| --- | --- | --- |
| `npm audit` | 1 个受影响包（undici），命中 8 条公告，最高为高危 | 0 个已知漏洞 |
| `cargo audit` 漏洞条目 | 1 条：RSA | 1 条：未启用的 SQLx MySQL 依赖中的 RSA |
| RustSec 提示 | 4 条停止维护提示、2 条不健全性提示（GLib、Tokio） | 4 条停止维护提示、1 条 GLib 不健全性提示 |

表格中的 Rust 结果均为**不忽略任何公告**的完整审计。检查发现原有 `src-tauri/.cargo/audit.toml` 忽略了 20 条公告，其中包括尚未解决的 RSA 和 GLib 问题；本次已清空忽略列表，避免从 `src-tauri` 执行审计时掩盖剩余风险。没有手工删除 Cargo 锁文件中的可选依赖。

`cargo audit` 仍会因 RSA 返回非零退出码，不能将本次结果描述为 Rust 零漏洞。停止维护提示与已确认漏洞分别列出。

## 更新内容

| 依赖 | 原版本 | 当前锁定版本 |
| --- | --- | --- |
| undici | 7.30.0 | 7.30.1 |
| Tokio | 1.49.0 | 1.51.6 |

npm 问题来自测试依赖链 `jsdom → undici`。根据 [undici 7.30.1 官方发布说明](https://github.com/nodejs/undici/releases/tag/v7.30.1)，该补丁修复 TLS 验证绕过、跨源重定向缓存污染及信息泄露、完整性校验绕过，以及 HTTP、SSE、WebSocket 相关的拒绝服务问题。升级符合 jsdom 的现有版本约束，无需增加 overrides 或修改直接依赖。

Tokio 更新针对 [RUSTSEC-2026-0386](https://rustsec.org/advisories/RUSTSEC-2026-0386.html)：`AsyncFd` 构造函数违反 I/O 安全约束，可能造成释放后使用。RustSec 将其归类为不健全性提示，修复范围为 `>=1.51.6, <1.52.0` 或 `>=1.53.3`。本次选择最低兼容修复版本，并由 Cargo 同步解析所需的间接依赖。

现有 Tauri（Rust）2.12.5、tauri-build 2.7.4、npm API/CLI 2.12.4 继续沿用；本次审计没有命中这些包的未修复公告。项目仍要求 Rust 1.90 或更新的稳定工具链，本次在 Rust 1.93.1 上验证。

另外核对了 [Tauri HTTP 插件的重定向作用域修复](https://tauri.app/release/http/)：`scopeRedirects` 需要显式开启。当前项目允许任意 HTTP(S) 地址，插件仅用于 SSE 且设置了 `maxRedirections: 0`；普通 HTTP 使用 Rust 自定义同源重定向策略。因此现有请求路径不会通过插件重定向绕过主机限制。若以后收紧 HTTP capability 或启用插件自动重定向，应同时开启 `plugins.http.scopeRedirects`。

## 尚未解决的上游问题

- **RSA：RUSTSEC-2023-0071。** [RustSec 公告](https://rustsec.org/advisories/RUSTSEC-2023-0071.html)仍无修复版本。锁文件路径是 `tauri-plugin-sql → sqlx → sqlx-mysql → rsa`。项目仅启用 SQLite；使用当前功能配置执行 `cargo tree --locked --target all --invert rsa` 没有依赖路径，完整 feature tree 也没有 `sqlx-mysql` 或 `rsa`。因此它当前没有进入应用构建；如果以后启用 MySQL，需要重新评估。
- **GLib：RUSTSEC-2024-0429。** `glib 0.18.5` 来自 Linux GTK/WebKit 依赖链。[官方修复要求 GLib ≥0.20.0](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)，超出当前 GTK 0.18 依赖约束，不能用普通锁文件升级替换。该提示涉及 `VariantStrIter` 的未定义行为，保留为 Linux 端未解决风险，等待兼容的上游修复或依赖栈迁移。
- **proc-macro-error：RUSTSEC-2024-0370。** `glib-macros` / `gtk3-macros` 引入的停止维护提示，需随 GTK 依赖栈迁移处理。
- **zvariant / zbus_names / zvariant_derive：RUSTSEC-2026-0370、0371、0372。** 由 Linux 上的 `tauri-plugin-opener → zbus 5` 引入。相关功能已[并入 zbus 6](https://rustsec.org/advisories/RUSTSEC-2026-0370.html)，需等待 opener 的兼容迁移；这些是停止维护提示。

## 复查命令

在仓库根目录执行：

```bash
npm ci
npm audit
npm test
npm run build
cargo audit --file src-tauri/Cargo.lock
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo tree --manifest-path src-tauri/Cargo.toml --locked --target all --invert rsa
cargo tree --manifest-path src-tauri/Cargo.toml --locked --target all --edges features
```

运行 Cargo 审计需要预先安装 `cargo-audit`。审计需更新 RustSec 数据库，不能添加 `--ignore`；使用 JSON 输出时应确认 `settings.ignore` 为空。当前 RSA 告警导致审计退出码为 1，这是已知的剩余问题。

保留两个锁文件，CI 使用 `npm ci`，Rust 验证使用 `--locked`，确保复验针对相同的依赖版本。

## 本次验证

- 最终锁文件的 `npm ci` 与 `npm audit` 成功，审计为 0 漏洞。
- `npm test`：34 个测试文件、368 个用例全部通过。
- `npm run build`：TypeScript 检查与 Vite 生产构建通过。
- `cargo check --locked`：macOS 编译检查通过。
- `cargo test --locked`：macOS 上 6 个 Rust 单元测试全部通过。
- `npm run tauri -- build --debug --no-bundle -- --locked --offline`：macOS 桌面程序构建通过，未生成安装包。
- 完整 `cargo audit`：忽略列表为空，剩余 1 条 RSA 漏洞、1 条 GLib 不健全性提示、4 条停止维护提示；Tokio 公告已消失。
- 未在本地执行 Linux、Windows 构建；跨平台结果仍需项目 CI 确认。
