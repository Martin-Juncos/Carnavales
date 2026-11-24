import { useEffect, useId, useState } from "react";
import { Modal } from "../../../components/Modal/Modal.jsx";
import styles from "./ConfiguracionEdicion.module.css";

export function PasoOrdenSalida({ edicion, noches, api, soloLectura }) {
  const idTitulo = useId();
  const [nocheId, setNocheId] = useState(() => noches[0]?.id ?? "");
  const [comparsas, setComparsas] = useState([]);
  const [ordenIds, setOrdenIds] = useState(null);
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (!nocheId && noches.length > 0) setNocheId(noches[0].id);
  }, [noches, nocheId]);

  useEffect(() => {
    if (typeof api.listarComparsas !== "function") return;
    const controlador = new AbortController();
    api.listarComparsas(edicion.id, controlador.signal).then((res) => {
      if (!controlador.signal.aborted && res.ok) {
        setComparsas((res.cuerpo.items ?? []).filter((c) => c.activa !== false));
      }
    }).catch(() => {});
    return () => controlador.abort();
  }, [api, edicion.id]);

  useEffect(() => {
    if (!nocheId || typeof api.obtenerOrdenNoche !== "function") return;
    const controlador = new AbortController();
    setOrdenIds(null);
    setError("");
    api.obtenerOrdenNoche(edicion.id, nocheId, controlador.signal).then((res) => {
      if (controlador.signal.aborted) return;
      if (res.ok) {
        const ordenados = [...(res.cuerpo.items ?? [])].sort((a, b) => a.orden - b.orden);
        setOrdenIds(ordenados.map((item) => item.comparsaId));
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo consultar el orden de salida.");
        setOrdenIds([]);
      }
    }).catch(() => {
      if (!controlador.signal.aborted) {
        setError("No se pudo consultar el orden de salida. Revisá la conexión.");
        setOrdenIds([]);
      }
    });
    return () => controlador.abort();
  }, [api, edicion.id, nocheId]);

  const nocheSeleccionada = noches.find((n) => n.id === nocheId) ?? null;
  const editable = !soloLectura && nocheSeleccionada?.estado === "DRAFT";
  const mapaComparsas = new Map(comparsas.map((c) => [c.id, c]));
  const disponibles = comparsas.filter((c) => !(ordenIds ?? []).includes(c.id));

  function mover(indice, delta) {
    setOrdenIds((prev) => {
      const siguiente = [...prev];
      const destino = indice + delta;
      if (destino < 0 || destino >= siguiente.length) return prev;
      [siguiente[indice], siguiente[destino]] = [siguiente[destino], siguiente[indice]];
      return siguiente;
    });
  }

  function quitar(id) {
    setOrdenIds((prev) => prev.filter((item) => item !== id));
  }

  function agregar(id) {
    if (!id) return;
    setOrdenIds((prev) => [...(prev ?? []), id]);
  }

  async function guardarOrden() {
    if (guardando || !nocheId || typeof api.guardarOrdenNoche !== "function") return;
    const items = (ordenIds ?? []).map((comparsaId, idx) => ({ comparsaId, orden: idx + 1 }));
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await api.guardarOrdenNoche(edicion.id, nocheId, items);
      if (res.ok) {
        setAviso("Orden de salida guardado correctamente.");
      } else {
        setError(res.cuerpo?.mensaje ?? "No se pudo guardar el orden de salida.");
      }
    } catch {
      setError("No se pudo guardar el orden de salida. Revisá la conexión.");
    } finally {
      setGuardando(false);
      setConfirmar(false);
    }
  }

  return (
    <section aria-labelledby={idTitulo} className="admin-configuracion-grupo">
      <h3 id={idTitulo}>Orden de salida por jornada</h3>

      {noches.length === 0 ? (
        <p>Primero agregá al menos una jornada en el paso 1.</p>
      ) : (
        <>
          <label style={{ maxWidth: "24rem", marginBottom: "1rem" }}>
            Jornada
            <select value={nocheId} onChange={(e) => { setNocheId(e.target.value); setAviso(""); }}>
              {noches.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.orden}. {n.nombre} ({n.estado})
                </option>
              ))}
            </select>
          </label>

          {error && <p className="admin-aviso" role="alert">{error}</p>}
          {aviso && <p role="status">{aviso}</p>}

          {ordenIds === null ? (
            <p role="status">Cargando orden de salida…</p>
          ) : (
            <>
              {ordenIds.length === 0 ? (
                <p>Todavía no hay comparsas programadas para esta jornada.</p>
              ) : (
                <div className={styles.cardList}>
                  {ordenIds.map((comparsaId, idx) => {
                    const comparsa = mapaComparsas.get(comparsaId);
                    const nombre = comparsa?.nombre ?? comparsaId;
                    return (
                      <article key={comparsaId} className={styles.itemCard}>
                        <div className={styles.itemCardHeader}>
                          <h4 className={styles.itemTitle}>{idx + 1}. {nombre}</h4>
                          {editable && (
                            <div className={styles.inlineActions}>
                              <button
                                type="button"
                                aria-label={`Subir ${nombre}`}
                                disabled={idx === 0 || guardando}
                                onClick={() => mover(idx, -1)}
                              >
                                Subir
                              </button>
                              <button
                                type="button"
                                aria-label={`Bajar ${nombre}`}
                                disabled={idx === ordenIds.length - 1 || guardando}
                                onClick={() => mover(idx, 1)}
                              >
                                Bajar
                              </button>
                              <button
                                type="button"
                                aria-label={`Quitar ${nombre}`}
                                disabled={guardando}
                                onClick={() => quitar(comparsaId)}
                              >
                                Quitar
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {editable && disponibles.length > 0 && (
                <div className={styles.inlineActions} style={{ marginBottom: "1rem" }}>
                  {disponibles.map((c) => (
                    <button key={c.id} type="button" disabled={guardando} onClick={() => agregar(c.id)}>
                      + Agregar {c.nombre}
                    </button>
                  ))}
                </div>
              )}

              {editable && typeof api.guardarOrdenNoche === "function" && (
                <button type="button" disabled={guardando} onClick={() => setConfirmar(true)}>
                  Guardar orden
                </button>
              )}
            </>
          )}
        </>
      )}

      {confirmar && (
        <Modal title="Guardar orden de salida" onClose={() => setConfirmar(false)}>
          <p>
            Vas a guardar el orden de salida de <strong>{nocheSeleccionada?.nombre}</strong> con {ordenIds?.length ?? 0} comparsa(s).
          </p>
          <button type="button" disabled={guardando} onClick={() => setConfirmar(false)}>Cancelar</button>{" "}
          <button type="button" disabled={guardando} onClick={guardarOrden}>
            {guardando ? "Guardando…" : "Confirmar orden"}
          </button>
        </Modal>
      )}
    </section>
  );
}
