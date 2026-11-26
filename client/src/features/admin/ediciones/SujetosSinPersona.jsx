import { useEffect, useId, useState } from "react";
import { Button } from "../../../components/Button/Button.jsx";
import { Modal } from "../../../components/Modal/Modal.jsx";
import styles from "./ConfiguracionEdicion.module.css";
import { RepresentacionSujeto } from "./RepresentacionSujeto.jsx";

// Sujetos con nombre propio que no son personas: carros, batería, banda, tema inédito, carroza y pareja.
export const TIPOS_SIN_PERSONA = [
  { codigo: "CARRO", etiqueta: "Carro" },
  { codigo: "CARROZA_REINA", etiqueta: "Carroza de reina" },
  { codigo: "BATERIA", etiqueta: "Batería" },
  { codigo: "BANDA_MUSICAL", etiqueta: "Banda musical" },
  { codigo: "TEMA_INEDITO", etiqueta: "Tema inédito" },
  { codigo: "PAREJA", etiqueta: "Pareja de baile" },
  { codigo: "GRUPO", etiqueta: "Grupo" },
];

const etiquetaTipo = Object.fromEntries(TIPOS_SIN_PERSONA.map((t) => [t.codigo, t.etiqueta]));

// Mensaje de la API (campo mensaje) para errores de negocio; si no llega ninguno, uno genérico.
function mensajeDeError(res, generico) {
  return res.cuerpo?.mensaje ?? generico;
}

// Integrantes de un grupo. Son información de la planilla: el puntaje lo recibe el grupo.
function IntegrantesGrupo({ edicion, sujeto, api, soloLectura }) {
  const [integrantes, setIntegrantes] = useState(null);
  const [personas, setPersonas] = useState([]);
  const [elegida, setElegida] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aQuitar, setAQuitar] = useState(null);

  useEffect(() => {
    if (typeof api.listarIntegrantesGrupo !== "function") return undefined;
    const controlador = new AbortController();
    Promise.all([
      api.listarIntegrantesGrupo(edicion.id, sujeto.id, controlador.signal),
      typeof api.listarParticipantes === "function"
        ? api.listarParticipantes(edicion.id, controlador.signal)
        : Promise.resolve({ ok: true, cuerpo: { items: [] } }),
    ]).then(([resIntegrantes, resPersonas]) => {
      if (controlador.signal.aborted) return;
      if (resIntegrantes.ok) setIntegrantes(resIntegrantes.cuerpo.items);
      else setError(mensajeDeError(resIntegrantes, "No se pudieron cargar los integrantes."));
      if (resPersonas.ok) setPersonas(resPersonas.cuerpo.items);
    }).catch(() => {
      if (!controlador.signal.aborted) setError("No se pudieron cargar los integrantes. Revisá la conexión.");
    });
    return () => controlador.abort();
  }, [api, edicion.id, sujeto.id]);

  if (typeof api.listarIntegrantesGrupo !== "function") return null;

  const disponibles = personas.filter((p) => !(integrantes ?? []).some((i) => i.participanteId === p.id));

  async function agregar(evento) {
    evento.preventDefault();
    if (!elegida || guardando) return;
    setGuardando(true);
    setError("");
    try {
      const res = await api.agregarIntegranteGrupo(edicion.id, sujeto.id, elegida);
      if (res.ok) {
        const persona = personas.find((p) => p.id === elegida);
        setIntegrantes((previos) => [...(previos ?? []), { participanteId: elegida, nombreCompleto: persona?.nombreCompleto ?? "" }]);
        setElegida("");
      } else {
        setError(mensajeDeError(res, "No se pudo agregar el integrante."));
      }
    } catch {
      setError("No se pudo agregar el integrante. Revisá la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarQuitar() {
    if (!aQuitar || guardando) return;
    setGuardando(true);
    setError("");
    try {
      const res = await api.quitarIntegranteGrupo(edicion.id, sujeto.id, aQuitar.participanteId);
      if (res.ok) {
        setIntegrantes((previos) => (previos ?? []).filter((i) => i.participanteId !== aQuitar.participanteId));
      } else {
        setError(mensajeDeError(res, "No se pudo quitar el integrante."));
      }
    } catch {
      setError("No se pudo quitar el integrante. Revisá la conexión.");
    } finally {
      setAQuitar(null);
      setGuardando(false);
    }
  }

  return (
    <section aria-label={`Integrantes de ${sujeto.nombre}`} className={styles.subseccion}>
      <p className={styles.itemMeta}>Los integrantes informan la planilla. El puntaje lo recibe el grupo.</p>
      {error && <p role="alert" className="admin-aviso">{error}</p>}

      {integrantes === null ? (
        <p role="status">Cargando integrantes…</p>
      ) : integrantes.length === 0 ? (
        <p>Todavía no hay integrantes en este grupo.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {integrantes.map((integrante) => (
            <li key={integrante.participanteId} className={styles.inlineActions}>
              <span>{integrante.nombreCompleto}</span>
              {!soloLectura && (
                <button
                  type="button"
                  aria-label={`Quitar ${integrante.nombreCompleto}`}
                  disabled={guardando}
                  onClick={() => setAQuitar(integrante)}
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!soloLectura && (
        <form onSubmit={agregar} aria-busy={guardando} className={styles.inlineActions}>
          <label>
            Persona
            <select value={elegida} onChange={(e) => setElegida(e.target.value)} disabled={guardando}>
              <option value="">Elegí una persona</option>
              {disponibles.map((p) => (
                <option key={p.id} value={p.id}>{p.nombreCompleto}</option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="primary" disabled={!elegida || guardando}>Agregar integrante</Button>
        </form>
      )}

      {aQuitar && (
        <Modal
          title="Quitar integrante"
          tone="warning"
          icon="alert"
          onClose={() => setAQuitar(null)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setAQuitar(null)}>Cancelar</Button>
              <Button variant="primary" disabled={guardando} onClick={confirmarQuitar}>Confirmar</Button>
            </>
          )}
        >
          <p>¿Confirmás quitar a <strong>{aQuitar.nombreCompleto}</strong> de {sujeto.nombre}?</p>
        </Modal>
      )}
    </section>
  );
}

// Alta, renombrado y baja de los sujetos con nombre de una comparsa. Las personas se cargan
// en la lista de integrantes; aquí solo aparecen los sujetos que no son personas.
export function SujetosSinPersona({ edicion, comparsa, api, soloLectura = false }) {
  const idSeccion = useId();
  const [sujetos, setSujetos] = useState(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [tipo, setTipo] = useState(TIPOS_SIN_PERSONA[0].codigo);
  const [nombre, setNombre] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [aQuitar, setAQuitar] = useState(null);

  useEffect(() => {
    if (typeof api.listarSujetosComparsa !== "function") return undefined;
    const controlador = new AbortController();
    api.listarSujetosComparsa(edicion.id, comparsa.id, controlador.signal).then((res) => {
      if (controlador.signal.aborted) return;
      if (res.ok) setSujetos(res.cuerpo.items.filter((s) => etiquetaTipo[s.tipoSujeto]));
      else setError(mensajeDeError(res, "No se pudieron cargar los sujetos."));
    }).catch(() => {
      if (!controlador.signal.aborted) setError("No se pudieron cargar los sujetos. Revisá la conexión.");
    });
    return () => controlador.abort();
  }, [api, edicion.id, comparsa.id]);

  if (typeof api.listarSujetosComparsa !== "function") return null;

  async function agregar(evento) {
    evento.preventDefault();
    const limpio = nombre.trim();
    if (guardando || limpio === "") return;
    setGuardando(true);
    setError("");
    try {
      const res = await api.crearSujetoComparsa(edicion.id, comparsa.id, { tipoSujeto: tipo, nombre: limpio });
      if (res.ok) {
        setSujetos((previos) => [...(previos ?? []), res.cuerpo]);
        setNombre("");
      } else {
        setError(mensajeDeError(res, "No se pudo agregar."));
      }
    } catch {
      setError("No se pudo agregar. Revisá la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarNombre(sujeto) {
    const limpio = nuevoNombre.trim();
    if (guardando || limpio === "") return;
    setGuardando(true);
    setError("");
    try {
      const res = await api.actualizarSujeto(edicion.id, sujeto.id, { nombre: limpio });
      if (res.ok) {
        setSujetos((previos) => previos.map((s) => (s.id === sujeto.id ? { ...s, nombre: limpio } : s)));
        setEditandoId(null);
        setNuevoNombre("");
      } else {
        setError(mensajeDeError(res, "No se pudo cambiar el nombre."));
      }
    } catch {
      setError("No se pudo cambiar el nombre. Revisá la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarQuitar() {
    if (!aQuitar || guardando) return;
    setGuardando(true);
    setError("");
    try {
      const res = await api.eliminarSujeto(edicion.id, aQuitar.id);
      if (res.ok) {
        setSujetos((previos) => previos.filter((s) => s.id !== aQuitar.id));
      } else {
        setError(mensajeDeError(res, "No se pudo quitar."));
      }
    } catch {
      setError("No se pudo quitar. Revisá la conexión.");
    } finally {
      setAQuitar(null);
      setGuardando(false);
    }
  }

  return (
    <section aria-labelledby={idSeccion} className={styles.subseccion}>
      <h4 id={idSeccion} className={styles.subseccionTitulo}>Carros, batería, banda y tema</h4>
      <p className={styles.itemMeta}>
        Cargá los sujetos con nombre propio de esta comparsa. Si ya preparaste las planillas, volvé a sincronizarlas en la etapa Planilla y apertura.
      </p>
      {error && <p role="alert" className="admin-aviso">{error}</p>}

      {sujetos === null ? (
        <p role="status">Cargando sujetos…</p>
      ) : sujetos.length === 0 ? (
        <p>Todavía no hay sujetos con nombre en esta comparsa.</p>
      ) : (
        <ul className={styles.cardList} style={{ listStyle: "none", padding: 0 }}>
          {sujetos.map((sujeto) => (
            <li key={sujeto.id} className={styles.itemCard}>
              {editandoId === sujeto.id ? (
                <form
                  className={styles.inlineActions}
                  onSubmit={(evento) => {
                    evento.preventDefault();
                    guardarNombre(sujeto);
                  }}
                >
                  <label>
                    Nuevo nombre
                    <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} required disabled={guardando} />
                  </label>
                  <Button type="submit" variant="primary" disabled={guardando}>Guardar nombre</Button>
                  <Button variant="secondary" disabled={guardando} onClick={() => setEditandoId(null)}>Cancelar</Button>
                </form>
              ) : (
                <div className={styles.itemCardHeader}>
                  <div>
                    <h5 className={styles.itemTitle}>{sujeto.nombre}</h5>
                    <p className={styles.itemMeta}>{etiquetaTipo[sujeto.tipoSujeto]}</p>
                  </div>
                  {!soloLectura && (
                    <div className={styles.inlineActions}>
                      <button
                        type="button"
                        aria-label={`Editar ${sujeto.nombre}`}
                        disabled={guardando}
                        onClick={() => {
                          setEditandoId(sujeto.id);
                          setNuevoNombre(sujeto.nombre ?? "");
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        aria-label={`Quitar ${sujeto.nombre}`}
                        disabled={guardando}
                        onClick={() => setAQuitar(sujeto)}
                      >
                        Quitar
                      </button>
                    </div>
                  )}
                </div>
              )}
              {editandoId !== sujeto.id && (
                <RepresentacionSujeto
                  api={api}
                  edicionId={edicion.id}
                  sujetoId={sujeto.id}
                  nombre={sujeto.nombre}
                  valor={sujeto.representacion ?? null}
                  soloLectura={soloLectura}
                  alGuardar={(texto) => setSujetos((previos) => previos.map((s) => (
                    s.id === sujeto.id ? { ...s, representacion: texto } : s
                  )))}
                />
              )}
              {sujeto.tipoSujeto === "GRUPO" && editandoId !== sujeto.id && (
                <IntegrantesGrupo edicion={edicion} sujeto={sujeto} api={api} soloLectura={soloLectura} />
              )}
            </li>
          ))}
        </ul>
      )}

      {!soloLectura && (
        <form onSubmit={agregar} aria-busy={guardando} className={styles.formIntegrante}>
          <label>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={guardando}>
              {TIPOS_SIN_PERSONA.map((t) => (
                <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>
              ))}
            </select>
          </label>
          <label>
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required disabled={guardando} />
          </label>
          <Button type="submit" variant="primary" disabled={guardando}>Agregar</Button>
        </form>
      )}

      {aQuitar && (
        <Modal
          title="Quitar sujeto"
          tone="warning"
          icon="alert"
          onClose={() => setAQuitar(null)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setAQuitar(null)}>Cancelar</Button>
              <Button variant="primary" disabled={guardando} onClick={confirmarQuitar}>Confirmar</Button>
            </>
          )}
        >
          <p>¿Confirmás quitar <strong>{aQuitar.nombre}</strong> de la comparsa?</p>
        </Modal>
      )}
    </section>
  );
}
