import { readdir, readFile } from "node:fs/promises";
import { relative, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = join(projectRoot, "src");
const extensions = new Set([".ts", ".tsx"]);
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
for (const file of await walk(sourceRoot)) {
  const text = await readFile(file, "utf8");
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

console.log("Encoding check passed: no suspicious mojibake sequences found.");