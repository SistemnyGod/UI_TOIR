# Inventory Interface CSS Map

This map explains how to connect `docs/inventory-interface-style.css` to Patrol360 Inventory screens during migration.

## Connection Rule

Use `inventory-shell` as the root class for every migrated Inventory page. Each screen should also use `inventory-screen`.

```tsx
<main className="inventory-shell">
  <section className="inventory-screen">
    ...
  </section>
</main>
```

Do not reuse generic Patrol360 patrol classes for Inventory tables, modals, or KPI cards. Use the `inventory-*` classes from the CSS file to avoid cross-module layout regressions.

## Shared Classes

| Purpose | Classes |
| --- | --- |
| Screen root | `inventory-shell`, `inventory-screen` |
| Header | `inventory-screen__header`, `inventory-screen__title`, `inventory-screen__subtitle` |
| Panels/cards | `inventory-card`, `inventory-panel`, `inventory-dialog` |
| Toolbar | `inventory-toolbar` |
| Forms | `inventory-field`, `inventory-field_wide`, `inventory-input`, `inventory-select`, `inventory-textarea` |
| Buttons | `inventory-button`, `inventory-button_primary`, `inventory-button_danger`, `inventory-button_ghost` |
| KPI | `inventory-kpi-grid`, `inventory-kpi`, `inventory-kpi__icon` |
| Tables | `inventory-table-wrap`, `inventory-table` |
| Status | `inventory-badge`, `inventory-badge_success`, `inventory-badge_warning`, `inventory-badge_danger` |
| Dialogs | `inventory-dialog-backdrop`, `inventory-dialog` |

## State Classes

| State | Class | Use |
| --- | --- | --- |
| Loading block | `inventory-is-loading` | Initial screen/table load |
| Empty block | `inventory-is-empty` | No rows for current filters |
| Error block | `inventory-is-error` | API or validation error |
| Skeleton line/card | `inventory-skeleton` | Placeholder while refetching |
| Selected row/card | `inventory-is-selected` or `is-selected` | Active table row, selected card |
| Archived row/card | `inventory-is-archived` | Archived employee/item/document |
| Disabled element | `inventory-is-disabled` | Forbidden action or inactive field |
| Overdue item | `inventory-is-overdue` | Expired issue/PPE/custody item |
| Locked entity | `inventory-is-locked` | Closed custody act or immutable record |

## Module Map

### Overview / Home

Use for the main Inventory dashboard and “Сейчас на руках”.

| UI Part | Classes |
| --- | --- |
| Layout | `inventory-overview-grid` |
| On-hand card | `inventory-overview-onhand` |
| Search/category/sort filters | `inventory-overview-onhand__filters` |
| On-hand list | `inventory-overview-onhand__list`, `inventory-overview-onhand__item` |
| Lower priority latest operations | `inventory-overview-operations` |

### Employees

Use for employee directory, archive mode and professional detail modal.

| UI Part | Classes |
| --- | --- |
| Workspace | `inventory-employees-layout` |
| Archive mode wrapper | `inventory-employees-archive-mode` |
| Right inspector | `inventory-employee-inspector` |
| Detail modal body | `inventory-employee-detail` |
| Detail summary KPI row | `inventory-employee-detail__summary` |
| Detail sections | `inventory-employee-detail__section` |

Recommended state mapping:
- Archived employees: `inventory-is-archived`
- Selected employee row: `inventory-is-selected`
- Overdue employee PPE/custody summary: `inventory-is-overdue`

### Items / Catalog

Use for nomenclature, category rail and item inspector.

| UI Part | Classes |
| --- | --- |
| Workspace | `inventory-items-layout` |
| Left category rail | `inventory-category-rail` |
| Category button | `inventory-category-button` |
| Active category | `inventory-category-button_active` |
| Item detail card | `inventory-item-card` |

### Operations

Use for issue, return, write-off and stock movement workflows.

| UI Part | Classes |
| --- | --- |
| Workspace | `inventory-operations-grid` |
| Operation form | `inventory-operation-form` |
| Stock/quantity warning | `inventory-stock-warning` |

Recommended state mapping:
- Invalid quantity or insufficient stock: `inventory-is-error` plus `inventory-stock-warning`
- Confirmed operation row: `inventory-is-selected`

### Custody / Под запись

Use for custody records, acts, right panel and action grid.

| UI Part | Classes |
| --- | --- |
| Workspace | `inventory-custody-layout` |
| Record/category tabs | `inventory-custody-tabs` |
| Selected act panel | `inventory-custody-act-panel` |
| Actions | `inventory-custody-action-grid` |

Recommended state mapping:
- Closed act: `inventory-is-locked`
- Archived record: `inventory-is-archived`
- Lost/write-off action: `inventory-badge_danger`

### PPE / СИЗ

Use for PPE journal, right detail panel, issue wizard, sets and print preview.

| UI Part | Classes |
| --- | --- |
| Workspace | `inventory-ppe-layout` |
| KPI summary | `inventory-ppe-summary` |
| Issue wizard | `inventory-ppe-wizard` |
| Employee searchable combobox | `inventory-ppe-combobox`, `inventory-ppe-combobox__list` |
| Catalog selector | `inventory-ppe-catalog` |
| Category select | `inventory-ppe-category-select` |
| PPE set card | `inventory-ppe-set-card`, `inventory-ppe-set-card__meta` |

Recommended state mapping:
- PPE line overdue: `inventory-is-overdue`
- Archived PPE card: `inventory-is-archived`
- Selected PPE card: `inventory-is-selected`

### History

Use for global history and per-employee timeline.

| UI Part | Classes |
| --- | --- |
| Workspace | `inventory-history-layout` |
| People list | `inventory-history-person-list` |
| Person row | `inventory-history-person` |
| Active person row | `inventory-history-person_active` |

### Reports

Use for report selector, filters, preview, totals and exports.

| UI Part | Classes |
| --- | --- |
| Workspace | `inventory-reports-layout` |
| Report selector | `inventory-report-selector` |
| Preview area | `inventory-report-preview` |
| Totals row | `inventory-report-totals` |

Recommended state mapping:
- No report rows: `inventory-is-empty`
- Export error: `inventory-is-error`
- Report loading: `inventory-is-loading` or `inventory-skeleton`

### Users And Permissions

Use for Inventory user bridge/admin screen.

| UI Part | Classes |
| --- | --- |
| Workspace | `inventory-users-layout` |
| User card | `inventory-user-card` |
| Actions | `inventory-user-actions` |

Recommended state mapping:
- Disabled user: `inventory-is-disabled`
- Archived/deleted user: `inventory-is-archived`

### Settings And References

Use for references, norms, item sets and organization settings.

| UI Part | Classes |
| --- | --- |
| Workspace | `inventory-settings-layout` |
| Navigation | `inventory-settings-nav` |
| Navigation item | `inventory-settings-nav__item` |
| Active navigation item | `inventory-settings-nav__item_active` |
| Content workspace | `inventory-settings-workspace` |
| Two-column editor | `inventory-settings-two-columns` |

### System Log

Use for admin audit journal.

| UI Part | Classes |
| --- | --- |
| Root | `inventory-system-log` |
| Payload/details cell | `inventory-system-log__payload` |

Visibility rule:
- Only render this module when the current user has `canViewSystemLog`.

### Print

Use for PPE card, signature sheet, report preview and custody act printing.

| UI Part | Classes |
| --- | --- |
| Printable page | `inventory-print-page` |
| Printable table | `inventory-print-table` |
| Hidden in print | `inventory-no-print` |

Print rule:
- Sidebar, topbar, action buttons and filters should have `inventory-no-print`.

## Theme And Accessibility

Dark theme is activated by putting `data-theme="dark"` on an ancestor:

```tsx
<div data-theme="dark">
  <InventoryScreen />
</div>
```

Accessibility helpers:
- Keep real buttons as `<button>`, not clickable `<div>`.
- Use `inventory-sr-only` for screen-reader-only labels.
- Use `aria-disabled="true"` when an action is visible but unavailable.
- Keep selected rows marked with both visual class and semantic state where possible.

## Migration Order

1. Connect shared shell, toolbar, KPI, table and dialog classes.
2. Move `Inventory.Catalog` with `inventory-items-layout`.
3. Move `Inventory.Stock/Operations` with `inventory-operations-grid`.
4. Move `Custody` and `PPE` after their API parity checks.
5. Move `Reports`, `History`, `Users`, `Settings` after permission checks.
