import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuración de Vite (servidor de desarrollo, compilación y pruebas de componentes).
// El cliente y la API comparten origen: en desarrollo, Vite reenvía /api a Express,
// así las cookies de Better Auth funcionan sin CORS.
// Vitest corre las pruebas de componentes de src/ con jsdom; las pruebas de la API
// del cliente viven en test/ y se ejecutan con node --test.

// Dirección de la API en desarrollo. Se puede cambiar con la variable API_ORIGIN.
const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: apiOrigin, changeOrigin: false },
      "/health": { target: apiOrigin, changeOrigin: false },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    include: ["src/**/*.test.{js,jsx}"],
    css: true,
  },
});
