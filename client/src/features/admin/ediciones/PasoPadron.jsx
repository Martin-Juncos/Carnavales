import { useEffect, useId, useState } from "react";
import { Modal } from "../../../components/Modal/Modal.jsx";
import styles from "./ConfiguracionEdicion.module.css";

const CATEGORIAS = { PRIMERA: "Primera", AGRUPACION: "Agrupación" };

// Comparsas y figuras nominadas (sin exponer el formulario técnico de "sujeto evaluable":
// las personas nominadas se crean y vinculan en un solo paso, y los sujetos de comparsa/batería/etc.
// se generan automáticamente al preparar la planilla).
export function PasoPadron({ edicion, api, soloLectura }) {
  const idComparsas = useId();
  const idFiguras = useId();

  const [comparsas, setComparsas] = useState(null);
  const [participantes, setParticipantes] = useState([]);
  const [comparsaActiva, setComparsaActiva] = useState(null);
  const [figuras, setFiguras] = useState(null);
  const [comparsaAEliminar, setComparsaAEliminar] = useState(null);
  const [figuraAEliminar, setFiguraAEliminar] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (typeof api.listarComparsas !== "function") return;
    const controlador = new AbortController();
    Promise.all([
      api.listarComparsas(edicion.id, controlador.signal),
      typeof api.listarParticipantes === "function"
        ? api.listarParticipantes(edicion.id, controlador.signal)
        : Promise.resolve({ ok: true, cuerpo: { items: [] } }),
    ]).then(([resComp, resPart]) => {
      if (controlador.signal.aborted) return;
      if (resComp.ok) setComparsas(resComp.cuerpo.items ?? []);
      else setError(resComp.cuerpo?.mensaje ?? "No se pudieron cargar las comparsas.");
      if (resPart.ok) setParticipantes(resPart.cuerpo.items ?? []);
    }).catch(() => {
      if (!controlador.signal.aborted) setError("No se pudieron cargar las comparsas. Revisá la conexión.");
    });
    return () => controlador.abort();
  }, [api, edicion.id]);

  useEffect(() => {
    if (!comparsaActiva || typeof api.listarSujetosComparsa !== "function") {
      setFiguras(null);
      return;
    }
    const controlador = new AbortController();
    api.listarSujetosComparsa(edicion.id, comparsaActiva.id, controlador.signal).then((res) => {
      if (controlador.signal.aborted) return;
      if (res.ok) {
        setFiguras((res.cuerpo.items ?? []).filter((s) => s.tipoSujeto === "PERSONA"));
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudieron cargar las figuras.");
      }
    }).catch(() => {
      if (!controlador.signal.aborted) setError("No se pudieron cargar las figuras.");
    });
    return () => controlador.abort();
  }, [api, edicion.id, comparsaActiva]);

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

  // Alta en 1 solo paso: crea el participante y lo vincula como persona de la comparsa.
  async function agregarFigura(evento) {
    evento.preventDefault();
    if (!comparsaActiva || guardando || typeof api.crearParticipante !== "function" || typeof api.crearSujetoComparsa !== "function") return;
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
        setError(resPart.cuerpo?.mensaje ?? "No se pudo registrar la figura.");
        return;
      }
      const persona = resPart.cuerpo;
      setParticipantes((prev) => [...prev, persona]);

      const resSujeto = await api.crearSujetoComparsa(edicion.id, comparsaActiva.id, {
        tipoSujeto: "PERSONA",
        participanteId: persona.id,
      });
      if (!resSujeto.ok) {
        setError(resSujeto.cuerpo?.mensaje ?? "Se creó la persona pero no se pudo vincular a la comparsa.");
        return;
      }
      setFiguras((prev) => [...(prev ?? []), resSujeto.cuerpo]);
      form.reset();
      setAviso(`Figura «${persona.nombreCompleto}» agregada a ${comparsaActiva.nombre}.`);
    } catch {
      setError("No se pudo agregar la figura. Revisá la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarBorradoFigura() {
    if (!figuraAEliminar || guardando || typeof api.eliminarSujeto !== "function") return;
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.eliminarSujeto(edicion.id, figuraAEliminar.id);
      if (res.ok) {
        setFiguras((prev) => prev.filter((s) => s.id !== figuraAEliminar.id));
        setAviso("Figura quitada de la comparsa.");
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo quitar la figura.");
      }
      setFiguraAEliminar(null);
    } catch {
      setError("No se pudo quitar la figura.");
      setFiguraAEliminar(null);
    } finally {
      setGuardando(false);
    }
  }

  const mapaParticipantes = new Map(participantes.map((p) => [p.id, p.nombreCompleto]));

  return (
    <>
      {error && <p className="admin-aviso" role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}

      <section aria-labelledby={idComparsas} className="admin-configuracion-grupo">
        <h3 id={idComparsas}>Comparsas</h3>
        <p className={styles.itemMeta}>
          Cargá las comparsas participantes. Los rubros grupales (batería, carro, banda, comparsa) se vinculan automáticamente al preparar la planilla.
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
                          aria-label={`Figuras de ${comparsa.nombre}`}
                          aria-pressed={comparsaActiva?.id === comparsa.id}
                          onClick={() => setComparsaActiva(comparsaActiva?.id === comparsa.id ? null : comparsa)}
                        >
                          Figuras / participantes
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
          <div className={styles.itemCardHeader}>
            <div>
              <h3 id={idFiguras}>Figuras de {comparsaActiva.nombre}</h3>
              <p className={styles.itemMeta}>
                Solo necesario para rubros individuales (por ejemplo, Reina o Bastonera).
              </p>
            </div>
            <button type="button" onClick={() => setComparsaActiva(null)}>Cerrar</button>
          </div>

          {figuras === null ? (
            <p role="status">Cargando figuras…</p>
          ) : (
            <>
              {figuras.length === 0 ? (
                <p>Todavía no hay figuras cargadas para {comparsaActiva.nombre}.</p>
              ) : (
                <div className={styles.cardList} style={{ marginTop: "0.75rem" }}>
                  {figuras.map((sujeto) => (
                    <article key={sujeto.id} className={styles.itemCard}>
                      <div className={styles.itemCardHeader}>
                        <h4 className={styles.itemTitle}>
                          {mapaParticipantes.get(sujeto.participanteId) ?? sujeto.nombre ?? sujeto.participanteId}
                        </h4>
                        {!soloLectura && typeof api.eliminarSujeto === "function" && (
                          <button type="button" disabled={guardando} onClick={() => setFiguraAEliminar(sujeto)}>
                            Quitar
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {!soloLectura && typeof api.crearParticipante === "function" && (
                <form onSubmit={agregarFigura} aria-busy={guardando}>
                  <label>
                    Nombre de la figura
                    <input name="nombreCompleto" required disabled={guardando} />
                  </label>
                  <label className="admin-casilla">
                    <input name="esMenor" type="checkbox" disabled={guardando} />
                    Es menor de edad
                  </label>
                  <button type="submit" disabled={guardando}>
                    {guardando ? "Guardando…" : "Agregar figura"}
                  </button>
                </form>
              )}
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

      {figuraAEliminar && (
        <Modal title="Quitar figura" onClose={() => setFiguraAEliminar(null)}>
          <p>¿Confirmás quitar esta figura de {comparsaActiva?.nombre}?</p>
          <button type="button" onClick={() => setFiguraAEliminar(null)}>Cancelar</button>{" "}
          <button type="button" disabled={guardando} onClick={confirmarBorradoFigura}>Confirmar</button>
        </Modal>
      )}
    </>
  );
}
