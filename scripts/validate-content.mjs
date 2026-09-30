import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import formats from "ajv-formats";
import semver from "semver";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function relative(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 220 ||
    value.includes("\\") ||
    value
      .split("/")
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          /[. ]$/.test(p) ||
          /[<>:"|?*\x00-\x1f]/.test(p) ||
          /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p),
      )
  )
    throw Error("Unsafe path: " + value);
  return value;
}
export function resolveDependencies(manifest, ids) {
  const map = new Map(manifest.content.map((p) => [p.id, p]));
  const done = new Set(),
    visiting = new Set(),
    result = [];
  function visit(id) {
    if (done.has(id)) return;
    const p = map.get(id);
    if (!p) throw Error("Unknown dependency " + id);
    if (visiting.has(id)) throw Error("Dependency cycle " + id);
    visiting.add(id);
    for (const d of p.dependencies ?? []) {
      if (
        !map.has(d.id) ||
        !semver.valid(d.minimumVersion) ||
        semver.lt(map.get(d.id).version, d.minimumVersion)
      )
        throw Error("Unsatisfied dependency " + d.id);
      visit(d.id);
    }
    visiting.delete(id);
    done.add(id);
    result.push(p);
  }
  ids.forEach(visit);
  return result;
}
export function validate(
  manifest,
  championship,
  repository = "AdriaVesseur/EC3",
) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  formats(ajv);
  for (const [name, data] of [
    ["manifest", manifest],
    ["championship", championship],
  ]) {
    const check = ajv.compile(
      JSON.parse(
        fs.readFileSync(
          path.join(root, "content-repository", name + ".schema.json"),
          "utf8",
        ),
      ),
    );
    if (!check(data)) throw Error(ajv.errorsText(check.errors));
  }
  if (
    !semver.valid(manifest.build) ||
    !semver.valid(championship.minimumHelperVersion) ||
    manifest.build !== championship.build ||
    manifest.season !== championship.season
  )
    throw Error("Invalid or inconsistent championship version");
  const ids = new Set();
  for (const p of manifest.content) {
    if (
      ids.has(p.id) ||
      !semver.valid(p.version) ||
      (p.minimumCspVersion && !semver.valid(p.minimumCspVersion))
    )
      throw Error("Duplicate ID or invalid version");
    ids.add(p.id);
    if (!p.description || !Array.isArray(p.changelog))
      throw Error("Each package needs a description and changelog");
    const u = new URL(p.download);
    if (
      u.origin !== "https://github.com" ||
      u.username ||
      u.password ||
      !u.pathname.startsWith("/" + repository + "/releases/download/")
    )
      throw Error("Untrusted URL");
    if (p.download.includes("REPLACE-ME")) continue;
  }
  resolveDependencies(
    manifest,
    manifest.content.map((p) => p.id),
  );
  resolveDependencies(manifest, championship.requiredContent);
  const events = new Set();
  for (const e of championship.events) {
    if (events.has(e.id)) throw Error("Duplicate event");
    events.add(e.id);
    resolveDependencies(manifest, e.requiredContent);
  }
  return true;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dir = path.resolve(
    process.argv[2] ?? path.join(root, "content-repository"),
  );
  validate(
    JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"))),
    JSON.parse(fs.readFileSync(path.join(dir, "championship.json"))),
    process.env.EC3_CONTENT_REPOSITORY ?? "AdriaVesseur/EC3",
  );
  console.log("Catalog valid: schema, versions, package fields and release URLs.");
}
