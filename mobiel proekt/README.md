# Мобильное приложение сотрудников

В этой папке расположен проект мобильного приложения Patrol360 для сотрудников обхода и учета работ.

Основное ТЗ: [`../docs/mobile-app-technical-requirements.md`](../docs/mobile-app-technical-requirements.md).

## Решения по проекту

- Проект мобильного приложения размещается отдельно от web/backend кода.
- Целевая платформа первого релиза: Android.
- Стек: React Native + Expo + TypeScript.
- Пилотное устройство: Kenshi Armor C1s.
- Первые маршруты пилота: `Обход печей`, `Помол`.
- Для NFC и production-проверок используется dev/release build, не Expo Go.

## Команды разработки

```powershell
npm install
npm run verify
npm run start
```

`verify` запускает mobile policy/contract tests, проверку кодировки, TypeScript и ESLint.

## Сборка APK

Android/Expo tooling нестабильно работает, когда native Android-проект генерируется в пути с кириллицей или пробелами. Поэтому локальная сборка APK выполняется через скрипт, который создает временную ASCII-папку, запускает `expo prebuild`, применяет совместимый Gradle resolver и копирует APK обратно в `build-output`.

Release-сборка требует явного контура и release-ключа. Рекомендуемый локальный запуск:

```powershell
$env:PATROL360_ENVIRONMENT = 'local-enterprise'
.\scripts\build-release-apk.ps1
```

Wrapper автоматически выбирает доступную DPAPI-копию существующего ключа и сверяет сертификат с публичным отпечатком из `release-signing.json`. Проверить ключ без сборки:

```powershell
.\scripts\build-release-apk.ps1 -ValidateOnly
```

Для существующего ключа создать резервную DPAPI-копию уровня компьютера:

```powershell
.\scripts\backup-release-signing.ps1
```

Signing metadata и JKS находятся в ignored-каталоге `secrets` и не коммитятся. `create-release-keystore.ps1` блокирует случайное создание нового сертификата, если сертификат приложения уже закреплён.

Результат:

- `build-output/patrol360-mobile-release.apk`

Для отладочной standalone-сборки:

```powershell
npm run build:android:debug
```

Результат:

- `build-output/patrol360-mobile-debug.apk`

Подробный порядок хранения, проверки и восстановления релизного ключа описан в [`../docs/mobile-release-signing.md`](../docs/mobile-release-signing.md).

После release-сборки скрипт выполняет zipalign, подписывает APK и проверяет подпись. Перед передачей зафиксируйте package/version, SHA-256 и certificate digest.
