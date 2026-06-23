# Apix Agent 指令

本文件为 AI 编码助手的项目级指令，Cursor 等工具会自动读取。

项目简介与技术栈见 [README.md](README.md)。

## 提交信息规范

提交信息使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：**type 用英文**，**说明用中文**，简短明确。

### 格式

```
<type>: <subject>
```

- `type`：变更类型（见下表）
- `subject`：一句话说明，中文，无句号

### 类型

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

### 示例

```
feat: 新增 OpenAPI YAML 导入
fix: 修复环境切换后草稿丢失
refactor: 拆分响应面板组件
chore: release v0.1.4
ci: 发布构建中运行前端测试
build: 升级 vite 到 6.x
docs: 补充提交信息规范
test: 覆盖变量替换场景
```

### 发布提交

版本发布由 `npm run release` 生成，提交信息格式：`chore: release v<version>`。

完整说明见 [docs/commit-conventions.md](docs/commit-conventions.md)。
