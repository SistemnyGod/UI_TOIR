# Patrol Web Structure

Дата: 2026-06-25

## Целевая структура

```text
apps/web/src/features/patrol/
  AssignmentScreen.tsx
  ResultsScreen.tsx
  assignments/
    AssignmentStatusBadge.tsx
    assignmentTypes.ts
    assignmentUtils.ts
  components/
    assignments/
    requests/
    results/
    routes/
    schedule/
```

## Правила

- `AssignmentScreen.tsx` и `ResultsScreen.tsx` остаются route-level контейнерами.
- Доменная логика статусов и фильтров уходит в feature-local `assignments/*` и `results/*`.
- Общие UI-примитивы можно выносить только в `shared/ui`, если они не знают про Patrol domain.
- Compatibility exports в `apps/web/src/screens/*` не удаляются без проверки `rg`.
- Новые Patrol-компоненты не добавляются в старый `apps/web/src/components`.

## Выполнено в текущем проходе

- `AssignmentStatusBadge.tsx` вынесен из `AssignmentScreen.tsx`.
- `assignmentUtils.ts` содержит статусные helper-ы и `shouldCreateAssignmentAfterRequest`.
- Старый экспорт `shouldCreateAssignmentAfterRequest` сохранен через `AssignmentScreen.tsx`.

## Следующий безопасный шаг

Разделить `AssignmentScreen.tsx` на `AssignmentWorkspace`, `EmployeePickerPanel`, `RoutePickerPanel`, `AssignmentHistoryPanel`, `ActiveAssignmentsPanel` без изменения пропсов внешнего экрана.

