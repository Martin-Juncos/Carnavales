import { useEffect, useId, useState } from "react";
import { Modal } from "../../../components/Modal/Modal.jsx";
import styles from "./ConfiguracionEdicion.module.css";

function textoItem(item) {
  if (typeof item === "string") return item;
  return item?.mensaje ?? item?.codigo ?? JSON.stringify(item);
}

export function PasoRevisionPublicacion({ edicion, versionActiva, api, soloLectura, alPublicar }) {
  const idTitulo = useId();
  const [checklist, setChecklist] = useState(null);
  const [vistaPrevia, setVistaPrevia] = useState(null);
  const [confirmar, setConfirmar] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [recarga, setRecarga] = useState(0);

  const versionId = versionActiva?.id ?? null;
  const esBorrador = !soloLectura && versionActiva?.estado === "BORRADOR";

  useEffect(() => {
    if (!versionId || typeof api.obtenerChecklistPublicacion !== "function") return;
    const controlador = new AbortController();
    setError("");
    Promise.all([
      api.obtenerChecklistPublicacion(edicion.id, versionId, controlador.signal),
      typeof api.obtenerVistaPreviaVersion === "function"
        ? api.obtenerVistaPreviaVersion(edicion.id, versionId, controlador.signal)
        : Promise.resolve({ ok: true, cuerpo: null }),
    ]).then(([resCheck, resPrev]) => {
      if (controlador.signal.aborted) return;
      if (resCheck.ok) setChecklist(resCheck.cuerpo);
      else setError(resCheck.cuerpo?.mensaje ?? "No se pudo consultar el checklist de publicación.");
      if (resPrev.ok) setVistaPrevia(resPrev.cuerpo);
    }).catch(() => {
      if (!controlador.signal.aborted) setError("No se pudo cargar la revisión. Revisá la conexión.");
    });
    return () => controlador.abort();
  }, [api, edicion.id, versionId, recarga]);

  if (!versionId) {
    return (
      <section aria-labelledby={idTitulo} className="admin-configuracion-grupo">
        <h3 id={idTitulo}>Revisión y publicación</h3>
        <p>No hay una versión de reglamento disponible para revisar.</p>
      </section>
    );
  }

  async function confirmarPublicacion() {
    if (publicando || typeof api.publicarVersion !== "function") return;
    setPublicando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.publicarVersion(edicion.id, versionId);
      if (res.ok) {
        setAviso("Versión publicada correctamente. Ya podés avanzar a Operación en vivo.");
        alPublicar?.(res.cuerpo);
        setRecarga((n) => n + 1);
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo publicar la versión.");
      }
    } catch {
      setError("No se pudo publicar la versión. Revisá la conexión.");
    } finally {
      setPublicando(false);
      setConfirmar(false);
    }
  }

  const bloqueantes = checklist?.bloqueantes ?? [];
  const advertencias = checklist?.advertencias ?? [];
  const especialidadesPrev = vistaPrevia?.especialidades ?? [];

  return (
    <section aria-labelledby={idTitulo} className="admin-configuracion-grupo">
      <div className={styles.itemCardHeader}>
        <div>
          <h3 id={idTitulo}>Revisión y publicación</h3>
          <p className={styles.itemMeta}>
            Versión {versionActiva.numero} · Estado actual: {versionActiva.estado}. Publicar no abre todavía la votación.
          </p>
        </div>
        {checklist && (
          <span className={checklist.publicable ? styles.badgeOk : styles.badgeDanger}>
            {checklist.publicable ? "Lista para publicar" : `${bloqueantes.length} bloqueante(s)`}
          </span>
        )}
      </div>

      {error && <p className="admin-aviso" role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}

      {!checklist ? (
        <p role="status">Verificando requisitos de publicación…</p>
      ) : (
        <div className={styles.cardList} style={{ marginTop: "1rem" }}>
          <article className={styles.itemCard}>
            <h4 className={styles.itemTitle}>Errores bloqueantes</h4>
            {bloqueantes.length === 0 ? (
              <p className={styles.itemMeta}>Sin bloqueantes oficiales de configuración.</p>
            ) : (
              <ul>
                {bloqueantes.map((item, idx) => (
                  <li key={idx}>{textoItem(item)}</li>
                ))}
              </ul>
            )}
          </article>

          {advertencias.length > 0 && (
            <article className={styles.itemCard}>
              <h4 className={styles.itemTitle}>Advertencias (no bloquean)</h4>
              <ul>
                {advertencias.map((item, idx) => (
                  <li key={idx}>{textoItem(item)}</li>
                ))}
              </ul>
            </article>
          )}

          {especialidadesPrev.length > 0 && (
            <article className={styles.itemCard}>
              <h4 className={styles.itemTitle}>Vista previa de planillas (solo lectura)</h4>
              {especialidadesPrev.map((esp, i) => (
                <div key={esp.id ?? esp.nombre ?? i} style={{ marginTop: "0.75rem" }}>
                  <strong>{esp.nombre}</strong>
                  {(esp.comparsas ?? []).map((comp, j) => (
                    <div key={comp.id ?? comp.nombre ?? j} style={{ marginLeft: "1rem", marginTop: "0.35rem" }}>
                      <span>{comp.nombre}</span>
                      <ul>
                        {(comp.filas ?? []).map((fila, k) => (
                          <li key={fila.id ?? k}>
                            {fila.rubroNombre ?? fila.rubro?.nombre}
                            {fila.sujetoNombre ? ` · ${fila.sujetoNombre}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
            </article>
          )}
        </div>
      )}

      {esBorrador && typeof api.publicarVersion === "function" && (
        <div className={styles.inlineActions}>
          <button
            type="button"
            disabled={!checklist?.publicable || publicando}
            onClick={() => setConfirmar(true)}
          >
            Publicar versión
          </button>
          <button type="button" disabled={publicando} onClick={() => setRecarga((n) => n + 1)}>
            Actualizar checklist
          </button>
        </div>
      )}

      {confirmar && (
        <Modal title="Publicar versión del reglamento" onClose={() => setConfirmar(false)}>
          <p>
            Vas a publicar la <strong>Versión {versionActiva.numero}</strong> de <strong>{edicion.nombre} {edicion.anio}</strong>.
            Una versión publicada ya no se edita; cualquier cambio posterior requerirá crear una nueva versión antes de abrir la primera noche.
          </p>
          <button type="button" disabled={publicando} onClick={() => setConfirmar(false)}>Cancelar</button>{" "}
          <button type="button" disabled={publicando} onClick={confirmarPublicacion}>
            {publicando ? "Publicando…" : "Confirmar publicación"}
          </button>
        </Modal>
      )}
    </section>
  );
}
