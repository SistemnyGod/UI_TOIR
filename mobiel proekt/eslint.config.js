const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

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
      "src/features/camera/CameraCaptureScreen.tsx",
      "src/features/syncQueue/SyncQueueScreen.tsx"
    ],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
        message: "Use colours from useAppTheme() instead of hex literals."
      }]
    }
  }
]);
