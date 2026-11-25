import { useState } from "react";
import { PanelAsignaciones } from "../../asignaciones/components/PanelAsignaciones/PanelAsignaciones.jsx";
import { PanelEdiciones } from "../../ediciones/components/PanelEdiciones/PanelEdiciones.jsx";
import { PanelInvitaciones } from "../../usuarios/components/PanelInvitaciones/PanelInvitaciones.jsx";
import { PanelUsuarios } from "../../usuarios/components/PanelUsuarios/PanelUsuarios.jsx";
import styles from "../../PanelAdministracion.module.css";
import "../../../../styles/administracion.css";

function IconoEventos() {
  return (
    <svg className={styles.icon} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 2.5v3M16 2.5v3M3 9.5h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconoUsuarios() {
  return (
    <svg className={styles.icon} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M2.5 19.5c0-3.2 2.9-5.5 6.5-5.5s6.5 2.3 6.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16.5 11.2a3 3 0 1 0 0-6M18 14.5c2 .6 3.5 2.2 3.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function PanelAdministracion({ api, nombre, onCambiarRol, onCerrarSesion }) {
  const [vista, setVista] = useState("votacion");
  const [cuentasVisitadas, setCuentasVisitadas] = useState(false);
  const [revisionCatalogos, setRevisionCatalogos] = useState(0);

  function actualizarCatalogos() {
    setRevisionCatalogos((n) => n + 1);
  }

  function abrirCuentas() {
    setVista("cuentas");
    setCuentasVisitadas(true);
  }

  return (
    <div className={`admin-contenido ${styles.shell}`}>
      <aside className={styles.sidebar} aria-label="Menú de administración">
        <div className={styles.sidebarBrand}>
          <p className={styles.sidebarTitle}>Administración</p>
          <p className={styles.sidebarUser}>{nombre} · Administrador</p>
        </div>

        <nav aria-label="Vistas de administración" className={styles.navGroup}>
          <p className={styles.navGroupTitle}>Inicio</p>
          <button
            type="button"
            className={`${styles.navItem} ${vista === "votacion" ? styles.navItemActive : ""}`}
            aria-pressed={vista === "votacion"}
            onClick={() => setVista("votacion")}
          >
            <IconoEventos />
            <span>Panel de control</span>
          </button>

          <p className={styles.navGroupTitle} style={{ marginTop: "0.75rem" }}>Personas</p>
          <button
            type="button"
            className={`${styles.navItem} ${vista === "cuentas" ? styles.navItemActive : ""}`}
            aria-pressed={vista === "cuentas"}
            onClick={abrirCuentas}
          >
            <IconoUsuarios />
            <span>Personas y accesos</span>
          </button>
        </nav>

        <div className={styles.sidebarFooter}>
          {onCambiarRol && <button type="button" onClick={onCambiarRol}>Cambiar rol</button>}
          <button type="button" onClick={onCerrarSesion}>Cerrar sesión</button>
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topBar}>
          <div>
            <h2 className={styles.topBarTitle}>
              {vista === "votacion" ? "Panel de control" : "Personas y accesos"}
            </h2>
            <p className={styles.topBarSubtitle}>
              {vista === "votacion"
                ? "Lo que necesita tu atención y el estado de cada evento."
                : "Gestioná el acceso y los roles de las personas que participan en la votación."}
            </p>
          </div>
        </header>

        <div className="admin-paneles" hidden={vista !== "votacion"}>
          <PanelEdiciones api={api} alAgregarConfiguracion={actualizarCatalogos} />
          <PanelAsignaciones api={api} revisionCatalogos={revisionCatalogos} />
        </div>

        {cuentasVisitadas && (
          <div className="admin-paneles" hidden={vista !== "cuentas"}>
            <PanelUsuarios api={api} alCambiarJurados={actualizarCatalogos} />
            <PanelInvitaciones api={api} />
          </div>
        )}
      </div>
    </div>
  );
}
