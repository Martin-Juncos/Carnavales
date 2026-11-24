import { useEffect, useId, useState } from "react";
import { Modal } from "../../../components/Modal/Modal.jsx";
import { TIPOS_SUJETO } from "./PasoReglamento.jsx";
import styles from "./ConfiguracionEdicion.module.css";

const CATEGORIAS = { PRIMERA: "Primera", AGRUPACION: "Agrupación" };

export function PasoPadron({ edicion, api, soloLectura }) {
  const idComparsas = useId();
  const idParticipantes = useId();
  const idSujetos = useId();

  const [comparsas, setComparsas] = useState(null);
  const [participantes, setParticipantes] = useState(null);
  const [comparsaActiva, setComparsaActiva] = useState(null);
  const [sujetos, setSujetos] = useState(null);
  const [tipoSujeto, setTipoSujeto] = useState("COMPARSA");
  const [comparsaAEliminar, setComparsaAEliminar] = useState(null);
  const [sujetoAEliminar, setSujetoAEliminar] = useState(null);
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
      if (!controlador.signal.aborted) setError("No se pudo cargar el padrón. Revisá la conexión.");
    });
    return () => controlador.abort();
  }, [api, edicion.id]);

  useEffect(() => {
    if (!comparsaActiva || typeof api.listarSujetosComparsa !== "function") {
      setSujetos(null);
      return;
    }
    const controlador = new AbortController();
    api.listarSujetosComparsa(edicion.id, comparsaActiva.id, controlador.signal).then((res) => {
      if (controlador.signal.aborted) return;
      if (res.ok) setSujetos(res.cuerpo.items ?? []);
      else setError(res.cuerpo?.mensaje ?? "No se pudieron cargar los sujetos.");
    }).catch(() => {
      if (!controlador.signal.aborted) setError("No se pudieron cargar los sujetos.");
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

  async function agregarParticipante(evento) {
    evento.preventDefault();
    if (guardando || typeof api.crearParticipante !== "function") return;
    const form = evento.currentTarget;
    const datos = new FormData(form);
    const nombreCompleto = String(datos.get("nombreCompleto") ?? "").trim();
    const esMenor = datos.has("esMenor");
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.crearParticipante(edicion.id, { nombreCompleto, esMenor, activo: true });
      if (res.ok) {
        setParticipantes((prev) => [...(prev ?? []), res.cuerpo]);
        form.reset();
        setAviso(`Participante «${res.cuerpo.nombreCompleto}» agregado.`);
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo crear el participante.");
      }
    } catch {
      setError("No se pudo crear el participante. Revisá la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function agregarSujeto(evento) {
    evento.preventDefault();
    if (!comparsaActiva || guardando || typeof api.crearSujetoComparsa !== "function") return;
    const form = evento.currentTarget;
    const datos = new FormData(form);
    const cuerpo = tipoSujeto === "PERSONA"
      ? { tipoSujeto, participanteId: String(datos.get("participanteId") ?? "") }
      : { tipoSujeto, nombre: String(datos.get("nombre") ?? "").trim() };
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.crearSujetoComparsa(edicion.id, comparsaActiva.id, cuerpo);
      if (res.ok) {
        setSujetos((prev) => [...(prev ?? []), res.cuerpo]);
        form.reset();
        setAviso("Sujeto evaluable agregado.");
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo agregar el sujeto.");
      }
    } catch {
      setError("No se pudo agregar el sujeto. Revisá la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarBorradoSujeto() {
    if (!sujetoAEliminar || guardando || typeof api.eliminarSujeto !== "function") return;
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.eliminarSujeto(edicion.id, sujetoAEliminar.id);
      if (res.ok) {
        setSujetos((prev) => prev.filter((s) => s.id !== sujetoAEliminar.id));
        setAviso("Sujeto eliminado.");
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo eliminar el sujeto.");
      }
      setSujetoAEliminar(null);
    } catch {
      setError("No se pudo eliminar el sujeto.");
      setSujetoAEliminar(null);
    } finally {
      setGuardando(false);
    }
  }

  const mapaParticipantes = new Map((participantes ?? []).map((p) => [p.id, p.nombreCompleto]));

  return (
    <>
      {error && <p className="admin-aviso" role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}

      <section aria-labelledby={idComparsas} className="admin-configuracion-grupo">
        <h3 id={idComparsas}>Comparsas</h3>
        {comparsas === null ? (
          <p role="status">Cargando comparsas…</p>
        ) : (
          <>
            {comparsas.length === 0 ? (
              <p>Todavía no hay comparsas cargadas en esta edición.</p>
            ) : (
              <div className={styles.cardList}>
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
                          aria-label={`Sujetos de ${comparsa.nombre}`}
                          aria-pressed={comparsaActiva?.id === comparsa.id}
                          onClick={() => setComparsaActiva(comparsaActiva?.id === comparsa.id ? null : comparsa)}
                        >
                          Sujetos evaluables
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
        <section aria-labelledby={idSujetos} className="admin-configuracion-grupo">
          <div className={styles.itemCardHeader}>
            <h3 id={idSujetos}>Sujetos evaluables de {comparsaActiva.nombre}</h3>
            <button type="button" onClick={() => setComparsaActiva(null)}>Cerrar sujetos</button>
          </div>

          {sujetos === null ? (
            <p role="status">Cargando sujetos…</p>
          ) : (
            <>
              {sujetos.length === 0 ? (
                <p>Todavía no hay sujetos evaluables para {comparsaActiva.nombre}.</p>
              ) : (
                <div className={styles.cardList}>
                  {sujetos.map((sujeto) => {
                    const etiqueta = sujeto.tipoSujeto === "PERSONA"
                      ? (mapaParticipantes.get(sujeto.participanteId) ?? sujeto.nombre ?? sujeto.participanteId)
                      : sujeto.nombre;
                    return (
                      <article key={sujeto.id} className={styles.itemCard}>
                        <div className={styles.itemCardHeader}>
                          <div>
                            <h4 className={styles.itemTitle}>{etiqueta}</h4>
                            <p className={styles.itemMeta}>Tipo: {sujeto.tipoSujeto}</p>
                          </div>
                          {!soloLectura && typeof api.eliminarSujeto === "function" && (
                            <button
                              type="button"
                              disabled={guardando}
                              onClick={() => setSujetoAEliminar(sujeto)}
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {!soloLectura && typeof api.crearSujetoComparsa === "function" && (
                <form onSubmit={agregarSujeto} aria-busy={guardando}>
                  <label>
                    Tipo de sujeto
                    <select
                      name="tipoSujeto"
                      value={tipoSujeto}
                      onChange={(e) => setTipoSujeto(e.target.value)}
                      disabled={guardando}
                    >
                      {TIPOS_SUJETO.map((t) => (
                        <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>
                      ))}
                    </select>
                  </label>
                  {tipoSujeto === "PERSONA" ? (
                    <label>
                      Participante
                      <select name="participanteId" required disabled={guardando}>
                        <option value="">Elegí una persona…</option>
                        {(participantes ?? []).map((p) => (
                          <option key={p.id} value={p.id}>{p.nombreCompleto}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label>
                      Nombre del sujeto
                      <input name="nombre" required disabled={guardando} />
                    </label>
                  )}
                  <button type="submit" disabled={guardando}>
                    {guardando ? "Guardando…" : "Agregar sujeto"}
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      )}

      <section aria-labelledby={idParticipantes} className="admin-configuracion-grupo">
        <h3 id={idParticipantes}>Participantes</h3>
        {participantes === null ? (
          <p role="status">Cargando participantes…</p>
        ) : (
          <>
            {participantes.length === 0 ? (
              <p>Todavía no hay participantes registrados en esta edición.</p>
            ) : (
              <div className="admin-tabla" role="region" aria-label="Listado de participantes" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Nombre completo</th>
                      <th scope="col">Condición</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participantes.map((p) => (
                      <tr key={p.id}>
                        <td>{p.nombreCompleto}</td>
                        <td>{p.esMenor ? "Menor" : "Mayor"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!soloLectura && typeof api.crearParticipante === "function" && (
              <form onSubmit={agregarParticipante} aria-busy={guardando}>
                <label>
                  Nombre completo
                  <input name="nombreCompleto" required disabled={guardando} />
                </label>
                <label className="admin-casilla">
                  <input name="esMenor" type="checkbox" disabled={guardando} />
                  Es menor de edad
                </label>
                <button type="submit" disabled={guardando}>
                  {guardando ? "Guardando…" : "Agregar participante"}
                </button>
              </form>
            )}
          </>
        )}
      </section>

      {comparsaAEliminar && (
        <Modal title="Eliminar comparsa" onClose={() => setComparsaAEliminar(null)}>
          <p>
            ¿Confirmás eliminar la comparsa <strong>{comparsaAEliminar.nombre}</strong>? Si ya tiene historial o sujetos asociados, la API bloqueará el borrado.
          </p>
          <button type="button" onClick={() => setComparsaAEliminar(null)}>Cancelar</button>{" "}
          <button type="button" disabled={guardando} onClick={confirmarBorradoComparsa}>Confirmar eliminación</button>
        </Modal>
      )}

      {sujetoAEliminar && (
        <Modal title="Eliminar sujeto" onClose={() => setSujetoAEliminar(null)}>
          <p>¿Confirmás eliminar este sujeto evaluable?</p>
          <button type="button" onClick={() => setSujetoAEliminar(null)}>Cancelar</button>{" "}
          <button type="button" disabled={guardando} onClick={confirmarBorradoSujeto}>Confirmar eliminación</button>
        </Modal>
      )}
    </>
  );
}
