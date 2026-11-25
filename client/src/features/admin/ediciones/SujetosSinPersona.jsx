import { useEffect, useId, useState } from "react";
import { Button } from "../../../components/Button/Button.jsx";
import { Modal } from "../../../components/Modal/Modal.jsx";
import styles from "./ConfiguracionEdicion.module.css";

// Sujetos con nombre propio que no son personas: carros, batería, banda, tema inédito, carroza y pareja.
export const TIPOS_SIN_PERSONA = [
  { codigo: "CARRO", etiqueta: "Carro" },
  { codigo: "CARROZA_REINA", etiqueta: "Carroza de reina" },
  { codigo: "BATERIA", etiqueta: "Batería" },
  { codigo: "BANDA_MUSICAL", etiqueta: "Banda musical" },
  { codigo: "TEMA_INEDITO", etiqueta: "Tema inédito" },
  { codigo: "PAREJA", etiqueta: "Pareja de baile" },
];

const etiquetaTipo = Object.fromEntries(TIPOS_SIN_PERSONA.map((t) => [t.codigo, t.etiqueta]));

// Mensaje de la API (campo mensaje) para errores de negocio; si no llega ninguno, uno genérico.
function mensajeDeError(res, generico) {
  return res.cuerpo?.mensaje ?? generico;
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
