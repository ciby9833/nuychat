# C1 Platform API Contract (Draft v0)

Date: 2026-03-10
Status: Draft for C1-1 implementation

## 1. API Namespace and Auth Rules

- Platform namespace: `/api/platform/*`
- Tenant namespace remains: `/api/admin/*` and `/api/conversations/*`
- Platform APIs require:
  - Bearer access token
  - `token.type = "access"`
  - `platform_admins` membership active for token `sub` identity

## 2. Endpoints

## 2.1 Platform Auth

1. `POST /api/platform/auth/login`
- Body:
```json
{ "email": "ops@nuychat.com", "password": "..." }
```
- Response:
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": { "identityId": "...", "email": "...", "role": "platform_admin" }
}
```

2. `POST /api/platform/auth/refresh`
- Body:
```json
{ "refreshToken": "..." }
```
- Response: same token pair shape as login.

3. `POST /api/platform/auth/logout`
- Body:
```json
{ "allSessions": false }
```

## 2.2 Tenant Lifecycle

1. `GET /api/platform/tenants`
- Query: `status`, `page`, `limit`, `search`
- Response: paged tenant list with plan + quota summary.

2. `POST /api/platform/tenants`
- Body:
```json
{
  "name": "Acme",
  "slug": "acme",
  "planCode": "starter",
  "operatingMode": "ai_first"
}
```
- Behavior:
  - create tenant
  - create default ai config
  - create default tenant configs

3. `PATCH /api/platform/tenants/:tenantId`
- Body (partial):
```json
{
  "status": "active",
  "planCode": "pro",
  "operatingMode": "human_first"
}
```

4. `GET /api/platform/tenants/:tenantId`
- Returns tenant profile + membership summary + channel/config summary.

## 2.3 Identity & Membership Management

1. `POST /api/platform/identities`
- Body:
```json
{
  "email": "admin@acme.com",
  "password": "...",
  "status": "active"
}
```

2. `POST /api/platform/memberships`
- Body:
```json
{
  "tenantId": "...",
  "identityId": "...",
  "role": "admin",
  "isDefault": true
}
```
- Used for assigning tenant admin/agent membership from platform side.

3. `PATCH /api/platform/memberships/:membershipId`
- Body:
```json
{ "status": "inactive", "role": "admin", "isDefault": false }
```

## 3. Error Contract

- Validation error: `400`
- Unauthorized/invalid token: `401`
- Forbidden (not platform admin): `403`
- Not found: `404`
- Conflict (duplicate slug/email/membership): `409`

Error body:
```json
{ "error": "conflict", "message": "Tenant slug already exists" }
```

## 4. Audit Requirements (Mandatory)

Every privileged endpoint writes one audit event:

- actor identity id
- action key (for example `tenant.create`, `membership.assign`)
- target type/id
- request metadata (ip, user-agent)
- result status
- created at

Suggested table: `platform_audit_logs`.

## 5. Non-Goals in C1

- Billing settlement engine
- Marketplace transaction flow
- SAML/OIDC enterprise SSO integration
- Full RBAC policy editor
