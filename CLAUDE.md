# CLAUDE.md — ServerHub 前端

## 概述

ServerHub 前端，独立仓库。基于 React 19 + TypeScript + Tailwind CSS + Vite。

后端仓库位于同级目录 `../server-hub/`。

## 开发

```bash
npm install          # 安装依赖
npm run dev          # Vite dev server :5173，自动 proxy /api → :9900
npm run build        # 生产构建 → dist/
npm run preview      # 预览构建产物
```

确保后端已在 :9900 运行：`cd ../server-hub && make dev`

## 与后端的通信

- **HTTP API**: 所有请求走 `/api/*`，开发时由 Vite proxy 转发到 `:9900`
- **WebSocket**: `/ws/metrics`（监控指标）、`/ws/terminal`（Web 终端）
- **SSE**: `POST /api/agents/chat`（Agent 对话流）

## 部署到后端

```bash
make deploy-local    # 构建并复制 dist/ → ../server-hub/static/
```

后端会自动服务 `static/` 目录中的前端文件。

## 技术栈

- **路由**: React Router v7，19 条路由 + 代码分割 (React.lazy)
- **状态**: TanStack Query (服务端缓存) + Zustand (客户端状态)
- **认证**: Cookie auth (HttpOnly JWT)，401 自动 refresh + 重定向
- **图表**: echarts-for-react + 暗色主题
- **Markdown**: marked.js + highlight.js + mermaid.js + DOMPurify
- **终端**: @xterm/xterm WebSocket

## 关键文件

- `src/App.tsx` — 路由配置 + 认证守卫
- `src/api/client.ts` — Axios 实例 (cookie auth, 401 refresh, 请求队列)
- `src/hooks/useSSEChat.ts` — SSE 流解析 (7 种事件类型)
- `src/hooks/useWebSocket.ts` — 指标 WebSocket (60 点缓冲区)
- `src/pages/agents/` — Agent 页面组件
- `src/lib/markdown.ts` — Markdown 渲染配置

## 代码规范

- 使用 TypeScript strict mode，避免 `any`
- 使用可选链 `?.` 防御性访问 API 返回值
- API 调用统一通过 `@/api/client` Axios 实例
- 组件使用函数式 + hooks 模式
