export type BrandId = "mkbt" | "epic";

const brands = {
  mkbt: {
    id: "mkbt",
    name: "MKBT",
    appName: "MKBT Content Manager",
    logo: "./brands/mkbt/logo.png",
    icon: "./brands/mkbt/app.ico",
    installerName: "MKBT-Content-Manager-Setup.exe",
    apiPort: 32145,
  },
  epic: {
    id: "epic",
    name: "Epic Simracing",
    appName: "Epic Simracing Content Manager",
    logo: "./brands/epic/logo.png",
    icon: "./brands/epic/app.ico",
    installerName: "EpicSimracing-Content-Manager-Setup.exe",
    apiPort: 32148,
  },
} as const;

// Brand is chosen at build time. There is deliberately no in-app switch:
// each launcher keeps its own helper, configuration and browser storage.
export const brand = brands[(import.meta.env.VITE_APP_BRAND ?? "mkbt") as BrandId];
if (!brand) throw new Error("Unsupported launcher brand.");

export const brandStorageKey = (name: string) => `${brand.id}:${name}`;
