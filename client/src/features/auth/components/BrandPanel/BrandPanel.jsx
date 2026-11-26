/*
 * Tarjeta magenta que contiene la marca y el formulario de acceso.
 * El formulario vive dentro de la misma tarjeta, ocupa la mitad derecha y
 * comparte el borde derecho y sus esquinas para mantener la alineación.
 * Depende de logotipo_monocromatico_blanco.webp y tokens.css.
 */
import logotype from '../../../../assets/icons/logotipo_monocromatico_blanco.webp';
import styles from './BrandPanel.module.css';

export function BrandPanel({ children }) {
  return (
    <section className={styles.card} aria-labelledby="portal-title">
      <div className={styles.brand}>
        <img
          className={styles.logotype}
          src={logotype}
          alt="Carnavales Goyanos"
        />
        <h1 id="portal-title" className={styles.title}>
          Portal de votación
        </h1>
      </div>
      {children && <div className={styles.formSlot}>{children}</div>}
    </section>
  );
}
