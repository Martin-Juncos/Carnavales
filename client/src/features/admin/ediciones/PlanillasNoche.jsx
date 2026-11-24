import { useEffect, useId, useRef, useState } from "react";
import { Modal } from "../../../components/Modal/Modal.jsx";
import estilos from "./PlanillasNoche.module.css";

const estadoNoche = { DRAFT: "Borrador", OPEN: "Abierta", CLOSED: "Cerrada" };
const estadoVersion = { BORRADOR: "Borrador", PUBLICADA: "Publicada", SUPERSEDIDA: "Reemplazada" };

// Mensaje de la API (campo mensaje) para errores de negocio; si no llega ninguno, uno genérico.
function mensajeDeError(resultado) {
  return resultado.cuerpo?.mensaje ?? "No se pudo completar la operación. Intentá de nuevo.";
}

// Elige la versión a configurar: el borrador si existe; si no, la más nueva.
function versionPorDefecto(versiones) {
  return versiones.find((version) => version.estado === "BORRADOR")?.id ?? versiones[0]?.id ?? "";
}

// Planilla por noche y especialidad: qué filas evalúa el jurado. La API decide permisos y reglas;
// este panel solo las muestra y envía la selección completa.
export function PlanillasNoche({ edicion, api, planillas }) {
  const titulo = useId();
  const [versiones, setVersiones] = useState(null);
  const [errorVersiones, setErrorVersiones] = useState("");
  const [noches, setNoches] = useState(null);
  const [especialidades, setEspecialidades] = useState(null);
  const [errorCatalogos, setErrorCatalogos] = useState("");
  const [versionId, setVersionId] = useState("");
  const [nocheId, setNocheId] = useState("");
  const [especialidadId, setEspecialidadId] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [planilla, setPlanilla] = useState(null);
  const [errorPlanilla, setErrorPlanilla] = useState("");
  const [marcadas, setMarcadas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [errorGuardado, setErrorGuardado] = useState("");
  const [confirmacion, setConfirmacion] = useState(null);
  const cancelar = useRef(null);

  const competencias = noches?.filter((noche) => noche.tipo === "COMPETENCIA") ?? [];
  const activas = especialidades?.filter((especialidad) => especialidad.activa) ?? [];
  const noche = competencias.find((item) => item.id === nocheId);
  const especialidad = activas.find((item) => item.id === especialidadId);
  const editable = edicion.estado !== "CLOSED" && noche?.estado === "DRAFT";
  const candidatas = planilla?.candidatas ?? [];

  // Versiones, noches y especialidades de la edición. Se vuelven a pedir con el reintento.
  useEffect(() => {
    const controlador = new AbortController();
    const señal = controlador.signal;
    setErrorVersiones("");
    setErrorCatalogos("");
    Promise.all([
      planillas.listarVersiones(edicion.id, señal),
      api.listarNochesEdicion(edicion.id, señal),
      api.listarEspecialidadesEdicion(edicion.id, señal),
    ]).then(([versionesRespuesta, nochesRespuesta, especialidadesRespuesta]) => {
      if (señal.aborted) return;
      if (versionesRespuesta.ok) {
        setVersiones(versionesRespuesta.cuerpo.items);
        setVersionId((actual) => actual || versionPorDefecto(versionesRespuesta.cuerpo.items));
      } else {
        setErrorVersiones(mensajeDeError(versionesRespuesta));
      }
      if (nochesRespuesta.ok && especialidadesRespuesta.ok) {
        setNoches(nochesRespuesta.cuerpo.items);
        setEspecialidades(especialidadesRespuesta.cuerpo.items);
      } else {
        setErrorCatalogos("No se pudieron cargar las noches o especialidades. Revisá la conexión.");
      }
    }).catch(() => {
      if (!señal.aborted) setErrorVersiones("No se pudieron cargar las planillas. Revisá la conexión.");
    });
    return () => controlador.abort();
  }, [api, planillas, edicion.id, recarga]);

  // Al tener noche, especialidad y versión, carga la selección y las candidatas de esa combinación.
  useEffect(() => {
    if (!versionId || !nocheId || !especialidadId) return undefined;
    const controlador = new AbortController();
    const señal = controlador.signal;
    setPlanilla(null);
    setErrorPlanilla("");
    setAviso("");
    setErrorGuardado("");
    Promise.all([
      planillas.obtenerSeleccion(edicion.id, versionId, nocheId, especialidadId, señal),
      planillas.listarCandidatas(edicion.id, versionId, nocheId, especialidadId, señal),
    ]).then(([seleccionRespuesta, candidatasRespuesta]) => {
      if (señal.aborted) return;
      if (!seleccionRespuesta.ok || !candidatasRespuesta.ok) {
        setErrorPlanilla(mensajeDeError(seleccionRespuesta.ok ? candidatasRespuesta : seleccionRespuesta));
        return;
      }
      setPlanilla({
        configurada: seleccionRespuesta.cuerpo.configurada,
        filaIds: seleccionRespuesta.cuerpo.filaIds,
        candidatas: candidatasRespuesta.cuerpo.items,
      });
      setMarcadas(seleccionRespuesta.cuerpo.filaIds);
    }).catch(() => {
      if (!señal.aborted) setErrorPlanilla("No se pudo cargar la planilla. Revisá la conexión.");
    });
    return () => controlador.abort();
  }, [planillas, edicion.id, versionId, nocheId, especialidadId, recarga]);

  // Primera noche y especialidad disponibles como elección inicial.
  useEffect(() => {
    if (!nocheId && competencias.length > 0) setNocheId(competencias[0].id);
  }, [competencias, nocheId]);
  useEffect(() => {
    if (!especialidadId && activas.length > 0) setEspecialidadId(activas[0].id);
  }, [activas, especialidadId]);

  // Solo se guardan las filas que siguen siendo candidatas: una fila vieja se descarta en vez de romper el guardado.
  const idsCandidatas = new Set(candidatas.map(({ id }) => id));
  const seleccionValida = marcadas.filter((id) => idsCandidatas.has(id));
  const quitadasPorCambio = marcadas.length - seleccionValida.length;

  function alternar(id) {
    setMarcadas((actuales) => (actuales.includes(id) ? actuales.filter((item) => item !== id) : [...actuales, id]));
  }

  async function guardar() {
    const filaIds = seleccionValida;
    setConfirmacion(null);
    setGuardando(true);
    setAviso("");
    setErrorGuardado("");
    try {
      const resultado = await planillas.guardarSeleccion(edicion.id, versionId, nocheId, especialidadId, filaIds);
      if (!resultado.ok) {
        setErrorGuardado(mensajeDeError(resultado));
        return;
      }
      setPlanilla((anterior) => ({ ...anterior, configurada: true, filaIds: resultado.cuerpo.filaIds }));
      setMarcadas(resultado.cuerpo.filaIds);
      setAviso(filaIds.length === 0 ? "Confirmaste una lista vacía." : "Guardado correctamente.");
    } catch {
      setErrorGuardado("No se pudo confirmar el guardado. Volvé a consultar la planilla antes de reintentar.");
    } finally {
      setGuardando(false);
    }
  }

  function pedirGuardado() {
    setConfirmacion(seleccionValida.length === 0 ? "vacia" : "guardar");
  }

  if (versiones === null && !errorVersiones) {
    return (
      <section className="admin-configuracion-grupo" aria-labelledby={titulo}>
        <h3 id={titulo}>Planillas por noche</h3>
        <p role="status">Cargando planillas…</p>
      </section>
    );
  }

  if (errorVersiones) {
    return (
      <section className="admin-configuracion-grupo" aria-labelledby={titulo}>
        <h3 id={titulo}>Planillas por noche</h3>
        <div className="admin-aviso">
          <p role="alert">{errorVersiones}</p>
          <button type="button" onClick={() => setRecarga((n) => n + 1)}>Reintentar</button>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-configuracion-grupo" aria-labelledby={titulo}>
      <h3 id={titulo}>Planillas por noche</h3>
      <p>Elegí qué filas evalúa el jurado en cada noche y especialidad. Solo se cambian mientras la noche está en borrador.</p>
      {versiones.length === 0 ? (
        <p>Todavía no hay reglamento en esta edición. Creá una versión antes de configurar las planillas.</p>
      ) : (
        <>
          <div className={estilos.selectores}>
            <label>Versión del reglamento
              <select value={versionId} onChange={(evento) => setVersionId(evento.target.value)}>
                {versiones.map((version) => (
                  <option key={version.id} value={version.id}>
                    Versión {version.numero} · {estadoVersion[version.estado] ?? version.estado}
                  </option>
                ))}
              </select>
            </label>
            {errorCatalogos && <p className="admin-aviso" role="alert">{errorCatalogos}</p>}
            {competencias.length === 0 && noches && (
              <p>Creá una noche competitiva para configurar sus planillas.</p>
            )}
            {competencias.length > 0 && (
              <label>Noche competitiva
                <select value={nocheId} onChange={(evento) => setNocheId(evento.target.value)}>
                  {competencias.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre} · {estadoNoche[item.estado] ?? item.estado}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {activas.length > 0 && (
              <label>Especialidad
                <select value={especialidadId} onChange={(evento) => setEspecialidadId(evento.target.value)}>
                  {activas.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                </select>
              </label>
            )}
          </div>

          {noche && especialidad && (
            <div className="admin-planilla-noche">
              {errorPlanilla ? (
                <div className="admin-aviso">
                  <p role="alert">{errorPlanilla}</p>
                  <button type="button" onClick={() => setRecarga((n) => n + 1)}>Reintentar</button>
                </div>
              ) : planilla === null ? (
                <p role="status">Cargando filas…</p>
              ) : candidatas.length === 0 ? (
                <p>No hay filas para esta noche y especialidad. Revisá el orden de desfile y los rubros de la especialidad.</p>
              ) : (
                <>
                  <p>{planilla.configurada
                    ? "Selección guardada."
                    : "Sin selección guardada: se muestra la propuesta del desfile."}
                    {!editable && " La noche ya no está en borrador, así que la selección es de solo lectura."}
                  </p>
                  {quitadasPorCambio > 0 && (
                    <p role="status">{quitadasPorCambio} fila(s) guardada(s) ya no son elegibles y se quitarán al guardar.</p>
                  )}
                  <fieldset className={estilos.casillas} disabled={!editable || guardando}>
                    <legend>Filas a evaluar ({seleccionValida.length} de {candidatas.length})</legend>
                    {candidatas.map((fila) => (
                      <label key={fila.id} className="admin-casilla">
                        <input type="checkbox" checked={marcadas.includes(fila.id)} onChange={() => alternar(fila.id)} />
                        {fila.rubroNombre} · {fila.comparsaNombre}
                      </label>
                    ))}
                  </fieldset>
                  {editable && (
                    <button type="button" disabled={guardando} onClick={pedirGuardado}>
                      {guardando ? "Guardando…" : "Guardar selección"}
                    </button>
                  )}
                </>
              )}
              {errorGuardado && <p className="admin-aviso" role="alert">{errorGuardado}</p>}
              {aviso && <p role="status">{aviso}</p>}
            </div>
          )}
        </>
      )}

      {confirmacion && (
        <Modal
          title={confirmacion === "vacia" ? "Confirmar lista vacía" : "Guardar planilla"}
          initialFocusRef={cancelar}
          onClose={() => setConfirmacion(null)}
        >
          {confirmacion === "vacia" ? (
            <p>No se evaluará ninguna fila de <strong>{especialidad.nombre}</strong> en <strong>{noche.nombre}</strong>. La confirmación queda registrada en la auditoría.</p>
          ) : (
            <p>Vas a guardar {seleccionValida.length} fila(s) para <strong>{especialidad.nombre}</strong> en <strong>{noche.nombre}</strong>. Reemplaza la selección anterior.</p>
          )}
          <button ref={cancelar} type="button" onClick={() => setConfirmacion(null)}>Cancelar</button>{" "}
          <button type="button" onClick={guardar}>
            {confirmacion === "vacia" ? "Confirmar lista vacía" : "Confirmar guardado"}
          </button>
        </Modal>
      )}
    </section>
  );
}
