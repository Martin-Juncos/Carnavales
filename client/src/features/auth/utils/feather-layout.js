/*
 * Distribución de las plumas decorativas del acceso.
 * Cada pluma se trata como un círculo que contiene su cuadrado rotado; dos
 * círculos deben quedar separados por `separacion` píxeles. Así ninguna pluma
 * toca a otra, aunque giren y se recorten contra los bordes de la pantalla.
 * La composición es determinista para una misma semilla y tamaño de ventana.
 */
import { createSeededRandom } from './seeded-random.js';

// Separación mínima visible entre los bordes de dos plumas.
export const SEPARACION_PLUMAS = 10;

// Relación entre el lado del cuadrado y el radio del círculo que lo contiene.
const RADIO_DEL_CUADRADO = Math.SQRT2 / 2;

// Tamaño base proporcional al área disponible: mantiene una densidad parecida
// en celulares, tablets y computadoras. Las plumas se miden en píxeles porque
// se recolocan cuando cambia el tamaño de la ventana.
function tamanioBase(width, height, count) {
  return Math.sqrt((width * height) / Math.max(1, count));
}

/**
 * Calcula posiciones sin solapamiento con una separación mínima de 10px.
 * Devuelve left/top en porcentaje y el tamaño en píxeles.
 */
export function construirPlumas({
  width,
  height,
  count = 30,
  seed = 0x60a7a1,
  separacion = SEPARACION_PLUMAS,
} = {}) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return [];
  }

  const random = createSeededRandom(seed);
  const base = tamanioBase(width, height, count);
  const plumas = [];

  // El límite de intentos evita un bucle infinito cuando el espacio no alcanza
  // para todas las plumas. En pantallas chicas se muestran menos, nunca superpuestas.
  const maximoIntentos = count * 120;

  for (let intento = 0; intento < maximoIntentos && plumas.length < count; intento += 1) {
    const banda = random();
    let factor;
    if (banda > 0.82) factor = 0.95 + random() * 0.4;
    else if (banda > 0.45) factor = 0.55 + random() * 0.3;
    else factor = 0.34 + random() * 0.2;

    const tamanio = Math.round(Math.max(24, base * factor));
    const radio = tamanio * RADIO_DEL_CUADRADO;

    // Un pequeño margen exterior permite que algunas plumas queden cortadas
    // por el borde, como en la composición original.
    const x = -0.04 * width + random() * 1.08 * width;
    const y = -0.04 * height + random() * 1.08 * height;

    const libre = plumas.every(
      (otra) => Math.hypot(x - otra.x, y - otra.y) >= otra.radio + radio + separacion,
    );
    if (!libre) continue;

    plumas.push({
      x,
      y,
      radio,
      tamanio,
      rotacion: -55 + random() * 110,
      invertida: random() > 0.5,
      opacidad: 0.38 + random() * 0.52,
    });
  }

  return plumas.map((pluma, indice) => ({
    id: indice,
    left: (pluma.x / width) * 100,
    top: (pluma.y / height) * 100,
    size: Math.round(pluma.tamanio),
    rotation: pluma.rotacion,
    flipped: pluma.invertida,
    opacity: pluma.opacidad,
  }));
}
