import styles from "../PanelJurado/PanelJurado.module.css";

export function IconoCheck({ size = 18 }) {
  return (
    <svg className={styles.icon} width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="currentColor" />
      <path d="M6.2 10.2l2.6 2.6 5-5.4" stroke="var(--color-white)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconoPendiente() {
  return (
    <svg className={styles.icon} width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 2.5" opacity="0.6" />
      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconoAlerta({ size = 16 }) {
  return (
    <svg className={styles.icon} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3L2 20h20L12 3z" fill="currentColor" />
      <path d="M12 9v5M12 17h.01" stroke="var(--color-white)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function IconoTraspaso({ size = 24 }) {
  return (
    <svg className={styles.icon} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M8 10h8m0 0l-2.5-2.5M16 10l-2.5 2.5M16 14H8m0 0l2.5-2.5M8 14l2.5 2.5" stroke="var(--color-white)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
