# C1-0 Baseline Assessment (Platform & Scale)

Date: 2026-03-10
Scope: Pre-implementation assessment for Phase C1 (Platform Admin + Tenant Lifecycle)

## 1. Baseline Snapshot

- Repo state: large in-progress workspace, not a clean baseline branch.
- Backend auth model already migrated to:
  - `identities`
  - `tenant_memberships`
  - `platform_admins`
  - `auth_sessions`
- Frontend status:
  - `platform-admin`: placeholder UI, no real API integration yet.
  - `tenant-admin` / `agent-workspace`: switched to bearer token + membership session model.
- Tenant-scoped route pattern is established:
  - JWT -> `req.auth`
  - tenant context from `tenant.middleware`
  - tenant transaction via `withTenantTransaction(...)`

## 2. What C1 Can Reuse Directly

- Identity and membership core tables from migration `007`.
- Session lifecycle infrastructure from migration `008` and auth session service.
- Existing JWT signing/verification stack and shared auth routes.
- Existing `tenant_plans` and `tenants` tables as C1 control-plane core.

## 3. Architecture Gaps Before C1 Functional Delivery

- No platform-level API module yet (missing `/api/platform/*` namespace).
- No platform-admin authentication path (platform role check not exposed as dedicated flow).
- No tenant lifecycle API:
  - create tenant
  - suspend/reactivate tenant
  - assign tenant admin membership
  - tenant-level quota and plan operations
- No audit trail table/service for control-plane actions.
- README schema/auth description is partially outdated vs current migrations.

## 4. Key Risks and Impact Areas

- Risk: mixing platform and tenant concerns in existing tenant routes.
  - Mitigation: strict namespace split:
    - tenant admin: `/api/admin/*`
    - platform admin: `/api/platform/*`
- Risk: platform endpoints accidentally entering tenant RLS context.
  - Mitigation: platform module must use direct `db` access for control-plane operations; only use `withTenantTransaction` for tenant data plane.
- Risk: membership ambiguity in multi-tenant identities.
  - Mitigation: all write paths require explicit `tenant_id` + `membership_id`; no implicit tenant by email.
- Risk: no auditability for privileged actions.
  - Mitigation: add `platform_audit_logs` in C1 early milestone.

## 5. C1-0 Decisions (Locked for C1 Start)

1. Control-plane API boundary is mandatory:
   - `/api/platform/auth/*`
   - `/api/platform/tenants/*`
   - `/api/platform/identities/*`
   - `/api/platform/memberships/*`
2. Platform role source of truth:
   - `platform_admins.identity_id` + `is_active = true`
3. Tenant lifecycle ownership:
   - Tenant creation and tenant-admin assignment are platform-only operations.
4. Old pre-membership account model is not supported.
5. C1 implementation must include audit logging for privileged operations.

## 6. Entry Criteria for C1-1 Implementation

- [x] Identity/membership/session model exists in DB.
- [x] Tenant-admin and agent apps use membership-based tokens.
- [x] Platform-admin app scaffold exists.
- [x] C1 API boundaries defined (see `docs/c1-platform-api-contract.md`).
- [ ] Platform module routes and guards implemented.
- [ ] Platform audit logging implemented.
