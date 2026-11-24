/*
 * Configuración compartida de Vitest: extiende expect con jest-dom y limpia
 * el DOM después de cada prueba para aislar los componentes montados.
 * Depende de @testing-library/jest-dom y del afterEach de Vitest.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
