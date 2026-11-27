/*
 * Fondo decorativo de plumas coral distribuidas sin superponerse.
 * La pluma original es magenta; se usa como máscara alfa y se pinta con
 * --feather-tint (#ff5252). La composición se recalcula si cambia la ventana.
 * Depende de pluma_magenta_fondo_patron.webp, feather-layout y su CSS Module.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import featherImage from '../../../../assets/icons/pluma_magenta_fondo_patron.webp';
import { construirPlumas } from '../../utils/feather-layout.js';
import styles from './FeatherBackground.module.css';

const FEATHER_COUNT = 30;
const FEATHER_SEED = 0x60a7a1;

// Tamaño inicial aproximado antes de medir el contenedor. El efecto lo ajusta
// al tamaño real en cuanto el elemento está montado.
function tamanioInicial() {
  const ventana = globalThis.window;
  const ancho = globalThis.innerWidth || ventana?.innerWidth || 1200;
  const alto = globalThis.innerHeight || ventana?.innerHeight || 800;
  return { width: ancho, height: alto };
}

export function FeatherBackground() {
  const layerRef = useRef(null);
  const [tamanio, setTamanio] = useState(tamanioInicial);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return undefined;

    const medir = () => {
      const width = layer.clientWidth;
      const height = layer.clientHeight;
      if (width <= 0 || height <= 0) return;
      setTamanio((actual) => (actual.width === width && actual.height === height ? actual : { width, height }));
    };

    medir();

    // ResizeObserver sigue cambios de layout; window.resize es el respaldo para
    // navegadores o entornos de prueba que no lo implementan.
    if (typeof ResizeObserver === 'undefined') {
      const ventana = globalThis.window;
      if (!ventana?.addEventListener) return undefined;
      ventana.addEventListener('resize', medir);
      return () => ventana.removeEventListener('resize', medir);
    }

    const observer = new ResizeObserver(medir);
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);

  const feathers = useMemo(
    () => construirPlumas({ ...tamanio, count: FEATHER_COUNT, seed: FEATHER_SEED }),
    [tamanio],
  );

  return (
    <div ref={layerRef} className={styles.layer} aria-hidden="true">
      {feathers.map((feather) => (
        <span
          key={feather.id}
          className={styles.feather}
          style={{
            '--feather-image': `url("${featherImage}")`,
            '--feather-left': `${feather.left}%`,
            '--feather-top': `${feather.top}%`,
            '--feather-size': `${feather.size}px`,
            '--feather-rotation': `${feather.rotation}deg`,
            '--feather-flip': feather.flipped ? -1 : 1,
            '--feather-opacity': feather.opacity,
          }}
        />
      ))}
    </div>
  );
}
