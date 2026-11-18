/**
 * Configuración de Vite para el cliente React de Carnavales Goyanos.
 * Habilita el plugin de React y Vitest con jsdom para pruebas de componentes.
 * Depende de vite, @vitejs/plugin-react y el setup de pruebas en src/test/setup.js.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: true,
  },
});
