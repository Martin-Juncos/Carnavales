import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// El cliente y la API comparten origen: en desarrollo, Vite reenvía /api a Express.
// Así las cookies de Better Auth funcionan sin CORS.
const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: apiOrigin, changeOrigin: false },
      "/health": { target: apiOrigin, changeOrigin: false },
    },
  },
});
