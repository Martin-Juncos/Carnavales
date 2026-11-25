/*
 * Fondo decorativo de plumas coral distribuidas de forma pseudoaleatoria.
 * La pluma original es magenta; se usa como máscara alfa y se pinta con
 * --feather-tint (#ff5252). Genera posiciones deterministas con semilla fija.
 * Depende de pluma_magenta_fondo_patron.webp, seededRandom y su CSS Module.
 */
import { useMemo } from 'react';
import featherImage from '../../../../assets/icons/pluma_magenta_fondo_patron.webp';
import { createSeededRandom } from '../../utils/seeded-random.js';
import styles from './FeatherBackground.module.css';

const FEATHER_COUNT = 30;
const FEATHER_SEED = 0x60a7a1;

/**
 * Posiciones de -8% a 108% para que algunas plumas queden cortadas por el
 * borde. La semilla fija evita que la composición cambie en cada render.
 */
function buildFeathers(seed) {
  const random = createSeededRandom(seed);

  return Array.from({ length: FEATHER_COUNT }, (_, index) => {
    const sizeBand = random();
    let size = 70 + random() * 60;
    if (sizeBand > 0.82) size = 250 + random() * 140;
    else if (sizeBand > 0.45) size = 130 + random() * 90;

    return {
      id: index,
      left: -8 + random() * 116,
      top: -8 + random() * 116,
      size: Math.round(size),
      rotation: -55 + random() * 110,
      flipped: random() > 0.5,
      opacity: 0.38 + random() * 0.52,
    };
  });
}

export function FeatherBackground() {
  const feathers = useMemo(() => buildFeathers(FEATHER_SEED), []);

  return (
    <div className={styles.layer} aria-hidden="true">
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
