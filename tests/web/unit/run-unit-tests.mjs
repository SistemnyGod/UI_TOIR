import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "../../..");
const failures = [];

function assertFile(relativePath) {
  const fullPath = resolve(repoRoot, relativePath);
  if (!existsSync(fullPath)) {
    failures.push(`Missing file: ${relativePath}`);
  }
}

function assertPackageScript(scriptName) {
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "apps/web/package.json"), "utf8"));
  if (!packageJson.scripts?.[scriptName]) {
    failures.push(`apps/web/package.json missing script: ${scriptName}`);
  }
}

[
  "apps/web/src/App.tsx",
  "apps/web/src/api/client.ts",
  "apps/web/src/api/contracts.ts",
  "apps/web/src/hooks/usePatrolDataSource.ts",
  "apps/web/src/repositories/patrolDataRepository.ts",
  "apps/web/src/repositories/routesRepository.ts",
  "apps/web/src/repositories/patrolRequestsRepository.ts",
  "apps/web/src/screens/DashboardScreen.tsx",
  "docs/frontend-improvement-plan.md",
].forEach(assertFile);

["typecheck", "build", "verify", "test", "test:run"].forEach(assertPackageScript);

if (failures.length > 0) {
  console.error("Frontend structural tests failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Frontend structural tests passed.");
