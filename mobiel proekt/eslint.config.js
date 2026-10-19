const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

const noUnkeyedTransaction = {
  selector: "CallExpression[callee.property.name='withExclusiveTransactionAsync']",
  message: "Use withProtectedExclusiveTransactionAsync from @/db/database."
};

module.exports = defineConfig([
  ...expoConfig,
  {
    ignores: ["node_modules/", ".expo/", "android/", "ios/", "dist/", "build/"]
  },
  {
    // Screens already moved to theme colours must not regress to fixed
    // light-theme hex values that become unreadable in dark mode.
    files: [
      "src/features/patrol/ActivePatrolScreen.tsx",
      "src/features/patrol/activePatrol/**/*.{ts,tsx}",
      "src/features/camera/CameraCaptureScreen.tsx",
      "src/features/syncQueue/SyncQueueScreen.tsx",
      "src/features/syncQueue/SyncQueueCards.tsx",
      "src/features/syncQueue/SyncQueueBanners.tsx",
      "src/features/syncQueue/syncQueuePresentation.ts",
      "src/features/syncQueue/syncQueueStyles.ts"
    ],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
        message: "Use colours from useAppTheme() instead of hex literals."
      }]
    }
  },
  {
    // expo-sqlite's own exclusive transaction opens a second connection without the
    // SQLCipher key, so it cannot read the encrypted database.
    files: ["src/db/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", noUnkeyedTransaction]
    }
  },
  {
    // Service writes race the sync transaction and must retry SQLITE_BUSY.
    files: [
      "src/db/repositories/filesRepository.ts",
      "src/db/repositories/outboxRepository.ts",
      "src/db/repositories/notificationRepository.ts",
      "src/db/repositories/logoutQueueRepository.ts"
    ],
    rules: {
      "no-restricted-syntax": ["error", noUnkeyedTransaction, {
        selector: "AwaitExpression > CallExpression[callee.object.name='db'][callee.property.name='runAsync']",
        message: "Wrap service writes in withSqliteBusyRetry(() => db.runAsync(...))."
      }]
    }
  }
]);
