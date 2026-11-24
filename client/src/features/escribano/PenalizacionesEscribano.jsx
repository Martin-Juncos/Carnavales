import { useEffect, useState } from "react";
import { Modal } from "../../components/Modal/Modal.jsx";
import styles from "./PanelEscribano.module.css";

const etiquetasTipo = {
  RETRASO_INGRESO: "Retraso de ingreso",
  RETRASO_SALIDA: "Retraso de salida",
  EXCESO_SHOW_BATERIA: "Exceso en show de batería",
  MINIMO_INTEGRANTES: "Incumplimiento de mínimo de integrantes",
};

function formatearPuntos(valor) {
  return `${Number(valor).toFixed(2).replace(".", ",")} pts`;
}

function describirEfecto(tipo, minutosTexto) {
  if (tipo === "MINIMO_INTEGRANTES") {
    return "Sin descuento numérico · Impide premios de comparsa (mantiene individuales).";
  }
  const minutos = Number(minutosTexto);
  if (!Number.isInteger(minutos) || minutos <= 0) {
    return "Ingresá minutos enteros positivos para calcular el descuento (0,50 pts/min).";
  }
  if (tipo === "RETRASO_INGRESO") {
    const aplicados = Math.min(minutos, 30);
    const pts = formatearPuntos(aplicados * 0.5);
    return minutos > 30
      ? `Descuento calculado: ${pts} (tope 30 min · cede turno y desfila al final).`
      : `Descuento calculado: ${pts}.`;
  }
  const pts = formatearPuntos(minutos * 0.5);
  return tipo === "EXCESO_SHOW_BATERIA"
    ? `Descuento calculado sobre el rubro elegido: ${pts}.`
    : `Descuento calculado: ${pts}.`;
}

function describirItem(item) {
  if (item.impidePremiosComparsa) return "Impide premios de comparsa (mantiene individuales)";
  const pts = formatearPuntos(item.puntosDescuento);
  if (item.cedioTurno) return `${pts} (${item.minutos} min · tope 30 min · cedió turno)`;
  if (item.rubro) return `${pts} (${item.minutos} min · ${item.rubro.nombre})`;
  return `${pts} (${item.minutos} min)`;
}

export function PenalizacionesEscribano({ api, revisionEdiciones = 0 }) {
  const [ediciones, setEdiciones] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    api.listarEdicionesEscribano().then(({ ok, cuerpo }) => {
      if (!ok || !Array.isArray(cuerpo?.items)) throw new Error();
      if (vigente) {
        setError("");
        setEdiciones(cuerpo.items);
      }
    }).catch(() => {
      if (vigente) setError("No se pudieron consultar las ediciones para penalizaciones.");
    });
    return () => { vigente = false; };
  }, [api, intento, revisionEdiciones]);

  const edicion = ediciones?.find(({ id }) => id === seleccion);
  return (
    <section aria-labelledby="titulo-penalizaciones" className={styles.stageCard}>
      <div className={styles.stageHeader}>
        <div>
          <h2 id="titulo-penalizaciones" className={styles.stageTitle}>Penalizaciones</h2>
          <p className={styles.stageDesc}>
            Descuentos reglamentarios independientes de la evaluación artística, con constancia de acta.
          </p>
        </div>
      </div>
      {error ? (
        <div className={styles.actionsRow}>
          <p role="alert" className={`${styles.statusBanner} ${styles.statusDanger}`}>{error}</p>
          <button type="button" className={styles.btnSecondary} onClick={() => { setError(""); setIntento(intento + 1); }}>
            Reintentar
          </button>
        </div>
      ) : !ediciones ? <p role="status">Cargando ediciones…</p> : !ediciones.length ? <p>No hay ediciones disponibles.</p> : (
        <>
          <ul className={styles.selectorList}>
            {ediciones.map((item) => {
              const activa = seleccion === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`${styles.selectorBtn} ${activa ? styles.selectorBtnActive : ""}`}
                    aria-pressed={activa}
                    onClick={() => setSeleccion(item.id)}
                  >
                    <span>{item.nombre} · {item.anio}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {edicion && <DetallePenalizaciones key={edicion.id} api={api} edicion={edicion} revisionEdiciones={revisionEdiciones} />}
        </>
      )}
    </section>
  );
}

function DetallePenalizaciones({ api, edicion, revisionEdiciones }) {
  const [contexto, setContexto] = useState(null);
  const [items, setItems] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [recarga, setRecarga] = useState(0);

  const [nocheId, setNocheId] = useState("");
  const [comparsaId, setComparsaId] = useState("");
  const [tipo, setTipo] = useState("RETRASO_INGRESO");
  const [minutos, setMinutos] = useState("1");
  const [rubroVersionId, setRubroVersionId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [referenciaActa, setReferenciaActa] = useState("");
  const [pendienteRegistro, setPendienteRegistro] = useState(null);
  const [errorForm, setErrorForm] = useState("");
  const [errorModalRegistro, setErrorModalRegistro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [aAnular, setAAnular] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState("");
  const [actaAnulacion, setActaAnulacion] = useState("");
  const [errorAnulacion, setErrorAnulacion] = useState("");

  useEffect(() => {
    let vigente = true;
    Promise.all([
      api.obtenerContextoPenalizaciones(edicion.id),
      api.listarPenalizaciones(edicion.id),
    ]).then(([resCtx, resLista]) => {
      if (!vigente) return;
      if (!resCtx.ok || !resLista.ok) throw new Error();
      setErrorCarga("");
      setContexto(resCtx.cuerpo);
      setItems(resLista.cuerpo.items);
      const primeraNoche = resCtx.cuerpo.noches[0];
      setNocheId((actual) => actual || primeraNoche?.id || "");
      setComparsaId((actual) => actual || primeraNoche?.comparsas[0]?.id || "");
      setRubroVersionId((actual) => actual || resCtx.cuerpo.rubros[0]?.id || "");
    }).catch(() => {
      if (vigente) setErrorCarga("No se pudieron consultar las penalizaciones de la edición.");
    });
    return () => { vigente = false; };
  }, [api, edicion.id, recarga, revisionEdiciones]);

  const estadoEdicion = contexto?.edicion?.estado ?? edicion.estado;
  const cerrada = estadoEdicion === "CLOSED";
  const abierta = estadoEdicion === "OPEN";
  const noches = contexto?.noches ?? [];
  const rubros = contexto?.rubros ?? [];
  const nocheActual = noches.find((n) => n.id === nocheId) ?? noches[0];
  const comparsas = nocheActual?.comparsas ?? [];

  function cambiarNoche(nuevoId) {
    setNocheId(nuevoId);
    const encontrada = noches.find((n) => n.id === nuevoId);
    setComparsaId(encontrada?.comparsas[0]?.id ?? "");
  }

  function prepararRegistro(evento) {
    evento.preventDefault();
    setErrorForm("");
    const motivoLimpio = motivo.trim();
    const actaLimpia = referenciaActa.trim();
    if (!nocheId || !comparsaId || !motivoLimpio || !actaLimpia) {
      setErrorForm("Completá noche, comparsa, motivo y referencia de acta.");
      return;
    }
    const payload = {
      operationId: globalThis.crypto.randomUUID(),
      nocheId,
      comparsaId,
      tipo,
      motivo: motivoLimpio,
      referenciaActa: actaLimpia,
      ...(tipo !== "MINIMO_INTEGRANTES" ? { minutos: Number(minutos) } : {}),
      ...(tipo === "EXCESO_SHOW_BATERIA" ? { rubroVersionId } : {}),
    };
    if (tipo !== "MINIMO_INTEGRANTES" && (!Number.isInteger(payload.minutos) || payload.minutos <= 0 || payload.minutos > 9999)) {
      setErrorForm("Los minutos deben ser un número entero entre 1 y 9999.");
      return;
    }
    if (tipo === "EXCESO_SHOW_BATERIA" && !rubroVersionId) {
      setErrorForm("Seleccioná el rubro correspondiente al show de batería.");
      return;
    }
    setErrorModalRegistro("");
    setPendienteRegistro(payload);
  }

  async function confirmarRegistro() {
    if (enviando || !pendienteRegistro) return;
    setEnviando(true);
    setErrorModalRegistro("");
    try {
      const res = await api.registrarPenalizacion(edicion.id, pendienteRegistro);
      if (!res.ok) {
        setErrorModalRegistro(res.cuerpo?.mensaje ?? "No se pudo registrar la penalización.");
        return;
      }
      setItems((prev) => [res.cuerpo, ...(prev ?? []).filter((x) => x.id !== res.cuerpo.id)]);
      setPendienteRegistro(null);
      setErrorModalRegistro("");
      setMotivo("");
      setReferenciaActa("");
    } catch {
      setErrorModalRegistro("No se pudo confirmar el registro. Podés volver a intentar sin duplicar la penalización.");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarAnulacion() {
    if (enviando || !aAnular) return;
    const m = motivoAnulacion.trim();
    const a = actaAnulacion.trim();
    if (!m || !a) {
      setErrorAnulacion("Ingresá motivo y referencia de acta de anulación.");
      return;
    }
    setEnviando(true);
    setErrorAnulacion("");
    try {
      const res = await api.anularPenalizacion(edicion.id, aAnular.id, {
        motivoAnulacion: m,
        referenciaActaAnulacion: a,
      });
      if (!res.ok) {
        setErrorAnulacion(res.cuerpo?.mensaje ?? "No se pudo anular la penalización.");
        return;
      }
      setItems((prev) => (prev ?? []).map((x) => (x.id === res.cuerpo.id ? res.cuerpo : x)));
      setAAnular(null);
      setMotivoAnulacion("");
      setActaAnulacion("");
    } catch {
      setErrorAnulacion("No se pudo confirmar la anulación.");
    } finally {
      setEnviando(false);
    }
  }

  if (errorCarga) {
    return (
      <section>
        <h3>{edicion.nombre} ({edicion.anio})</h3>
        <p role="alert">{errorCarga}</p>
        <button type="button" onClick={() => setRecarga((n) => n + 1)}>Reintentar</button>
      </section>
    );
  }

  if (!contexto || !items) {
    return <p role="status">Cargando penalizaciones…</p>;
  }

  return (
    <section className={styles.detailBox}>
      <h3 className={styles.detailTitle}>{edicion.nombre} ({edicion.anio})</h3>
      {cerrada && <p role="status" className={`${styles.statusBanner} ${styles.statusNeutral}`}>Las penalizaciones quedaron congeladas por el cierre total.</p>}
      {!cerrada && !abierta && <p role="status" className={`${styles.statusBanner} ${styles.statusWarn}`}>La edición todavía no está abierta para registrar penalizaciones.</p>}

      {abierta && (noches.length === 0 ? (
        <p>Todavía no hay noches competitivas abiertas o cerradas para registrar penalizaciones.</p>
      ) : (
        <form onSubmit={prepararRegistro} className={styles.formGrid}>
          <label>
            Noche
            <select value={nocheId} onChange={(e) => cambiarNoche(e.target.value)} disabled={enviando}>
              {noches.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
            </select>
          </label>
          <label>
            Comparsa
            <select value={comparsaId} onChange={(e) => setComparsaId(e.target.value)} disabled={enviando}>
              {comparsas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <label>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} disabled={enviando}>
              {Object.entries(etiquetasTipo).map(([codigo, nombre]) => (
                <option key={codigo} value={codigo}>{nombre}</option>
              ))}
            </select>
          </label>
          {tipo !== "MINIMO_INTEGRANTES" && (
            <label>
              Minutos
              <input type="number" min="1" max="9999" step="1" value={minutos} onChange={(e) => setMinutos(e.target.value)} required disabled={enviando} />
            </label>
          )}
          {tipo === "EXCESO_SHOW_BATERIA" && (
            <label>
              Rubro afectado
              <select value={rubroVersionId} onChange={(e) => setRubroVersionId(e.target.value)} disabled={enviando}>
                {rubros.map((r) => <option key={r.id} value={r.id}>{r.codigo} · {r.nombre}</option>)}
              </select>
            </label>
          )}
          <p className={`${styles.formFull} ${styles.statusBanner} ${styles.statusWarn}`}>{describirEfecto(tipo, minutos)}</p>
          <label>
            Motivo
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} required disabled={enviando} />
          </label>
          <label>
            Referencia de acta
            <input value={referenciaActa} onChange={(e) => setReferenciaActa(e.target.value)} required disabled={enviando} />
          </label>
          {errorForm && <p role="alert" className={`${styles.formFull} ${styles.statusBanner} ${styles.statusDanger}`}>{errorForm}</p>}
          <div className={styles.formFull}>
            <button type="submit" className={styles.btnPrimary} disabled={enviando || !comparsas.length}>
              Registrar penalización
            </button>
          </div>
        </form>
      ))}

      {items.length === 0 ? <p>Todavía no hay penalizaciones registradas.</p> : (
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Noche</th>
                <th>Comparsa</th>
                <th>Tipo</th>
                <th>Efecto</th>
                <th>Motivo y acta</th>
                <th>Estado</th>
                {abierta && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.noche.nombre}</td>
                  <td>{item.comparsa.nombre}</td>
                  <td>{etiquetasTipo[item.tipo] ?? item.tipo}</td>
                  <td>{describirItem(item)}</td>
                  <td>
                    <div>{item.motivo}</div>
                    <small>{item.referenciaActa}</small>
                    {item.anulacion && (
                      <div><small>Anulación: {item.anulacion.motivo} ({item.anulacion.referenciaActa})</small></div>
                    )}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${item.estado === "ANULADA" ? styles.badgeClosed : styles.badgeWarn}`}>
                      {item.estado === "ANULADA" ? "Anulada" : "Activa"}
                    </span>
                  </td>
                  {abierta && (
                    <td>
                      {item.estado === "ACTIVA" && (
                        <button
                          type="button"
                          className={styles.btnDanger}
                          onClick={() => {
                            setErrorAnulacion("");
                            setMotivoAnulacion("");
                            setActaAnulacion("");
                            setAAnular(item);
                          }}
                        >
                          Anular
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

      {pendienteRegistro && (
        <Modal title="Confirmar penalización" onClose={() => { if (!enviando) { setErrorModalRegistro(""); setPendienteRegistro(null); } }}>
          <p>
            Vas a registrar <strong>{etiquetasTipo[pendienteRegistro.tipo]}</strong> para{" "}
            <strong>{comparsas.find((c) => c.id === pendienteRegistro.comparsaId)?.nombre}</strong>{" "}
            en <strong>{nocheActual?.nombre}</strong>.
          </p>
          <p>{describirEfecto(pendienteRegistro.tipo, pendienteRegistro.minutos)}</p>
          <p>Acta: <strong>{pendienteRegistro.referenciaActa}</strong></p>
          {errorModalRegistro && <p role="alert">{errorModalRegistro}</p>}
          <button type="button" disabled={enviando} onClick={() => void confirmarRegistro()}>Confirmar penalización</button>{" "}
          <button type="button" disabled={enviando} onClick={() => { setErrorModalRegistro(""); setPendienteRegistro(null); }}>Cancelar</button>
        </Modal>
      )}

      {aAnular && (
        <Modal title="Anular penalización" onClose={() => { if (!enviando) setAAnular(null); }}>
          <p>La penalización original se conservará en el historial auditado como anulada.</p>
          <label>
            Motivo de anulación
            <input value={motivoAnulacion} onChange={(e) => setMotivoAnulacion(e.target.value)} required disabled={enviando} />
          </label>
          <label>
            Referencia de acta de anulación
            <input value={actaAnulacion} onChange={(e) => setActaAnulacion(e.target.value)} required disabled={enviando} />
          </label>
          {errorAnulacion && <p role="alert">{errorAnulacion}</p>}
          <button type="button" disabled={enviando} onClick={() => void confirmarAnulacion()}>Confirmar anulación</button>{" "}
          <button type="button" disabled={enviando} onClick={() => setAAnular(null)}>Cancelar</button>
        </Modal>
      )}
    </section>
  );
}
