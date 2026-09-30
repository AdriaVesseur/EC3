import { test } from "node:test";
import assert from "node:assert/strict";
import semver from "semver";
import {
  validate,
  relative,
  resolveDependencies,
} from "../scripts/validate-content.mjs";
import { fixtures } from "../scripts/fixtures.mjs";
function publicCatalog() {
  const { manifest, championship } = fixtures();
  manifest.content = manifest.content.map(
    ({
      id,
      name,
      type,
      version,
      required,
      download,
      description,
      changelog,
    }) => ({
      id,
      name,
      type,
      version,
      required,
      download,
      description,
      changelog,
    }),
  );
  return { manifest, championship };
}
test("complete example catalog validates", () => {
  const { manifest, championship } = publicCatalog();
  assert.equal(validate(manifest, championship), true);
});
test("manifest asks only for the eight hand-edited package fields", () => {
  const { manifest, championship } = publicCatalog();
  const packageFields = Object.keys(manifest.content[0]).sort();
  assert.deepEqual(packageFields, [
    "changelog",
    "description",
    "download",
    "id",
    "name",
    "required",
    "type",
    "version",
  ]);
  assert.equal(validate(manifest, championship), true);
});
test("manifest accepts an optional HTTPS package icon without changing required fields", () => {
  const { manifest, championship } = publicCatalog();
  manifest.content[0].icon =
    "https://raw.githubusercontent.com/AdriaVesseur/EC3/main/images/car-logo.png?version=1";
  assert.equal(validate(manifest, championship), true);
  assert.equal(manifest.content[1].icon, undefined);
});
test("card photos are optional and accept a public HTTPS URL", () => {
  const { manifest, championship } = publicCatalog();
  manifest.content[0].image =
    "https://raw.githubusercontent.com/AdriaVesseur/EC3/main/content-repository/images/car.jpg";
  assert.equal(validate(manifest, championship), true);
  assert.equal(manifest.content[1].image, undefined);
});
for (const image of [
  "http://example.com/photo.jpg",
  "data:image/png;base64,AAAA",
  "/photo.jpg",
  "https://user:secret@example.com/photo.jpg",
  "https://@example.com/photo.jpg",
  "https://example.com\\photo.jpg",
  "https://example.com/car photo.jpg",
  "",
  42,
])
  test("rejects invalid card photo " + JSON.stringify(image), () => {
    const { manifest, championship } = publicCatalog();
    manifest.content[0].image = image;
    assert.throws(() => validate(manifest, championship));
  });
for (const icon of [
  "http://example.com/car.png",
  "data:image/png;base64,AAAA",
  "/images/car.png",
  "https://user:secret@example.com/car.png",
  "https://user@example.com/car.png",
  "https://@example.com/car.png",
  "https://example.com\\car.png",
  "https://example.com/car logo.png",
  "",
  42,
])
  test("rejects an invalid package icon " + JSON.stringify(icon), () => {
    const { manifest, championship } = publicCatalog();
    manifest.content[0].icon = icon;
    assert.throws(() => validate(manifest, championship));
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
  ["automatic fields cannot be set manually", (m) => (m.content[0].size = 123)],
  [
    "untrusted download",
    (m) => (m.content[0].download = "https://evil.example/car.zip"),
  ],
  ["invalid semver", (m) => (m.content[0].version = "01.0.0")],
])
  test("rejects " + name, () => {
    const { manifest, championship } = publicCatalog();
    mutate(manifest);
    assert.throws(() => validate(manifest, championship));
  });
