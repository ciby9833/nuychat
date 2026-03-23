# NuyChat

NuyChat 是一个面向客服场景的多应用 Monorepo，当前仓库包含：

- `apps/api`: 核心后端服务，负责认证、租户、渠道接入、会话、消息、路由、AI 编排、实时事件与任务队列
- `apps/platform-admin`: 平台管理后台
- `apps/tenant-admin`: 租户管理后台
- `apps/agent-workspace`: 客服工作台
- `apps/customer-web`: Web 聊天端

这个 README 只描述当前仓库已经存在的代码与本地开发方式，不包含未落地的产品规划内容。

## 技术栈

- Node.js 20+
- pnpm 10
- TypeScript
- Fastify
- React 19 + Vite 7
- PostgreSQL
- Redis
- Qdrant
- BullMQ

## 仓库结构

```text
nuyess-chat/
├── apps/
│   ├── api/
│   ├── agent-workspace/
│   ├── customer-web/
│   ├── platform-admin/
│   └── tenant-admin/
├── docker/
├── docs/
├── packages/
├── tests/
├── package.json
└── pnpm-workspace.yaml
```

## 当前功能范围

基于现有目录与源码，项目当前主要覆盖以下能力：

- 多租户后端基础能力
- 渠道接入与 Webhook / Web Chat 消息入口
- 会话、消息、客户资料管理
- 路由引擎与 AI 编排相关模块
- 技能注册与内置技能
- 客服工作台与管理后台前端
- Redis / Qdrant / PostgreSQL 支撑的本地开发环境

如需了解更细的设计说明，可查看 [`docs/`](./docs) 下的文档；README 不再重复内部设计草稿。

## 环境要求

- Node.js >= 20
- pnpm >= 10
- Docker / Docker Compose

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp apps/api/.env.example apps/api/.env
```

默认开发环境变量示例位于 `apps/api/.env.example`。

### 3. 启动本地依赖

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

默认会启动以下服务：

- PostgreSQL: `localhost:5433`
- Redis: `localhost:6380`
- Qdrant: `localhost:6335`
- Adminer: `localhost:8081`

### 4. 执行数据库迁移

```bash
pnpm --filter @nuychat/api db:migrate
```

### 5. 启动开发服务

```bash
pnpm dev:api
pnpm --filter @nuychat/platform-admin dev
pnpm --filter @nuychat/tenant-admin dev
pnpm --filter @nuychat/agent-workspace dev
pnpm dev:customer-web
```

## 常用脚本

### 根目录

```bash
pnpm dev:api
pnpm dev:customer-web
pnpm build
pnpm test
```

### API

```bash
pnpm --filter @nuychat/api dev
pnpm --filter @nuychat/api db:migrate
pnpm --filter @nuychat/api db:rollback
pnpm --filter @nuychat/api test
```

## 目录说明

- `apps/api/src/modules`: 按业务域组织的后端模块
- `apps/api/src/workers`: 队列消费者与后台任务
- `apps/api/migrations`: 数据库迁移
- `packages`: 共享 SDK 与类型定义
- `tests/webchat`: Web Chat 相关测试脚本
- `docs`: 补充设计与实现文档

## License

见 [`LICENSE`](./LICENSE)。
