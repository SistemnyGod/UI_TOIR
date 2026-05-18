# ADR 0003: Frontend data-source boundaries

Дата: 18.05.2026

## Статус

Принято.

## Контекст

Frontend имеет режимы `Mock` и `API`, но часть экранов пока смешивает API snapshot, fallback data и `localStorage`. Это полезно для прототипирования, но опасно для production: пользователь может видеть локальные данные как будто они пришли с сервера.

## Решение

Разделить источники данных на уровне repositories:

- `api` - данные и mutations идут через backend;
- `mock` - демонстрационные fixtures для UI-разработки;
- `localDraft` - локальные черновики, которые явно не являются server state.

Правила:

- API repository не пишет в `localStorage`;
- mock repository не мутирует production state;
- local draft данные явно маркируются в UI;
- DTO mapping живет рядом с repository/API client, а не в JSX;
- fallback arrays нельзя использовать как незаметную замену недоступного backend в API mode.

## Последствия

Плюсы:

- меньше риска ложной синхронизации;
- проще тестировать API и mock flows отдельно;
- проще подключать typed/generated API client.

Минусы:

- придется довести несколько существующих fallback-only repositories до полноценного контракта;
- screen hooks станут обязательной частью архитектуры frontend.

## Проверка

Доработки описаны в `docs/frontend-improvement-plan.md`. Структурные smoke checks frontend находятся в `tests/web/unit`.
