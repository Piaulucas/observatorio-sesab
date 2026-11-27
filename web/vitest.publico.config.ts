import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Testes do painel público, sem depender da configuração local do admin.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/testes/preparar.ts"],
    css: false,
    include: ["src/testes/publico.test.ts", "src/testes/painel-bi.test.tsx"],
  },
});
