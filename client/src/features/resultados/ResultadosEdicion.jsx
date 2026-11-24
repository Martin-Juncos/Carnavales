import { useEffect, useState } from "react";
import { Modal } from "../../components/Modal/Modal.jsx";

function fmt(valor) {
  return Number(valor).toFixed(2).replace(".", ",");
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
    <section aria-labelledby="titulo-resultados-escribano">
      <h2 id="titulo-resultados-escribano">Resultados y publicación</h2>
      {error ? <>
        <p role="alert">{error}</p>
        <button type="button" onClick={() => { setError(""); setIntento(intento + 1); }}>Reintentar</button>
      </> : !ediciones ? <p role="status">Cargando ediciones…</p> : !ediciones.length ? <p>No hay ediciones disponibles.</p> : (
        <>
          <ul>{ediciones.map((item) => <li key={item.id}>
            <button type="button" aria-pressed={seleccion === item.id} onClick={() => setSeleccion(item.id)}>
              {item.nombre} · {item.anio}
            </button>
          </li>)}</ul>
          {edicion && (edicion.estado !== "CLOSED" ? (
            <p role="status">Cierra la votación completa de la edición para habilitar el cálculo y la consulta de resultados.</p>
          ) : (
            <VistaResultadosEdicion key={edicion.id} api={api} edicion={edicion} puedeOperar />
          ))}
        </>
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

  return (
    <section>
      {alVolver && <button type="button" onClick={alVolver}>Volver a ediciones</button>}
      <h3>Resultados · {edicion.nombre} ({edicion.anio})</h3>

      {errorCarga ? (
        <>
          <p role="alert">{errorCarga}</p>
          <button type="button" onClick={() => setRecarga((n) => n + 1)}>Reintentar</button>
        </>
      ) : !datos ? (
        <p role="status">Cargando resultados…</p>
      ) : (
        <>
          {activo?.estado === "PUBLICADO" && <p role="status">Resultados publicados oficialmente.</p>}
          {activo?.estado === "CALCULADO" && (
            <p role="status">
              Snapshot #{activo.numero} calculado (sin publicar).
              {hayEmpatesPendientes && " Resolvé todos los empates pendientes antes de publicar."}
            </p>
          )}
          {!activo && <p>Todavía no se calcularon resultados para esta edición.</p>}

          {snapshots.length > 1 && (
            <label>
              Snapshot
              <select value={activo?.id ?? ""} onChange={(e) => setCalculoSeleccionado(e.target.value)}>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.numero} · {s.estado === "PUBLICADO" ? "Publicado" : "Calculado"}
                  </option>
                ))}
              </select>
            </label>
          )}

          {puedeOperar && activo?.estado !== "PUBLICADO" && (
            <button type="button" disabled={enviando} onClick={() => { setErrorModal(""); setConfirmarCalculo(true); }}>
              {activo ? "Recalcular nuevo snapshot" : "Calcular resultados"}
            </button>
          )}{" "}
          {puedeOperar && activo?.estado === "CALCULADO" && (
            <button
              type="button"
              disabled={enviando || hayEmpatesPendientes}
              onClick={() => { setErrorModal(""); setConfirmarPublicar(true); }}
            >
              Publicar resultados oficiales
            </button>
          )}

          {activo?.empates?.length > 0 && (
            <section aria-label="Empates">
              <h4>Empates en primer puesto</h4>
              <ul>
                {activo.empates.map((emp) => (
                  <li key={emp.id}>
                    <strong>{emp.ambito === "COMPARSA" ? "Ranking general de comparsas" : `${emp.rubro?.codigo} · ${emp.rubro?.nombre}`}</strong>
                    {" — "}Puntaje empatado: {fmt(emp.puntajeEmpatado)} · Candidatos:{" "}
                    {emp.candidatos.map((c) => c.nombre).join(", ")} · Estado:{" "}
                    {emp.estado === "RESUELTO" ? "Resuelto" : "Pendiente"}
                    {emp.resolucion && (
                      <div>
                        <small>
                          Ganador: {emp.candidatos.find((c) => c.id === emp.resolucion.ganadorId)?.nombre ?? emp.resolucion.ganadorId} ·{" "}
                          {emp.resolucion.motivo} ({emp.resolucion.referenciaActa})
                        </small>
                      </div>
                    )}
                    {puedeOperar && activo.estado === "CALCULADO" && emp.estado === "PENDIENTE" && (
                      <button type="button" onClick={() => {
                        setErrorModal("");
                        setGanadorId(emp.candidatos[0]?.id ?? "");
                        setMotivoResolucion("");
                        setReferenciaActa("");
                        setEmpateActivo(emp);
                      }}>Resolver empate</button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {activo && (
            <>
              <h4>Ranking general de comparsas</h4>
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
                  {activo.comparsas.map((c) => (
                    <tr key={c.comparsa.id}>
                      <td>{c.posicion ?? "—"}</td>
                      <td>{c.comparsa.nombre}</td>
                      <td>{fmt(c.puntajeFijos)}</td>
                      <td>{fmt(c.puntajeNominativos)}</td>
                      <td>{fmt(c.puntajeCarros)}</td>
                      <td>{fmt(c.descuentoGeneral)}</td>
                      <td><strong>{fmt(c.puntajeTotal)}</strong></td>
                      <td>{c.descalificadaComparsa ? "Descalificada (mínimo integrantes)" : c.empatado ? "Empatada" : "Habilitada"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {activo.rubros.length > 0 && (
                <>
                  <h4>Resultados por rubro</h4>
                  {activo.rubros.map((bloque) => (
                    <div key={bloque.rubro.id}>
                      <h5>{bloque.rubro.codigo} · {bloque.rubro.nombre}</h5>
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
                              <td><strong>{fmt(r.puntajeNeto)}</strong></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {typeof api.obtenerPuntajesDetallados === "function" && (
            <div>
              <button type="button" disabled={cargandoPuntajes} onClick={() => void cargarPuntajesDetallados()}>
                {cargandoPuntajes ? "Cargando puntajes…" : "Ver puntajes detallados"}
              </button>
              {errorPuntajes && <p role="alert">{errorPuntajes}</p>}
              {puntajes && (
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
              )}
            </div>
          )}
        </>
      )}

      {confirmarCalculo && (
        <Modal title="Confirmar cálculo de resultados" onClose={() => { if (!enviando) { setErrorModal(""); setConfirmarCalculo(false); } }}>
          <p>Se generará un nuevo snapshot inmutable de resultados usando las planillas oficiales y penalizaciones activas de las noches puntuables.</p>
          {errorModal && <p role="alert">{errorModal}</p>}
          <button type="button" disabled={enviando} onClick={() => void ejecutarCalculo()}>Confirmar cálculo</button>{" "}
          <button type="button" disabled={enviando} onClick={() => { setErrorModal(""); setConfirmarCalculo(false); }}>Cancelar</button>
        </Modal>
      )}

      {empateActivo && (
        <Modal title="Resolver empate" onClose={() => { if (!enviando) { setErrorModal(""); setEmpateActivo(null); } }}>
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
          <button type="button" disabled={enviando} onClick={() => void ejecutarResolucionEmpate()}>Confirmar resolución</button>{" "}
          <button type="button" disabled={enviando} onClick={() => { setErrorModal(""); setEmpateActivo(null); }}>Cancelar</button>
        </Modal>
      )}

      {confirmarPublicar && (
        <Modal title="Confirmar publicación oficial" onClose={() => { if (!enviando) { setErrorModal(""); setConfirmarPublicar(false); } }}>
          <p>Vas a publicar oficialmente el snapshot #{activo?.numero} de <strong>{edicion.nombre} ({edicion.anio})</strong>. Esta acción es definitiva.</p>
          {errorModal && <p role="alert">{errorModal}</p>}
          <button type="button" disabled={enviando} onClick={() => void ejecutarPublicacion()}>Confirmar publicación</button>{" "}
          <button type="button" disabled={enviando} onClick={() => { setErrorModal(""); setConfirmarPublicar(false); }}>Cancelar</button>
        </Modal>
      )}
    </section>
  );
}
