import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fixtures } from "./fixtures.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  work = path.join(root, "work", "demo");
fs.mkdirSync(work, { recursive: true });
const game = path.join(work, "assettocorsa");
fs.mkdirSync(game, { recursive: true });
fs.writeFileSync(path.join(game, "acs.exe"), "SAFE FIXTURE: not executable");
const { manifest, championship, archives } = fixtures();
for (const p of manifest.content)
  p.download = "http://127.0.0.1:32146/" + p.id + ".zip";
const settings = {
  contentRepository: "AdriaVesseur/EC3",
  manifestUrl: "http://127.0.0.1:32146/manifest.json",
  championshipUrl: "http://127.0.0.1:32146/championship.json",
  allowedOrigins: [
    "http://127.0.0.1:32145",
    "http://127.0.0.1:5183",
    "http://localhost:5183",
  ],
  assettoPath: game,
  parallelDownloads: 2,
};
fs.writeFileSync(
  path.join(work, "settings.json"),
  JSON.stringify(settings, null, 2),
);
const server = http.createServer((req, res) => {
  if (req.url === "/manifest.json" || req.url === "/championship.json") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(req.url === "/manifest.json" ? manifest : championship),
    );
    return;
  }
  if (req.url?.startsWith("/generated/")) {
    const pkg = manifest.content.find((p) =>
      req.url === `/generated/${p.id}-${p.version}.json`,
    );
    if (!pkg) {
      res.statusCode = 404;
      res.end();
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
  const zip = archives.get(req.url?.slice(1));
  if (zip) {
    res.setHeader("Content-Length", zip.length);
    res.end(zip);
  } else {
    res.statusCode = 404;
    res.end();
  }
});
server.listen(32146, "127.0.0.1");
const child = spawn(
  process.env.EC3_HELPER_BINARY || "dotnet",
  process.env.EC3_HELPER_BINARY ? [] : [
    path.join(
      root,
      "helper",
      "bin",
      "Release",
      "net8.0-windows",
      "Eurocup3.Helper.dll",
    ),
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      EC3_TEST_MODE: "1",
      EC3_DATA: work,
      EC3_NO_BROWSER: "1",
    },
  },
);
function stop() {
  child.kill();
  server.close();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", () => server.close());
console.log(
  "ISOLATED DEMO: " + game + "\nOpen http://127.0.0.1:5183 after npm run dev.",
);
