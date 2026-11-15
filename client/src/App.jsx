import { useEffect, useState } from "react";
import { Acceso } from "./Acceso.jsx";
import { AceptarInvitacion } from "./AceptarInvitacion.jsx";
import { crearClienteApi } from "./cliente-api.js";
import { PanelInvitaciones } from "./PanelInvitaciones.jsx";
import { PanelUsuarios } from "./PanelUsuarios.jsx";
import { esRutaAceptarInvitacion, tokenDeBusqueda } from "./ruta-invitacion.js";

// Cliente único para toda la aplicación: una referencia estable evita repetir efectos en cada render.
const apiPorDefecto = crearClienteApi();

// Raíz de la aplicación. Según la ruta muestra la aceptación de invitación o el acceso,
// y al cargar consulta si ya hay una sesión.
export function App({ api = apiPorDefecto }) {
  // cargando: true mientras se consulta la sesión inicial.
  const [cargando, setCargando] = useState(true);
  // usuario: datos de la persona con sesión, o null si no hay sesión.
  const [usuario, setUsuario] = useState(null);
  // Tras crear una cuenta por invitación se muestra un aviso y se pide iniciar sesión.
  const [cuentaCreada, setCuentaCreada] = useState(false);
  // Ruta de invitación: se lee una vez al cargar.
  const [invitacion] = useState(() => esRutaAceptarInvitacion(window.location.pathname));
  const [token] = useState(() => tokenDeBusqueda(window.location.search));

  useEffect(() => {
    api
      .obtenerSesion()
      .then((resultado) => setUsuario(resultado.cuerpo?.user ?? null))
      .catch(() => setUsuario(null))
      .finally(() => setCargando(false));
  }, [api]);

  // Cierra la sesión en el servidor y vuelve a la pantalla de acceso, aunque la petición falle.
  async function cerrarSesion() {
    await api.cerrarSesion().catch(() => null);
    setUsuario(null);
  }

  if (cargando) {
    return <main><p>Cargando…</p></main>;
  }

  let contenido;
  if (usuario) {
    contenido = (
      <section>
        <p>Sesión iniciada como {usuario.email}.</p>
        <button type="button" onClick={cerrarSesion}>Cerrar sesión</button>
        <PanelUsuarios api={api} />
        <PanelInvitaciones api={api} />
      </section>
    );
  } else if (invitacion && !cuentaCreada) {
    contenido = <AceptarInvitacion api={api} token={token} onCuentaCreada={() => setCuentaCreada(true)} />;
  } else if (cuentaCreada) {
    contenido = (
      <section>
        <p>Cuenta creada. Ahora podés iniciar sesión con tu correo y contraseña.</p>
        <Acceso api={api} onSesionIniciada={setUsuario} />
      </section>
    );
  } else {
    contenido = <Acceso api={api} onSesionIniciada={setUsuario} />;
  }

  return (
    <main>
      <h1>Carnavales · Votación</h1>
      {contenido}
    </main>
  );
}
