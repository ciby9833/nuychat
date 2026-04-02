# NuyChat 服务器部署文档

本文档描述当前项目在服务器上的部署方式、关键文件位置、改动生效方式，以及后续版本更新流程。

## 1. 当前部署架构

当前采用单机部署，包含以下组件：

- `nginx`
- `platform-admin` 前端
- `tenant-admin` 前端
- `agent-workspace` 前端
- `customer-web` 前端
- `api` 后端服务
- `PostgreSQL`
- `Redis`
- `Qdrant`

域名规划如下：

- 平台管理：`platformchat.jtcargo.co.id`
- 租户管理：`adminchat.jtcargo.co.id`
- 座席工作台：`agentchat.jtcargo.co.id`
- API：`apichat.jtcargo.co.id`
- 客户 Web：`webchat.jtcargo.co.id`

## 2. 服务器目录说明

服务器部署根目录：

- `/srv/nuychat`

项目代码目录：

- `/srv/nuychat/nuyess-chat`

环境变量目录：

- `/srv/nuychat/env`

前端静态发布目录：

- `/srv/nuychat/www/platform-admin`
- `/srv/nuychat/www/tenant-admin`
- `/srv/nuychat/www/agent-workspace`
- `/srv/nuychat/www/customer-web`

业务数据目录：

- `/srv/nuychat/data/uploads`

Qdrant 数据目录：

- `/srv/qdrant/storage`

## 3. 项目内关键文件说明

### 3.1 API 环境变量

服务器运行时实际使用：

- `/srv/nuychat/env/nuychat-api.env`

作用：

- 控制 API 服务连接数据库、Redis、Qdrant
- 控制 API 对外域名
- 控制 CORS、JWT、加密密钥、第三方接入参数

当前常用字段包括：

- `NODE_ENV`
- `HOST`
- `PORT`
- `DATABASE_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `QDRANT_URL`
- `JWT_SECRET`
- `ENCRYPTION_SECRET`
- `API_PUBLIC_BASE`
- `WEBCHAT_APP_BASE`
- `CORS_ORIGIN`
- `META_*`
- `OPENAI_API_KEY`

### 3.2 前端构建环境变量

前端使用构建时环境变量，不是运行时读取。

文件位置：

- `/srv/nuychat/nuyess-chat/apps/platform-admin/.env.production`
- `/srv/nuychat/nuyess-chat/apps/tenant-admin/.env.production`
- `/srv/nuychat/nuyess-chat/apps/agent-workspace/.env.production`
- `/srv/nuychat/nuyess-chat/apps/customer-web/.env.production`

作用：

- 指定前端构建时写入的 API 地址
- `customer-web` 额外需要 `VITE_WEBCHAT_PUBLIC_KEY`

### 3.3 systemd 文件

仓库内模板：

- `/srv/nuychat/nuyess-chat/deploy/systemd/nuychat-api.service`

服务器实际使用：

- `/etc/systemd/system/nuychat-api.service`

作用：

- 用 systemd 拉起 API
- 指定工作目录和环境变量文件

### 3.4 nginx 配置

服务器当前建议配置文件：

- `/etc/nginx/sites-available/nuychat.conf`

启用链接：

- `/etc/nginx/sites-enabled/nuychat.conf`

作用：

- `apichat.jtcargo.co.id` 反代到 `127.0.0.1:3001`
- 4 个前端子域名分别托管 4 份静态文件

### 3.5 数据库迁移

迁移目录：

- `/srv/nuychat/nuyess-chat/apps/api/migrations`

当前已移出执行集合的历史补丁迁移：

- `/srv/nuychat/nuyess-chat/apps/api/migrations/skipped`

说明：

- `skipped` 目录中的文件是历史补丁/回填迁移
- 它们不适合新库从 0 初始化时执行
- 新环境初始化时不应再移回 `migrations` 根目录

## 4. 当前部署使用的主要命令

### 4.0 自动化脚本

仓库内脚本目录：

- `/srv/nuychat/nuyess-chat/deploy/scripts`

脚本说明：

- `lib.sh`
  - 公共变量和函数
- `publish-static.sh`
  - 发布 4 个前端 `dist` 到 `/srv/nuychat/www/...`
- `restart-api.sh`
  - 重启 `nuychat-api`
- `deploy.sh`
  - 拉取指定分支或提交、安装依赖、跑迁移、构建、发布静态资源、重启 API
- `rollback.sh`
  - 回滚到指定 release 或指定 commit，并重新构建发布

首次使用前：

```bash
chmod +x /srv/nuychat/nuyess-chat/deploy/scripts/*.sh
```

常用命令：

```bash
/srv/nuychat/nuyess-chat/deploy/scripts/deploy.sh
/srv/nuychat/nuyess-chat/deploy/scripts/deploy.sh main
/srv/nuychat/nuyess-chat/deploy/scripts/publish-static.sh
/srv/nuychat/nuyess-chat/deploy/scripts/restart-api.sh
```

查看最近一次发布：

```bash
ls -l /srv/nuychat/releases
cat /srv/nuychat/releases/latest/manifest.env
```

回滚代码和静态资源：

```bash
/srv/nuychat/nuyess-chat/deploy/scripts/rollback.sh <release-id>
```

或回滚到指定提交：

```bash
/srv/nuychat/nuyess-chat/deploy/scripts/rollback.sh <commit>
```

如需同时执行数据库回滚，必须显式指定步数：

```bash
DB_ROLLBACK_STEPS=1 /srv/nuychat/nuyess-chat/deploy/scripts/rollback.sh <release-id>
```

说明：

- 默认不自动执行数据库回滚
- 数据库回滚有破坏性，只有在明确知道迁移影响范围时才使用

### 4.1 安装依赖

在项目根目录执行：

```bash
cd /srv/nuychat/nuyess-chat
pnpm install
```

### 4.2 数据库迁移

```bash
cd /srv/nuychat/nuyess-chat
pnpm --filter @nuychat/api db:migrate
```

### 4.3 构建项目

```bash
cd /srv/nuychat/nuyess-chat
pnpm build
```

### 4.4 发布前端静态文件

```bash
mkdir -p /srv/nuychat/www/platform-admin
mkdir -p /srv/nuychat/www/tenant-admin
mkdir -p /srv/nuychat/www/agent-workspace
mkdir -p /srv/nuychat/www/customer-web

rm -rf /srv/nuychat/www/platform-admin/*
rm -rf /srv/nuychat/www/tenant-admin/*
rm -rf /srv/nuychat/www/agent-workspace/*
rm -rf /srv/nuychat/www/customer-web/*

cp -r /srv/nuychat/nuyess-chat/apps/platform-admin/dist/* /srv/nuychat/www/platform-admin/
cp -r /srv/nuychat/nuyess-chat/apps/tenant-admin/dist/* /srv/nuychat/www/tenant-admin/
cp -r /srv/nuychat/nuyess-chat/apps/agent-workspace/dist/* /srv/nuychat/www/agent-workspace/
cp -r /srv/nuychat/nuyess-chat/apps/customer-web/dist/* /srv/nuychat/www/customer-web/
```

### 4.5 重启 API

```bash
systemctl restart nuychat-api
systemctl status nuychat-api --no-pager
journalctl -u nuychat-api -n 100 --no-pager
```

### 4.6 重载 nginx

```bash
nginx -t
systemctl reload nginx
```

## 5. 文件改动后如何生效

### 5.1 改 API 环境变量

改动文件：

- `/srv/nuychat/env/nuychat-api.env`

生效方式：

```bash
systemctl restart nuychat-api
```

说明：

- 只改这个文件，不需要重建前端

### 5.2 改前端环境变量

改动文件：

- `/srv/nuychat/nuyess-chat/apps/platform-admin/.env.production`
- `/srv/nuychat/nuyess-chat/apps/tenant-admin/.env.production`
- `/srv/nuychat/nuyess-chat/apps/agent-workspace/.env.production`
- `/srv/nuychat/nuyess-chat/apps/customer-web/.env.production`

生效方式：

```bash
cd /srv/nuychat/nuyess-chat
pnpm build
```

然后重新发布静态文件：

```bash
rm -rf /srv/nuychat/www/platform-admin/*
rm -rf /srv/nuychat/www/tenant-admin/*
rm -rf /srv/nuychat/www/agent-workspace/*
rm -rf /srv/nuychat/www/customer-web/*

cp -r /srv/nuychat/nuyess-chat/apps/platform-admin/dist/* /srv/nuychat/www/platform-admin/
cp -r /srv/nuychat/nuyess-chat/apps/tenant-admin/dist/* /srv/nuychat/www/tenant-admin/
cp -r /srv/nuychat/nuyess-chat/apps/agent-workspace/dist/* /srv/nuychat/www/agent-workspace/
cp -r /srv/nuychat/nuyess-chat/apps/customer-web/dist/* /srv/nuychat/www/customer-web/
```

说明：

- 前端环境变量是构建时注入的
- 改完 `.env.production` 必须重新 `build`

### 5.3 改 API 代码

生效方式：

```bash
cd /srv/nuychat/nuyess-chat
pnpm build
systemctl restart nuychat-api
```

### 5.4 改前端代码

生效方式：

```bash
cd /srv/nuychat/nuyess-chat
pnpm build
```

然后重新复制 `dist` 到 `/srv/nuychat/www/...`

### 5.5 改 nginx 配置

改动文件：

- `/etc/nginx/sites-available/nuychat.conf`

生效方式：

```bash
nginx -t
systemctl reload nginx
```

## 6. 首次初始化或新服务器部署流程

### 6.1 拉代码

```bash
cd /srv/nuychat
git clone git@github.com:ciby9833/nuychat.git nuyess-chat
cd /srv/nuychat/nuyess-chat
```

### 6.2 安装依赖

```bash
pnpm install
```

### 6.3 配 API 环境变量

编辑：

- `/srv/nuychat/env/nuychat-api.env`

### 6.4 配前端构建环境变量

编辑：

- `apps/platform-admin/.env.production`
- `apps/tenant-admin/.env.production`
- `apps/agent-workspace/.env.production`
- `apps/customer-web/.env.production`

### 6.5 初始化数据库

数据库创建后，先执行扩展：

```bash
sudo -u postgres psql -d nuychat <<'SQL'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
SQL
```

然后跑迁移：

```bash
cd /srv/nuychat/nuyess-chat
pnpm --filter @nuychat/api db:migrate
```

### 6.6 构建并发布

```bash
cd /srv/nuychat/nuyess-chat
pnpm build
```

然后拷贝静态文件到 `/srv/nuychat/www/...`

### 6.7 启动 API

```bash
cp /srv/nuychat/nuyess-chat/deploy/systemd/nuychat-api.service /etc/systemd/system/nuychat-api.service
systemctl daemon-reload
systemctl enable --now nuychat-api
```

### 6.8 配 nginx

编辑：

- `/etc/nginx/sites-available/nuychat.conf`

启用：

```bash
ln -sf /etc/nginx/sites-available/nuychat.conf /etc/nginx/sites-enabled/nuychat.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

## 7. 后续项目发布更新流程

### 7.1 拉最新代码

```bash
cd /srv/nuychat/nuyess-chat
git pull origin $(git branch --show-current)
```

### 7.2 安装新依赖

```bash
pnpm install
```

### 7.3 如有数据库变更，先跑迁移

```bash
pnpm --filter @nuychat/api db:migrate
```

### 7.4 构建项目

```bash
pnpm build
```

### 7.5 发布前端静态文件

把新的 `dist` 拷贝到：

- `/srv/nuychat/www/platform-admin`
- `/srv/nuychat/www/tenant-admin`
- `/srv/nuychat/www/agent-workspace`
- `/srv/nuychat/www/customer-web`

### 7.6 重启 API

```bash
systemctl restart nuychat-api
```

### 7.7 如改了 nginx，再 reload

```bash
nginx -t
systemctl reload nginx
```

## 8. 常用检查命令

### 8.1 API 健康检查

```bash
curl http://127.0.0.1:3001/health
```

### 8.2 systemd 日志

```bash
journalctl -u nuychat-api -n 100 --no-pager
```

### 8.3 nginx 状态

```bash
systemctl status nginx --no-pager
```

### 8.4 API 状态

```bash
systemctl status nuychat-api --no-pager
```

### 8.5 数据库连接检查

```bash
sudo -u postgres psql -d nuychat -c "\dt"
```

## 9. 当前已知注意事项

- `customer-web` 的 `VITE_WEBCHAT_PUBLIC_KEY` 必须换成真实 `publicChannelKey` 后再构建
- API 环境变量里 `META_*`、`OPENAI_API_KEY` 等按实际功能启用情况配置
- 历史补丁迁移已移到 `apps/api/migrations/skipped`，新库初始化时不要移回
- 前端变量改动后必须重新构建并重新复制 `dist`
- API 环境变量改动后必须重启 `nuychat-api`
