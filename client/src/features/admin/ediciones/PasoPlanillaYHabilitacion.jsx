import { useEffect, useId, useState } from "react";
import { Modal } from "../../../components/Modal/Modal.jsx";
import { PlanillasNoche } from "./components/PlanillasNoche/PlanillasNoche.jsx";
import { PasoOperacionEnVivo } from "./PasoOperacionEnVivo.jsx";
import { sincronizarPlanillaEdicion } from "./sincronizar-planilla.js";
import styles from "./ConfiguracionEdicion.module.css";

function textoItem(item) {
  if (typeof item === "string") return item;
  return item?.mensaje ?? item?.codigo ?? JSON.stringify(item);
}

export function PasoPlanillaYHabilitacion({
  edicion,
  estadoEdicionActual,
  versionActiva,
  noches,
  especialidades,
  api,
  planillas,
  soloLectura,
  alPublicar,
  alAbrirEdicion,
  alAbrirNoche,
}) {
  const idTitulo = useId();
  const [checklist, setChecklist] = useState(null);
  const [vistaPrevia, setVistaPrevia] = useState(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [mostrarExcepciones, setMostrarExcepciones] = useState(false);
  const [confirmarPublicar, setConfirmarPublicar] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [recarga, setRecarga] = useState(0);

  const versionId = versionActiva?.id ?? null;
  const esBorrador = !soloLectura && versionActiva?.estado === "BORRADOR";

  useEffect(() => {
    if (!versionId || typeof api.obtenerChecklistPublicacion !== "function") return;
    const controlador = new AbortController();
    Promise.all([
      api.obtenerChecklistPublicacion(edicion.id, versionId, controlador.signal),
      typeof api.obtenerVistaPreviaVersion === "function"
        ? api.obtenerVistaPreviaVersion(edicion.id, versionId, controlador.signal)
        : Promise.resolve({ ok: true, cuerpo: null }),
    ]).then(([resCheck, resPrev]) => {
      if (controlador.signal.aborted) return;
      if (resCheck.ok) setChecklist(resCheck.cuerpo);
      else setError(resCheck.cuerpo?.mensaje ?? "No se pudo consultar el estado de la planilla.");
      if (resPrev.ok) setVistaPrevia(resPrev.cuerpo);
    }).catch(() => {
      if (!controlador.signal.aborted) setError("No se pudo cargar la revisión. Revisá la conexión.");
    });
    return () => controlador.abort();
  }, [api, edicion.id, versionId, recarga]);

  async function prepararYSincronizar() {
    if (sincronizando || !versionActiva) return;
    setSincronizando(true);
    setError("");
    setAviso("");
    const res = await sincronizarPlanillaEdicion({
      edicionId: edicion.id,
      versionActiva,
      noches,
      especialidades,
      api,
      planillas,
    });
    setSincronizando(false);
    if (!res.ok) {
      setError(res.mensaje);
      return;
    }
    setAviso(
      `Planillas sincronizadas (${res.seleccionesGuardadas} selección(es) actualizada(s) en ${res.jornadasSincronizadas} jornada(s)).`,
    );
    setRecarga((n) => n + 1);
  }

  async function confirmarPublicacion() {
    if (publicando || !versionId || typeof api.publicarVersion !== "function") return;
    setPublicando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.publicarVersion(edicion.id, versionId);
      if (res.ok) {
        setAviso("Versión publicada correctamente. Ya podés abrir la edición y las jornadas.");
        alPublicar?.(res.cuerpo);
        setRecarga((n) => n + 1);
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo publicar la versión.");
      }
    } catch {
      setError("No se pudo publicar la versión. Revisá la conexión.");
    } finally {
      setPublicando(false);
      setConfirmarPublicar(false);
    }
  }

  const bloqueantes = checklist?.bloqueantes ?? [];
  const advertencias = checklist?.advertencias ?? [];
  const especialidadesPrev = vistaPrevia?.especialidades ?? [];

  return (
    <section aria-labelledby={idTitulo} className="admin-configuracion-grupo">
      <div className={styles.itemCardHeader}>
        <div>
          <h3 id={idTitulo}>Planilla y habilitación</h3>
          <p className={styles.itemMeta}>
            Sincronizá las planillas y revisá la vista previa. En este paso publicás la versión del reglamento que se creó para la edición y, después, habilitás la votación.
          </p>
        </div>
        {checklist && (
          <span className={checklist.publicable ? styles.badgeOk : styles.badgeDanger}>
            {checklist.publicable ? "Lista para publicar" : `${bloqueantes.length} pendiente(s)`}
          </span>
        )}
      </div>

      {error && <p className="admin-aviso" role="alert" style={{ marginTop: "0.75rem" }}>{error}</p>}
      {aviso && <p role="status">{aviso}</p>}

      {!soloLectura && versionActiva && (
        <div className={styles.inlineActions} style={{ marginTop: "1rem", marginBottom: "1rem" }}>
          <button type="button" disabled={sincronizando} onClick={prepararYSincronizar}>
            {sincronizando ? "Sincronizando planillas…" : "Preparar y sincronizar planillas"}
          </button>
          {esBorrador && typeof api.publicarVersion === "function" && (
            <button
              type="button"
              disabled={!checklist?.publicable || publicando || sincronizando}
              onClick={() => setConfirmarPublicar(true)}
            >
              Publicar reglamento
            </button>
          )}
          <button
            type="button"
            aria-expanded={mostrarExcepciones}
            onClick={() => setMostrarExcepciones((prev) => !prev)}
          >
            {mostrarExcepciones ? "Ocultar excepciones por noche" : "Ajustar excepciones por noche"}
          </button>
        </div>
      )}

      {checklist && (bloqueantes.length > 0 || advertencias.length > 0) && (
        <div className={styles.cardList}>
          {bloqueantes.length > 0 && (
            <article className={styles.itemCard}>
              <h4 className={styles.itemTitle}>Falta completar antes de publicar</h4>
              <ul>
                {bloqueantes.map((item, idx) => (
                  <li key={idx}>{textoItem(item)}</li>
                ))}
              </ul>
            </article>
          )}
          {advertencias.length > 0 && (
            <article className={styles.itemCard}>
              <h4 className={styles.itemTitle}>Avisos (no bloquean)</h4>
              <ul>
                {advertencias.map((item, idx) => (
                  <li key={idx}>{textoItem(item)}</li>
                ))}
              </ul>
            </article>
          )}
        </div>
      )}

      {especialidadesPrev.length > 0 && (
        <article className={styles.itemCard} style={{ marginBottom: "1rem" }}>
          <h4 className={styles.itemTitle}>Vista previa de planillas</h4>
          {especialidadesPrev.map((esp, i) => (
            <div key={esp.id ?? esp.nombre ?? i} style={{ marginTop: "0.65rem" }}>
              <strong>{esp.nombre}</strong>
              {(esp.comparsas ?? []).map((comp, j) => (
                <div key={comp.id ?? comp.nombre ?? j} style={{ marginLeft: "1rem", marginTop: "0.25rem" }}>
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

      {mostrarExcepciones && (
        <PlanillasNoche edicion={edicion} api={api} planillas={planillas} />
      )}

      <PasoOperacionEnVivo
        edicion={edicion}
        estadoEdicionActual={estadoEdicionActual}
        noches={noches}
        api={api}
        alAbrirEdicion={alAbrirEdicion}
        alAbrirNoche={alAbrirNoche}
      />

      {confirmarPublicar && (
        <Modal title="Publicar versión del reglamento" onClose={() => setConfirmarPublicar(false)}>
          <p>
            Vas a publicar la <strong>Versión {versionActiva?.numero}</strong> de <strong>{edicion.nombre} {edicion.anio}</strong>.
            Una versión publicada ya no se edita; luego podrás abrir la edición y las jornadas.
          </p>
          <button type="button" disabled={publicando} onClick={() => setConfirmarPublicar(false)}>Cancelar</button>{" "}
          <button type="button" disabled={publicando} onClick={confirmarPublicacion}>
            {publicando ? "Publicando…" : "Confirmar publicación"}
          </button>
        </Modal>
      )}
    </section>
  );
}
