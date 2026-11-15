import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Configuración de Vite (servidor de desarrollo y compilación).
// El cliente y la API comparten origen: en desarrollo, Vite reenvía /api a Express.
// Así las cookies de Better Auth funcionan sin CORS.

// Dirección de la API en desarrollo. Se puede cambiar con la variable API_ORIGIN.
const apiOrigin = process.env.API_ORIGIN ?? "http://127.0.0.1:3000";

export default defineConfig({
  // Plugin de React: permite JSX y recarga en caliente.
  plugins: [react()],
  server: {
    // Peticiones que Vite reenvía a la API en lugar de resolverlas él mismo.
    proxy: {
      // Rutas de autenticación, invitaciones y administración.
      "/api": { target: apiOrigin, changeOrigin: false },
      // Comprobación de salud de la API.
      "/health": { target: apiOrigin, changeOrigin: false },
    },
  },
});
