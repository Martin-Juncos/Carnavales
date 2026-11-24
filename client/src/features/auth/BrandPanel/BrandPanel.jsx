/*
 * Tarjeta magenta opaca con el logotipo blanco y el título "Portal de votación".
 * Al compartir el color del fondo tapa las plumas en la zona izquierda.
 * Expone BrandPanel; depende de logotipo_monocromatico_blanco.webp y tokens.
 */
import logotype from '../../../assets/icons/logotipo_monocromatico_blanco.webp';
import styles from './BrandPanel.module.css';

export function BrandPanel() {
  return (
    <section className={styles.card} aria-labelledby="portal-title">
      <img
        className={styles.logotype}
        src={logotype}
        alt="Carnavales Goyanos"
      />
      <h1 id="portal-title" className={styles.title}>
        Portal de votación
      </h1>
    </section>
  );
}
