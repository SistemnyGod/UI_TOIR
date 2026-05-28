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
npm run typecheck
npm run lint
npm run start
```

## Сборка APK

Android/Expo tooling нестабильно работает, когда native Android-проект генерируется в пути с кириллицей или пробелами. Поэтому локальная сборка APK выполняется через скрипт, который создает временную ASCII-папку, запускает `expo prebuild`, применяет совместимый Gradle resolver и копирует APK обратно в `build-output`.

```powershell
npm run build:android:apk
```

Результат:

- `build-output/patrol360-mobile-release.apk`

Для отладочной сборки:

```powershell
npm run build:android:debug
```

Результат:

- `build-output/patrol360-mobile-debug.apk`
