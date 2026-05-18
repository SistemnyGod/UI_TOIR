# Structure remaining work

Дата обновления: 18.05.2026

Текущая оценка структуры: 89%.

Этот документ фиксирует только то, что осталось доделать по структуре проекта. Детальная история уже находится в `docs/structure-improvement-plan.md`.

## Что уже закрыто

- Монорепо разложено по `apps`, `libs`, `docs`, `infra`, `tests`, `tools`, `legacy`.
- Backend слои разделены на `api`, `application`, `domain`, `contracts`, `infrastructure`.
- Frontend находится в `apps/web`, старый статический прототип вынесен в `legacy/territory-patrol-panel`.
- Git инициализирован локально, есть базовая история коммитов.
- CI workflow создан в `.github/workflows/ci.yml`.
- Локальный gate оформлен в `tools/Test-All.ps1`.
- Test artifacts публикуются в CI и не коммитятся.
- Branch/review policy описан в `docs/runbooks/branch-review-policy.md`.
- PR template создан в `.github/pull_request_template.md`.
- Скрипт branch protection подготовлен: `tools/Set-GitHubBranchProtection.ps1`.
- xUnit/Vitest/Playwright smoke tests подключены и частично расширены до scenario checks.

## Осталось до структуры 90%+

### P0: подключить удаленный GitHub repository

Сейчас `git remote -v` пустой, поэтому CI и branch protection нельзя проверить на реальном GitHub-хостинге.

Сделать:

- создать или выбрать GitHub repository;
- добавить remote:

```powershell
git remote add origin https://github.com/<owner>/<repo>.git
```

- запушить текущую ветку;
- убедиться, что GitHub Actions видит `.github/workflows/ci.yml`.

Критерии закрытия:

- `git remote -v` показывает `origin`;
- первый push прошел;
- workflow `CI` появился в GitHub Actions.

### P0: включить branch protection на GitHub

Локальный скрипт уже готов, но применить его можно только после настройки remote и авторизации GitHub CLI.

Сделать:

```powershell
gh auth login
.\tools\Set-GitHubBranchProtection.ps1 -Repository <owner>/<repo> -Branches main,master
```

Проверить в GitHub settings:

- pull request обязателен перед merge;
- минимум 1 approving review;
- required status check: `CI / verify`;
- conversation resolution включен;
- force push запрещен;
- branch deletion запрещен;
- squash merge используется как основной способ merge.

Критерии закрытия:

- protected branch rules активны;
- PR нельзя смержить без зеленого `CI / verify`;
- прямой push в protected branch заблокирован или ограничен.

### P1: прогнать CI на удаленном хостинге

Локальный `Test-All` проходит, но GitHub Actions еще не подтвержден.

Сделать:

- открыть тестовый PR;
- дождаться `CI / verify`;
- проверить artifact `test-results`;
- сверить, что локальный `.\tools\Test-All.ps1 -IncludeE2E` и GitHub Actions проверяют один и тот же контракт.

Критерии закрытия:

- GitHub Actions зеленый;
- `test-results` опубликован;
- расхождений между локальным gate и CI нет.

### P1: добавить DB-backed integration tests

Добавлен первый опциональный DB-backed smoke для Mobile Accounts через реальный PostgreSQL. Оставшийся риск: route/request/assignment lifecycle еще не покрыт DB integration профилем.

Сделать:

- готово: добавить профиль внутри `tests/Patrol360.Infrastructure.Tests` и switch `-IncludeDbIntegration`;
- добавить минимум один CRUD-сценарий маршрута через EF store;
- проверить создание заявки на обход и связанное назначение;
- принято: запускать через Docker PostgreSQL и временную test database;
- добавить инструкцию в `docs/runbooks/database-migrations.md` или отдельный runbook.

Критерии закрытия:

- Mobile Accounts integration smoke запускается воспроизводимо через `-IncludeDbIntegration`;
- `Test-All.ps1` умеет запускать DB profile через `-IncludeDbIntegration`;
- CI либо запускает их, либо документирует причину отложенного запуска.

### P1: расширить Playwright e2e до основных потоков

Сейчас Playwright проверяет загрузку shell/dashboard. Для структуры этого достаточно как smoke, но не как сценарное покрытие модулей.

Сделать:

- dashboard shell smoke оставить;
- добавить e2e для перехода между основными экранами;
- добавить route create/edit draft flow;
- добавить mobile account draft flow;
- добавить request modal flow;
- проверить, что e2e не зависит от случайного состояния localStorage.

Критерии закрытия:

- Playwright покрывает минимум 3 ключевых пользовательских потока;
- e2e стабильно проходит локально и в CI;
- test data изолирована от ручных данных разработчика.

### P2: добавить CODEOWNERS

Branch policy уже описывает code owners, но файл еще не создан.

Сделать:

- добавить `.github/CODEOWNERS`;
- назначить владельцев по зонам: backend, frontend, infra, docs;
- после этого повторно применить branch protection с `-RequireCodeOwnerReviews`.

Критерии закрытия:

- GitHub показывает required code owner review;
- изменения в `.github`, `tools`, `infra`, `libs/domain`, `apps/web` требуют ревью соответствующего владельца.

### P2: принять решение по legacy

Legacy уже отделен, но решение о долгосрочном хранении не принято.

Варианты:

- оставить как reference prototype до завершения frontend MVP;
- перенести полезные решения в docs/screenshots;
- удалить после подтверждения, что активный frontend все забрал.

Критерии закрытия:

- в `legacy/territory-patrol-panel/README.md` указан финальный срок или условие удаления;
- CI не затрагивает legacy;
- новые задачи не создаются поверх legacy-кода.

### P2: формализовать правило новых модулей

Нужно короткое правило, что добавляется вместе с новым модулем.

Сделать:

- добавить чеклист в `docs/monorepo-structure.md`;
- закрепить, что новый модуль требует API/application/domain/contracts/infrastructure/frontend/tests/docs только при фактической необходимости;
- добавить пример размещения файлов для нового модуля.

Критерии закрытия:

- новый разработчик понимает, куда класть код;
- PR template ссылается на этот чеклист;
- structural tests проверяют критичные части, которые можно проверить автоматически.

## Что можно отложить

- Полноценный deployment pipeline.
- Monitoring manifests.
- OpenAPI codegen как обязательный CI step.
- Отдельные performance/load tests.
- Автоматическое создание GitHub environments.

Эти пункты важны, но не блокируют структурную готовность 90%+.

## Ближайший порядок работ

1. Подключить GitHub remote и запушить текущую ветку.
2. Дождаться первого GitHub Actions run.
3. Применить branch protection.
4. Создать тестовый PR и проверить, что merge gate работает.
5. Расширить DB-backed integration tests на routes/requests/assignments.
6. Расширить Playwright e2e до 3 ключевых потоков.
7. Добавить CODEOWNERS.
8. Принять решение по legacy.

## Итоговый критерий структуры 90%+

Структуру можно считать закрытой на 90%+, когда:

- remote GitHub подключен;
- CI зеленый на GitHub;
- protected branch rules включены;
- PR без `CI / verify` нельзя смержить;
- test artifacts доступны в GitHub Actions;
- есть DB-backed integration smoke;
- есть несколько стабильных Playwright e2e flows;
- CODEOWNERS или эквивалентное правило ревью включено;
- legacy имеет зафиксированное решение по дальнейшей судьбе.
