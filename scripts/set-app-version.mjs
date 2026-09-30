import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";

const version = process.argv[2];
if (!version || semver.valid(version) !== version || semver.prerelease(version))
  throw new Error(
    "Provide a stable semantic version, for example: node scripts/set-app-version.mjs 1.3.1",
  );
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const edits = new Map();
for (const name of ["package.json", "package-lock.json"]) {
  const json = JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
  json.version = version;
  if (json.packages?.[""]) json.packages[""].version = version;
  edits.set(name, JSON.stringify(json, null, 2) + "\n");
}
for (const [name, pattern, replacement] of [
  [
    "helper/Program.cs",
    /public const string Version = "[^"]+";/,
    `public const string Version = "${version}";`,
  ],
  [
    "helper/Eurocup3.Helper.csproj",
    /<Version>[^<]+<\/Version>/,
    `<Version>${version}</Version>`,
  ],
  ["installer/Eurocup3.iss", /^AppVersion=.+$/m, `AppVersion=${version}`],
]) {
  const text = fs.readFileSync(path.join(root, name), "utf8");
  if (!pattern.test(text))
    throw new Error(`Cannot find the application version in ${name}`);
  edits.set(name, text.replace(pattern, replacement));
}
// Validate all sources before writing any file.
for (const [name, text] of edits) fs.writeFileSync(path.join(root, name), text);
console.log(
  `Application version set to ${version}. Content package versions are unchanged.`,
);
