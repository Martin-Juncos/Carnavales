import styles from "../PanelJurado/PanelJurado.module.css";

export function CabeceraJurado({ contexto, estadoPlanilla, enLinea, nombre, onCambiarRol, onCerrarSesion }) {
  return (
    <header role="banner" className={styles.topBar}>
      <div className={styles.topBarContext}>
        <span className={styles.brandMark}>
          {contexto?.noche?.edicion?.nombre ?? "Carnavales · Votación"}
        </span>
        {contexto ? (
          <>
            <span className={styles.topBarSep} aria-hidden="true" />
            <span className={styles.topBarNight}>{contexto.noche.nombre}</span>
            <span className={styles.specialtyPill}>{contexto.especialidad.nombre}</span>
            {estadoPlanilla ? <span className={styles.sheetStatusText}>{estadoPlanilla}</span> : null}
          </>
        ) : null}
      </div>

      <div className={styles.topBarRight}>
        <span className={`${styles.connPill} ${enLinea ? styles.connOnline : styles.connOffline}`}>
          <span className={styles.connDot} aria-hidden="true" />
          {enLinea ? "Con conexión" : "Sin conexión"}
        </span>
        {nombre ? (
          <span className={styles.userTag}>
            <strong>{nombre}</strong> · Jurado
          </span>
        ) : null}
        {onCambiarRol ? (
          <button type="button" className={styles.topActionBtn} onClick={onCambiarRol}>
            Cambiar rol
          </button>
        ) : null}
        {onCerrarSesion ? (
          <button type="button" className={styles.topActionBtn} onClick={onCerrarSesion}>
            Cerrar sesión
          </button>
        ) : null}
      </div>
    </header>
  );
}
