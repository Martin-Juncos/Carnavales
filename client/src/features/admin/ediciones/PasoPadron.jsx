import { useEffect, useId, useState } from "react";
import { Modal } from "../../../components/Modal/Modal.jsx";
import styles from "./ConfiguracionEdicion.module.css";

const CATEGORIAS = { PRIMERA: "Primera", AGRUPACION: "Agrupación" };
const TIPOS_LOGO = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_LOGO_BYTES = 300 * 1024;

function leerLogoComoDataUrl(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(typeof lector.result === "string" ? lector.result : "");
    lector.onerror = () => reject(new Error("No se pudo leer la imagen."));
    lector.readAsDataURL(archivo);
  });
}

// Comparsas y asignación de participantes directamente en cada rubro de tipo PERSONA
// que forma parte de la planilla de la edición (ej. Reina, Bastonera).
export function PasoPadron({ edicion, versionActiva, api, soloLectura }) {
  const idComparsas = useId();
  const idFiguras = useId();

  const [comparsas, setComparsas] = useState(null);
  const [todosLosRubros, setTodosLosRubros] = useState([]);
  const [filasPlanilla, setFilasPlanilla] = useState([]);
  const [comparsaActiva, setComparsaActiva] = useState(null);
  const [comparsaAEliminar, setComparsaAEliminar] = useState(null);
  const [asignacionAQuitar, setAsignacionAQuitar] = useState(null);
  const [logoNuevo, setLogoNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [recargaPlanilla, setRecargaPlanilla] = useState(0);

  const versionId = versionActiva?.id ?? null;
  const editableBorrador = !soloLectura && versionActiva?.estado === "BORRADOR";
  const rubrosPersona = todosLosRubros.filter((r) => r.tipoSujeto === "PERSONA");
  const rubrosPersonaIds = new Set(rubrosPersona.map((r) => r.id));

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
        setTodosLosRubros(resRubros.cuerpo.items ?? []);
      }
      if (resPlanilla.ok) {
        setFilasPlanilla(resPlanilla.cuerpo.items ?? []);
      }
    }).catch(() => {});
    return () => controlador.abort();
  }, [api, edicion.id, versionId, recargaPlanilla]);

  async function seleccionarLogo(evento) {
    const archivo = evento.target.files?.[0];
    if (!archivo) {
      setLogoNuevo("");
      return;
    }
    if (!TIPOS_LOGO.has(archivo.type)) {
      setError("El logo debe ser una imagen PNG, JPG o WebP.");
      evento.target.value = "";
      setLogoNuevo("");
      return;
    }
    if (archivo.size > MAX_LOGO_BYTES) {
      setError("El logo no puede superar los 300 KB.");
      evento.target.value = "";
      setLogoNuevo("");
      return;
    }
    setError("");
    try {
      const dataUrl = await leerLogoComoDataUrl(archivo);
      setLogoNuevo(dataUrl);
    } catch {
      setError("No se pudo leer la imagen seleccionada.");
      setLogoNuevo("");
    }
  }

  async function agregarComparsa(evento) {
    evento.preventDefault();
    if (guardando || typeof api.crearComparsa !== "function") return;
    const form = evento.currentTarget;
    const datos = new FormData(form);
    const nombre = String(datos.get("nombre") ?? "").trim();
    const categoria = String(datos.get("categoria") ?? "PRIMERA");
    const cuerpo = {
      nombre,
      categoria,
      activa: true,
      ...(logoNuevo ? { logoDataUrl: logoNuevo } : {}),
    };
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.crearComparsa(edicion.id, cuerpo);
      if (res.ok) {
        setComparsas((prev) => [...(prev ?? []), res.cuerpo]);
        form.reset();
        setLogoNuevo("");
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

  async function alternarRubroConParticipante(rubro) {
    if (!editableBorrador || !versionId || guardando || typeof api.actualizarRubro !== "function") return;
    const siguienteTipo = rubro.tipoSujeto === "PERSONA" ? "COMPARSA" : "PERSONA";
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.actualizarRubro(edicion.id, versionId, rubro.id, { tipoSujeto: siguienteTipo });
      if (res.ok) {
        setTodosLosRubros((prev) => prev.map((r) => (r.id === rubro.id ? { ...r, ...res.cuerpo } : r)));
        setAviso(
          siguienteTipo === "PERSONA"
            ? `«${rubro.nombre}» habilitado para asignar nombres de participantes.`
            : `«${rubro.nombre}» quitado de la asignación individual.`,
        );
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo actualizar el rubro.");
      }
    } catch {
      setError("No se pudo actualizar el rubro. Revisá la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  function participantesDeComparsa(comparsa) {
    const porSujeto = new Map();
    for (const fila of filasPlanilla) {
      if (fila.excluida || !rubrosPersonaIds.has(fila.rubroId)) continue;
      const mismaComparsa = fila.comparsaId
        ? fila.comparsaId === comparsa.id
        : fila.comparsaNombre === comparsa.nombre;
      if (!mismaComparsa) continue;
      const actual = porSujeto.get(fila.sujetoId) ?? {
        sujetoId: fila.sujetoId,
        nombre: fila.sujetoNombre ?? fila.sujetoId,
        rubros: new Map(),
      };
      const filasRubro = actual.rubros.get(fila.rubroId) ?? [];
      filasRubro.push(fila.id);
      actual.rubros.set(fila.rubroId, filasRubro);
      porSujeto.set(fila.sujetoId, actual);
    }
    return [...porSujeto.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }

  async function nominarSujetoEnRubro({ sujetoId, nombre, rubro }) {
    if (!comparsaActiva || !versionId || guardando || typeof api.nominarEnRubro !== "function") return false;
    const especialidadIds = rubro.especialidadIds ?? [];
    if (especialidadIds.length === 0) {
      setError(`El rubro «${rubro.nombre}» todavía no tiene especialidades asignadas en Evaluación.`);
      return false;
    }

    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const nuevasFilas = [];
      for (const especialidadId of especialidadIds) {
        const resNom = await api.nominarEnRubro(edicion.id, versionId, rubro.id, {
          sujetoId,
          especialidadId,
        });
        if (!resNom.ok) {
          setError(resNom.cuerpo?.mensaje ?? `No se pudo asignar a «${rubro.nombre}».`);
          return false;
        }
        nuevasFilas.push({
          ...resNom.cuerpo,
          rubroId: resNom.cuerpo?.rubroId ?? rubro.id,
          sujetoId: resNom.cuerpo?.sujetoId ?? sujetoId,
          sujetoNombre: resNom.cuerpo?.sujetoNombre ?? nombre,
          comparsaId: resNom.cuerpo?.comparsaId ?? comparsaActiva.id,
          comparsaNombre: resNom.cuerpo?.comparsaNombre ?? comparsaActiva.nombre,
        });
      }
      setFilasPlanilla((prev) => [...prev, ...nuevasFilas]);
      setAviso(`«${nombre}» asignado a ${rubro.nombre} (${comparsaActiva.nombre}).`);
      setRecargaPlanilla((n) => n + 1);
      return true;
    } catch {
      setError("No se pudo asignar el participante. Revisá la conexión.");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  // Alta en 1 solo paso: si ya existe un participante con ese nombre en la comparsa,
  // reutiliza su sujetoId; si no, crea participante + sujeto PERSONA y lo nomina.
  async function asignarParticipanteARubro(evento, rubro) {
    evento.preventDefault();
    if (
      !comparsaActiva
      || !versionId
      || guardando
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

    const existente = participantesDeComparsa(comparsaActiva).find(
      (p) => p.nombre.trim().toLocaleLowerCase("es") === nombreCompleto.toLocaleLowerCase("es"),
    );
    if (existente) {
      const ok = await nominarSujetoEnRubro({
        sujetoId: existente.sujetoId,
        nombre: existente.nombre,
        rubro,
      });
      if (ok) form.reset();
      return;
    }

    if (typeof api.crearParticipante !== "function" || typeof api.crearSujetoComparsa !== "function") return;

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
                      <div className={styles.comparsaIdentity}>
                        {comparsa.logoDataUrl?.startsWith("data:image/") && (
                          <img
                            src={comparsa.logoDataUrl}
                            alt={`Logo de ${comparsa.nombre}`}
                            className={styles.comparsaLogoThumb}
                          />
                        )}
                        <div>
                          <h4 className={styles.itemTitle}>{comparsa.nombre}</h4>
                          <p className={styles.itemMeta}>
                            {CATEGORIAS[comparsa.categoria] ?? comparsa.categoria} · {comparsa.activa ? "Activa" : "Inactiva"}
                          </p>
                        </div>
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
                <label>
                  Logo de la comparsa (opcional)
                  <input
                    type="file"
                    name="logo"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={guardando}
                    onChange={seleccionarLogo}
                  />
                </label>
                {logoNuevo && (
                  <div className={styles.logoPreviewRow}>
                    <img src={logoNuevo} alt="Vista previa del logo" className={styles.comparsaLogoThumb} />
                    <button type="button" disabled={guardando} onClick={() => setLogoNuevo("")}>
                      Quitar imagen
                    </button>
                  </div>
                )}
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

          {editableBorrador && typeof api.actualizarRubro === "function" && todosLosRubros.length > 0 && (
            <div style={{ marginBottom: "1rem" }}>
              <p className={styles.itemMeta} style={{ marginBottom: "0.45rem" }}>
                Elegí qué rubros requieren nombre de participante:
              </p>
              <div className={styles.chipGroup} role="group" aria-label="Rubros que requieren nombre de participante">
                {todosLosRubros.map((rubro) => (
                  <label key={rubro.id} className={styles.chipLabel}>
                    <input
                      type="checkbox"
                      checked={rubro.tipoSujeto === "PERSONA"}
                      disabled={guardando}
                      onChange={() => alternarRubroConParticipante(rubro)}
                    />
                    <span>{rubro.nombre}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {rubrosPersona.length === 0 ? (
            <p>
              Todavía no hay rubros marcados para nombre de participante. Marcalos arriba o en la etapa Evaluación.
            </p>
          ) : (
            <>
              {rubrosPersona.length > 1 && participantesDeComparsa(comparsaActiva).length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <p className={styles.itemMeta} style={{ marginBottom: "0.45rem" }}>
                    Participantes cargados en {comparsaActiva.nombre} (marcá todos los rubros en los que participa cada uno):
                  </p>
                  <div className={styles.cardList}>
                    {participantesDeComparsa(comparsaActiva).map((persona) => (
                      <article key={persona.sujetoId} className={styles.itemCard}>
                        <h4 className={styles.itemTitle} style={{ marginBottom: "0.4rem" }}>
                          {persona.nombre}
                        </h4>
                        <div className={styles.chipGroup} role="group" aria-label={`Rubros de ${persona.nombre}`}>
                          {rubrosPersona.map((rubro) => {
                            const filaIds = persona.rubros.get(rubro.id) ?? [];
                            const asignado = filaIds.length > 0;
                            return (
                              <label key={rubro.id} className={styles.chipLabel}>
                                <input
                                  type="checkbox"
                                  checked={asignado}
                                  disabled={soloLectura || guardando}
                                  onChange={() => {
                                    if (asignado) {
                                      setAsignacionAQuitar({
                                        nombre: persona.nombre,
                                        rubroNombre: rubro.nombre,
                                        filaIds,
                                      });
                                    } else {
                                      nominarSujetoEnRubro({
                                        sujetoId: persona.sujetoId,
                                        nombre: persona.nombre,
                                        rubro,
                                      });
                                    }
                                  }}
                                />
                                <span>{rubro.nombre}</span>
                              </label>
                            );
                          })}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              )}

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
                          {rubro.nominadosMaximosPorComparsa
                            ? ` · Máx. ${rubro.nominadosMaximosPorComparsa} por comparsa`
                            : rubro.nominadosMaximos
                              ? ` · Máx. ${rubro.nominadosMaximos} en total`
                              : ""}
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
            </>
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
