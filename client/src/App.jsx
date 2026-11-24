import { useEffect, useState } from "react";
import { AceptarInvitacion } from "./features/auth/AceptarInvitacion.jsx";
import { crearClienteApi } from "./shared/api/cliente-api.js";
import { PanelAdministracion } from "./features/admin/PanelAdministracion.jsx";
import { PanelEscribano } from "./features/escribano/PanelEscribano.jsx";
import { PanelJurado } from "./features/jurado/PanelJurado.jsx";
import { guardarPlanillaLocal as almacenamientoJurado } from "./features/jurado/planilla-local.js";
import { RecuperarContrasena } from "./features/auth/RecuperarContrasena.jsx";
import { RestablecerContrasena } from "./features/auth/RestablecerContrasena.jsx";
import { SelectorRol } from "./shared/SelectorRol.jsx";
import { borrarRolGuardado, elegirRolInicial, guardarRol, leerRolGuardado, puedeCambiarRol } from "./shared/rol-activo.js";
import { etiquetaDeRol } from "./shared/roles.js";
import { esRutaAceptarInvitacion, esRutaRestablecerContrasena, tokenDeBusqueda, volverAlInicio } from "./features/auth/ruta-invitacion.js";
import { LoginPage } from "./features/auth/LoginPage/LoginPage.jsx";

// Cliente único para toda la aplicación: una referencia estable evita repetir efectos en cada render.
const apiPorDefecto = crearClienteApi();

// Envoltorio común de las pantallas que no son el acceso: encabezado y landmark principal.
function Pantalla({ children }) {
  return (
    <main>
      <h1>Carnavales · Votación</h1>
      {children}
    </main>
  );
}

// Raíz de la aplicación. Según la ruta muestra la aceptación de invitación o el acceso.
// Con sesión, carga los roles de la persona y muestra el rol activo, con selector si tiene varios.
export function App({ api = apiPorDefecto, guardarPlanillaLocal = almacenamientoJurado }) {
  // cargando: true mientras se consulta la sesión inicial.
  const [cargando, setCargando] = useState(true);
  // usuario: datos de la persona con sesión, o null si no hay sesión.
  const [usuario, setUsuario] = useState(null);
  // roles: códigos asignados a la persona; null mientras se cargan.
  const [roles, setRoles] = useState(null);
  // rolActivo: rol con el que entró; null si todavía debe elegir.
  const [rolActivo, setRolActivo] = useState(null);
  // Tras crear una cuenta por invitación se muestra un aviso y se pide iniciar sesión.
  const [cuentaCreada, setCuentaCreada] = useState(false);
  // Pantalla de solicitud de recuperación de contraseña, abierta desde el acceso.
  const [recuperando, setRecuperando] = useState(false);
  // Ruta de invitación: se lee una vez al cargar.
  const [invitacion] = useState(() => esRutaAceptarInvitacion(window.location.pathname));
  const [token] = useState(() => tokenDeBusqueda(window.location.search));
  // Ruta del enlace de restablecimiento de contraseña, leída una vez al cargar.
  const [restableciendo, setRestableciendo] = useState(() => esRutaRestablecerContrasena(window.location.pathname));

  // Al cargar, consulta si ya hay una sesión.
  useEffect(() => {
    api
      .obtenerSesion()
      .then((resultado) => setUsuario(resultado.cuerpo?.user ?? null))
      .catch(() => setUsuario(null))
      .finally(() => setCargando(false));
  }, [api]);

  // Con sesión, carga los roles y decide el rol activo: el guardado si sigue asignado,
  // el único rol si tiene uno, o ninguno si debe elegir.
  useEffect(() => {
    if (!usuario) return;
    let cancelado = false;
    api.obtenerMisRoles().then((resultado) => {
      if (cancelado) return;
      const lista = resultado.ok ? resultado.cuerpo?.roles ?? [] : [];
      setRoles(lista);
      setRolActivo(elegirRolInicial({ roles: lista, guardado: leerRolGuardado() }));
    });
    return () => {
      cancelado = true;
    };
  }, [api, usuario]);

  // Guarda la elección del selector y entra con ese rol.
  function elegirRol(rol) {
    guardarRol(rol);
    setRolActivo(rol);
  }

  // Vuelve al selector sin cerrar la sesión.
  function cambiarRol() {
    setRolActivo(null);
  }

  // Cierra la sesión en el servidor y descarta el rol activo, aunque la petición falle.
  async function cerrarSesion() {
    await api.cerrarSesion().catch(() => null);
    borrarRolGuardado();
    setRolActivo(null);
    setRoles(null);
    setUsuario(null);
  }

  if (cargando) {
    return <main><p>Cargando…</p></main>;
  }

  if (usuario) {
    return (
      <Pantalla>
        <Panel
          usuario={usuario}
          roles={roles}
          rolActivo={rolActivo}
          api={api}
          guardarPlanillaLocal={guardarPlanillaLocal}
          onElegir={elegirRol}
          onCambiarRol={cambiarRol}
          onCerrarSesion={cerrarSesion}
        />
      </Pantalla>
    );
  }
  if (recuperando) {
    return (
      <Pantalla>
        <RecuperarContrasena api={api} onVolver={() => setRecuperando(false)} />
      </Pantalla>
    );
  }
  if (restableciendo) {
    return (
      <Pantalla>
        <RestablecerContrasena
          api={api}
          token={token}
          onListo={() => {
            volverAlInicio();
            setRestableciendo(false);
          }}
        />
      </Pantalla>
    );
  }
  if (invitacion && !cuentaCreada) {
    return (
      <Pantalla>
        <AceptarInvitacion
          api={api}
          token={token}
          onCuentaCreada={() => {
            volverAlInicio();
            setCuentaCreada(true);
          }}
        />
      </Pantalla>
    );
  }

  // Acceso: la pantalla trae su propio landmark principal.
  return (
    <>
      {cuentaCreada && <p role="status">Cuenta creada. Ahora podés iniciar sesión con tu correo y contraseña.</p>}
      <LoginPage api={api} onSesionIniciada={setUsuario} onRecuperar={() => setRecuperando(true)} />
    </>
  );
}

// Vista de la persona con sesión: rol activo, selector si debe elegir y paneles según el rol.
function Panel({ usuario, roles, rolActivo, api, guardarPlanillaLocal, onElegir, onCambiarRol, onCerrarSesion }) {
  if (roles === null) {
    return <p>Cargando roles…</p>;
  }
  if (roles.length === 0) {
    return (
      <section>
        <p>Bienvenido, {usuario.name || usuario.email}</p>
        <p>Tu cuenta no tiene roles asignados. Consultá con el administrador.</p>
        <button type="button" onClick={onCerrarSesion}>Cerrar sesión</button>
      </section>
    );
  }
  if (rolActivo === null) {
    return (
      <section>
        <p>Bienvenido, {usuario.name || usuario.email}</p>
        <SelectorRol roles={roles} onElegir={onElegir} />
        <button type="button" onClick={onCerrarSesion}>Cerrar sesión</button>
      </section>
    );
  }
  if (rolActivo === "ADMINISTRADOR") {
    return (
      <PanelAdministracion
        api={api}
        nombre={usuario.name || usuario.email}
        onCambiarRol={puedeCambiarRol(roles) ? onCambiarRol : undefined}
        onCerrarSesion={onCerrarSesion}
      />
    );
  }
  return (
    <section>
      <p>Bienvenido, {usuario.name || usuario.email} - {etiquetaDeRol(rolActivo)}</p>
      {puedeCambiarRol(roles) && <button type="button" onClick={onCambiarRol}>Cambiar rol</button>}{" "}
      <button type="button" onClick={onCerrarSesion}>Cerrar sesión</button>
      {rolActivo === "JURADO" && (
        <PanelJurado key={usuario.id} api={api} juradoId={usuario.id} guardar={guardarPlanillaLocal} />
      )}
      {rolActivo === "ESCRIBANO" && <PanelEscribano key={usuario.id} api={api} />}
    </section>
  );
}
