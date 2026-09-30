import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { validate } from "./validate-content.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function registerRelease(manifest, championship, options) {
  const {
    id,
    name,
    type,
    version,
    installPath,
    download,
    metadata,
    description,
  } = options;
  if (
    !id ||
    !name ||
    !type ||
    !version ||
    !installPath ||
    !download ||
    !metadata
  )
    throw Error("Missing required package details or metadata.");
  if (!metadata.size || !metadata.sha256 || !metadata.files?.length)
    throw Error(
      "Metadata must include ZIP size, SHA256 and a non-empty files list.",
    );

  const existing = manifest.content.find((p) => p.id === id);
  const entry = {
    id,
    name,
    type,
    version,
    download,
    size: metadata.size,
    sha256: metadata.sha256,
    installPath,
    required: options.required ?? existing?.required ?? false,
    description: description ?? existing?.description ?? "",
    changelog: options.changelog
      ? [options.changelog]
      : (existing?.changelog ?? [`Release ${version}`]),
    files: metadata.files,
    dependencies: existing?.dependencies ?? [],
  };
  if (existing?.minimumCspVersion)
    entry.minimumCspVersion = existing.minimumCspVersion;

  const index = manifest.content.findIndex((p) => p.id === id);
  if (index < 0) manifest.content.push(entry);
  else manifest.content[index] = entry;

  const nextBuild = semver.inc(manifest.build, "patch");
  if (!nextBuild) throw Error("Could not increment the catalog build version.");
  manifest.build = nextBuild;
  championship.build = nextBuild;
  validate(manifest, championship);
  return { entry, build: nextBuild };
}

export async function verifyReleaseAsset(
  download,
  metadata,
  fetchImpl = fetch,
) {
  const url = new URL(download);
  const repository = process.env.EC3_CONTENT_REPOSITORY ?? "AdriaVesseur/EC3";
  if (
    url.origin !== "https://github.com" ||
    url.username ||
    url.password ||
    !url.pathname.startsWith(`/${repository}/releases/download/`)
  )
    throw Error(
      "The download link must be a direct asset in an EC3 GitHub Release.",
    );

  const response = await fetchImpl(download, {
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  if (!response.ok || !response.body)
    throw Error(
      `Could not download the release asset (HTTP ${response.status}).`,
    );

  const digest = createHash("sha256");
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    digest.update(chunk);
  }
  if (size !== metadata.size || digest.digest("hex") !== metadata.sha256)
    throw Error(
      "The release ZIP does not match the supplied .metadata.json file.",
    );
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === "--required") {
      if (options.required === false)
        throw Error("Choose only one of --required or --optional.");
      options.required = true;
      continue;
    }
    if (key === "--optional") {
      if (options.required === true)
        throw Error("Choose only one of --required or --optional.");
      options.required = false;
      continue;
    }
    if (!key.startsWith("--") || !args[i + 1] || args[i + 1].startsWith("--"))
      throw Error(`Invalid argument: ${key}`);
    const name = key.slice(2);
    if (
      ![
        "id",
        "name",
        "type",
        "version",
        "install-path",
        "download",
        "metadata",
        "description",
        "changelog",
      ].includes(name)
    )
      throw Error(`Unknown option: ${key}`);
    options[name] = args[++i];
  }
  return {
    id: options.id,
    name: options.name,
    type: options.type,
    version: options.version,
    installPath: options["install-path"],
    download: options.download,
    metadata: options.metadata
      ? JSON.parse(fs.readFileSync(path.resolve(options.metadata), "utf8"))
      : undefined,
    description: options.description,
    changelog: options.changelog,
    required: options.required,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const args = process.argv.slice(2);
    if (args.includes("--help") || args.length === 0) {
      console.log(
        "Usage: node scripts/register-release.mjs --id ID --name NAME --type car|track --version X.Y.Z --install-path content/cars/ID --download RELEASE_ASSET_URL --metadata ZIP.metadata.json [--description TEXT] [--required|--optional]",
      );
      process.exit(args.includes("--help") ? 0 : 1);
    }
    const manifestPath = path.join(root, "content-repository", "manifest.json");
    const championshipPath = path.join(
      root,
      "content-repository",
      "championship.json",
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const championship = JSON.parse(fs.readFileSync(championshipPath, "utf8"));
    const options = parseArgs(args);
    await verifyReleaseAsset(options.download, options.metadata);
    const result = registerRelease(manifest, championship, options);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    fs.writeFileSync(
      championshipPath,
      JSON.stringify(championship, null, 2) + "\n",
    );
    console.log(
      `Verified release asset and registered ${result.entry.name} ${result.entry.version}; catalog build is now ${result.build}.`,
    );
    console.log(
      "Run npm run validate:content, then commit both catalog JSON files.",
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
