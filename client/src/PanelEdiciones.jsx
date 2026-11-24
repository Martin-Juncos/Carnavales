import { useEffect, useRef, useState } from "react";
import { ConfiguracionEdicion } from "./ConfiguracionEdicion.jsx";
import { Modal } from "./components/Modal/Modal.jsx";
import { VistaResultadosEdicion } from "./ResultadosEdicion.jsx";

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
  const [edicionResultados, setEdicionResultados] = useState(null);
  const [edicionAEliminar, setEdicionAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminacion, setErrorEliminacion] = useState("");
  const botonConfigurar = useRef(null);
  const cancelarEliminacion = useRef(null);
  const encabezado = useRef(null);

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

  async function confirmarEliminacion() {
    if (eliminando || !edicionAEliminar) return;
    setEliminando(true);
    setErrorEliminacion("");
    try {
      const resultado = await api.eliminarEdicion(edicionAEliminar.id);
      if (!resultado.ok) {
        setErrorEliminacion(mensajeDeError(resultado));
        return;
      }
      setDatos((actual) => ({
        ...actual, items: actual.items.filter(({ id }) => id !== edicionAEliminar.id),
      }));
      setEdicionAEliminar(null);
      setMensaje("Edición eliminada.");
      setRecargar((n) => n + 1);
      encabezado.current?.focus();
    } catch {
      setErrorEliminacion("No se pudo confirmar la eliminación. Revisa la conexión.");
    } finally {
      setEliminando(false);
    }
  }

  return (
    <>
    <section hidden={edicionActiva !== null || edicionResultados !== null}>
      <h2 ref={encabezado} tabIndex={-1}>Ediciones</h2>
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
                      CONFIGURING: "En configuración", OPEN: "Abierta", CLOSED: "Votación cerrada",
                    })[edicion.estado] ?? edicion.estado}</span></td>
                  <td>{edicion.version ? `Versión ${edicion.version.numero}: ${edicion.version.estado}` : "Sin versión"}</td>
                  <td><button type="button" aria-label={`Configurar ${edicion.nombre} ${edicion.anio}`} onClick={(evento) => {
                    botonConfigurar.current = evento.currentTarget;
                    setEdicionActiva(edicion);
                  }}>Configurar</button>
                  {edicion.estado === "CLOSED" && typeof api.obtenerResultadosEdicion === "function" && (
                    <button type="button" aria-label={`Ver resultados ${edicion.nombre} ${edicion.anio}`} onClick={() => {
                      setEdicionResultados(edicion);
                    }}>Ver resultados</button>
                  )}
                  <button type="button" aria-label={`Eliminar ${edicion.nombre} ${edicion.anio}`} onClick={() => {
                    setErrorEliminacion("");
                    setEdicionAEliminar(edicion);
                  }}>Eliminar</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>}
          {datos.items.length === 0 && <p>No hay ediciones creadas. Crea una para empezar.</p>}
        </>
      )}
    </section>
    {edicionAEliminar && (
      <Modal title="Eliminar edición" initialFocusRef={cancelarEliminacion}
        onClose={eliminando ? () => {} : () => setEdicionAEliminar(null)}>
        <p>Vas a eliminar definitivamente <strong>{edicionAEliminar.nombre} {edicionAEliminar.anio}</strong>, incluidas todas sus jornadas, planillas, votos confirmados, cierres, auditoría atribuible y configuración. No se puede deshacer.</p>
        <p>No se puede eliminar mientras una jornada competitiva esté en votación.</p>
        {errorEliminacion && <p role="alert">{errorEliminacion}</p>}
        <button ref={cancelarEliminacion} type="button" disabled={eliminando} onClick={() => setEdicionAEliminar(null)}>Cancelar</button>{" "}
        <button type="button" disabled={eliminando} onClick={confirmarEliminacion}>
          {eliminando ? "Eliminando…" : "Confirmar eliminación"}
        </button>
      </Modal>
    )}
    {edicionActiva && (
      <ConfiguracionEdicion edicion={edicionActiva} api={api} alVolver={volver}
        alAgregar={alAgregarConfiguracion} />
    )}
    {edicionResultados && (
      <VistaResultadosEdicion edicion={edicionResultados} api={api} puedeOperar={false}
        alVolver={() => setEdicionResultados(null)} />
    )}
    </>
  );
}
