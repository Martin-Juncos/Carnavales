/*
 * Marco visual común de las pantallas de autenticación: fondo de plumas,
 * tarjeta translúcida con matiz rosa, isotipo, título y texto introductorio.
 * Depende de FeatherBackground, el isotipo oficial y tokens.css.
 */
import isotipo from '../../../../assets/icons/isotipo.webp';
import { FeatherBackground } from '../FeatherBackground/FeatherBackground.jsx';
import styles from './AuthShell.module.css';

export function AuthShell({ title, description, children }) {
  return (
    <main className={styles.page}>
      <FeatherBackground />
      <section className={styles.card} aria-labelledby="auth-title">
        <img className={styles.isotipo} src={isotipo} alt="" aria-hidden="true" />
        <h2 id="auth-title" className={styles.title}>
          {title}
        </h2>
        {description && <p className={styles.description}>{description}</p>}
        {children}
      </section>
    </main>
  );
}
