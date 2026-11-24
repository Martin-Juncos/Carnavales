import { useEffect, useRef, useState } from "react";
import { ConfiguracionEdicion } from "./ConfiguracionEdicion.jsx";
import { Modal } from "../../../components/Modal/Modal.jsx";
import { VistaResultadosEdicion } from "../../resultados/ResultadosEdicion.jsx";
import styles from "../PanelAdministracion.module.css";

// Mensaje de la API (campo mensaje) para errores de negocio; si no llega ninguno, uno genérico.
function mensajeDeError(resultado) {
  return resultado.cuerpo?.mensaje ?? "No se pudo completar la operación. Intentá de nuevo.";
}

const ETIQUETA_ESTADO = {
  CONFIGURING: { texto: "En configuración", clase: styles.badgeConfiguring },
  OPEN: { texto: "Abierta", clase: styles.badgeOpen },
  CLOSED: { texto: "Votación cerrada", clase: styles.badgeClosed },
};

// Panel administrativo de ediciones (Hub "Mis eventos"): crear, buscar, filtrar, configurar, retirar y eliminar.
// La API decide quién es administrador: si responde 403, el panel no se muestra.
export function PanelEdiciones({ api, alAgregarConfiguracion }) {
  const [datos, setDatos] = useState(null);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [nombre, setNombre] = useState("");
  const [anio, setAnio] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("ALL");
  const [recargar, setRecargar] = useState(0);
  const [edicionActiva, setEdicionActiva] = useState(null);
  const [edicionResultados, setEdicionResultados] = useState(null);
  const [edicionAEliminar, setEdicionAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminacion, setErrorEliminacion] = useState("");
  const [edicionARetirar, setEdicionARetirar] = useState(null);
  const [retirando, setRetirando] = useState(false);
  const [errorRetiro, setErrorRetiro] = useState("");
  const botonConfigurar = useRef(null);
  const cancelarEliminacion = useRef(null);
  const cancelarRetiro = useRef(null);
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
    setRecargar((n) => n + 1);
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

  async function confirmarRetiro() {
    if (retirando || !edicionARetirar || typeof api.retirarEdicion !== "function") return;
    setRetirando(true);
    setErrorRetiro("");
    try {
      const resultado = await api.retirarEdicion(edicionARetirar.id);
      if (!resultado.ok) {
        setErrorRetiro(mensajeDeError(resultado));
        return;
      }
      setDatos((actual) => ({
        ...actual, items: actual.items.filter(({ id }) => id !== edicionARetirar.id),
      }));
      setEdicionARetirar(null);
      setMensaje("Edición retirada.");
      setRecargar((n) => n + 1);
      alAgregarConfiguracion?.();
      encabezado.current?.focus();
    } catch {
      setErrorRetiro("No se pudo confirmar el retiro. Revisá la conexión.");
    } finally {
      setRetirando(false);
    }
  }

  const consulta = busqueda.trim().toLowerCase();
  const edicionesFiltradas = (datos?.items ?? []).filter((edicion) => {
    if (filtroEstado !== "ALL" && edicion.estado !== filtroEstado) return false;
    if (!consulta) return true;
    return `${edicion.nombre} ${edicion.anio}`.toLowerCase().includes(consulta);
  });

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
            {datos.items.length > 0 && (
              <>
                <div className={styles.hubToolbar}>
                  <label className={styles.hubSearch}>
                    Buscar evento
                    <input
                      type="search"
                      aria-label="Buscar evento"
                      placeholder="Buscar por nombre o año…"
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                    />
                  </label>
                  <label className={styles.hubFilter}>
                    Estado
                    <select
                      aria-label="Filtrar por estado"
                      value={filtroEstado}
                      onChange={(e) => setFiltroEstado(e.target.value)}
                    >
                      <option value="ALL">Todos los estados</option>
                      <option value="CONFIGURING">En configuración</option>
                      <option value="OPEN">Abiertas</option>
                      <option value="CLOSED">Cerradas</option>
                    </select>
                  </label>
                </div>

                {edicionesFiltradas.length === 0 ? (
                  <p>No hay ediciones que coincidan con el filtro actual.</p>
                ) : (
                  <div className={styles.edicionesGrid} role="region" aria-label="Listado de ediciones">
                    {edicionesFiltradas.map((edicion) => {
                      const badge = ETIQUETA_ESTADO[edicion.estado] ?? { texto: edicion.estado, clase: styles.badgeClosed };
                      const puedeRetirar = edicion.estado !== "CLOSED" && typeof api.retirarEdicion === "function";
                      return (
                        <article key={edicion.id} className={styles.edicionCard}>
                          <div>
                            <div className={styles.edicionCardHeader}>
                              <span className={styles.edicionAnio}>{edicion.anio}</span>
                              <span className={`${styles.badge} ${badge.clase}`}>{badge.texto}</span>
                            </div>
                            <h3 className={styles.edicionNombre}>{edicion.nombre}</h3>
                            <p className={styles.edicionMeta}>
                              {edicion.version
                                ? `Reglamento · Versión ${edicion.version.numero} (${edicion.version.estado})`
                                : "Reglamento · Sin versión"}
                            </p>
                          </div>

                          <div className={styles.cardActions}>
                            <button
                              type="button"
                              className={styles.btnPrimary}
                              aria-label={`Configurar ${edicion.nombre} ${edicion.anio}`}
                              onClick={(evento) => {
                                botonConfigurar.current = evento.currentTarget;
                                setEdicionActiva(edicion);
                              }}
                            >
                              Administrar evento
                            </button>
                            {edicion.estado === "CLOSED" && typeof api.obtenerResultadosEdicion === "function" && (
                              <button
                                type="button"
                                aria-label={`Ver resultados ${edicion.nombre} ${edicion.anio}`}
                                onClick={() => setEdicionResultados(edicion)}
                              >
                                Ver resultados
                              </button>
                            )}
                            {puedeRetirar && (
                              <button
                                type="button"
                                aria-label={`Retirar ${edicion.nombre} ${edicion.anio}`}
                                onClick={() => {
                                  setErrorRetiro("");
                                  setEdicionARetirar(edicion);
                                }}
                              >
                                Retirar
                              </button>
                            )}
                            <button
                              type="button"
                              className={styles.btnDanger}
                              aria-label={`Eliminar ${edicion.nombre} ${edicion.anio}`}
                              onClick={() => {
                                setErrorEliminacion("");
                                setEdicionAEliminar(edicion);
                              }}
                            >
                              Eliminar
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            {datos.items.length === 0 && <p>No hay ediciones creadas. Crea una para empezar.</p>}
          </>
        )}
      </section>

      {edicionARetirar && (
        <Modal
          title="Retirar edición"
          initialFocusRef={cancelarRetiro}
          onClose={retirando ? () => {} : () => setEdicionARetirar(null)}
        >
          <p>
            Vas a retirar definitivamente <strong>{edicionARetirar.nombre} {edicionARetirar.anio}</strong> del listado operativo.
            Sus planillas, votos y cierres se conservan para auditoría y no se puede reactivar.
          </p>
          <p>No se puede retirar mientras una jornada competitiva esté en votación.</p>
          {errorRetiro && <p role="alert">{errorRetiro}</p>}
          <button ref={cancelarRetiro} type="button" disabled={retirando} onClick={() => setEdicionARetirar(null)}>
            Cancelar
          </button>{" "}
          <button type="button" disabled={retirando} onClick={confirmarRetiro}>
            {retirando ? "Retirando…" : "Confirmar retiro"}
          </button>
        </Modal>
      )}

      {edicionAEliminar && (
        <Modal
          title="Eliminar edición"
          initialFocusRef={cancelarEliminacion}
          onClose={eliminando ? () => {} : () => setEdicionAEliminar(null)}
        >
          <p>
            Vas a eliminar definitivamente <strong>{edicionAEliminar.nombre} {edicionAEliminar.anio}</strong>, incluidas todas sus jornadas, planillas, votos confirmados, cierres, auditoría atribuible y configuración. No se puede deshacer.
          </p>
          <p>No se puede eliminar mientras una jornada competitiva esté en votación.</p>
          {errorEliminacion && <p role="alert">{errorEliminacion}</p>}
          <button ref={cancelarEliminacion} type="button" disabled={eliminando} onClick={() => setEdicionAEliminar(null)}>
            Cancelar
          </button>{" "}
          <button type="button" disabled={eliminando} onClick={confirmarEliminacion}>
            {eliminando ? "Eliminando…" : "Confirmar eliminación"}
          </button>
        </Modal>
      )}

      {edicionActiva && (
        <ConfiguracionEdicion
          edicion={edicionActiva}
          api={api}
          alVolver={volver}
          alAgregar={alAgregarConfiguracion}
        />
      )}

      {edicionResultados && (
        <VistaResultadosEdicion
          edicion={edicionResultados}
          api={api}
          puedeOperar={false}
          alVolver={() => setEdicionResultados(null)}
        />
      )}
    </>
  );
}
