import { readdir, readFile } from "node:fs/promises";
import { relative, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoots = ["src", "app", "tests", "scripts"].map(name => join(projectRoot, name));
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".ps1"]);
const suspiciousPatterns = [
  /(?:Р.|С.){3,}/u,
  /в(?:Ђ|„|™|љ)/u,
  /[\uFFFD]/u
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(path));
    } else if (extensions.has(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
}

const findings = [];
const files = [...(await Promise.all(sourceRoots.map(walk))).flat(), ...[
  "README.md", "app.config.js", "package.json", "tsconfig.json"
].map(name => join(projectRoot, name))];
for (const file of files) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(file));
  } catch {
    findings.push(`${relative(projectRoot, file)}: invalid UTF-8`);
    continue;
  }
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (suspiciousPatterns.some((pattern) => pattern.test(line))) {
      findings.push(`${relative(projectRoot, file)}:${index + 1}`);
    }
  }
}

if (findings.length > 0) {
  console.error("Suspicious mojibake/invalid UTF-8 sequences found:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Encoding check passed: ${files.length} source, route, test, script and config files checked.`);
