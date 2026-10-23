# 依赖安全审计（2026-10-23）

本次检查项目的 npm 锁文件和 Tauri/Rust 锁文件，使用 npm 官方漏洞服务与当日更新的 RustSec 数据库。结论仅覆盖已公开的依赖漏洞，不代表应用没有其他安全问题。

## 审计结果

| 检查 | 修复前 | 修复后 |
| --- | --- | --- |
| `npm audit` | 5 个受影响包：1 严重、2 高危、2 中危 | 0 个已知漏洞 |
| `cargo audit` 漏洞条目 | 15 条 | 1 条：未启用的 SQLx MySQL 依赖中的 RSA |
| RustSec 提示 | 停止维护、不健全性及撤回版本提示 | 4 条停止维护提示、1 条 GLib 不健全性提示 |

`cargo audit` 仍会因 RSA 返回非零退出码。本次没有添加漏洞忽略规则，也没有手工删除 Cargo 锁文件中的可选依赖。

## 更新内容

| 依赖 | 原版本 | 当前锁定版本 |
| --- | --- | --- |
| Vite | 8.0.16 | 8.1.6 |
| Vitest / `@vitest/mocker` | 4.1.11 | 4.1.12 |
| Handlebars | 4.7.9 | 4.7.10 |
| source-map-js | 1.2.1 | 1.2.2 |
| Tauri（Rust） | 2.10.2 | 2.12.5 |
| tauri-build | 2.5.5 | 2.7.4 |
| `@tauri-apps/api` / CLI | 2.10.1 | 2.12.4 |
| Tauri HTTP 插件（Rust / npm） | 2.5.7 | 2.8.3 |
| Tauri FS 插件（Rust / npm） | 2.4.5 | 2.7.1 |
| h2 | 0.4.13 | 0.4.20 |
| quick-xml | 0.38.4 | 0.41.0 |
| quinn-proto | 0.11.14 | 0.11.19 |
| rustls | 0.23.40 | 0.23.46 |
| rustls-webpki | 0.103.13 | 0.103.16 |
| webpki-roots | 1.0.6 | 1.0.10 |

npm 问题均来自开发、测试或发布工具链；Handlebars 由 `conventional-changelog-writer` 引入，source-map-js 由 PostCSS 和 css-tree 引入。修复版本依据 [Handlebars 官方公告](https://github.com/handlebars-lang/handlebars.js/security/advisories/GHSA-8r5x-fm3f-whwj)、[Vite 官方公告](https://github.com/vitejs/vite/security/advisories/GHSA-rq7h-c2jc-7f22)、[Vitest 官方公告](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8)及 [source-map-js 发布记录](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2)核对。

Rust 更新修复了 h2 的 1 条、quick-xml 的 2 条、quinn-proto 的 5 条、rustls 的 4 条，以及 rustls-webpki、webpki-roots 各 1 条漏洞。另更新 anyhow、event-listener 和 rand 的兼容版本以处理相关不健全性提示，并通过新版 Tauri 依赖链移除 fxhash、旧版 rand 及 unic 系列停止维护的依赖。

升级后的 Tauri 依赖要求 Rust 至少为 1.90；项目 CI 使用稳定工具链，本次在 Rust 1.93.1 上验证。

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
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo tree --manifest-path src-tauri/Cargo.toml --locked --target all --invert rsa
cargo tree --manifest-path src-tauri/Cargo.toml --locked --target all --edges features
```

运行 Cargo 审计需要预先安装 `cargo-audit`。保留并提交两个锁文件，CI 使用 `npm ci`，Rust 验证使用 `--locked`，确保复验针对相同的依赖版本。

## 本次验证

- 最终锁文件的 `npm ci` 与 `npm audit` 成功，审计为 0 漏洞。
- `npm test`：34 个测试文件、368 个用例全部通过。
- `npm run build`：TypeScript 检查与 Vite 生产构建通过。
- `cargo test --locked`：macOS 上 6 个 Rust 单元测试全部通过。
- `npm run tauri -- build --debug --no-bundle -- --locked --offline`：macOS 桌面程序构建通过，未生成安装包。
- 未在本地执行 Linux、Windows 构建；跨平台结果仍需项目 CI 确认。
