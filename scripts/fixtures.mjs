import { zipSync, strToU8 } from "fflate";
import { createHash } from "node:crypto";
export const hash = (data) => createHash("sha256").update(data).digest("hex");
export function fixtures() {
  const data = [
    [
      "ec3-dallara-326",
      "Eurocup 3 Dallara 326",
      "car",
      "2.3.1",
      "content/cars/ec3_dallara_326",
    ],
    [
      "barcelona",
      "Barcelona GP",
      "track",
      "1.4.2",
      "content/tracks/ec3_barcelona",
    ],
    ["spa", "Spa Francorchamps", "track", "1.6.0", "content/tracks/ec3_spa"],
    [
      "paul-ricard",
      "Paul Ricard",
      "track",
      "1.2.0",
      "content/tracks/ec3_paul_ricard",
    ],
    [
      "ec3-config",
      "Eurocup 3 Competition Config",
      "config",
      "1.4.0",
      "extension/config/ec3_competition",
    ],
  ];
  const archives = new Map();
  const content = data.map(([id, name, type, version, installPath]) => {
    const payload = strToU8(
      `${name}\nEUROCUP 3 SAFE TEST FIXTURE\nThis is not a playable car or track.\nVersion ${version}\n`,
    );
    const zip = zipSync({ "ec3-demo.txt": payload }, { level: 0 });
    archives.set(id + ".zip", zip);
    return {
      id,
      name,
      type,
      version,
      installPath,
      required: true,
      download: `https://github.com/AdriaVesseur/EC3/releases/download/demo-1/${id}.zip`,
      size: zip.length,
      sha256: hash(zip),
      description: `Example package for ${name}. Replace this catalog entry with official release assets before championship use.`,
      changelog: ["Safe demonstration package. No game assets are included."],
      files: [
        { path: "ec3-demo.txt", size: payload.length, sha256: hash(payload) },
      ],
      dependencies:
        id === "ec3-config"
          ? [
              { id: "ec3-dallara-326", minimumVersion: "2.3.1" },
              { id: "barcelona", minimumVersion: "1.4.2" },
            ]
          : [],
    };
  });
  return {
    manifest: {
      championship: "Eurocup 3",
      season: "2026",
      build: "1.4.0",
      demo: true,
      content,
    },
    championship: {
      season: "2026",
      build: "1.4.0",
      minimumHelperVersion: "1.0.0",
      requiredContent: content.map((p) => p.id),
      events: [
        {
          id: "round-04",
          name: "Round 4 · Example event",
          venue: "Barcelona",
          round: "4",
          requiredContent: ["ec3-dallara-326", "barcelona", "ec3-config"],
        },
      ],
    },
    archives,
  };
}
