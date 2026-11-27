import { describe, expect, it } from 'vitest';
import { construirPlumas, SEPARACION_PLUMAS } from './feather-layout.js';

function centros(plumas, width, height) {
  return plumas.map((pluma) => ({
    x: (pluma.left / 100) * width,
    y: (pluma.top / 100) * height,
    radio: (pluma.size * Math.SQRT2) / 2,
  }));
}

function distanciaMinima(plumas, width, height) {
  const puntos = centros(plumas, width, height);
  let minima = Number.POSITIVE_INFINITY;
  for (let i = 0; i < puntos.length; i += 1) {
    for (let j = i + 1; j < puntos.length; j += 1) {
      const distancia = Math.hypot(puntos[i].x - puntos[j].x, puntos[i].y - puntos[j].y);
      minima = Math.min(minima, distancia - puntos[i].radio - puntos[j].radio);
    }
  }
  return minima;
}

describe('construirPlumas', () => {
  it('nunca deja dos plumas a menos de 10px', () => {
    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [768, 1024],
      [390, 844],
    ]) {
      const plumas = construirPlumas({ width, height });
      expect(plumas.length).toBeGreaterThan(0);
      expect(distanciaMinima(plumas, width, height)).toBeGreaterThanOrEqual(SEPARACION_PLUMAS - 0.001);
    }
  });

  it('es determinista para la misma semilla y tamaño', () => {
    const opciones = { width: 1200, height: 800, count: 20, seed: 42 };
    expect(construirPlumas(opciones)).toEqual(construirPlumas(opciones));
  });

  it('no supera la cantidad pedida', () => {
    const plumas = construirPlumas({ width: 800, height: 600, count: 12 });
    expect(plumas.length).toBeLessThanOrEqual(12);
  });

  it('devuelve una lista vacía sin dimensiones válidas', () => {
    expect(construirPlumas({ width: 0, height: 0 })).toEqual([]);
    expect(construirPlumas()).toEqual([]);
  });
});
