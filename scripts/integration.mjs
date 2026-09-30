import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { fixtures, hash } from "./fixtures.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  work = path.join(root, "work", "integration-" + Date.now()),
  game = path.join(work, "assettocorsa"),
  apiOrigin = "http://127.0.0.1:32147";
fs.mkdirSync(game, { recursive: true });
fs.writeFileSync(path.join(game, "acs.exe"), "NOT EXECUTABLE");
const { manifest, championship, archives } = fixtures();
let mode = "normal",
  downloadCount = 0;
const payload = strToU8("EC3 SAFE INTEGRATION FIXTURE\n".repeat(12000));
const car = manifest.content[0];
const originalArchive = zipSync({ "ec3-demo.txt": payload }, { level: 0 });
archives.set(car.id + ".zip", originalArchive);
Object.assign(car, {
  size: originalArchive.length,
  sha256: hash(originalArchive),
  files: [
    { path: "ec3-demo.txt", size: payload.length, sha256: hash(payload) },
  ],
});
for (const p of manifest.content)
  p.download = "http://127.0.0.1:32146/" + p.id + ".zip";
fs.writeFileSync(
  path.join(work, "settings.json"),
  JSON.stringify({
    manifestUrl: "http://127.0.0.1:32146/manifest.json",
    championshipUrl: "http://127.0.0.1:32146/championship.json",
    assettoPath: game,
    allowedOrigins: ["http://127.0.0.1:5183"],
    parallelDownloads: 2,
  }),
);
const server = http.createServer((req, res) => {
  if (req.url === "/manifest.json") {
    res.setHeader("Content-Type", "application/json");
    const publicManifest = {
      ...manifest,
      content: manifest.content.map(
        ({ id, name, type, version, required, download, description, changelog }) =>
          ({ id, name, type, version, required, download, description, changelog }),
      ),
    };
    res.end(JSON.stringify(publicManifest));
    return;
  }
  if (req.url === "/championship.json") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(championship));
    return;
  }
  if (req.url?.startsWith("/generated/")) {
    const pkg = manifest.content.find((p) =>
      req.url === `/generated/${p.id}-${p.version}.json`,
    );
    if (!pkg) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      id: pkg.id,
      version: pkg.version,
      installPath: pkg.installPath,
      size: pkg.size,
      sha256: pkg.sha256,
      files: pkg.files,
    }));
    return;
  }
  let zip = archives.get(req.url.slice(1));
  if (!zip) {
    res.writeHead(404).end();
    return;
  }
  downloadCount++;
  if (mode === "redirect") {
    res.writeHead(302, { Location: "https://evil.invalid/payload.zip" }).end();
    return;
  }
  if (mode === "corrupt") {
    zip = Uint8Array.from(zip);
    zip[zip.length - 1] ^= 1;
  }
  res.setHeader("Content-Length", zip.length);
  if (mode === "truncated") {
    res.write(zip.slice(0, 20));
    setTimeout(() => res.destroy(), 30);
    return;
  }
  if (mode === "slow") {
    let offset = 0;
    const timer = setInterval(() => {
      if (res.destroyed) {
        clearInterval(timer);
        return;
      }
      const end = Math.min(offset + 8192, zip.length);
      res.write(zip.slice(offset, end));
      offset = end;
      if (offset === zip.length) {
        clearInterval(timer);
        res.end();
      }
    }, 40);
    return;
  }
  res.end(zip);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(32146, "127.0.0.1", resolve);
});
const child = spawn(
  "dotnet",
  [path.join(root, "helper/bin/Release/net8.0-windows/Eurocup3.Helper.dll")],
  {
    cwd: root,
    stdio: "ignore",
    env: {
      ...process.env,
      EC3_TEST_MODE: "1",
      EC3_TEST_API_PORT: "32147",
      EC3_DATA: work,
      EC3_NO_BROWSER: "1",
    },
  },
);
let token = "";
const origin = "http://127.0.0.1:5183";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0;
const check = (value, name) => {
  assert.ok(value, name);
  checks++;
  console.log("PASS: " + name);
};
async function raw(endpoint, body, extra = {}) {
  return fetch(apiOrigin + "/api" + endpoint, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      "X-EC3-Client": "1",
      "X-EC3-Token": token,
      "Content-Type": "application/json",
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
}
async function api(endpoint, body) {
  const r = await raw(endpoint, body);
  if (!r.ok) throw Error(await r.text());
  return r.json();
}
async function until(fn, ms = 15000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const result = await fn();
    if (result) return result;
    await sleep(60);
  }
  throw Error("Timed out");
}
const status = () => api("/status");
const settled = () =>
  until(async () => {
    const s = await status();
    return (
      s.jobs.every((j) =>
        ["failed", "complete", "cancelled"].includes(j.state),
      ) && s
    );
  });
try {
  await until(async () => {
    try {
      const r = await raw("/session", {});
      if (!r.ok) return false;
      token = (await r.json()).token;
      return true;
    } catch {
      return false;
    }
  });
  check(
    (await raw("/session", {}, { Origin: "https://evil.invalid" })).status ===
      403,
    "reject hostile browser origin",
  );
  check(
    (await raw("/status", undefined, { "X-EC3-Token": "bad" })).status === 401,
    "reject invalid session token",
  );
  check(
    (await raw("/session", {}, { "X-EC3-Client": "" })).status === 403,
    "reject simple cross-site requests",
  );
  await api("/refresh", {});
  await settled();
  check(
    !(await status()).raceReady.ready,
    "missing packages cannot be race ready",
  );
  mode = "corrupt";
  await api("/install", { ids: [car.id] });
  let s = await settled();
  check(
    s.jobs.at(-1).state === "failed" &&
      s.jobs.at(-1).error.includes("CHECKSUM_MISMATCH"),
    "download checksum failure blocks installation",
  );
  check(
    !fs.existsSync(path.join(game, car.installPath, "ec3-demo.txt")),
    "failed download writes no game content",
  );
  mode = "redirect";
  await api("/install", { ids: [car.id] });
  s = await settled();
  check(
    s.jobs.at(-1).error.includes("UNTRUSTED_URL"),
    "reject redirect to arbitrary download host",
  );
  mode = "truncated";
  await api("/install", { ids: [car.id] });
  s = await settled();
  check(s.jobs.at(-1).state === "failed", "truncated download fails safely");
  mode = "slow";
  let [job] = await api("/install", { ids: [car.id] });
  await until(
    async () =>
      (await status()).jobs.find((j) => j.id === job.id)?.state ===
      "downloading",
  );
  await api(`/jobs/${job.id}/pause`, {});
  await until(
    async () =>
      (await status()).jobs.find((j) => j.id === job.id)?.state === "paused",
  );
  const paused = (await status()).jobs.find((j) => j.id === job.id).bytes;
  await sleep(180);
  check(
    (await status()).jobs.find((j) => j.id === job.id).bytes === paused,
    "pause stops writing downloaded bytes",
  );
  await api(`/jobs/${job.id}/resume`, {});
  await until(
    async () =>
      (await status()).jobs.find((j) => j.id === job.id)?.state ===
      "downloading",
  );
  await api(`/jobs/${job.id}/cancel`, {});
  s = await settled();
  check(
    s.jobs.find((j) => j.id === job.id).state === "cancelled",
    "cancel stops the real transfer",
  );
  mode = "normal";
  await api(`/jobs/${job.id}/retry`, {});
  s = await settled();
  check(
    s.content.find((p) => p.package.id === car.id).state === "ready",
    "retry installs and verifies the package",
  );
  await api("/update", { ids: [] });
  s = await settled();
  check(
    s.raceReady.ready,
    "update all resolves dependencies and reaches race ready",
  );
  let downloads = downloadCount;
  await api("/update", { ids: [] });
  await settled();
  check(
    downloadCount === downloads,
    "current verified packages are not downloaded again",
  );
  const file = path.join(game, car.installPath, "ec3-demo.txt");
  fs.writeFileSync(file, "corrupted");
  await api("/verify", { ids: [car.id] });
  s = await settled();
  check(
    !s.raceReady.ready &&
      s.content.find((p) => p.package.id === car.id).invalidFiles === 1,
    "file corruption removes race readiness",
  );
  mode = "corrupt";
  await api("/repair", { ids: [car.id] });
  s = await settled();
  check(!s.raceReady.ready, "failed repair never retains a stale ready state");
  mode = "normal";
  await api("/repair", { ids: [car.id] });
  s = await settled();
  check(
    s.raceReady.ready && hash(fs.readFileSync(file)) === car.files[0].sha256,
    "repair restores exact official bytes",
  );
  const previousVersion = car.version;
  const downloadsBeforeVersionChange = downloadCount;
  car.version = "2.3.2";
  await api("/refresh", {});
  s = await settled();
  check(
    s.content.find((p) => p.package.id === car.id).state === "outdated" &&
      s.content.find((p) => p.package.id === car.id).installedVersion ===
        previousVersion &&
      !s.raceReady.ready &&
      downloadCount === downloadsBeforeVersionChange,
    "a newer catalog version marks the previous receipt outdated even when files match",
  );
  const versionUpdate = (await api("/update", { ids: [] })).find(
    (j) => j.packageId === car.id,
  );
  s = await settled();
  const updatedCar = s.content.find((p) => p.package.id === car.id);
  const updatedReceipt = JSON.parse(
    fs.readFileSync(
      path.join(game, ".ec3", "installed", car.id + ".json"),
      "utf8",
    ),
  );
  check(
    s.jobs.find((j) => j.id === versionUpdate.id).state === "complete" &&
      updatedCar.state === "ready" &&
      updatedCar.installedVersion === car.version &&
      updatedReceipt.version === car.version &&
      s.raceReady.ready &&
      downloadCount === downloadsBeforeVersionChange + 1 &&
      hash(fs.readFileSync(file)) === car.files[0].sha256,
    "an explicit version update installs verified bytes and records the new receipt version",
  );
  // A malicious archive can pass the outer checksum. Extraction must still reject it.
  const bad = zipSync({ "../escape.txt": strToU8("malicious") }, { level: 0 });
  archives.set(car.id + ".zip", bad);
  const saved = { ...car };
  Object.assign(car, {
    version: "2.3.3",
    size: bad.length,
    sha256: hash(bad),
    files: [{ path: "updated.txt", size: 4, sha256: hash(strToU8("next")) }],
  });
  await api("/update", { ids: [car.id] });
  s = await settled();
  check(
    s.jobs.at(-1).state === "failed" &&
      !fs.existsSync(path.join(game, "escape.txt")),
    "Zip Slip rejected after a valid ZIP checksum",
  );
  check(
    hash(fs.readFileSync(file)) === saved.files[0].sha256,
    "malicious update preserves the previous package",
  );
  Object.assign(car, saved);
  archives.set(car.id + ".zip", originalArchive);
  const oldPath = car.installPath;
  car.installPath = "../escape";
  check(
    !(await raw("/refresh", {})).ok,
    "helper rejects malicious catalog paths",
  );
  car.installPath = oldPath;
  check(
    fs.readdirSync(path.join(game, ".ec3", "downloads")).length === 0,
    "temporary downloads cleaned after failure and success",
  );
  fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "artifacts", "integration-results.json"),
    JSON.stringify(
      {
        passed: checks,
        isolatedGame: game,
        completedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`All ${checks} real integration checks passed.`);
} finally {
  child.kill();
  await new Promise((r) => {
    child.once("exit", r);
    setTimeout(r, 1500);
  });
  server.closeAllConnections();
  server.close();
}
