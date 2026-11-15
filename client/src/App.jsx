import { useEffect, useState } from "react";
import { Acceso } from "./Acceso.jsx";
import { crearClienteApi } from "./cliente-api.js";

// Raíz de la aplicación. Al cargar, consulta si ya hay una sesión; si no la hay, muestra el acceso.
// Cliente único para toda la aplicación: una referencia estable evita repetir efectos en cada render.
const apiPorDefecto = crearClienteApi();

export function App({ api = apiPorDefecto }) {
  // cargando: true mientras se consulta la sesión inicial.
  const [cargando, setCargando] = useState(true);
  // usuario: datos de la persona con sesión, o null si no hay sesión.
  const [usuario, setUsuario] = useState(null);

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

  return (
    <main>
      <h1>Carnavales · Votación</h1>
      {usuario ? (
        <section>
          <p>Sesión iniciada como {usuario.email}.</p>
          <button type="button" onClick={cerrarSesion}>Cerrar sesión</button>
        </section>
      ) : (
        <Acceso api={api} onSesionIniciada={setUsuario} />
      )}
    </main>
  );
}
