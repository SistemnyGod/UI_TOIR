# Backend implementation notes

> **Статус документа: исторический снимок первой persistence-итерации (май 2026).**
> Перечни endpoint-ов, таблиц, gaps и next steps ниже не отражают текущую полноту backend.
> Для актуального состояния используйте [README.md](./README.md), [architecture.md](./architecture.md), [modules.md](./modules.md) и код `apps/api/Controllers`.

Date: 2026-05-15
Last updated: 2026-05-18 after Mobile Accounts edit/block/unblock/detach/session/security endpoints and binding schema.

## Current backend slice

Backend is an ASP.NET Core API inside the modular monolith skeleton:

- `apps/api` - HTTP host and controllers.
- `libs/contracts` - DTO contracts exposed to frontend/mobile clients.
- `libs/application` - query/service interfaces.
- `libs/infrastructure` - EF Core/Npgsql persistence implementations.
- `apps/worker` - background worker host placeholder.

The current implementation uses PostgreSQL through EF Core and Npgsql. Database schema changes are versioned through checked-in EF Core migrations. Normal API startup does not mutate the database schema. Migrations and idempotent seeding run in the explicit `--migrate` mode; Docker Compose executes that mode as a one-shot `migrate` service before starting the API.

The initializer holds a PostgreSQL advisory lock scoped to the current database while migration and seeding run. This prevents concurrent deployment jobs from racing. A failed migrator blocks API startup instead of exposing a partially upgraded application.

## Persistence slice

Packages:

- `Npgsql.EntityFrameworkCore.PostgreSQL` 10.0.1
- `Microsoft.EntityFrameworkCore.Design` 10.0.4

Connection string key:

```json
{
  "ConnectionStrings": {
    "Patrol360": "Host=localhost;Port=5432;Database=patrol360;Username=patrol360;Password=patrol360_dev"
  }
}
```

Implemented EF tables:

- `routes`
- `route_points`
- `employees`
- `mobile_accounts`
- `mobile_account_employee_bindings`
- `mobile_account_sessions`
- `mobile_account_audit_events`
- `patrol_requests`
- `assignments`

Runtime services:

- `Patrol360DbContext` owns EF mapping.
- `EfPatrolStore` implements dashboard, route catalog, route CRUD, route point CRUD, employee directory, mobile account and patrol request application interfaces.
- `Patrol360DatabaseInitializer` applies EF migrations and then calls the development seeder.
- `Patrol360DbSeeder` seeds routes, points, employees, requests and assignments when the database is empty.
- `Patrol360DbContextFactory` provides design-time configuration for `dotnet ef`.

Checked-in migrations:

- `20260514190555_InitialPatrolCore` creates `routes`, `route_points`, `employees`, `patrol_requests`, and `assignments`.
- `20260514201028_RouteCatalogCrudFields` adds editable route and point catalog fields used by the frontend route editor.
- `20260514223719_MobileAccounts` adds `mobile_accounts` with login uniqueness and employee binding scope.
- `20260515024643_MobileAccountPasswordSecurity` replaces plaintext mobile passwords with `password_hash`, adds password reset state, and creates `mobile_account_audit_events`.
- `20260518155301_MobileAccountBindingsSessions` adds employee binding rows, mobile session rows, and the audit actor column.

Development compatibility:

- Local databases previously created by `EnsureCreatedAsync` did not have `__EFMigrationsHistory`.
- API startup detects that legacy schema and marks the initial migration as applied before calling `MigrateAsync`.
- This is only a transition path for the current development database; new environments should be created only through EF migrations.

## Implemented endpoints

Health:

- `GET /health/live`
- `GET /health/ready`

Dashboard:

- `GET /api/v1/dashboards/summary`
- `GET /api/v1/dashboards/active-patrols`

Routes and points:

- `GET /api/v1/routes`
- `GET /api/v1/routes/{id}`
- `POST /api/v1/routes`
- `PUT /api/v1/routes/{id}`
- `DELETE /api/v1/routes/{id}`
- `POST /api/v1/routes/{routeId}/points`
- `PUT /api/v1/routes/{routeId}/points/{pointId}`
- `PUT /api/v1/routes/{routeId}/points/{pointId}/order`
- `DELETE /api/v1/routes/{routeId}/points/{pointId}`

Employees:

- `GET /api/v1/employees`
- `GET /api/v1/employees/{id}`
- `POST /api/v1/employees`
- `PUT /api/v1/employees/{id}`
- `DELETE /api/v1/employees/{id}`

Patrol requests:

- `GET /api/v1/patrol-requests`
- `POST /api/v1/patrol-requests`

Mobile accounts:

- `GET /api/v1/mobile-accounts`
- `GET /api/v1/mobile-accounts/{id}`
- `POST /api/v1/mobile-accounts`
- `PUT /api/v1/mobile-accounts/{id}`
- `POST /api/v1/mobile-accounts/{id}/employees`
- `POST /api/v1/mobile-accounts/{id}/block`
- `POST /api/v1/mobile-accounts/{id}/unblock`
- `DELETE /api/v1/mobile-accounts/{id}/employees/{employeeId}`
- `GET /api/v1/mobile-accounts/{id}/sessions`
- `GET /api/v1/mobile-accounts/{id}/security-events`
- `POST /api/v1/mobile-accounts/{id}/reset-password`
- `DELETE /api/v1/mobile-accounts/{id}`

Backward-compatible aliases still exist for the earlier singular dashboard route:

- `GET /api/v1/dashboard/summary`
- `GET /api/v1/dashboard/active-assignments`

## Patrol request rules

`POST /api/v1/patrol-requests` is the first backend command flow for the UI scenario "заявка на проведение обхода".

Required fields:

- employee id or employee name;
- route id or route name;
- scheduled date.

Optional fields:

- scheduled time;
- notification text;
- description.

Current behavior:

- request date defaults on the frontend to the current day;
- request number is generated from `scheduledDate`, not server UTC time;
- successful request creates the linked assignment;
- created request returns status `Отправлена`;
- validation errors return `400 problem+json`.

## Route and NFC rule

The product rule is preserved: one NFC label can be reused across different routes. The backend must not add a global unique constraint for NFC labels.

Route points are ordered by `sequenceNo`. Reorder is implemented as a point command endpoint:

```text
PUT /api/v1/routes/{routeId}/points/{pointId}/order
```

## Frontend integration notes

The API host enables CORS for local Vite ports `5173`, `5174`, and `5175` on `localhost` and `127.0.0.1`.

The frontend has a source switch:

- `Mock` - local demo state and `localStorage` editing.
- `API` - PostgreSQL-backed API snapshot and command endpoints.

API mode now uses backend data for:

```text
GET /api/v1/dashboards/summary
GET /api/v1/dashboards/active-patrols
GET /api/v1/routes
GET /api/v1/employees
POST /api/v1/employees
PUT /api/v1/employees/{id}
DELETE /api/v1/employees/{id}
POST /api/v1/patrol-requests
POST /api/v1/routes
PUT /api/v1/routes/{id}
DELETE /api/v1/routes/{id}
POST /api/v1/routes/{routeId}/points
PUT /api/v1/routes/{routeId}/points/{pointId}
PUT /api/v1/routes/{routeId}/points/{pointId}/order
DELETE /api/v1/routes/{routeId}/points/{pointId}
GET /api/v1/mobile-accounts
POST /api/v1/mobile-accounts
PUT /api/v1/mobile-accounts/{id}
POST /api/v1/mobile-accounts/{id}/employees
POST /api/v1/mobile-accounts/{id}/block
POST /api/v1/mobile-accounts/{id}/unblock
DELETE /api/v1/mobile-accounts/{id}/employees/{employeeId}
GET /api/v1/mobile-accounts/{id}/sessions
GET /api/v1/mobile-accounts/{id}/security-events
POST /api/v1/mobile-accounts/{id}/reset-password
DELETE /api/v1/mobile-accounts/{id}
```

Important frontend rule: API mode should not mix `localStorage` route drafts or locally created active patrols into API lists. Mock mode remains local and is used for UI work without a running backend.

Employee directory integration:

- API mode renders the `employees` table from PostgreSQL through `GET /api/v1/employees`.
- The employee create/edit modal calls `POST /api/v1/employees` and `PUT /api/v1/employees/{id}`.
- Employee delete is currently a soft operational deactivate: `DELETE /api/v1/employees/{id}` sets employee status to `Офлайн` and removes the mobile-account flag instead of physically deleting the row.
- Mock mode keeps employee edits in `localStorage` under `patrol360.employees.v1`.

Mobile account integration:

- API mode renders the `mobile_accounts` table from PostgreSQL through `GET /api/v1/mobile-accounts`.
- Creating an account supports selected-employee access or all-employee access. A selected account keeps legacy display names in `bound_employees` and new relationships in `mobile_account_employee_bindings`.
- `POST /api/v1/mobile-accounts/{id}/employees` accepts `employeeId` first, keeps `employeeName` as a transition fallback, appends/reactivates a binding and syncs employee mobile flags.
- `PUT /api/v1/mobile-accounts/{id}` updates login, role and status with uniqueness/status validation.
- `POST /api/v1/mobile-accounts/{id}/block` and `/unblock` update account access state.
- `DELETE /api/v1/mobile-accounts/{id}/employees/{employeeId}` detaches an employee and moves the account to `Не привязан` when the last selected binding is removed.
- `GET /api/v1/mobile-accounts/{id}/sessions` and `/security-events` expose session and audit read models for the frontend panels.
- Mobile account passwords are stored only as `password_hash`; list/get endpoints return password state, not the secret.
- The frontend `MobileAccount` model now stores `passwordState` only. It does not keep a `password` field for account list/detail state.
- `POST /api/v1/mobile-accounts` and `POST /api/v1/mobile-accounts/{id}/reset-password` return a temporary password only once in the command response.
- Password create/reset writes `mobile_account_audit_events` records for audit and later security review.
- Next production hardening step: add the real mobile login endpoint, verify the hash there, force password change when `password_reset_required = true`, and replace the temporary `system` actor with authenticated actor/correlation id.

Mobile account backend gaps after the current frontend/API pass:

- Backend still needs real mobile auth/session write flow that creates/updates `mobile_account_sessions`.
- Audit events currently carry a default `system` actor until auth/RBAC lands.
- Frontend still needs to render live sessions/security events from the new endpoints.
- OpenAPI generation and generated frontend DTOs are not wired yet.

Local PostgreSQL startup:

```powershell
docker compose -f .\infra\docker\compose.yaml up -d postgres
dotnet run --project .\apps\api\Patrol360.Api.csproj
```

Migration commands:

```powershell
dotnet ef migrations add <Name> `
  --project .\libs\infrastructure\Patrol360.Infrastructure.csproj `
  --startup-project .\libs\infrastructure\Patrol360.Infrastructure.csproj `
  --context Patrol360DbContext `
  --output-dir Persistence\Migrations

dotnet ef database update `
  --project .\libs\infrastructure\Patrol360.Infrastructure.csproj `
  --startup-project .\libs\infrastructure\Patrol360.Infrastructure.csproj `
  --context Patrol360DbContext
```

## Next backend steps

1. Add integration tests for health, routes, route points, employees, patrol request creation and mobile account create/reset/delete against PostgreSQL.
2. Split `EfPatrolStore` into module-specific repositories/services before adding more mobile account, results and schedule commands.
3. Generate/OpenAPI-export API contracts for frontend DTO alignment and replace temporary manual TypeScript DTOs.
4. Add auth/RBAC and audit fields around write endpoints, including actor and correlation id.
5. Complete mobile account commands needed by the frontend: edit, block/unblock, detach employee, sessions and security events.
6. Add the next persistence slice: patrol result facts, issue facts, schedule rules/conflicts and file attachments.
