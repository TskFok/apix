# Apix

轻量级跨平台 API 客户端，类似 Postman。基于 Tauri 2 + React + TypeScript 构建。

## 功能

- **HTTP 请求**：支持 GET、POST、PUT、PATCH、DELETE、HEAD、OPTIONS
- **文件上传**：form-data、流式上传
- **WebSocket**：双向通信，实时消息收发
- **SSE**：Server-Sent Events 流式接收
- **请求历史**：自动记录，一键填充
- **收藏**：保存常用请求配置

## 开发

```bash
npm install
npm run tauri dev
```

## 构建

```bash
npm run build
npm run tauri build
```

## 测试

```bash
npm run test
```

## 技术栈

- Tauri 2
- React 18 + TypeScript + Vite
- tauri-plugin-http / upload / websocket / sql
- Zustand
