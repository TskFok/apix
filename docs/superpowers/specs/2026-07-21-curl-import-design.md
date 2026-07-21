# cURL 命令导入设计

## 目标

用户粘贴常见 HTTP cURL 命令后，Apix 自动将其填充为当前请求的 URL、方法、请求头、查询参数和请求体。该功能与已有的“复制为 cURL 命令”入口形成双向工作流。

## 范围

支持：

- `curl` 命令、可选的反斜杠续行，以及单引号、双引号和反斜杠转义的参数值。
- URL、`-X` / `--request`、`-H` / `--header`、`-d` / `--data` / `--data-raw` / `--data-binary`、`-F` / `--form`。
- URL 中已有的查询参数，并复用现有 URL 解析规则回填 Params 表格。
- `-F key=value` 文本字段与 `-F key=@path` 文件字段。

不支持且静默忽略：代理、认证、Cookie、重试、输出选项、TLS 选项及其他不会改变 Apix 请求表单的 cURL 运行参数。

## 交互

请求栏在“复制为 cURL 命令”旁新增“导入 cURL”按钮。点击后使用现有通用弹窗输入命令；确认时解析并回填当前请求。解析失败（非 cURL、缺少 URL）时不修改当前表单。

## 解析与映射

解析器位于 `src/lib/parseCurlCommand.ts`，与现有生成器保持独立。

1. tokenizer 将多行命令正规化并按 shell 的有限规则拆分参数；仅需要处理引号和反斜杠，不执行 shell 表达式。
2. 解析器读取受支持 flag，最后一个未识别为 flag 的非空参数作为 URL；显式方法优先。
3. 未写 `-X` 时，包含 data 或 form 参数则使用 `POST`，否则 `GET`。
4. 请求头按原始顺序回填，并补充一个空行；URL 交给 `parseUrlToBaseAndParams` 回填 URL 与 Params。
5. 包含 form 参数时，Body 类型为 `form-data`；文件和文本字段保留顺序并补充一个空行。
6. 否则包含 data 参数时，Body 类型为 `raw`。根据 Content-Type 推断 rawType：JSON（含 `+json`）映射为 `json`，XML（含 `+xml`）映射为 `xml`，其他映射为 `text`。
7. `--data-binary @path` 映射为 `binary` 与 `binaryPath`；其他 data 值作为 Raw Body。

## 错误处理

解析器返回可判定结果，不抛出用户输入异常。输入不是 cURL、未获得 URL、或命令只含不支持参数时返回失败，UI 保留原请求。未知参数被跳过，使来自浏览器、Postman 等工具的命令仍能导入其可识别部分。

## 测试

- 解析器：GET、POST JSON、多请求头、URL 参数、多行续行、urlencoded data、multipart 文本/文件、二进制、Content-Type 推断、无 URL 的失败。
- 组件：从弹窗导入 cURL 后验证请求状态（方法、URL、Headers、Body）已回填；无效输入不覆盖现有状态。
