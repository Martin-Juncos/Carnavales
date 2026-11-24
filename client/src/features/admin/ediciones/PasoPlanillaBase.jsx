import { useEffect, useId, useState } from "react";
import styles from "./ConfiguracionEdicion.module.css";

export function PasoPlanillaBase({ edicion, versionActiva, api, soloLectura }) {
  const idTitulo = useId();
  const [filas, setFilas] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [recarga, setRecarga] = useState(0);

  const versionId = versionActiva?.id ?? null;
  const esBorrador = !soloLectura && versionActiva?.estado === "BORRADOR";

  useEffect(() => {
    if (!versionId || typeof api.listarPlanillaVersion !== "function") return;
    const controlador = new AbortController();
    api.listarPlanillaVersion(edicion.id, versionId, controlador.signal).then((res) => {
      if (controlador.signal.aborted) return;
      if (res.ok) setFilas(res.cuerpo.items ?? []);
      else setError(res.cuerpo?.mensaje ?? "No se pudo cargar la planilla base.");
    }).catch(() => {
      if (!controlador.signal.aborted) setError("No se pudo cargar la planilla base. Revisá la conexión.");
    });
    return () => controlador.abort();
  }, [api, edicion.id, versionId, recarga]);

  if (!versionId || typeof api.listarPlanillaVersion !== "function") {
    return null;
  }

  async function generarFilas() {
    if (guardando || typeof api.generarPlanillaVersion !== "function") return;
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.generarPlanillaVersion(edicion.id, versionId);
      if (res.ok) {
        setAviso("Filas nominativas generadas correctamente.");
        setRecarga((n) => n + 1);
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudieron generar las filas nominativas.");
      }
    } catch {
      setError("No se pudieron generar las filas. Revisá la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function alternarExclusion(fila) {
    if (guardando || typeof api.actualizarFilaPlanilla !== "function") return;
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.actualizarFilaPlanilla(edicion.id, versionId, fila.id, { excluida: !fila.excluida });
      if (res.ok) {
        setFilas((prev) => prev.map((f) => (f.id === fila.id ? { ...f, excluida: !fila.excluida } : f)));
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo actualizar la fila.");
      }
    } catch {
      setError("No se pudo actualizar la fila. Revisá la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  async function eliminarManual(fila) {
    if (guardando || typeof api.eliminarFilaPlanilla !== "function") return;
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.eliminarFilaPlanilla(edicion.id, versionId, fila.id);
      if (res.ok) {
        setFilas((prev) => prev.filter((f) => f.id !== fila.id));
        setAviso("Nominación manual eliminada.");
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo eliminar la nominación.");
      }
    } catch {
      setError("No se pudo eliminar la nominación.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section aria-labelledby={idTitulo} className="admin-configuracion-grupo">
      <div className={styles.itemCardHeader}>
        <div>
          <h3 id={idTitulo}>Planilla base del reglamento</h3>
          <p className={styles.itemMeta}>
            Generá las filas nominativas a partir de los rubros y el padrón, y ajustá exclusiones antes de publicar.
          </p>
        </div>
        {esBorrador && typeof api.generarPlanillaVersion === "function" && (
          <button type="button" disabled={guardando} onClick={generarFilas}>
            {guardando ? "Generando…" : "Generar filas nominativas"}
          </button>
        )}
      </div>

      {error && <p className="admin-aviso" role="alert">{error}</p>}
      {aviso && <p role="status">{aviso}</p>}

      {filas === null ? (
        <p role="status">Cargando planilla base…</p>
      ) : filas.length === 0 ? (
        <p>Todavía no hay filas generadas para esta versión.</p>
      ) : (
        <div className="admin-tabla" role="region" aria-label="Filas de planilla base" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Comparsa</th>
                <th scope="col">Rubro</th>
                <th scope="col">Especialidad</th>
                <th scope="col">Estado</th>
                {esBorrador && <th scope="col">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.id}>
                  <td>{fila.comparsaNombre ?? fila.sujeto?.comparsa?.nombre ?? "—"}</td>
                  <td>{fila.rubroNombre ?? fila.rubro?.nombre ?? "—"}</td>
                  <td>{fila.especialidadNombre ?? fila.especialidad?.nombre ?? "—"}</td>
                  <td>
                    <span className={fila.excluida ? styles.badgeWarn : styles.badgeOk}>
                      {fila.excluida ? "Excluida" : "Activa"}
                    </span>
                  </td>
                  {esBorrador && (
                    <td>
                      {typeof api.actualizarFilaPlanilla === "function" && (
                        <button type="button" disabled={guardando} onClick={() => alternarExclusion(fila)}>
                          {fila.excluida ? "Incluir" : "Excluir"}
                        </button>
                      )}
                      {fila.origen === "MANUAL" && typeof api.eliminarFilaPlanilla === "function" && (
                        <button type="button" disabled={guardando} onClick={() => eliminarManual(fila)}>
                          Quitar
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
