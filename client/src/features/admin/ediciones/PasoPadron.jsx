import { useEffect, useId, useState } from "react";
import { Modal } from "../../../components/Modal/Modal.jsx";
import styles from "./ConfiguracionEdicion.module.css";

const CATEGORIAS = { PRIMERA: "Primera", AGRUPACION: "Agrupación" };

// Comparsas y asignación de participantes directamente en cada rubro de tipo PERSONA
// que forma parte de la planilla de la edición (ej. Reina, Bastonera).
export function PasoPadron({ edicion, versionActiva, api, soloLectura }) {
  const idComparsas = useId();
  const idFiguras = useId();

  const [comparsas, setComparsas] = useState(null);
  const [rubrosPersona, setRubrosPersona] = useState([]);
  const [filasPlanilla, setFilasPlanilla] = useState([]);
  const [comparsaActiva, setComparsaActiva] = useState(null);
  const [comparsaAEliminar, setComparsaAEliminar] = useState(null);
  const [asignacionAQuitar, setAsignacionAQuitar] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [recargaPlanilla, setRecargaPlanilla] = useState(0);

  const versionId = versionActiva?.id ?? null;

  useEffect(() => {
    if (typeof api.listarComparsas !== "function") return;
    const controlador = new AbortController();
    api.listarComparsas(edicion.id, controlador.signal).then((resComp) => {
      if (controlador.signal.aborted) return;
      if (resComp.ok) setComparsas(resComp.cuerpo.items ?? []);
      else setError(resComp.cuerpo?.mensaje ?? "No se pudieron cargar las comparsas.");
    }).catch(() => {
      if (!controlador.signal.aborted) setError("No se pudieron cargar las comparsas. Revisá la conexión.");
    });
    return () => controlador.abort();
  }, [api, edicion.id]);

  useEffect(() => {
    if (!versionId || typeof api.listarRubros !== "function") return;
    const controlador = new AbortController();
    Promise.all([
      api.listarRubros(edicion.id, versionId, controlador.signal),
      typeof api.listarPlanillaVersion === "function"
        ? api.listarPlanillaVersion(edicion.id, versionId, controlador.signal)
        : Promise.resolve({ ok: true, cuerpo: { items: [] } }),
    ]).then(([resRubros, resPlanilla]) => {
      if (controlador.signal.aborted) return;
      if (resRubros.ok) {
        setRubrosPersona((resRubros.cuerpo.items ?? []).filter((r) => r.tipoSujeto === "PERSONA"));
      }
      if (resPlanilla.ok) {
        setFilasPlanilla(resPlanilla.cuerpo.items ?? []);
      }
    }).catch(() => {});
    return () => controlador.abort();
  }, [api, edicion.id, versionId, recargaPlanilla]);

  async function agregarComparsa(evento) {
    evento.preventDefault();
    if (guardando || typeof api.crearComparsa !== "function") return;
    const form = evento.currentTarget;
    const datos = new FormData(form);
    const nombre = String(datos.get("nombre") ?? "").trim();
    const categoria = String(datos.get("categoria") ?? "PRIMERA");
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.crearComparsa(edicion.id, { nombre, categoria, activa: true });
      if (res.ok) {
        setComparsas((prev) => [...(prev ?? []), res.cuerpo]);
        form.reset();
        setAviso(`Comparsa «${res.cuerpo.nombre}» agregada.`);
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo crear la comparsa.");
      }
    } catch {
      setError("No se pudo crear la comparsa. Revisá la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarBorradoComparsa() {
    if (!comparsaAEliminar || guardando || typeof api.eliminarComparsa !== "function") return;
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.eliminarComparsa(edicion.id, comparsaAEliminar.id);
      if (res.ok) {
        setComparsas((prev) => prev.filter((c) => c.id !== comparsaAEliminar.id));
        if (comparsaActiva?.id === comparsaAEliminar.id) setComparsaActiva(null);
        setAviso(`Comparsa «${comparsaAEliminar.nombre}» eliminada.`);
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo eliminar la comparsa.");
      }
      setComparsaAEliminar(null);
    } catch {
      setError("No se pudo eliminar la comparsa.");
      setComparsaAEliminar(null);
    } finally {
      setGuardando(false);
    }
  }

  // Alta en 1 solo paso: crea el participante, lo vincula a la comparsa como PERSONA
  // y lo nomina directamente en ese rubro para todas sus especialidades.
  async function asignarParticipanteARubro(evento, rubro) {
    evento.preventDefault();
    if (
      !comparsaActiva
      || !versionId
      || guardando
      || typeof api.crearParticipante !== "function"
      || typeof api.crearSujetoComparsa !== "function"
      || typeof api.nominarEnRubro !== "function"
    ) return;

    const especialidadIds = rubro.especialidadIds ?? [];
    if (especialidadIds.length === 0) {
      setError(`El rubro «${rubro.nombre}» todavía no tiene especialidades asignadas en Evaluación.`);
      return;
    }

    const form = evento.currentTarget;
    const datos = new FormData(form);
    const nombreCompleto = String(datos.get("nombreCompleto") ?? "").trim();
    const esMenor = datos.has("esMenor");

    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const resPart = await api.crearParticipante(edicion.id, { nombreCompleto, esMenor, activo: true });
      if (!resPart.ok) {
        setError(resPart.cuerpo?.mensaje ?? "No se pudo registrar el participante.");
        return;
      }
      const persona = resPart.cuerpo;

      const resSujeto = await api.crearSujetoComparsa(edicion.id, comparsaActiva.id, {
        tipoSujeto: "PERSONA",
        participanteId: persona.id,
      });
      if (!resSujeto.ok) {
        setError(resSujeto.cuerpo?.mensaje ?? "No se pudo vincular el participante a la comparsa.");
        return;
      }
      const sujeto = resSujeto.cuerpo;

      const nuevasFilas = [];
      for (const especialidadId of especialidadIds) {
        const resNom = await api.nominarEnRubro(edicion.id, versionId, rubro.id, {
          sujetoId: sujeto.id,
          especialidadId,
        });
        if (!resNom.ok) {
          setError(resNom.cuerpo?.mensaje ?? `No se pudo asignar a «${rubro.nombre}».`);
          return;
        }
        nuevasFilas.push({
          ...resNom.cuerpo,
          rubroId: resNom.cuerpo?.rubroId ?? rubro.id,
          sujetoId: resNom.cuerpo?.sujetoId ?? sujeto.id,
          sujetoNombre: resNom.cuerpo?.sujetoNombre ?? persona.nombreCompleto,
          comparsaId: resNom.cuerpo?.comparsaId ?? comparsaActiva.id,
          comparsaNombre: resNom.cuerpo?.comparsaNombre ?? comparsaActiva.nombre,
        });
      }

      setFilasPlanilla((prev) => [...prev, ...nuevasFilas]);
      form.reset();
      setAviso(`«${persona.nombreCompleto}» asignado a ${rubro.nombre} (${comparsaActiva.nombre}).`);
      setRecargaPlanilla((n) => n + 1);
    } catch {
      setError("No se pudo asignar el participante. Revisá la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarQuitarAsignacion() {
    if (!asignacionAQuitar || !versionId || guardando || typeof api.eliminarFilaPlanilla !== "function") return;
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      for (const filaId of asignacionAQuitar.filaIds) {
        const res = await api.eliminarFilaPlanilla(edicion.id, versionId, filaId);
        if (!res.ok) {
          setError(res.cuerpo?.mensaje ?? "No se pudo quitar la asignación.");
          setAsignacionAQuitar(null);
          return;
        }
      }
      const quitadas = new Set(asignacionAQuitar.filaIds);
      setFilasPlanilla((prev) => prev.filter((f) => !quitadas.has(f.id)));
      setAviso(`Se quitó a «${asignacionAQuitar.nombre}» de ${asignacionAQuitar.rubroNombre}.`);
      setAsignacionAQuitar(null);
    } catch {
      setError("No se pudo quitar la asignación.");
      setAsignacionAQuitar(null);
    } finally {
      setGuardando(false);
    }
  }

  function asignadosEnRubro(comparsa, rubroId) {
    const porSujeto = new Map();
    for (const fila of filasPlanilla) {
      if (fila.rubroId !== rubroId || fila.excluida) continue;
      const mismaComparsa = fila.comparsaId
        ? fila.comparsaId === comparsa.id
        : fila.comparsaNombre === comparsa.nombre;
      if (!mismaComparsa) continue;
      const actual = porSujeto.get(fila.sujetoId) ?? {
        sujetoId: fila.sujetoId,
        nombre: fila.sujetoNombre ?? fila.sujetoId,
        filaIds: [],
      };
      actual.filaIds.push(fila.id);
      porSujeto.set(fila.sujetoId, actual);
    }
    return [...porSujeto.values()];
  }

  return (
    <>
      {error && <p className="admin-aviso" role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}

      <section aria-labelledby={idComparsas} className="admin-configuracion-grupo">
        <h3 id={idComparsas}>Comparsas</h3>
        <p className={styles.itemMeta}>
          Cargá las comparsas y elegí una para asignar sus participantes en cada rubro individual de la planilla.
        </p>

        {comparsas === null ? (
          <p role="status">Cargando comparsas…</p>
        ) : (
          <>
            {comparsas.length === 0 ? (
              <p>Todavía no hay comparsas cargadas en esta edición.</p>
            ) : (
              <div className={styles.cardList} style={{ marginTop: "0.75rem" }}>
                {comparsas.map((comparsa) => (
                  <article key={comparsa.id} className={styles.itemCard}>
                    <div className={styles.itemCardHeader}>
                      <div>
                        <h4 className={styles.itemTitle}>{comparsa.nombre}</h4>
                        <p className={styles.itemMeta}>
                          {CATEGORIAS[comparsa.categoria] ?? comparsa.categoria} · {comparsa.activa ? "Activa" : "Inactiva"}
                        </p>
                      </div>
                      <div className={styles.inlineActions}>
                        <button
                          type="button"
                          aria-label={`Participantes de ${comparsa.nombre}`}
                          aria-pressed={comparsaActiva?.id === comparsa.id}
                          onClick={() => setComparsaActiva(comparsaActiva?.id === comparsa.id ? null : comparsa)}
                        >
                          Participantes por rubro
                        </button>
                        {!soloLectura && typeof api.eliminarComparsa === "function" && (
                          <button
                            type="button"
                            disabled={guardando}
                            aria-label={`Eliminar comparsa ${comparsa.nombre}`}
                            onClick={() => setComparsaAEliminar(comparsa)}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {!soloLectura && typeof api.crearComparsa === "function" && (
              <form onSubmit={agregarComparsa} aria-busy={guardando}>
                <label>
                  Nombre de la comparsa
                  <input name="nombre" required disabled={guardando} />
                </label>
                <label>
                  Categoría
                  <select name="categoria" defaultValue="PRIMERA" disabled={guardando}>
                    <option value="PRIMERA">Primera</option>
                    <option value="AGRUPACION">Agrupación</option>
                  </select>
                </label>
                <button type="submit" disabled={guardando}>
                  {guardando ? "Guardando…" : "Agregar comparsa"}
                </button>
              </form>
            )}
          </>
        )}
      </section>

      {comparsaActiva && (
        <section aria-labelledby={idFiguras} className="admin-configuracion-grupo">
          <div className={styles.itemCardHeader} style={{ marginBottom: "0.75rem" }}>
            <div>
              <h3 id={idFiguras}>Participantes de {comparsaActiva.nombre}</h3>
              <p className={styles.itemMeta}>
                Asigná cada participante directamente en el rubro de la planilla que le corresponde.
              </p>
            </div>
            <button type="button" onClick={() => setComparsaActiva(null)}>Cerrar</button>
          </div>

          {rubrosPersona.length === 0 ? (
            <p>
              Todavía no hay rubros de tipo Persona configurados en la etapa Evaluación. Si un rubro evalúa personas (por ejemplo, Reina o Bastonera), crealo allí y volvé aquí para asignar cada figura.
            </p>
          ) : (
            <div className={styles.cardList}>
              {rubrosPersona.map((rubro) => {
                const asignados = asignadosEnRubro(comparsaActiva, rubro.id);
                return (
                  <article key={rubro.id} className={styles.itemCard} aria-label={rubro.nombre}>
                    <div className={styles.itemCardHeader}>
                      <div>
                        <h4 className={styles.itemTitle}>{rubro.nombre}</h4>
                        <p className={styles.itemMeta}>
                          {asignados.length} participante(s) asignado(s)
                          {rubro.nominadosMaximos ? ` · Máx. ${rubro.nominadosMaximos}` : ""}
                        </p>
                      </div>
                      <span className={asignados.length > 0 ? styles.badgeOk : styles.badgeWarn}>
                        {asignados.length > 0 ? "Cargado" : "Pendiente"}
                      </span>
                    </div>

                    {asignados.length > 0 && (
                      <ul style={{ margin: "0.65rem 0", paddingLeft: "1.25rem" }}>
                        {asignados.map((persona) => (
                          <li key={persona.sujetoId} style={{ marginBottom: "0.35rem" }}>
                            <strong>{persona.nombre}</strong>{" "}
                            {!soloLectura && typeof api.eliminarFilaPlanilla === "function" && (
                              <button
                                type="button"
                                disabled={guardando}
                                onClick={() => setAsignacionAQuitar({
                                  nombre: persona.nombre,
                                  rubroNombre: rubro.nombre,
                                  filaIds: persona.filaIds,
                                })}
                              >
                                Quitar
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {!soloLectura && typeof api.nominarEnRubro === "function" && (
                      <form onSubmit={(e) => asignarParticipanteARubro(e, rubro)} aria-busy={guardando} style={{ marginTop: "0.75rem" }}>
                        <label>
                          Nombre para {rubro.nombre}
                          <input name="nombreCompleto" required disabled={guardando} />
                        </label>
                        <label className="admin-casilla">
                          <input name="esMenor" type="checkbox" disabled={guardando} />
                          Es menor de edad
                        </label>
                        <button type="submit" disabled={guardando}>
                          {guardando ? "Guardando…" : `Asignar a ${rubro.nombre}`}
                        </button>
                      </form>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {comparsaAEliminar && (
        <Modal title="Eliminar comparsa" onClose={() => setComparsaAEliminar(null)}>
          <p>
            ¿Confirmás eliminar la comparsa <strong>{comparsaAEliminar.nombre}</strong>?
          </p>
          <button type="button" onClick={() => setComparsaAEliminar(null)}>Cancelar</button>{" "}
          <button type="button" disabled={guardando} onClick={confirmarBorradoComparsa}>Confirmar eliminación</button>
        </Modal>
      )}

      {asignacionAQuitar && (
        <Modal title="Quitar participante del rubro" onClose={() => setAsignacionAQuitar(null)}>
          <p>
            ¿Confirmás quitar a <strong>{asignacionAQuitar.nombre}</strong> del rubro <strong>{asignacionAQuitar.rubroNombre}</strong>?
          </p>
          <button type="button" onClick={() => setAsignacionAQuitar(null)}>Cancelar</button>{" "}
          <button type="button" disabled={guardando} onClick={confirmarQuitarAsignacion}>Confirmar</button>
        </Modal>
      )}
    </>
  );
}
