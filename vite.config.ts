import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const id = process.env.VITE_APP_BRAND ?? env.VITE_APP_BRAND ??
    (mode === "epic" ? "epic" : "mkbt");
  if (id !== "mkbt" && id !== "epic") throw new Error("VITE_APP_BRAND must be mkbt or epic.");
  const name = id === "mkbt" ? "MKBT" : "Epic Simracing";
  return {
    plugins: [react(), tailwindcss(), {
      name: "launcher-brand-html",
      transformIndexHtml(html) {
        return html.replaceAll("__APP_NAME__", name)
          .replaceAll("__APP_ID__", id);
      },
    }],
    define: { "import.meta.env.VITE_APP_BRAND": JSON.stringify(id) },
    base: "./",
    server: { port: 5183, strictPort: true },
    build: { outDir: "dist" },
  };
});
