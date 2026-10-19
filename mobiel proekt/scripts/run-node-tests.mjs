import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Every tests/*.test.ts that is not a Vitest file runs under node:test, so new files cannot silently
// fall out of `npm run verify`. Vitest picks up *.vitest.test.ts on its own (see vitest.config.ts).
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const testFiles = readdirSync(join(projectRoot, "tests"))
  .filter(name => name.endsWith(".test.ts") && !name.endsWith(".vitest.test.ts"))
  .sort()
  .map(name => join("tests", name));

if (testFiles.length === 0) {
  console.error("No node:test files found in tests/.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  ["--test", "--experimental-strip-types", ...process.argv.slice(2), ...testFiles],
  { cwd: projectRoot, stdio: "inherit" }
);
process.exit(result.status ?? 1);
