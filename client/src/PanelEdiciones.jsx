import { useEffect, useRef, useState } from "react";
import { ConfiguracionEdicion } from "./ConfiguracionEdicion.jsx";

// Mensaje de la API (campo mensaje) para errores de negocio; si no llega ninguno, uno genérico.
function mensajeDeError(resultado) {
  return resultado.cuerpo?.mensaje ?? "No se pudo completar la operación. Intentá de nuevo.";
}

// Panel administrativo de ediciones: crear una edición vacía y ver su estado.
// La API decide quién es administrador: si responde 403, el panel no se muestra.
export function PanelEdiciones({ api, alAgregarConfiguracion }) {
  const [datos, setDatos] = useState(null);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [nombre, setNombre] = useState("");
  const [anio, setAnio] = useState("");
  const [recargar, setRecargar] = useState(0);
  const [edicionActiva, setEdicionActiva] = useState(null);
  const botonConfigurar = useRef(null);

  // Al montar y después de cada alta, pide el listado a la API.
  useEffect(() => {
    let cancelado = false;
    api.listarEdiciones().then((resultado) => {
      if (cancelado) return;
      if (resultado.status === 403) {
        setSinPermiso(true);
        return;
      }
      if (resultado.ok) setDatos(resultado.cuerpo);
      else setMensaje(mensajeDeError(resultado));
    });
    return () => {
      cancelado = true;
    };
  }, [api, recargar]);

  useEffect(() => {
    if (!edicionActiva) botonConfigurar.current?.focus();
  }, [edicionActiva]);

  // Sin permiso de administrador no se muestra nada de administración.
  if (sinPermiso) {
    return null;
  }

  function volver() {
    setEdicionActiva(null);
  }

  async function crear(evento) {
    evento.preventDefault();
    const resultado = await api.crearEdicion(nombre.trim(), anio.trim());
    setMensaje(resultado.ok ? "Edición creada." : mensajeDeError(resultado));
    if (resultado.ok) {
      setNombre("");
      setAnio("");
      setRecargar((n) => n + 1);
    }
  }

  return (
    <>
    <section hidden={edicionActiva !== null}>
      <h2>Ediciones</h2>
      <form onSubmit={crear}>
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </label>
        <label>
          Año
          <input type="number" min="1" step="1" value={anio} onChange={(e) => setAnio(e.target.value)} required />
        </label>
        <button type="submit">Crear edición</button>
      </form>

      {mensaje && <p role="status">{mensaje}</p>}
      {!datos && !mensaje && <p role="status">Cargando ediciones…</p>}

      {datos && (
        <>
          {datos.items.length > 0 && <div className="admin-tabla admin-tabla-ediciones" role="region" aria-label="Listado de ediciones" tabIndex={0}><table>
            <thead>
              <tr>
                <th>Año</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Reglamento</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((edicion) => (
                <tr key={edicion.id}>
                  <td>{edicion.anio}</td>
                  <td>{edicion.nombre}</td>
                    <td><span className="admin-estado">{({
                      CONFIGURING: "En configuración", OPEN: "Abierta",
                    })[edicion.estado] ?? edicion.estado}</span></td>
                  <td>{edicion.version ? `Versión ${edicion.version.numero}: ${edicion.version.estado}` : "Sin versión"}</td>
                  <td><button type="button" aria-label={`Configurar ${edicion.nombre} ${edicion.anio}`} onClick={(evento) => {
                    botonConfigurar.current = evento.currentTarget;
                    setEdicionActiva(edicion);
                  }}>Configurar</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>}
          {datos.items.length === 0 && <p>No hay ediciones creadas. Crea una para empezar.</p>}
        </>
      )}
    </section>
    {edicionActiva && (
      <ConfiguracionEdicion edicion={edicionActiva} api={api} alVolver={volver}
        alAgregar={alAgregarConfiguracion} />
    )}
    </>
  );
}
