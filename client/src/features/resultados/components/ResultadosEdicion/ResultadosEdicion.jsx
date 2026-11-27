import { useEffect, useState } from "react";
import { Modal } from "../../../../components/Modal/Modal.jsx";
import panelStyles from "../../../escribano/PanelEscribano.module.css";
import styles from "./ResultadosEdicion.module.css";

function fmt(valor) {
  return Number(valor).toFixed(2).replace(".", ",");
}

const CUERPO_REINA = /reina\s+del\s+carnaval/i;
const PUESTOS_REINA = ["Reina del Carnaval", "Primera Princesa", "Segunda Princesa"];

function rubroReina(rubros) {
  return rubros.find(({ rubro }) => CUERPO_REINA.test(rubro.nombre)) ?? null;
}

function podioReina(bloque) {
  if (!bloque) return [];
  return PUESTOS_REINA.map((cargo, indice) => ({ cargo, puesto: indice + 1 }));
}

function ganadorEmpate(activo, ambito, rubroId = null) {
  const empate = activo.empates?.find(
    (e) => e.estado === "RESUELTO" && e.ambito === ambito && (!rubroId || e.rubro?.id === rubroId),
  );
  if (!empate?.resolucion) return null;
  if (ambito === "COMPARSA") {
    return activo.comparsas.find((c) => c.comparsa.id === empate.resolucion.ganadorId) ?? null;
  }
  return activo.rubros
    .flatMap((b) => b.resultados)
    .find((r) => r.sujeto.id === empate.resolucion.ganadorId) ?? null;
}

function comparsaGanadora(activo) {
  const lideres = activo.comparsas.filter((c) => !c.descalificadaComparsa && c.posicion === 1 && !c.empatado);
  if (lideres.length === 1) return lideres[0];
  const resuelta = ganadorEmpate(activo, "COMPARSA");
  return resuelta && !resuelta.descalificadaComparsa ? resuelta : null;
}

function puestoReina(bloque, activo, puesto) {
  const empatados = bloque.resultados.filter((r) => r.posicion === puesto);
  if (empatados.length === 1) return { ganadora: empatados[0], empatados: [], resuelta: false };
  const resuelta = ganadorEmpate(activo, "RUBRO", bloque.rubro.id);
  if (resuelta && empatados.some((r) => r.sujeto.id === resuelta.sujeto.id)) {
    return { ganadora: resuelta, empatados: [], resuelta: true };
  }
  return { ganadora: null, empatados, resuelta: false };
}

export function SeccionResultadosEscribano({ api, revisionEdiciones = 0 }) {
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
      if (vigente) setError("No se pudieron consultar las ediciones para resultados.");
    });
    return () => { vigente = false; };
  }, [api, intento, revisionEdiciones]);

  const edicion = ediciones?.find(({ id }) => id === seleccion);
  return (
    <section aria-labelledby="titulo-resultados-escribano" className={panelStyles.stageCard}>
      <div className={panelStyles.stageHeader}>
        <div>
          <h2 id="titulo-resultados-escribano" className={panelStyles.stageTitle}>Resultados y publicación</h2>
          <p className={panelStyles.stageDesc}>
            Escrutinio versionado, resolución manual de empates y publicación oficial de la edición cerrada.
          </p>
        </div>
      </div>
      {error ? (
        <div className={panelStyles.actionsRow}>
          <p role="alert" className={`${panelStyles.statusBanner} ${panelStyles.statusDanger}`}>{error}</p>
          <button type="button" className={panelStyles.btnSecondary} onClick={() => { setError(""); setIntento(intento + 1); }}>
            Reintentar
          </button>
        </div>
      ) : !ediciones ? <p role="status">Cargando ediciones…</p> : !ediciones.length ? <p>No hay ediciones disponibles.</p> : (
        <>
          <ul className={panelStyles.selectorList}>
            {ediciones.map((item) => {
              const activa = seleccion === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`${panelStyles.selectorBtn} ${activa ? panelStyles.selectorBtnActive : ""}`}
                    aria-pressed={activa}
                    onClick={() => setSeleccion(item.id)}
                  >
                    <span>{item.nombre} · {item.anio}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {edicion && (edicion.estado !== "CLOSED" ? (
            <p role="status" className={`${panelStyles.statusBanner} ${panelStyles.statusWarn}`}>
              Cierra la votación completa de la edición para habilitar el cálculo y la consulta de resultados.
            </p>
          ) : (
            <div className={panelStyles.detailBox}>
              <VistaResultadosEdicion key={edicion.id} api={api} edicion={edicion} puedeOperar />
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function EstadoSnapshot({ activo, hayEmpatesPendientes }) {
  if (!activo) return <p>Todavía no se calcularon resultados para esta edición.</p>;
  if (activo.estado === "PUBLICADO") {
    return <p role="status">Resultados publicados oficialmente.</p>;
  }
  return (
    <p role="status">
      Snapshot #{activo.numero} calculado (sin publicar).
      {hayEmpatesPendientes && " Resolvé todos los empates pendientes antes de publicar."}
    </p>
  );
}

function SelectorSnapshot({ snapshots, activo, onChange }) {
  return (
    <label className={styles.selectorSnapshot}>
      Snapshot
      <select value={activo?.id ?? ""} onChange={(e) => onChange(e.target.value)}>
        {snapshots.map((s) => (
          <option key={s.id} value={s.id}>
            #{s.numero} · {s.estado === "PUBLICADO" ? "Publicado" : "Calculado"}
          </option>
        ))}
      </select>
    </label>
  );
}

function BloqueEmpates({ activo, puedeOperar, onResolver }) {
  if (!activo?.empates?.length) return null;
  return (
    <section aria-label="Empates" className={styles.bloque}>
      <h4 className={styles.bloqueTitulo}>
        Empates en primer puesto
        {activo.empates.some((e) => e.estado === "PENDIENTE") && (
          <span className={`${styles.badge} ${styles.badgeAlerta}`}>Pendientes de resolución</span>
        )}
      </h4>
      <ul className={styles.listaEmpates}>
        {activo.empates.map((emp) => (
          <li key={emp.id} className={styles.empate}>
            <div>
              <p>
                <strong>
                  {emp.ambito === "COMPARSA" ? "Ranking general de comparsas" : `${emp.rubro?.codigo} · ${emp.rubro?.nombre}`}
                </strong>
                {" — "}Puntaje empatado: {fmt(emp.puntajeEmpatado)} · Candidatos:{" "}
                {emp.candidatos.map((c) => c.nombre).join(", ")} · Estado:{" "}
                {emp.estado === "RESUELTO" ? "Resuelto" : "Pendiente"}
              </p>
              {emp.resolucion && (
                <small>
                  Ganador: {emp.candidatos.find((c) => c.id === emp.resolucion.ganadorId)?.nombre ?? emp.resolucion.ganadorId} ·{" "}
                  {emp.resolucion.motivo} ({emp.resolucion.referenciaActa})
                </small>
              )}
            </div>
            {puedeOperar && activo.estado === "CALCULADO" && emp.estado === "PENDIENTE" && (
              <button type="button" onClick={() => onResolver(emp)}>Resolver empate</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Podio({ activo }) {
  const bloqueReina = rubroReina(activo.rubros);
  const ganadora = comparsaGanadora(activo);
  if (!bloqueReina && !ganadora) return null;

  return (
    <section aria-label="Podio oficial" className={styles.bloque}>
      <h4 className={styles.bloqueTitulo}>Ganadores y podio</h4>
      <div className={styles.podio}>
        {bloqueReina && (
          <article className={styles.podioGrupo}>
            <h5>{bloqueReina.rubro.nombre}</h5>
            <ol className={styles.podioLista}>
              {podioReina(bloqueReina).map(({ cargo, puesto }) => {
                const { ganadora, empatados, resuelta } = puestoReina(bloqueReina, activo, puesto);
                return (
                  <li key={cargo} className={styles.podioItem}>
                    <span className={styles.podioCargo}>{cargo}</span>
                    {ganadora ? (
                      <span className={styles.podioNombre}>
                        {ganadora.sujeto.nombre} · {ganadora.comparsa.nombre}
                        <span className={styles.podioPuntaje}>{fmt(ganadora.puntajeNeto)} pts</span>
                        {resuelta ? <span className={styles.podioResuelta}>Resuelto por empate</span> : null}
                      </span>
                    ) : empatados.length > 1 ? (
                      <span className={styles.podioPendiente}>
                        Empate en {puesto}.º puesto: {empatados.map((r) => r.sujeto.nombre).join(", ")}
                      </span>
                    ) : (
                      <span className={styles.podioPendiente}>Sin adjudicar (sin {puesto}.º puesto)</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </article>
        )}
        {ganadora && (
          <article className={styles.podioGrupo}>
            <h5>Comparsa ganadora</h5>
            <p className={styles.podioNombre}>
              {ganadora.comparsa.nombre}
              <span className={styles.podioPuntaje}>{fmt(ganadora.puntajeTotal)} pts</span>
            </p>
          </article>
        )}
      </div>
    </section>
  );
}

function TablaRanking({ comparsas }) {
  return (
    <section className={styles.bloque}>
      <h4 className={styles.bloqueTitulo}>Ranking general de comparsas</h4>
      <div className={styles.tablaWrap}>
        <table>
          <thead>
            <tr>
              <th>Pos.</th>
              <th>Comparsa</th>
              <th>Fijos</th>
              <th>Nominativos</th>
              <th>Carros</th>
              <th>Desc. general</th>
              <th>Total</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {comparsas.map((c) => (
              <tr key={c.comparsa.id}>
                <td>{c.posicion ?? "—"}</td>
                <td>{c.comparsa.nombre}</td>
                <td>{fmt(c.puntajeFijos)}</td>
                <td>{fmt(c.puntajeNominativos)}</td>
                <td>{fmt(c.puntajeCarros)}</td>
                <td>{fmt(c.descuentoGeneral)}</td>
                <td className={styles.tablaTotal}><strong>{fmt(c.puntajeTotal)}</strong></td>
                <td className={`${styles.estadoComparsa} ${c.descalificadaComparsa || c.empatado ? styles.estadoAlerta : ""}`}>
                  {c.descalificadaComparsa ? "Descalificada (mínimo integrantes)" : c.empatado ? "Empatada" : "Habilitada"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TablaRubros({ rubros }) {
  if (!rubros.length) return null;
  return (
    <section className={styles.bloque}>
      <h4 className={styles.bloqueTitulo}>Resultados por rubro</h4>
      {rubros.map((bloque) => (
        <div key={bloque.rubro.id} className={styles.rubro}>
          <h5>{bloque.rubro.codigo} · {bloque.rubro.nombre}</h5>
          <div className={styles.tablaWrap}>
            <table>
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Sujeto</th>
                  <th>Comparsa</th>
                  <th>Artístico</th>
                  <th>Descuento</th>
                  <th>Neto</th>
                </tr>
              </thead>
              <tbody>
                {bloque.resultados.map((r) => (
                  <tr key={r.sujeto.id}>
                    <td>{r.posicion}</td>
                    <td>{r.sujeto.nombre}</td>
                    <td>{r.comparsa.nombre}</td>
                    <td>{fmt(r.puntajeArtistico)}</td>
                    <td>{fmt(r.descuentoRubro)}</td>
                    <td className={styles.tablaTotal}><strong>{fmt(r.puntajeNeto)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

function Escrutinio({ api, edicion, onCargar, cargando, error, puntajes }) {
  if (typeof api.obtenerPuntajesDetallados !== "function") return null;
  return (
    <section aria-label="Puntajes detallados" className={`${styles.bloque} ${styles.escrutinio}`}>
      <h4 className={styles.bloqueTitulo}>Escrutinio de puntajes</h4>
      <p className={styles.bloqueSubtitulo}>Notas recibidas por noche, especialidad, jurado, comparsa, rubro y sujeto.</p>
      <button type="button" disabled={cargando} onClick={onCargar}>
        {cargando ? "Cargando puntajes…" : "Ver puntajes detallados"}
      </button>
      {error && <p role="alert">{error}</p>}
      {puntajes && (
        <div className={styles.tablaWrap}>
          <table>
            <thead>
              <tr>
                <th>Noche</th>
                <th>Especialidad</th>
                <th>Jurado</th>
                <th>Comparsa</th>
                <th>Rubro</th>
                <th>Sujeto</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {puntajes.map((p, idx) => (
                <tr key={`${p.planillaId}-${idx}`}>
                  <td>{p.noche.nombre}</td>
                  <td>{p.especialidad.nombre}</td>
                  <td>{p.autor.nombre}</td>
                  <td>{p.comparsa.nombre}</td>
                  <td>{p.rubro.nombre}</td>
                  <td>{p.sujeto.nombre}</td>
                  <td>{p.noPresentado ? "No se presentó (0)" : p.valor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatearFecha(valor) {
  if (!valor) return "—";
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? String(valor) : fecha.toISOString();
}

// Guarda el blob con el nombre devuelto por la API. Los entornos sin URL.createObjectURL
// (por ejemplo, pruebas jsdom) solo informan el resultado de la descarga.
function guardarBlob(blob, nombreArchivo) {
  if (!blob || typeof URL.createObjectURL !== "function") return false;
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

function ActasOficiales({ api, edicion, calculoId, puedeEmitir }) {
  const [actas, setActas] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [confirmarEmision, setConfirmarEmision] = useState(false);
  const [operationId, setOperationId] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [errorEmision, setErrorEmision] = useState("");
  const [estados, setEstados] = useState({});

  useEffect(() => {
    let vigente = true;
    api.listarActas(edicion.id).then(({ ok, cuerpo }) => {
      if (!vigente) return;
      if (!ok) {
        setErrorCarga(cuerpo?.mensaje ?? "No se pudieron consultar las actas oficiales.");
        return;
      }
      setErrorCarga("");
      setActas(cuerpo?.items ?? []);
    }).catch(() => {
      if (vigente) setErrorCarga("No se pudieron consultar las actas oficiales.");
    });
    return () => { vigente = false; };
  }, [api, edicion.id, recarga]);

  function abrirEmision() {
    setErrorEmision("");
    setOperationId(globalThis.crypto.randomUUID());
    setConfirmarEmision(true);
  }

  function cerrarEmision() {
    if (enviando) return;
    setConfirmarEmision(false);
    setOperationId(null);
    setErrorEmision("");
  }

  async function ejecutarEmision() {
    if (enviando || !operationId || !calculoId) return;
    setEnviando(true);
    setErrorEmision("");
    try {
      const res = await api.emitirActa(edicion.id, calculoId, operationId);
      if (!res.ok) {
        setErrorEmision(res.cuerpo?.mensaje ?? "No se pudo emitir el acta oficial.");
        return;
      }
      const nueva = res.cuerpo;
      setActas((prev) => [nueva, ...(prev ?? []).filter((a) => a.id !== nueva.id)]);
      setConfirmarEmision(false);
      setOperationId(null);
    } catch {
      setErrorEmision("No se pudo emitir el acta. Revisá la conexión y reintentá con el mismo identificador.");
    } finally {
      setEnviando(false);
    }
  }

  function cambiarEstado(actaId, cambios) {
    setEstados((prev) => ({ ...prev, [actaId]: { ...prev[actaId], ...cambios } }));
  }

  async function descargar(acta, formato) {
    cambiarEstado(acta.id, { descarga: "", errorDescarga: "" });
    try {
      const res = await api.descargarActa(edicion.id, acta.id, formato);
      if (!res.ok) {
        cambiarEstado(acta.id, { errorDescarga: res.cuerpo?.mensaje ?? `No se pudo descargar el ${formato}.` });
        return;
      }
      const guardado = guardarBlob(
        res.cuerpo?.blob,
        res.cuerpo?.nombreArchivo ?? `acta-v${acta.numero}.${formato.toLowerCase()}`,
      );
      cambiarEstado(acta.id, { descarga: guardado ? `Descarga del ${formato} iniciada.` : `Descarga del ${formato} lista.` });
    } catch {
      cambiarEstado(acta.id, { errorDescarga: `No se pudo descargar el ${formato}. Revisá la conexión.` });
    }
  }

  async function verificar(acta) {
    cambiarEstado(acta.id, { verificacion: null, errorVerificacion: "" });
    try {
      const resultados = await Promise.all((acta.representaciones ?? []).map(async (representacion) => {
        const formato = representacion.formato;
        const res = await api.verificarActa(edicion.id, acta.id, formato);
        if (!res.ok) {
          return { formato, coincide: false, mensaje: res.cuerpo?.mensaje ?? `No se pudo verificar el ${formato}.` };
        }
        return { formato, ...res.cuerpo };
      }));
      cambiarEstado(acta.id, {
        verificacion: { coincide: resultados.every((r) => r.coincide === true), resultados },
      });
    } catch {
      cambiarEstado(acta.id, { errorVerificacion: "No se pudo verificar la integridad. Revisá la conexión." });
    }
  }

  return (
    <section aria-label="Actas oficiales" className={styles.bloque}>
      <div className={styles.actaHeader}>
        <div>
          <h4 className={styles.bloqueTitulo}>Actas oficiales</h4>
          <p className={styles.bloqueSubtitulo}>
            Versiones inmutables del acta de resultados, con representaciones PDF/CSV y verificación SHA-256.
          </p>
        </div>
        {puedeEmitir && calculoId && (
          <button type="button" disabled={enviando} onClick={abrirEmision}>
            Emitir acta
          </button>
        )}
      </div>

      {errorCarga ? (
        <div className={styles.acciones}>
          <p role="alert">{errorCarga}</p>
          <button type="button" onClick={() => setRecarga((n) => n + 1)}>Reintentar</button>
        </div>
      ) : !actas ? <p role="status">Cargando actas oficiales…</p> : actas.length === 0 ? (
        <p>Todavía no hay actas oficiales emitidas para esta edición.</p>
      ) : (
        <ul className={styles.listaActas}>
          {actas.map((acta) => {
            const estado = estados[acta.id] ?? {};
            const formatos = (estado.verificacion?.resultados ?? []).map((r) => r.formato).join(" y ");
            return (
              <li key={acta.id} className={styles.acta}>
                <div className={styles.actaHeader}>
                  <div>
                    <h5 className={styles.actaTitulo}>Acta #{acta.numero}</h5>
                    <p className={styles.bloqueSubtitulo}>Generada: {formatearFecha(acta.generadaEn)}</p>
                  </div>
                  <button type="button" onClick={() => void verificar(acta)}>
                    Verificar integridad
                  </button>
                </div>
                <ul className={styles.listaRepresentaciones}>
                  {(acta.representaciones ?? []).map((representacion) => (
                    <li key={representacion.formato} className={styles.representacion}>
                      <div>
                        <strong>{representacion.formato}</strong>
                        <span className={styles.representacionContentType}>{representacion.contentType}</span>
                        <code className={styles.hash}>SHA-256: {representacion.sha256}</code>
                        <span className={styles.bloqueSubtitulo}>{representacion.tamanioBytes} bytes</span>
                      </div>
                      <button type="button" onClick={() => void descargar(acta, representacion.formato)}>
                        Descargar {representacion.formato}
                      </button>
                    </li>
                  ))}
                </ul>
                {estado.descarga && <p role="status">{estado.descarga}</p>}
                {estado.errorDescarga && <p role="alert">{estado.errorDescarga}</p>}
                {estado.errorVerificacion && <p role="alert">{estado.errorVerificacion}</p>}
                {estado.verificacion && (
                  <p
                    role={estado.verificacion.coincide ? "status" : "alert"}
                    className={estado.verificacion.coincide ? styles.verificacionOk : styles.verificacionError}
                  >
                    <span>
                      {estado.verificacion.coincide
                        ? `Integridad verificada: ${formatos} coinciden con su SHA-256.`
                        : `Integridad no verificada: ${formatos} no coinciden con su SHA-256.`}
                    </span>
                    {estado.verificacion.resultados.map((resultado) => (
                      <code key={resultado.formato} className={styles.hash}>
                        {resultado.formato} · almacenado: {resultado.hashAlmacenado ?? "—"} · recalculado: {resultado.hashRecalculado ?? "—"}
                        {resultado.mensaje ? ` · ${resultado.mensaje}` : ""}
                      </code>
                    ))}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {confirmarEmision && (
        <Modal title="Emitir acta oficial" onClose={cerrarEmision}>
          <div className={styles.modalCuerpo}>
            <p>
              Se generará una nueva versión inmutable del acta oficial de <strong>{edicion.nombre} ({edicion.anio})</strong>,
              con representaciones PDF y CSV y su hash SHA-256. Las actas ya emitidas no se modifican ni se sobrescriben.
            </p>
            {errorEmision && <p role="alert">{errorEmision}</p>}
            <div className={styles.modalAcciones}>
              <button type="button" disabled={enviando} onClick={cerrarEmision}>Cancelar</button>
              <button type="button" disabled={enviando} onClick={() => void ejecutarEmision()}>
                {enviando ? "Emitiendo…" : errorEmision ? "Reintentar emisión" : "Confirmar emisión"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}

export function VistaResultadosEdicion({ api, edicion, puedeOperar = false, alVolver }) {
  const [datos, setDatos] = useState(null);
  const [calculoSeleccionado, setCalculoSeleccionado] = useState("");
  const [errorCarga, setErrorCarga] = useState("");
  const [recarga, setRecarga] = useState(0);

  const [confirmarCalculo, setConfirmarCalculo] = useState(false);
  const [confirmarPublicar, setConfirmarPublicar] = useState(false);
  const [empateActivo, setEmpateActivo] = useState(null);
  const [ganadorId, setGanadorId] = useState("");
  const [motivoResolucion, setMotivoResolucion] = useState("");
  const [referenciaActa, setReferenciaActa] = useState("");
  const [errorModal, setErrorModal] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [puntajes, setPuntajes] = useState(null);
  const [cargandoPuntajes, setCargandoPuntajes] = useState(false);
  const [errorPuntajes, setErrorPuntajes] = useState("");

  useEffect(() => {
    let vigente = true;
    api.obtenerResultadosEdicion(edicion.id, calculoSeleccionado || undefined).then(({ ok, cuerpo }) => {
      if (!vigente) return;
      if (!ok) {
        setErrorCarga(cuerpo?.mensaje ?? "No se pudieron consultar los resultados.");
        return;
      }
      setErrorCarga("");
      setDatos(cuerpo);
    }).catch(() => {
      if (vigente) setErrorCarga("No se pudieron consultar los resultados.");
    });
    return () => { vigente = false; };
  }, [api, edicion.id, calculoSeleccionado, recarga]);

  const activo = datos?.activo ?? null;
  const snapshots = datos?.snapshots ?? [];
  const hayEmpatesPendientes = Boolean(activo?.empates?.some((e) => e.estado === "PENDIENTE"));

  async function ejecutarCalculo() {
    if (enviando) return;
    setEnviando(true);
    setErrorModal("");
    try {
      const res = await api.calcularResultados(edicion.id);
      if (!res.ok) {
        setErrorModal(res.cuerpo?.mensaje ?? "No se pudo calcular el resultado.");
        return;
      }
      const nuevo = res.cuerpo;
      setDatos((prev) => ({
        edicion: prev?.edicion ?? edicion,
        snapshots: [nuevo, ...(prev?.snapshots ?? []).filter((s) => s.id !== nuevo.id)],
        activo: nuevo,
      }));
      setCalculoSeleccionado(nuevo.id);
      setConfirmarCalculo(false);
    } catch {
      setErrorModal("No se pudo confirmar el cálculo.");
    } finally {
      setEnviando(false);
    }
  }

  async function ejecutarResolucionEmpate() {
    if (enviando || !empateActivo || !activo) return;
    const m = motivoResolucion.trim();
    const a = referenciaActa.trim();
    if (!ganadorId || !m || !a) {
      setErrorModal("Seleccioná el ganador e ingresá motivo y referencia de acta.");
      return;
    }
    setEnviando(true);
    setErrorModal("");
    try {
      const res = await api.resolverEmpate(edicion.id, activo.id, empateActivo.id, {
        ganadorId, motivoResolucion: m, referenciaActa: a,
      });
      if (!res.ok) {
        setErrorModal(res.cuerpo?.mensaje ?? "No se pudo resolver el empate.");
        return;
      }
      setDatos((prev) => ({
        ...prev,
        activo: {
          ...prev.activo,
          empates: prev.activo.empates.map((e) => (e.id === res.cuerpo.id ? res.cuerpo : e)),
        },
      }));
      setEmpateActivo(null);
      setMotivoResolucion("");
      setReferenciaActa("");
    } catch {
      setErrorModal("No se pudo confirmar la resolución del empate.");
    } finally {
      setEnviando(false);
    }
  }

  async function ejecutarPublicacion() {
    if (enviando || !activo) return;
    setEnviando(true);
    setErrorModal("");
    try {
      const res = await api.publicarResultados(edicion.id, activo.id);
      if (!res.ok) {
        setErrorModal(res.cuerpo?.mensaje ?? "No se pudieron publicar los resultados.");
        return;
      }
      setDatos((prev) => ({
        ...prev,
        snapshots: (prev?.snapshots ?? []).map((s) => (s.id === res.cuerpo.id ? { ...s, estado: "PUBLICADO", publicadoEn: res.cuerpo.publicadoEn } : s)),
        activo: res.cuerpo,
      }));
      setConfirmarPublicar(false);
    } catch {
      setErrorModal("No se pudo confirmar la publicación oficial.");
    } finally {
      setEnviando(false);
    }
  }

  async function cargarPuntajesDetallados() {
    if (cargandoPuntajes || typeof api.obtenerPuntajesDetallados !== "function") return;
    setCargandoPuntajes(true);
    setErrorPuntajes("");
    try {
      const res = await api.obtenerPuntajesDetallados(edicion.id);
      if (!res.ok) {
        setErrorPuntajes(res.cuerpo?.mensaje ?? "No se pudieron consultar los puntajes detallados.");
        return;
      }
      setPuntajes(res.cuerpo.items);
    } catch {
      setErrorPuntajes("No se pudieron consultar los puntajes detallados.");
    } finally {
      setCargandoPuntajes(false);
    }
  }

  function abrirEmpate(emp) {
    setErrorModal("");
    setGanadorId(emp.candidatos[0]?.id ?? "");
    setMotivoResolucion("");
    setReferenciaActa("");
    setEmpateActivo(emp);
  }

  return (
    <div className={styles.planilla}>
      <header className={styles.cabecera}>
        <h3 className={styles.cabeceraTitulo}>Resultados · {edicion.nombre} ({edicion.anio})</h3>
        <div className={styles.cabeceraMeta}>
          {activo?.estado === "PUBLICADO" && <span className={`${styles.badge} ${styles.badgePublicado}`}>Publicado</span>}
          {activo?.estado === "CALCULADO" && <span className={`${styles.badge} ${styles.badgeCalculado}`}>Snapshot #{activo.numero}</span>}
          {hayEmpatesPendientes && <span className={`${styles.badge} ${styles.badgeAlerta}`}>Empates pendientes</span>}
        </div>
        {alVolver && <button type="button" className={styles.volver} onClick={alVolver}>Volver a ediciones</button>}
      </header>

      {errorCarga ? (
        <>
          <p role="alert">{errorCarga}</p>
          <button type="button" onClick={() => setRecarga((n) => n + 1)}>Reintentar</button>
        </>
      ) : !datos ? (
        <p role="status">Cargando resultados…</p>
      ) : (
        <div className={styles.vista}>
          <div className={styles.barraEstado}>
            <EstadoSnapshot activo={activo} hayEmpatesPendientes={hayEmpatesPendientes} />
            {snapshots.length > 1 && (
              <SelectorSnapshot
                snapshots={snapshots}
                activo={activo}
                onChange={setCalculoSeleccionado}
              />
            )}
          </div>

          <div className={styles.acciones}>
            {puedeOperar && activo?.estado !== "PUBLICADO" && (
              <button type="button" disabled={enviando} onClick={() => { setErrorModal(""); setConfirmarCalculo(true); }}>
                {activo ? "Recalcular nuevo snapshot" : "Calcular resultados"}
              </button>
            )}
            {puedeOperar && activo?.estado === "CALCULADO" && (
              <button
                type="button"
                disabled={enviando || hayEmpatesPendientes}
                onClick={() => { setErrorModal(""); setConfirmarPublicar(true); }}
              >
                Publicar resultados oficiales
              </button>
            )}
          </div>

          <BloqueEmpates activo={activo} puedeOperar={puedeOperar} onResolver={abrirEmpate} />

          {activo && (
            <>
              <Podio activo={activo} />
              <TablaRanking comparsas={activo.comparsas} />
              <TablaRubros rubros={activo.rubros} />
            </>
          )}

          <Escrutinio
            api={api}
            edicion={edicion}
            onCargar={() => void cargarPuntajesDetallados()}
            cargando={cargandoPuntajes}
            error={errorPuntajes}
            puntajes={puntajes}
          />

          {typeof api.listarActas === "function" && (
            <ActasOficiales
              key={edicion.id}
              api={api}
              edicion={edicion}
              calculoId={activo?.id}
              puedeEmitir={puedeOperar}
            />
          )}
        </div>
      )}

      {confirmarCalculo && (
        <Modal title="Confirmar cálculo de resultados" onClose={() => { if (!enviando) { setErrorModal(""); setConfirmarCalculo(false); } }}>
          <div className={styles.modalCuerpo}>
            <p>Se generará un nuevo snapshot inmutable de resultados usando las planillas oficiales y penalizaciones activas de las noches puntuables.</p>
            {errorModal && <p role="alert">{errorModal}</p>}
            <div className={styles.modalAcciones}>
              <button type="button" disabled={enviando} onClick={() => { setErrorModal(""); setConfirmarCalculo(false); }}>Cancelar</button>
              <button type="button" disabled={enviando} onClick={() => void ejecutarCalculo()}>Confirmar cálculo</button>
            </div>
          </div>
        </Modal>
      )}

      {empateActivo && (
        <Modal title="Resolver empate" onClose={() => { if (!enviando) { setErrorModal(""); setEmpateActivo(null); } }}>
          <div className={styles.modalCuerpo}>
            <p>Registrá la resolución oficial del empate sin modificar los puntajes ni votos originales.</p>
            <label>
              Ganador oficial
              <select value={ganadorId} onChange={(e) => setGanadorId(e.target.value)} disabled={enviando}>
                {empateActivo.candidatos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <label>
              Motivo de resolución
              <input value={motivoResolucion} onChange={(e) => setMotivoResolucion(e.target.value)} required disabled={enviando} />
            </label>
            <label>
              Referencia de acta
              <input value={referenciaActa} onChange={(e) => setReferenciaActa(e.target.value)} required disabled={enviando} />
            </label>
            {errorModal && <p role="alert">{errorModal}</p>}
            <div className={styles.modalAcciones}>
              <button type="button" disabled={enviando} onClick={() => { setErrorModal(""); setEmpateActivo(null); }}>Cancelar</button>
              <button type="button" disabled={enviando} onClick={() => void ejecutarResolucionEmpate()}>Confirmar resolución</button>
            </div>
          </div>
        </Modal>
      )}

      {confirmarPublicar && (
        <Modal title="Confirmar publicación oficial" onClose={() => { if (!enviando) { setErrorModal(""); setConfirmarPublicar(false); } }}>
          <div className={styles.modalCuerpo}>
            <p>Vas a publicar oficialmente el snapshot #{activo?.numero} de <strong>{edicion.nombre} ({edicion.anio})</strong>. Esta acción es definitiva.</p>
            {errorModal && <p role="alert">{errorModal}</p>}
            <div className={styles.modalAcciones}>
              <button type="button" disabled={enviando} onClick={() => { setErrorModal(""); setConfirmarPublicar(false); }}>Cancelar</button>
              <button type="button" disabled={enviando} onClick={() => void ejecutarPublicacion()}>Confirmar publicación</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
