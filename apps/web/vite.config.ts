import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const port = Number(process.env.PORT || process.env.VITE_PORT || 5173);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port,
    strictPort: true,
    proxy: {
      "/healthz": { target: "http://127.0.0.1:8443", changeOrigin: true },
      "/v1": { target: "http://127.0.0.1:8443", changeOrigin: true },
    },
  },
  preview: {
    host: "0.0.0.0",
    port,
    strictPort: true,
    proxy: {
      "/healthz": { target: "http://127.0.0.1:8443", changeOrigin: true },
      "/v1": { target: "http://127.0.0.1:8443", changeOrigin: true },
    },
  },
});
