# 提交信息规范

本项目采用 [Conventional Commits](https://www.conventionalcommits.org/)。提交信息**尽量用英文动词开头**，保持简短明确。

## 格式

```
<type>: <subject>
```

| 字段 | 说明 |
|------|------|
| `type` | 变更类型，见下表 |
| `subject` | 一句话描述，英文祈使语气，小写开头，结尾不加句号 |

可选：正文与 footer 遵循 Conventional Commits，用于说明动机、Breaking Changes 或关联 Issue。

## 类型一览

| type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修 bug |
| `refactor` | 重构 |
| `chore` | 日常维护 |
| `ci` | GitHub Actions / 部署配置 |
| `build` | 依赖 / 构建变更 |
| `docs` | 文档 |
| `test` | 测试 |

## 示例

```
feat: add websocket message export
fix: restore draft after env switch
refactor: split response panel components
chore: release v0.2.0
ci: run frontend tests on release build
build: update tauri plugin dependencies
docs: add commit message guidelines
test: add cases for variable substitution
```

## 版本发布

`npm run release` 会 bump 版本并提交，提交信息固定为：

```
chore: release v<version>
```

例如 `chore: release v0.1.4`。

## Release Notes

GitHub Release 的说明由 [conventional-changelog](https://github.com/conventional-changelog/conventional-changelog) 根据 tag 间的 Conventional Commits 自动生成，并按 type 分组（Features、Bug Fixes、Refactor 等）。版本 bump 提交 `chore: release v*` 不会出现在 notes 中。

本地预览最近一次发布的 notes：

```bash
npm run release:notes
```

指定 tag 预览（与 CI 一致）：

```bash
npm run release:notes -- --tag v0.1.3
```
