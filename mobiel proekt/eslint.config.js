const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

const noUnkeyedTransaction = {
  selector: "CallExpression[callee.property.name='withExclusiveTransactionAsync']",
  message: "Use withProtectedExclusiveTransactionAsync from @/db/database."
};

const colorLiteralMessage = "Use theme colours (useAppTheme()/useThemedStyles()) or a named colour from src/ui/brandPalette.ts.";
// A whole-string hex colour, or anything that starts like rgb()/rgba()/hsl()/hsla().
const colorLiteralPattern = String.raw`/^\s*(#[0-9a-fA-F]{3,8}\s*$|rgba?\(|hsla?\()/`;
const noColorLiterals = [
  { selector: `Literal[value=${colorLiteralPattern}]`, message: colorLiteralMessage },
  { selector: `TemplateElement[value.raw=${colorLiteralPattern}]`, message: colorLiteralMessage }
];

module.exports = defineConfig([
  ...expoConfig,
  {
    ignores: ["node_modules/", ".expo/", "android/", "ios/", "dist/", "build/"]
  },
  {
    // Colours come from the theme (useAppTheme()/useThemedStyles()) so light and dark never drift.
    // Fixed brand and illustration colours live in the palette modules listed in `ignores`.
    files: ["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    ignores: ["src/ui/atomTheme.ts", "src/ui/GradientFill.tsx", "src/ui/brandPalette.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...noColorLiterals]
    }
  },
  {
    // expo-sqlite's own exclusive transaction opens a second connection without the
    // SQLCipher key, so it cannot read the encrypted database.
    files: ["src/db/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...noColorLiterals, noUnkeyedTransaction]
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
      "no-restricted-syntax": ["error", ...noColorLiterals, noUnkeyedTransaction, {
        selector: "AwaitExpression > CallExpression[callee.object.name='db'][callee.property.name='runAsync']",
        message: "Wrap service writes in withSqliteBusyRetry(() => db.runAsync(...))."
      }]
    }
  }
]);
