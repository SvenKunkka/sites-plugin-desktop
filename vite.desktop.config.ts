import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "desktop",
  base: "./",
  plugins: [react()],
  publicDir: "../public",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "../dist-desktop",
    emptyOutDir: true,
  },
});
