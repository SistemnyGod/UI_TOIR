# Frontend e2e tests

Этот каталог зарезервирован под общие cross-app Playwright smoke tests.

Текущие app-specific Playwright tests для frontend находятся в `apps/web/e2e`, потому что они используют зависимости пакета `apps/web`.

Минимальный будущий набор:

1. Dashboard loads.
2. Switch Mock/API.
3. Navigate every screen.
4. Create request.
5. Create route and route point.
6. Open mobile account drawer.
7. Check request dirty-close confirm.
8. Verify browser console has no runtime errors.
