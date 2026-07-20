# Branch and review policy

## Цель

Правила веток и ревью защищают структуру monorepo: изменения проходят через pull request, обязательный CI gate и осознанное ревью затронутых слоев.

## Защищенные ветки

Защищенные ветки:

- `main`
- `master`, пока репозиторий не мигрирован на единую основную ветку

Рекомендуемые настройки GitHub branch protection:

- require a pull request before merging;
- require at least 1 approving review;
- require review from code owners после настройки владельцев;
- require conversation resolution before merge;
- require status checks `CI / verify` и `CI / PostgreSQL integration`;
- require branches to be up to date before merging;
- block force pushes;
- block branch deletion;
- prefer squash merge for feature branches.

## Имена веток

Формат:

```text
<type>/<area>-<short-description>
```

Разрешенные `type`:

- `feature` - новая функциональность;
- `fix` - исправление дефекта;
- `chore` - обслуживание репозитория;
- `docs` - документация;
- `test` - тесты;
- `infra` - инфраструктура, CI/CD, docker;
- `refactor` - изменение структуры без изменения поведения.

Примеры:

```text
feature/frontend-route-editor
fix/api-health-ready
chore/ci-test-artifacts
docs/branch-review-policy
```

## Pull request policy

Один PR должен иметь понятную границу:

- одна feature, fix или структурная доработка;
- связанные backend/frontend/docs изменения допустимы, если они нужны одному сценарию;
- unrelated refactor не смешивается с feature/fix;
- generated artifacts не коммитятся.

PR должен содержать:

- краткое описание изменений;
- список проверок;
- влияние на БД, API, frontend, infra или legacy;
- ссылки на обновленные docs/ADR, если изменились архитектурные правила.

## Review policy

Минимум 1 approval обязателен для любого PR.

Требуется повышенное внимание, если PR затрагивает:

- `libs/domain` или `libs/application` - проверить инварианты и слой зависимостей;
- `libs/infrastructure` или `infra` - проверить настройки, миграции, secrets и rollback;
- `apps/api` или `libs/contracts` - проверить совместимость API;
- `apps/web` - проверить UX smoke, состояние mock/API и e2e;
- `.github/workflows`, `tools`, `tests/Patrol360.Structure.Tests` - проверить, что локальный gate и CI не расходятся;
- `docs/adr` - проверить, что решение действительно архитектурное и не противоречит текущим ADR.

## Merge policy

Перед merge:

- `CI / verify` и `CI / PostgreSQL integration` зеленые;
- все review comments закрыты;
- PR checklist заполнен;
- branch синхронизирована с protected branch, если GitHub требует up-to-date branch;
- `.\tools\Clean-Workspace.ps1` не оставляет новых tracked artifacts.

Рекомендуемый merge method: squash merge.

## Применение через GitHub CLI

В текущей рабочей папке remote может быть еще не настроен. После публикации репозитория в GitHub:

```powershell
git remote add origin https://github.com/<owner>/<repo>.git
gh auth login
.\tools\Set-GitHubBranchProtection.ps1 -Repository <owner>/<repo> -Branches main,master
```

Если `CODEOWNERS` еще не настроен, не включайте `-RequireCodeOwnerReviews`. После появления владельцев кода повторите команду:

```powershell
.\tools\Set-GitHubBranchProtection.ps1 -Repository <owner>/<repo> -Branches main -RequireCodeOwnerReviews
```

## Исключения

Прямой commit в protected branch допустим только для аварийного исправления, когда PR flow блокирует восстановление системы. После такого commit нужно создать follow-up PR с описанием причины и проверок.
