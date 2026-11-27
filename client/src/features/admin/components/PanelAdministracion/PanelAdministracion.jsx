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

function IconoAsignaciones() {
  return (
    <svg className={styles.icon} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="4" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 3.5h6v2.5H9z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m8.5 12 2.2 2.2 4.3-4.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const VISTAS = {
  votacion: {
    titulo: "Panel de control",
    subtitulo: "Lo que necesita tu atención y el estado de cada evento.",
  },
  cuentas: {
    titulo: "Personas y accesos",
    subtitulo: "Gestioná el acceso y los roles de las personas que participan en la votación.",
  },
  asignaciones: {
    titulo: "Asignaciones",
    subtitulo: "Asigná jurados por noche y especialidad, y gestioná suplencias y relevos.",
  },
};

const CLAVE_VISTA_ADMIN = "adminVistaActiva";

function leerVistaInicial(almacenamiento = globalThis.sessionStorage) {
  try {
    const guardada = almacenamiento?.getItem(CLAVE_VISTA_ADMIN);
    if (guardada && Object.hasOwn(VISTAS, guardada)) return guardada;
  } catch {
    // Sin sessionStorage se inicia en la vista por defecto.
  }
  return "votacion";
}

function guardarVista(vista, almacenamiento = globalThis.sessionStorage) {
  try {
    almacenamiento?.setItem(CLAVE_VISTA_ADMIN, vista);
  } catch {
    // Si sessionStorage no está disponible, solo se mantiene en memoria.
  }
}

export function PanelAdministracion({ api, nombre, onCambiarRol, onCerrarSesion }) {
  const [vista, setVista] = useState(leerVistaInicial);
  const [cuentasVisitadas, setCuentasVisitadas] = useState(() => leerVistaInicial() === "cuentas");
  const [revisionCatalogos, setRevisionCatalogos] = useState(0);

  function actualizarCatalogos() {
    setRevisionCatalogos((n) => n + 1);
  }

  function cambiarVista(nuevaVista) {
    setVista(nuevaVista);
    guardarVista(nuevaVista);
    if (nuevaVista === "cuentas") {
      setCuentasVisitadas(true);
    }
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
            onClick={() => cambiarVista("votacion")}
          >
            <IconoEventos />
            <span>Panel de control</span>
          </button>

          <p className={styles.navGroupTitle} style={{ marginTop: "0.75rem" }}>Personas</p>
          <button
            type="button"
            className={`${styles.navItem} ${vista === "cuentas" ? styles.navItemActive : ""}`}
            aria-pressed={vista === "cuentas"}
            onClick={() => cambiarVista("cuentas")}
          >
            <IconoUsuarios />
            <span>Personas y accesos</span>
          </button>

          <p className={styles.navGroupTitle} style={{ marginTop: "0.75rem" }}>Operación</p>
          <button
            type="button"
            className={`${styles.navItem} ${vista === "asignaciones" ? styles.navItemActive : ""}`}
            aria-pressed={vista === "asignaciones"}
            onClick={() => cambiarVista("asignaciones")}
          >
            <IconoAsignaciones />
            <span>Asignaciones</span>
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
            <h2 className={styles.topBarTitle}>{VISTAS[vista].titulo}</h2>
            <p className={styles.topBarSubtitle}>{VISTAS[vista].subtitulo}</p>
          </div>
        </header>

        <div className="admin-paneles" hidden={vista !== "votacion"}>
          <PanelEdiciones api={api} alAgregarConfiguracion={actualizarCatalogos} />
        </div>

        <div className="admin-paneles" hidden={vista !== "asignaciones"}>
          <PanelAsignaciones api={api} revisionCatalogos={revisionCatalogos} />
        </div>

        {cuentasVisitadas && (
          <div className={`admin-paneles ${styles.cuentasPaneles}`} hidden={vista !== "cuentas"}>
            <PanelUsuarios api={api} alCambiarJurados={actualizarCatalogos} />
            <PanelInvitaciones api={api} />
          </div>
        )}
      </div>
    </div>
  );
}
