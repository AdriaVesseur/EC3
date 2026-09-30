import { test } from "node:test";
import assert from "node:assert/strict";
import semver from "semver";
import {
  validate,
  relative,
  resolveDependencies,
} from "../scripts/validate-content.mjs";
import {
  registerRelease,
  verifyReleaseAsset,
} from "../scripts/register-release.mjs";
import { fixtures, hash } from "../scripts/fixtures.mjs";
test("complete example catalog validates", () => {
  const { manifest, championship } = fixtures();
  assert.equal(validate(manifest, championship), true);
});
test("register release uses generated metadata and bumps both catalog builds", () => {
  const { manifest, championship } = fixtures();
  const metadata = {
    size: 1234,
    sha256: "b".repeat(64),
    files: [{ path: "data.acd", size: 7, sha256: "a".repeat(64) }],
  };
  const result = registerRelease(manifest, championship, {
    id: "ec3-dallara-326",
    name: "Dallara 326 EC3",
    type: "car",
    version: "2.4.0",
    installPath: "content/cars/ec3_dallara_326",
    download:
      "https://github.com/AdriaVesseur/EC3/releases/download/ec3-content-dallara-2.4.0/dallara.zip",
    metadata,
    description: "Updated car package.",
  });
  assert.equal(result.build, "1.4.1");
  assert.equal(championship.build, manifest.build);
  assert.equal(manifest.content[0].size, metadata.size);
  assert.deepEqual(manifest.content[0].files, metadata.files);
  assert.equal(
    manifest.content.filter((p) => p.id === "ec3-dallara-326").length,
    1,
  );
});
test("new packages default to optional unless marked required", () => {
  const { manifest, championship } = fixtures();
  const result = registerRelease(manifest, championship, {
    id: "optional-car",
    name: "Optional Car",
    type: "car",
    version: "1.0.0",
    installPath: "content/cars/optional_car",
    download:
      "https://github.com/AdriaVesseur/EC3/releases/download/car-1.0.0/car.zip",
    metadata: {
      size: 12,
      sha256: "b".repeat(64),
      files: [{ path: "data.acd", size: 1, sha256: "a".repeat(64) }],
    },
  });
  assert.equal(result.entry.required, false);
  assert.equal(manifest.build, championship.build);
});
test("register flow checks that the copied release URL serves the metadata ZIP", async () => {
  const bytes = Buffer.from("package-zip");
  const metadata = { size: bytes.length, sha256: hash(bytes) };
  const download =
    "https://github.com/AdriaVesseur/EC3/releases/download/car-1.0.0/car.zip";
  await verifyReleaseAsset(download, metadata, async () => new Response(bytes));
  await assert.rejects(
    verifyReleaseAsset(
      download,
      { ...metadata, sha256: "a".repeat(64) },
      async () => new Response(bytes),
    ),
    /does not match/,
  );
});
test("semver correctly handles numeric versions and prereleases", () => {
  assert.ok(semver.gt("2.10.0", "2.9.0"));
  assert.ok(semver.lt("2.3.1-rc.1", "2.3.1"));
  assert.ok(semver.lt("2.3.1-rc.2", "2.3.1-rc.10"));
});
test("Windows path attacks rejected", () => {
  for (const p of [
    "../x",
    "/root",
    "C:/root",
    "a\\b",
    "a/../b",
    "a//b",
    "a/file:stream",
    "a/NUL.txt",
    "a/file.",
    "a/file ",
    "a/COM1",
    "a/\u0000",
  ])
    assert.throws(() => relative(p), undefined, p);
  assert.equal(
    relative("skins/driver_01/livery.dds"),
    "skins/driver_01/livery.dds",
  );
});
test("dependencies resolve before dependents", () => {
  const { manifest } = fixtures();
  assert.deepEqual(
    resolveDependencies(manifest, ["ec3-config"]).map((p) => p.id),
    ["ec3-dallara-326", "barcelona", "ec3-config"],
  );
});
test("cycles and unsatisfied versions rejected", () => {
  const { manifest } = fixtures();
  manifest.content[0].dependencies = [
    { id: "ec3-config", minimumVersion: "1.4.0" },
  ];
  assert.throws(() => resolveDependencies(manifest, ["ec3-config"]), /cycle/);
  manifest.content[0].dependencies = [];
  manifest.content[4].dependencies[0].minimumVersion = "99.0.0";
  assert.throws(
    () => resolveDependencies(manifest, ["ec3-config"]),
    /Unsatisfied/,
  );
});
for (const [name, mutate] of [
  ["duplicate ID", (m) => (m.content[1].id = m.content[0].id)],
  [
    "overlapping folders",
    (m) => (m.content[2].installPath = m.content[1].installPath + "/child"),
  ],
  [
    "untrusted download",
    (m) => (m.content[0].download = "https://evil.example/car.zip"),
  ],
  ["checksum missing", (m) => (m.content[0].sha256 = "...")],
  ["reserved file", (m) => (m.content[0].files[0].path = "AUX.ini")],
  [
    "case collision",
    (m) =>
      m.content[0].files.push({
        ...m.content[0].files[0],
        path: "EC3-DEMO.TXT",
      }),
  ],
  ["invalid semver", (m) => (m.content[0].version = "01.0.0")],
  [
    "file folder collision",
    (m) =>
      m.content[0].files.push({
        ...m.content[0].files[0],
        path: "ec3-demo.txt/child",
      }),
  ],
])
  test("rejects " + name, () => {
    const { manifest, championship } = fixtures();
    mutate(manifest);
    assert.throws(() => validate(manifest, championship));
  });
