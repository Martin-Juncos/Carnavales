import { useState } from "react";
import { PanelAsignaciones } from "./PanelAsignaciones.jsx";
import { PanelEdiciones } from "./PanelEdiciones.jsx";
import { PanelInvitaciones } from "./PanelInvitaciones.jsx";
import { PanelUsuarios } from "./PanelUsuarios.jsx";
import "./styles/administracion.css";

export function PanelAdministracion({ api, nombre, onCambiarRol, onCerrarSesion }) {
  const [vista, setVista] = useState("votacion");
  const [cuentasVisitadas, setCuentasVisitadas] = useState(false);
  const [revisionCatalogos, setRevisionCatalogos] = useState(0);

  function abrirCuentas() {
    setVista("cuentas");
    setCuentasVisitadas(true);
  }

  return (
    <div className="admin-contenido">
      <header className="admin-cabecera">
        <div>
          <h2>Administración</h2>
          <p>{nombre} · Administrador</p>
        </div>
        <div className="admin-acciones">
          {onCambiarRol && <button type="button" onClick={onCambiarRol}>Cambiar rol</button>}
          <button type="button" onClick={onCerrarSesion}>Cerrar sesión</button>
        </div>
      </header>
      <nav className="admin-vistas" aria-label="Vistas de administración">
        <button type="button" aria-pressed={vista === "votacion"} onClick={() => setVista("votacion")}>
          Control de votación
        </button>
        <button type="button" aria-pressed={vista === "cuentas"} onClick={abrirCuentas}>
          Usuarios e invitaciones
        </button>
      </nav>
      <div className="admin-paneles" hidden={vista !== "votacion"}>
        <p>Consulta el estado de las ediciones y organiza la cobertura de jurados por noche.</p>
        <PanelEdiciones api={api} alAgregarConfiguracion={() => setRevisionCatalogos((n) => n + 1)} />
        <PanelAsignaciones api={api} revisionCatalogos={revisionCatalogos} />
      </div>
      {cuentasVisitadas && (
        <div className="admin-paneles" hidden={vista !== "cuentas"}>
          <p>Gestiona el acceso de las personas que participan en la votación.</p>
          <PanelUsuarios api={api} />
          <PanelInvitaciones api={api} />
        </div>
      )}
    </div>
  );
}
