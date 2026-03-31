# Customer Web Embed

## 0. 本地配置文件（推荐）

在 `apps/customer-web` 下创建 `.env.local`（可从 `.env.example` 复制）：

```env
VITE_WEBCHAT_PUBLIC_KEY=demo-web
VITE_WEBCHAT_API_BASE=http://localhost:3001
```

- 不传 URL 参数时，会使用 `VITE_WEBCHAT_PUBLIC_KEY`。
- 传了 `?k=...` 时，URL 参数优先覆盖配置文件。

## 1. 嵌入代码

```html
<script src="http://localhost:3001/webchat.js"
        data-key="<publicChannelKey>"
        data-api-base="http://localhost:3001"
        data-app-base="http://localhost:5176"
        data-source="widget"
        data-app-id="b2c-site"></script>
```

## 2. 参数说明

- `data-key`: Web 渠道标识（`publicChannelKey`）
- `data-api-base`: API 地址（默认脚本同源）
- `data-app-base`: customer-web 地址（默认 `api-base` 的 5176）
- `data-source`: 来源标识（如 `widget` / `web` / `app`）
- `data-app-id`: 业务应用标识（如 `official-site` / `miniapp`）

## 3. 值从哪里看

进入 Tenant Admin:

- 菜单: `渠道配置`
- 区块: `WEB 渠道嵌入配置`

可以看到并复制:

- `Web 标识 (publicChannelKey)`
- `客户直连地址`
- `Widget 脚本地址`
- `嵌入代码`
