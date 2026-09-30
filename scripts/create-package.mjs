import fs from "node:fs";
import path from "node:path";
import { zipSync } from "fflate";
import { hash } from "./fixtures.mjs";
import { relative } from "./validate-content.mjs";
const [source, output] = process.argv.slice(2);
if (!source || !output)
  throw Error(
    "Usage: node scripts/create-package.mjs <package-folder> <output.zip>",
  );
const root = path.resolve(source),
  entries = {},
  files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isSymbolicLink()) throw Error("Symlink rejected");
    if (e.isDirectory()) walk(full);
    else {
      const name = relative(path.relative(root, full).replaceAll("\\", "/"));
      const content = fs.readFileSync(full);
      entries[name] = content;
      files.push({ path: name, size: content.length, sha256: hash(content) });
    }
  }
}
walk(root);
const zip = zipSync(entries, { level: 6 });
fs.writeFileSync(output, zip);
fs.writeFileSync(
  output + ".metadata.json",
  JSON.stringify({ size: zip.length, sha256: hash(zip), files }, null, 2),
);
console.log("Created ZIP and file inventory: " + output + ".metadata.json");
