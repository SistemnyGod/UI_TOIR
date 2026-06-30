# Inventory PPE backend contract hardening

Date: 2026-06-30

## Current contract matrix

Backend endpoints and services inspected:

- `apps/api/Controllers/InventoryController.cs`
- `libs/contracts/InventoryContracts.cs`
- `libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.Issue.cs`
- `libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.ReturnWriteOff.cs`
- `libs/infrastructure/Persistence/Inventory/EfInventoryExportService.Print.cs`
- `libs/infrastructure/Persistence/Entities/InventoryWorkflowEntities.cs`
- `libs/infrastructure/Persistence/Patrol360DbContext.cs`

Confirmed supported PPE line fields:

- `itemId`
- `warehouseId`
- `quantity`
- `unitPriceMinor`
- `status`
- `issuedAt`
- `dueAt`
- `comment`
- `printItemName`
- `normPoint`
- `issuePeriodText`
- `quantityText`
- `isSectionTitle`
- `brandModelArticle`

Confirmed behavior:

- Section rows are persisted through `isSectionTitle` / print item names ending with `:`.
- Section rows cannot be issued.
- Signature sheet filters to fact rows with signature statuses and excludes section rows.
- Personal card keeps normative rows and section rows.
- PPE issue no longer depends on stock validation; `ValidatePpeStatusStockTransition` is currently a no-op.
- `comment`, `brandModelArticle`, `issuedAt`, price and quantity are part of the existing API/DB contract.

Not supported as persisted backend fields:

- `issueMethod`
- `sizeText`
- `normKey`
- `normLineId`
- `positionNormId` on PPE card lines
- persisted `NormItemCatalogMapping`

Frontend-only behavior:

- Norm-to-catalog mapping is stored in browser localStorage via `ppeNormMapping.ts`.
- `issueMethod` and `sizeText` are used by web preview/UI but are not sent to the backend contract.

## No-migration hardening completed

DOCX/PDF print must not fail only because employee size/detail fields are empty. Empty employee details remain a UI/print-check warning, not a backend blocker.

The backend print pipeline still validates normative PPE line names, section rows, signature-row filtering and `brandModelArticle` separation.

## Migration proposal for the next stage

Create table `inventory.ppe_norm_catalog_mappings`:

- `id uuid primary key`
- `position_name varchar(240) not null`
- `norm_item_name varchar(600) not null`
- `print_item_name varchar(600) not null default ''`
- `norm_point varchar(240) not null default ''`
- `item_id uuid not null references inventory.items(id)`
- `brand_model_article varchar(600) not null default ''`
- `is_default boolean not null default false`
- `comment varchar(1200) not null default ''`
- `archived_at timestamptz null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Indexes:

- Unique active key on `position_name + norm_item_name + norm_point` where `archived_at is null`.
- Non-unique index on `item_id`.
- Non-unique index on `archived_at`.

Add PPE line fields in a separate migration:

- `issue_method varchar(40) not null default 'personal'`
- `size_text varchar(120) not null default ''`
- optional `norm_key varchar(1000) not null default ''`
- optional `position_norm_id uuid null references inventory.position_norms(id)`

Recommended API endpoints after migration approval:

- `GET /api/v1/inventory/ppe/norm-catalog-mappings`
- `POST /api/v1/inventory/ppe/norm-catalog-mappings`
- `PATCH /api/v1/inventory/ppe/norm-catalog-mappings/{id}`
- `PATCH /api/v1/inventory/ppe/norm-catalog-mappings/{id}/archive`
- `GET /api/v1/inventory/ppe/norm-catalog-mappings/by-norm`

Rules for the migration stage:

- Mapping must not create an issue fact.
- Issue facts must remain on PPE card lines.
- `brandModelArticle` must describe the issued catalog item and must not replace the normative name.
- Personal card must print norms; signature sheet must print actual issued rows only.
