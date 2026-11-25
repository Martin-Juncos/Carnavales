/*
 * Tarjeta magenta opaca con el logotipo blanco y el título "Portal oficial de votaciones".
 * Al compartir el color del fondo tapa las plumas en la zona izquierda.
 * Contiene la tarjeta de acceso en su columna derecha, alineada al borde.
 * Expone BrandPanel; depende de logotipo_monocromatico_blanco.webp y tokens.
 */
import logotype from '../../../assets/icons/logotipo_monocromatico_blanco.webp';
import styles from './BrandPanel.module.css';

export function BrandPanel({ children }) {
  return (
    <section className={styles.card} aria-labelledby="portal-title">
      <div className={styles.brandContent}>
        <img
          className={styles.logotype}
          src={logotype}
          alt="Carnavales Goyanos"
        />
        <h1 id="portal-title" className={styles.title}>
          Portal oficial de votaciones
        </h1>
      </div>

      {children && <div className={styles.accessSlot}>{children}</div>}
    </section>
  );
}
