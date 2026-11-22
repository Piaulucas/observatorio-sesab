import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Build público estático (Cloudflare Pages). Sem proxy, sem /api, sem /admin-api, sem entrada admin.
// Os dados vêm de publico/estatico/ (gerado por scripts/publico/exportar_publico.py).
const aqui = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  root: aqui("./publico"),
  publicDir: aqui("./publico/estatico"),
  envDir: aqui("."),
  define: { "import.meta.env.VITE_PUBLICO": JSON.stringify("1") },
  plugins: [react()],
  build: { outDir: aqui("./dist-publico"), emptyOutDir: true, sourcemap: false },
  preview: { host: "127.0.0.1", port: 4180, strictPort: true },
});
