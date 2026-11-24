import { useId, useRef, useState } from "react";
import { Modal } from "../../../components/Modal/Modal.jsx";
import styles from "./ConfiguracionEdicion.module.css";

const ETIQUETA_NOCHE = { DRAFT: "Borrador", OPEN: "Abierta", CLOSED: "Cerrada" };

function textoBloqueante(item) {
  if (typeof item === "string") return item;
  return item?.mensaje ?? item?.codigo ?? JSON.stringify(item);
}

export function PasoOperacionEnVivo({ edicion, estadoEdicionActual, noches, api, alAbrirEdicion, alAbrirNoche }) {
  const idTitulo = useId();
  const [confirmarEdicion, setConfirmarEdicion] = useState(false);
  const [nocheAAbrir, setNocheAAbrir] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [bloqueantes, setBloqueantes] = useState([]);
  const [aviso, setAviso] = useState("");
  const claveEdicionRef = useRef(null);
  const claveNocheRef = useRef(new Map());

  async function confirmarAperturaEdicion() {
    if (enviando || typeof api.abrirEdicion !== "function") return;
    if (!claveEdicionRef.current) claveEdicionRef.current = crypto.randomUUID();
    setEnviando(true);
    setError("");
    setBloqueantes([]);
    setAviso("");
    try {
      const res = await api.abrirEdicion(edicion.id, claveEdicionRef.current);
      if (res.ok) {
        claveEdicionRef.current = null;
        setAviso("Edición abierta correctamente. Ya podés operar jornadas y asignaciones.");
        alAbrirEdicion?.();
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo abrir la edición.");
      }
    } catch {
      setError("No se pudo abrir la edición. Revisá la conexión.");
    } finally {
      setEnviando(false);
      setConfirmarEdicion(false);
    }
  }

  async function confirmarAperturaNoche() {
    if (enviando || !nocheAAbrir || typeof api.abrirNoche !== "function") return;
    let clave = claveNocheRef.current.get(nocheAAbrir.id);
    if (!clave) {
      clave = crypto.randomUUID();
      claveNocheRef.current.set(nocheAAbrir.id, clave);
    }
    setEnviando(true);
    setError("");
    setBloqueantes([]);
    setAviso("");
    try {
      const res = await api.abrirNoche(edicion.id, nocheAAbrir.id, clave);
      if (res.ok) {
        claveNocheRef.current.delete(nocheAAbrir.id);
        setAviso(`Jornada «${nocheAAbrir.nombre}» abierta para votación.`);
        alAbrirNoche?.(nocheAAbrir.id);
      } else {
        if (res.status === 409) {
          claveNocheRef.current.delete(nocheAAbrir.id);
        }
        setError(res.cuerpo?.mensaje ?? "No se pudo abrir la jornada.");
        if (Array.isArray(res.cuerpo?.bloqueantes)) {
          setBloqueantes(res.cuerpo.bloqueantes);
        }
      }
    } catch {
      setError("No se pudo abrir la jornada. Revisá la conexión.");
    } finally {
      setEnviando(false);
      setNocheAAbrir(null);
    }
  }

  const soloLectura = estadoEdicionActual === "CLOSED";

  return (
    <section aria-labelledby={idTitulo} className="admin-configuracion-grupo">
      <h3 id={idTitulo}>Operación en vivo</h3>
      <p className={styles.itemMeta}>
        Desde aquí abrís la edición y cada jornada competitiva. El cierre de jornada, las penalizaciones digitales y la publicación de resultados corresponden exclusivamente al rol Escribano.
      </p>

      {error && (
        <div className="admin-aviso" role="alert" style={{ marginTop: "0.75rem", flexDirection: "column", alignItems: "flex-start" }}>
          <p>{error}</p>
          {bloqueantes.length > 0 && (
            <ul>
              {bloqueantes.map((b, idx) => (
                <li key={idx}>{textoBloqueante(b)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {aviso && <p role="status">{aviso}</p>}

      <div className={styles.cardList} style={{ marginTop: "1rem" }}>
        <article className={styles.itemCard}>
          <div className={styles.itemCardHeader}>
            <div>
              <h4 className={styles.itemTitle}>Estado de la edición</h4>
              <p className={styles.itemMeta}>
                Abrir la edición habilita la operación sin congelar todavía el reglamento ni el padrón.
              </p>
            </div>
            <span className={estadoEdicionActual === "OPEN" ? styles.badgeOk : styles.badgeWarn}>
              {estadoEdicionActual === "OPEN" ? "Abierta" : estadoEdicionActual === "CLOSED" ? "Votación cerrada" : "En configuración"}
            </span>
          </div>
          {estadoEdicionActual === "CONFIGURING" && typeof api.abrirEdicion === "function" && (
            <div style={{ marginTop: "0.75rem" }}>
              <button type="button" disabled={enviando} onClick={() => setConfirmarEdicion(true)}>
                Abrir edición
              </button>
            </div>
          )}
        </article>

        <article className={styles.itemCard}>
          <h4 className={styles.itemTitle}>Jornadas de votación</h4>
          <p className={styles.itemMeta}>
            Al abrir la primera jornada, el reglamento publicado pasa a congelado y se fija la instantánea de planillas esperadas.
          </p>
          {noches.length === 0 ? (
            <p className={styles.itemMeta}>Todavía no hay jornadas cargadas en esta edición.</p>
          ) : (
            <div className={styles.cardList} style={{ marginTop: "0.75rem" }}>
              {noches.map((noche) => {
                const puedeAbrir = !soloLectura && estadoEdicionActual === "OPEN"
                  && noche.estado === "DRAFT" && typeof api.abrirNoche === "function";
                return (
                  <div key={noche.id} className={styles.itemCard}>
                    <div className={styles.itemCardHeader}>
                      <div>
                        <strong>{noche.orden}. {noche.nombre}</strong>
                        <p className={styles.itemMeta}>
                          {noche.fecha ?? "Sin fecha"} · {noche.tipo} · {ETIQUETA_NOCHE[noche.estado] ?? noche.estado}
                        </p>
                      </div>
                      {puedeAbrir && (
                        <button
                          type="button"
                          aria-label={`Abrir ${noche.nombre}`}
                          disabled={enviando}
                          onClick={() => setNocheAAbrir(noche)}
                        >
                          Abrir jornada
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </div>

      {confirmarEdicion && (
        <Modal title="Abrir edición" onClose={() => setConfirmarEdicion(false)}>
          <p>
            Vas a abrir <strong>{edicion.nombre} {edicion.anio}</strong> para operación. Esta acción queda auditada.
          </p>
          <button type="button" disabled={enviando} onClick={() => setConfirmarEdicion(false)}>Cancelar</button>{" "}
          <button type="button" disabled={enviando} onClick={confirmarAperturaEdicion}>
            {enviando ? "Abriendo…" : "Confirmar apertura"}
          </button>
        </Modal>
      )}

      {nocheAAbrir && (
        <Modal title="Abrir jornada para votación" onClose={() => setNocheAAbrir(null)}>
          <p>
            Vas a abrir <strong>{nocheAAbrir.nombre}</strong>. Al confirmar se congela el reglamento y el padrón, y se habilitan las planillas de los jurados asignados.
          </p>
          <button type="button" disabled={enviando} onClick={() => setNocheAAbrir(null)}>Cancelar</button>{" "}
          <button type="button" disabled={enviando} onClick={confirmarAperturaNoche}>
            {enviando ? "Abriendo…" : "Confirmar apertura de jornada"}
          </button>
        </Modal>
      )}
    </section>
  );
}
