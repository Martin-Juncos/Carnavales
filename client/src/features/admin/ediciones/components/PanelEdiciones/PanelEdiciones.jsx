import { useEffect, useId, useRef, useState } from "react";
import { ConfiguracionEdicion } from "../ConfiguracionEdicion/ConfiguracionEdicion.jsx";
import { Button } from "../../../../../components/Button/Button.jsx";
import { Modal } from "../../../../../components/Modal/Modal.jsx";
import { VistaResultadosEdicion } from "../../../../resultados/components/ResultadosEdicion/ResultadosEdicion.jsx";
import { cargarResumenEdicion, estadosDePasos, progresoDeEdicion } from "../../resumen-edicion.js";
import styles from "./PanelEdiciones.module.css";

// Mensaje de la API (campo mensaje) para errores de negocio; si no llega ninguno, uno genérico.
function mensajeDeError(resultado) {
  return resultado.cuerpo?.mensaje ?? "No se pudo completar la operación. Intentá de nuevo.";
}

const ETIQUETA_ESTADO = {
  CONFIGURING: { texto: "En preparación", clase: styles.pillPreparacion },
  OPEN: { texto: "Abierta", clase: styles.pillAbierta },
  CLOSED: { texto: "Cerrada", clase: styles.pillCerrada },
};

const VERSIONES_PUBLICADAS = ["PUBLICADA", "CONGELADA"];

function TarjetaEdicion({
  edicion, progreso, puedeRetirar, menuAbierto, alAlternarMenu, alConfigurar, alVerResultados,
  alRetirar, alEliminar, puedeVerResultados,
}) {
  const idMenu = useId();
  const badge = ETIQUETA_ESTADO[edicion.estado] ?? { texto: edicion.estado, clase: styles.pillCerrada };
  const nombreCompleto = `${edicion.nombre} ${edicion.anio}`;

  return (
    <article className={styles.card}>
      <div className={styles.cardCabecera}>
        <span className={styles.anio}>{edicion.anio}</span>
        <span className={`${styles.pill} ${badge.clase}`}>{badge.texto}</span>
      </div>
      <h3 className={styles.nombre}>{edicion.nombre}</h3>

      {progreso && (
        <div className={styles.progreso}>
          <div className={styles.progresoTexto}>
            <span>Configuración</span>
            <span>{progreso.completos} de {progreso.total} pasos</span>
          </div>
          <div className={styles.barra} aria-hidden="true">
            <div className={styles.barraRelleno} style={{ width: `${(progreso.completos / progreso.total) * 100}%` }} />
          </div>
        </div>
      )}

      <div className={styles.acciones}>
        <button
          type="button"
          className={styles.btnPrimario}
          aria-label={`Administrar evento ${nombreCompleto}`}
          onClick={alConfigurar}
        >
          Administrar evento
        </button>
        {puedeVerResultados && (
          <button
            type="button"
            className={styles.btnSecundario}
            aria-label={`Ver resultados ${nombreCompleto}`}
            onClick={alVerResultados}
          >
            Ver resultados
          </button>
        )}
        <button
          type="button"
          className={styles.btnSecundario}
          aria-expanded={menuAbierto}
          aria-controls={idMenu}
          aria-label={`Más opciones de ${nombreCompleto}`}
          onClick={alAlternarMenu}
        >
          Más opciones
        </button>
      </div>

      {menuAbierto && (
        <div id={idMenu} className={styles.menu} role="group" aria-label={`Más opciones de ${nombreCompleto}`}>
          {puedeRetirar && (
            <button type="button" className={styles.menuItem} aria-label={`Retirar del listado ${nombreCompleto}`} onClick={alRetirar}>
              <span className={styles.menuTitulo}>Retirar del listado</span>
              <span className={styles.menuDescripcion}>Conserva todos los datos. No se puede reactivar.</span>
            </button>
          )}
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuPeligro}`}
            aria-label={`Eliminar definitivamente ${nombreCompleto}`}
            onClick={alEliminar}
          >
            <span className={styles.menuTitulo}>Eliminar definitivamente</span>
            <span className={styles.menuDescripcion}>Borra el evento y su historial. No se puede deshacer.</span>
          </button>
        </div>
      )}
    </article>
  );
}

// Panel "Mis eventos": crear, buscar, filtrar, configurar, retirar y eliminar.
// La API decide quién es administrador: si responde 403, el panel no se muestra.
export function PanelEdiciones({ api, alAgregarConfiguracion }) {
  const [datos, setDatos] = useState(null);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [nombre, setNombre] = useState("");
  const [anio, setAnio] = useState("");
  const [errorCreacion, setErrorCreacion] = useState("");
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("ALL");
  const [recargar, setRecargar] = useState(0);
  const [resumenes, setResumenes] = useState({});
  const [menuAbierto, setMenuAbierto] = useState(null);
  const [edicionActiva, setEdicionActiva] = useState(null);
  const [edicionResultados, setEdicionResultados] = useState(null);
  const [edicionAEliminar, setEdicionAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminacion, setErrorEliminacion] = useState("");
  const [segundaConfirmacionEdicion, setSegundaConfirmacionEdicion] = useState(false);
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

  // Conteos de cada evento para su progreso. Si la API no responde, la tarjeta no muestra progreso.
  useEffect(() => {
    if (!datos?.items?.length) return undefined;
    const controlador = new AbortController();
    Promise.all(datos.items.map(async (edicion) => [
      edicion.id,
      await cargarResumenEdicion(api, edicion.id, controlador.signal),
    ])).then((pares) => {
      if (!controlador.signal.aborted) setResumenes(Object.fromEntries(pares));
    });
    return () => controlador.abort();
  }, [api, datos]);

  useEffect(() => {
    if (!edicionActiva) botonConfigurar.current?.focus();
  }, [edicionActiva]);

  // Sin permiso de administrador no se muestra nada de administración.
  if (sinPermiso) {
    return null;
  }

  function progresoDe(edicion) {
    const resumen = resumenes[edicion.id];
    if (!resumen) return null;
    const pasos = estadosDePasos({
      estado: edicion.estado,
      ...resumen,
      reglamentoPublicado: VERSIONES_PUBLICADAS.includes(edicion.version?.estado),
    });
    return pasos ? progresoDeEdicion(pasos) : null;
  }

  function volver() {
    setEdicionActiva(null);
    setRecargar((n) => n + 1);
  }

  async function crear(evento) {
    evento.preventDefault();
    const resultado = await api.crearEdicion(nombre.trim(), anio.trim());
    if (resultado.ok) {
      setNombre("");
      setAnio("");
      setErrorCreacion("");
      setNuevoAbierto(false);
      setMensaje("Edición creada.");
      setRecargar((n) => n + 1);
    } else {
      setErrorCreacion(mensajeDeError(resultado));
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
      setSegundaConfirmacionEdicion(false);
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
  const todas = datos?.items ?? [];
  const edicionesFiltradas = todas.filter((edicion) => {
    if (filtroEstado !== "ALL" && edicion.estado !== filtroEstado) return false;
    if (!consulta) return true;
    return `${edicion.nombre} ${edicion.anio}`.toLowerCase().includes(consulta);
  });
  const contar = (estado) => todas.filter((edicion) => edicion.estado === estado).length;

  // La primera edición en preparación con pasos pendientes es el siguiente paso sugerido.
  const siguiente = todas.find((edicion) => {
    const progreso = progresoDe(edicion);
    return edicion.estado === "CONFIGURING" && progreso && progreso.completos < progreso.total;
  });
  const progresoSiguiente = siguiente ? progresoDe(siguiente) : null;

  return (
    <>
      <section hidden={edicionActiva !== null || edicionResultados !== null}>
        <div className={styles.encabezado}>
          <h2 ref={encabezado} tabIndex={-1} className={styles.tituloSeccion}>Mis eventos</h2>
          <Button variant="primary" onClick={() => { setErrorCreacion(""); setNuevoAbierto(true); }}>
            Nuevo evento
          </Button>
        </div>

        {mensaje && <p role="status">{mensaje}</p>}
        {!datos && !mensaje && <p role="status">Cargando eventos…</p>}

        {datos && (
          <>
            {todas.length > 0 && (
              <div className={styles.resumen} aria-label="Resumen de eventos">
                <div className={styles.tile}>
                  <span className={styles.tileNumero}>{contar("CONFIGURING")}</span>
                  <span className={styles.tileEtiqueta}>En preparación</span>
                </div>
                <div className={styles.tile}>
                  <span className={styles.tileNumero}>{contar("OPEN")}</span>
                  <span className={styles.tileEtiqueta}>Abiertas</span>
                </div>
                <div className={styles.tile}>
                  <span className={styles.tileNumero}>{contar("CLOSED")}</span>
                  <span className={styles.tileEtiqueta}>Cerradas</span>
                </div>
              </div>
            )}

            {siguiente && progresoSiguiente && (
              <section className={styles.siguiente} aria-label="Siguiente paso">
                <p className={styles.siguienteTexto}>
                  <strong>Siguiente paso</strong>
                  Falta terminar la configuración de {siguiente.nombre} {siguiente.anio}:
                  {" "}{progresoSiguiente.completos} de {progresoSiguiente.total} pasos completos.
                </p>
                <Button variant="secondary" onClick={() => setEdicionActiva(siguiente)}>
                  Ir a la configuración
                </Button>
              </section>
            )}

            {todas.length > 0 && (
              <div className={styles.herramientas}>
                <label className={styles.buscador}>
                  Buscar evento
                  <input
                    type="search"
                    className={styles.control}
                    aria-label="Buscar evento"
                    placeholder="Buscar por nombre o año…"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                  />
                </label>
                <label className={styles.filtro}>
                  Estado
                  <select
                    className={styles.control}
                    aria-label="Filtrar por estado"
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value)}
                  >
                    <option value="ALL">Todos los estados</option>
                    <option value="CONFIGURING">En preparación</option>
                    <option value="OPEN">Abiertas</option>
                    <option value="CLOSED">Cerradas</option>
                  </select>
                </label>
              </div>
            )}

            {todas.length > 0 && edicionesFiltradas.length === 0 && (
              <p className={styles.vacio}>No hay eventos que coincidan con el filtro actual.</p>
            )}

            {edicionesFiltradas.length > 0 && (
              <div className={styles.grid} role="region" aria-label="Listado de eventos">
                {edicionesFiltradas.map((edicion) => (
                  <TarjetaEdicion
                    key={edicion.id}
                    edicion={edicion}
                    progreso={progresoDe(edicion)}
                    puedeRetirar={edicion.estado !== "CLOSED" && typeof api.retirarEdicion === "function"}
                    puedeVerResultados={edicion.estado === "CLOSED" && typeof api.obtenerResultadosEdicion === "function"}
                    menuAbierto={menuAbierto === edicion.id}
                    alAlternarMenu={() => setMenuAbierto((actual) => (actual === edicion.id ? null : edicion.id))}
                    alConfigurar={(evento) => {
                      botonConfigurar.current = evento.currentTarget;
                      setEdicionActiva(edicion);
                    }}
                    alVerResultados={() => setEdicionResultados(edicion)}
                    alRetirar={() => {
                      setMenuAbierto(null);
                      setErrorRetiro("");
                      setEdicionARetirar(edicion);
                    }}
                    alEliminar={() => {
                      setMenuAbierto(null);
                      setErrorEliminacion("");
                      setEdicionAEliminar(edicion);
                    }}
                  />
                ))}
              </div>
            )}

            {todas.length === 0 && (
              <p className={styles.vacio}>Todavía no hay eventos. Creá el primero con «Nuevo evento».</p>
            )}
          </>
        )}
      </section>

      {nuevoAbierto && (
        <Modal title="Nuevo evento" onClose={() => setNuevoAbierto(false)}>
          <form onSubmit={crear} className={styles.formulario}>
            <label className={styles.campo}>
              Nombre
              <input className={styles.control} value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </label>
            <label className={styles.campo}>
              Año
              <input
                className={styles.control}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={anio}
                onChange={(e) => setAnio(e.target.value.replace(/\D/g, ""))}
                required
              />
            </label>
            {errorCreacion && <p role="alert" className={styles.errorFormulario}>{errorCreacion}</p>}
            <div className={styles.accionesModal}>
              <Button variant="secondary" onClick={() => setNuevoAbierto(false)}>Cancelar</Button>
              <Button type="submit" variant="primary">Crear evento</Button>
            </div>
          </form>
        </Modal>
      )}

      {edicionARetirar && (
        <Modal
          title="Retirar edición"
          tone="warning"
          icon="alert"
          initialFocusRef={cancelarRetiro}
          onClose={retirando ? () => {} : () => setEdicionARetirar(null)}
          footer={(
            <>
              <Button ref={cancelarRetiro} variant="secondary" disabled={retirando} onClick={() => setEdicionARetirar(null)}>
                Cancelar
              </Button>
              <Button variant="primary" disabled={retirando} onClick={confirmarRetiro}>
                {retirando ? "Retirando…" : "Confirmar retiro"}
              </Button>
            </>
          )}
        >
          <p>
            Vas a retirar definitivamente <strong>{edicionARetirar.nombre} {edicionARetirar.anio}</strong> del listado operativo.
            Sus planillas, votos y cierres se conservan para auditoría y no se puede reactivar.
          </p>
          <p>No se puede retirar mientras una jornada competitiva esté en votación.</p>
          {errorRetiro && <p role="alert">{errorRetiro}</p>}
        </Modal>
      )}

      {edicionAEliminar && !segundaConfirmacionEdicion && (
        <Modal
          title="Eliminar edición"
          tone="warning"
          icon="trash"
          initialFocusRef={cancelarEliminacion}
          onClose={() => setEdicionAEliminar(null)}
          footer={(
            <>
              <Button ref={cancelarEliminacion} variant="secondary" onClick={() => setEdicionAEliminar(null)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => setSegundaConfirmacionEdicion(true)}>
                Confirmar eliminación
              </Button>
            </>
          )}
        >
          <p>
            Vas a eliminar <strong>{edicionAEliminar.nombre} {edicionAEliminar.anio}</strong>, con sus jornadas, planillas, votos confirmados, cierres, auditoría atribuible y configuración.
          </p>
          <p>No se puede eliminar mientras una jornada competitiva esté en votación.</p>
        </Modal>
      )}

      {edicionAEliminar && segundaConfirmacionEdicion && (
        <Modal
          title="Eliminar definitivamente la edición"
          tone="danger"
          icon="trash"
          initialFocusRef={cancelarEliminacion}
          onClose={eliminando ? () => {} : () => setSegundaConfirmacionEdicion(false)}
          footer={(
            <>
              <Button ref={cancelarEliminacion} variant="secondary" disabled={eliminando} onClick={() => setSegundaConfirmacionEdicion(false)}>
                Volver
              </Button>
              <Button variant="danger" disabled={eliminando} onClick={confirmarEliminacion}>
                {eliminando ? "Eliminando…" : "Eliminar edición"}
              </Button>
            </>
          )}
        >
          <p>
            Vas a eliminar definitivamente <strong>{edicionAEliminar.nombre} {edicionAEliminar.anio}</strong>. Esta acción no se puede deshacer.
          </p>
          <p>Las cuentas de usuario no se eliminan.</p>
          {errorEliminacion && <p role="alert">{errorEliminacion}</p>}
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
