import { useEffect, useState } from "react";
import { Modal } from "../../../../components/Modal/Modal.jsx";
import { PenalizacionesEscribano } from "../PenalizacionesEscribano/PenalizacionesEscribano.jsx";
import { SeccionResultadosEscribano } from "../../../resultados/components/ResultadosEdicion/ResultadosEdicion.jsx";
import styles from "../../PanelEscribano.module.css";

const bloqueos = {
  noche_cerrada: "Noche cerrada.",
  noche_no_abierta: "La noche no está abierta.",
  instantanea_no_disponible: "No hay un registro verificable de las planillas esperadas.",
  sin_planillas_esperadas: "No se puede cerrar una noche sin planillas esperadas.",
  planillas_pendientes: "Hay planillas esperadas que el servidor todavía no recibió.",
};

const bloqueosEdicion = {
  edicion_cerrada: "Votación completa cerrada.",
  edicion_no_abierta: "La edición todavía no está abierta.",
  edicion_retirada: "La edición fue retirada.",
  sin_noches_puntuables: "La edición no tiene noches competitivas puntuables.",
  noches_en_votacion: "Todavía hay una noche competitiva en votación.",
  noches_puntuables_pendientes: "Todavía quedan noches competitivas puntuables sin cerrar.",
};

const VISTAS = {
  todas: {
    titulo: "Mesa de Escribano",
    subtitulo: "Supervisá cierres de jornada, penalizaciones digitales, cierre total y publicación oficial.",
  },
  noches: {
    titulo: "Cierre de noche",
    subtitulo: "Verificá la recepción completa de planillas y cerrá cada jornada competitiva.",
  },
  penalizaciones: {
    titulo: "Penalizaciones digitales",
    subtitulo: "Registrá o anulá penalizaciones reglamentarias con referencia de acta y auditoría.",
  },
  cierreTotal: {
    titulo: "Cierre total de la votación",
    subtitulo: "Sellá definitivamente la edición para habilitar el escrutinio oficial.",
  },
  resultados: {
    titulo: "Resultados y publicación",
    subtitulo: "Calculá snapshots versionados, resolvé empates y publicá los resultados oficiales.",
  },
};

function IconoVistaGeneral() {
  return (
    <svg className={styles.icon} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconoCandado() {
  return (
    <svg className={styles.icon} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconoAlerta() {
  return (
    <svg className={styles.icon} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5L2.5 20h19L12 3.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 9.5v4.5M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconoSello() {
  return (
    <svg className={styles.icon} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 12.2l2.4 2.4 4.8-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconoTrofeo() {
  return (
    <svg className={styles.icon} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v5M8.5 19h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function PanelEscribano({ api, nombre, onCambiarRol, onCerrarSesion }) {
  const [vista, setVista] = useState("todas");
  const [noches, setNoches] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  const [revisionNoches, setRevisionNoches] = useState(0);
  const [revisionEdiciones, setRevisionEdiciones] = useState(0);

  const tieneCierreTotal = typeof api.listarEdicionesEscribano === "function";
  const tienePenalizaciones = tieneCierreTotal && typeof api.listarPenalizaciones === "function";
  const tieneResultados = tieneCierreTotal && typeof api.obtenerResultadosEdicion === "function";

  useEffect(() => {
    let vigente = true;
    api.listarNochesEscribano().then(({ ok, cuerpo }) => {
      if (!ok || !Array.isArray(cuerpo?.items)) throw new Error();
      if (vigente) setNoches(cuerpo.items);
    }).catch(() => {
      if (vigente) setError("No se pudieron consultar las noches.");
    });
    return () => { vigente = false; };
  }, [api, intento]);

  const noche = noches?.find(({ id }) => id === seleccion);
  const cabecera = VISTAS[vista] ?? VISTAS.todas;

  return (
    <div className={`escribano-contenido ${styles.shell}`}>
      <aside className={styles.sidebar} aria-label="Menú del escribano">
        <div className={styles.sidebarBrand}>
          <p className={styles.sidebarTitle}>Escribanía</p>
          <p className={styles.sidebarUser}>{nombre ? `${nombre} · Escribano` : "Rol Escribano"}</p>
        </div>

        <nav aria-label="Etapas del escribano" className={styles.navGroup}>
          <p className={styles.navGroupTitle}>Resumen</p>
          <button
            type="button"
            className={`${styles.navItem} ${vista === "todas" ? styles.navItemActive : ""}`}
            aria-pressed={vista === "todas"}
            onClick={() => setVista("todas")}
          >
            <IconoVistaGeneral />
            <span>Vista general</span>
          </button>

          <p className={styles.navGroupTitle}>Operación oficial</p>
          <button
            type="button"
            className={`${styles.navItem} ${vista === "noches" ? styles.navItemActive : ""}`}
            aria-pressed={vista === "noches"}
            onClick={() => setVista("noches")}
          >
            <IconoCandado />
            <span>Cierre de noche</span>
          </button>

          {tienePenalizaciones && (
            <button
              type="button"
              className={`${styles.navItem} ${vista === "penalizaciones" ? styles.navItemActive : ""}`}
              aria-pressed={vista === "penalizaciones"}
              onClick={() => setVista("penalizaciones")}
            >
              <IconoAlerta />
              <span>Penalizaciones</span>
            </button>
          )}

          {tieneCierreTotal && (
            <button
              type="button"
              className={`${styles.navItem} ${vista === "cierreTotal" ? styles.navItemActive : ""}`}
              aria-pressed={vista === "cierreTotal"}
              onClick={() => setVista("cierreTotal")}
            >
              <IconoSello />
              <span>Cierre total</span>
            </button>
          )}

          {tieneResultados && (
            <button
              type="button"
              className={`${styles.navItem} ${vista === "resultados" ? styles.navItemActive : ""}`}
              aria-pressed={vista === "resultados"}
              onClick={() => setVista("resultados")}
            >
              <IconoTrofeo />
              <span>Resultados y publicación</span>
            </button>
          )}
        </nav>

        {(onCambiarRol || onCerrarSesion) && (
          <div className={styles.sidebarFooter}>
            {onCambiarRol && (
              <button type="button" className={styles.btnSecondary} onClick={onCambiarRol}>
                Cambiar rol
              </button>
            )}
            {onCerrarSesion && (
              <button type="button" className={styles.btnSecondary} onClick={onCerrarSesion}>
                Cerrar sesión
              </button>
            )}
          </div>
        )}
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topBar}>
          <div>
            <h2 className={styles.topBarTitle}>{cabecera.titulo}</h2>
            <p className={styles.topBarSubtitle}>{cabecera.subtitulo}</p>
          </div>
        </header>

        <section
          aria-labelledby="titulo-cierre-noches"
          className={styles.stageCard}
          hidden={vista !== "todas" && vista !== "noches"}
        >
          <div className={styles.stageHeader}>
            <div>
              <h2 id="titulo-cierre-noches" className={styles.stageTitle}>Cierre de noche</h2>
              <p className={styles.stageDesc}>
                Solo se cierra una jornada cuando el servidor recibió oficialmente todas las planillas esperadas.
              </p>
            </div>
          </div>

          {error ? (
            <div className={styles.actionsRow}>
              <p role="alert" className={`${styles.statusBanner} ${styles.statusDanger}`}>{error}</p>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => { setError(""); setIntento(intento + 1); }}
              >
                Reintentar
              </button>
            </div>
          ) : !noches ? (
            <p role="status">Cargando noches…</p>
          ) : !noches.length ? (
            <p>No hay noches competitivas.</p>
          ) : (
            <>
              <ul className={styles.selectorList}>
                {noches.map((item) => {
                  const activa = seleccion === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`${styles.selectorBtn} ${activa ? styles.selectorBtnActive : ""}`}
                        aria-pressed={activa}
                        onClick={() => setSeleccion(item.id)}
                      >
                        <span>{item.edicion.nombre} · {item.nombre}</span>
                        <span className={`${styles.badge} ${item.estado === "CLOSED" ? styles.badgeClosed : styles.badgeOpen}`}>
                          {item.estado === "CLOSED" ? "Cerrada" : item.estado === "OPEN" ? "Abierta" : item.estado}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {noche && (
                <CierreNoche
                  key={noche.id}
                  api={api}
                  noche={noche}
                  alCerrar={() => {
                    setNoches((actual) => actual.map((item) =>
                      item.id === noche.id ? { ...item, estado: "CLOSED" } : item));
                    setRevisionNoches((n) => n + 1);
                  }}
                />
              )}
            </>
          )}
        </section>

        {tieneCierreTotal && (
          <div hidden={vista !== "todas" && vista !== "cierreTotal"}>
            <SeccionCierreTotal
              api={api}
              revisionNoches={revisionNoches}
              alCerrarEdicion={() => setRevisionEdiciones((n) => n + 1)}
            />
          </div>
        )}

        {tienePenalizaciones && (
          <div hidden={vista !== "todas" && vista !== "penalizaciones"}>
            <PenalizacionesEscribano api={api} revisionEdiciones={revisionEdiciones} />
          </div>
        )}

        {tieneResultados && (
          <div hidden={vista !== "todas" && vista !== "resultados"}>
            <SeccionResultadosEscribano api={api} revisionEdiciones={revisionEdiciones} />
          </div>
        )}
      </div>
    </div>
  );
}

function CierreNoche({ api, noche, alCerrar }) {
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const { id, edicion } = noche;
  const cerrada = noche.estado === "CLOSED";

  useEffect(() => {
    if (cerrada) return;
    let vigente = true;
    api.consultarCierreNoche(edicion.id, id).then(({ ok, cuerpo }) => {
      if (!ok || cuerpo?.nocheId !== id || typeof cuerpo.puedeCerrar !== "boolean") throw new Error();
      if (vigente) setEstado(cuerpo);
    }).catch(() => {
      if (vigente) setError("No se pudo consultar el estado del cierre.");
    });
    return () => { vigente = false; };
  }, [api, cerrada, edicion.id, id, intento]);

  async function cerrar() {
    if (enviando || !confirmar || !estado?.puedeCerrar) return;
    setEnviando(true);
    setError("");
    try {
      const { ok, cuerpo } = await api.cerrarNoche(edicion.id, id);
      if (ok && cuerpo?.nocheId === id && cuerpo.estado === "CLOSED") alCerrar();
      else {
        setEstado(null);
        setError(bloqueos[cuerpo?.error] ?? "No se pudo cerrar la noche. Actualizá el estado antes de volver a intentar.");
      }
    } catch {
      setEstado(null);
      setError("No se pudo confirmar el cierre. Actualizá el estado antes de volver a intentar.");
    } finally {
      setEnviando(false);
      setConfirmar(false);
    }
  }

  return (
    <section className={styles.detailBox}>
      <h3 className={styles.detailTitle}>{noche.nombre}</h3>
      {cerrada ? (
        <p role="status" className={`${styles.statusBanner} ${styles.statusNeutral}`}>Noche cerrada.</p>
      ) : (
        <>
          {error ? (
            <p role="alert" className={`${styles.statusBanner} ${styles.statusDanger}`}>{error}</p>
          ) : (
            <p
              role="status"
              className={`${styles.statusBanner} ${
                !estado ? styles.statusNeutral : estado.puedeCerrar ? styles.statusOk : styles.statusWarn
              }`}
            >
              {estado
                ? (estado.puedeCerrar ? "La noche puede cerrarse." : bloqueos[estado.motivo] ?? "La noche no puede cerrarse.")
                : "Consultando estado…"}
            </p>
          )}
          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.btnSecondary}
              disabled={enviando || confirmar}
              onClick={() => {
                setEstado(null);
                setError("");
                setIntento(intento + 1);
              }}
            >
              Actualizar estado
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={!estado?.puedeCerrar || enviando}
              onClick={() => setConfirmar(true)}
            >
              Cerrar noche
            </button>
          </div>
          {confirmar && (
            <Modal title="Confirmar cierre de noche" onClose={() => { if (!enviando) setConfirmar(false); }}>
              <p>Vas a cerrar {noche.nombre}. Esta acción no se puede deshacer.</p>
              <div className={styles.actionsRow}>
                <button type="button" className={styles.btnPrimary} disabled={enviando} onClick={() => void cerrar()}>
                  Confirmar cierre
                </button>
                <button type="button" className={styles.btnSecondary} disabled={enviando} onClick={() => setConfirmar(false)}>
                  Cancelar
                </button>
              </div>
            </Modal>
          )}
        </>
      )}
    </section>
  );
}

function SeccionCierreTotal({ api, revisionNoches, alCerrarEdicion }) {
  const [ediciones, setEdiciones] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vigente = true;
    api.listarEdicionesEscribano().then(({ ok, cuerpo }) => {
      if (!ok || !Array.isArray(cuerpo?.items)) throw new Error();
      if (vigente) setEdiciones(cuerpo.items);
    }).catch(() => {
      if (vigente) setError("No se pudieron consultar las ediciones.");
    });
    return () => { vigente = false; };
  }, [api, intento]);

  const edicion = ediciones?.find(({ id }) => id === seleccion);
  return (
    <section aria-labelledby="titulo-cierre-total" className={styles.stageCard}>
      <div className={styles.stageHeader}>
        <div>
          <h2 id="titulo-cierre-total" className={styles.stageTitle}>Cierre total de la votación</h2>
          <p className={styles.stageDesc}>
            Una vez cerradas todas las jornadas puntuables, cerrá la votación completa para habilitar el escrutinio.
          </p>
        </div>
      </div>

      {error ? (
        <div className={styles.actionsRow}>
          <p role="alert" className={`${styles.statusBanner} ${styles.statusDanger}`}>{error}</p>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => { setError(""); setIntento(intento + 1); }}
          >
            Reintentar ediciones
          </button>
        </div>
      ) : !ediciones ? (
        <p role="status">Cargando ediciones…</p>
      ) : !ediciones.length ? (
        <p>No hay ediciones disponibles.</p>
      ) : (
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
                    <span className={`${styles.badge} ${item.estado === "CLOSED" ? styles.badgeClosed : styles.badgeOpen}`}>
                      {item.estado === "CLOSED" ? "Cerrada" : item.estado === "OPEN" ? "Abierta" : item.estado}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {edicion && (
            <CierreTotalEdicion
              key={edicion.id}
              api={api}
              edicion={edicion}
              revisionNoches={revisionNoches}
              alCerrar={(cerradaEn) => {
                setEdiciones((actual) => actual.map((item) =>
                  item.id === edicion.id ? { ...item, estado: "CLOSED", cerradaEn } : item));
                alCerrarEdicion?.();
              }}
            />
          )}
        </>
      )}
    </section>
  );
}

function CierreTotalEdicion({ api, edicion, revisionNoches, alCerrar }) {
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const { id } = edicion;
  const cerrada = edicion.estado === "CLOSED";

  useEffect(() => {
    if (cerrada) return;
    let vigente = true;
    api.consultarCierreTotal(id).then(({ ok, cuerpo }) => {
      if (!ok || cuerpo?.edicionId !== id || typeof cuerpo.puedeCerrar !== "boolean") throw new Error();
      if (vigente) {
        setError("");
        setEstado(cuerpo);
      }
    }).catch(() => {
      if (vigente) setError("No se pudo consultar el estado del cierre total.");
    });
    return () => { vigente = false; };
  }, [api, cerrada, id, intento, revisionNoches]);

  async function cerrar() {
    if (enviando || !confirmar || !estado?.puedeCerrar) return;
    setEnviando(true);
    setError("");
    try {
      const { ok, cuerpo } = await api.cerrarVotacionTotal(id);
      if (ok && cuerpo?.edicionId === id && cuerpo.estado === "CLOSED") {
        alCerrar(cuerpo.cerradaEn ?? null);
      } else {
        setEstado(null);
        setError(bloqueosEdicion[cuerpo?.error]
          ?? "No se pudo cerrar la votación completa. Actualizá el estado antes de volver a intentar.");
      }
    } catch {
      setEstado(null);
      setError("No se pudo confirmar el cierre total. Actualizá el estado antes de volver a intentar.");
    } finally {
      setEnviando(false);
      setConfirmar(false);
    }
  }

  return (
    <section className={styles.detailBox}>
      <h3 className={styles.detailTitle}>{edicion.nombre} ({edicion.anio})</h3>
      {cerrada ? (
        <p role="status" className={`${styles.statusBanner} ${styles.statusNeutral}`}>Votación completa cerrada.</p>
      ) : (
        <>
          {error ? (
            <p role="alert" className={`${styles.statusBanner} ${styles.statusDanger}`}>{error}</p>
          ) : (
            <p
              role="status"
              className={`${styles.statusBanner} ${
                !estado ? styles.statusNeutral : estado.puedeCerrar ? styles.statusOk : styles.statusWarn
              }`}
            >
              {estado
                ? (estado.puedeCerrar
                  ? "La votación completa puede cerrarse."
                  : bloqueosEdicion[estado.motivo] ?? "La votación completa no puede cerrarse.")
                : "Consultando estado…"}
            </p>
          )}
          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.btnSecondary}
              disabled={enviando || confirmar}
              onClick={() => {
                setEstado(null);
                setError("");
                setIntento(intento + 1);
              }}
            >
              Actualizar estado de la edición
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={!estado?.puedeCerrar || enviando}
              onClick={() => setConfirmar(true)}
            >
              Cerrar votación completa
            </button>
          </div>
          {confirmar && (
            <Modal title="Confirmar cierre total de la votación" onClose={() => { if (!enviando) setConfirmar(false); }}>
              <p>
                Vas a cerrar definitivamente la votación completa de <strong>{edicion.nombre} ({edicion.anio})</strong>.
                Esta acción es irreversible: bloquea nuevas noches y votos, y habilita la etapa de resultados.
              </p>
              <div className={styles.actionsRow}>
                <button type="button" className={styles.btnPrimary} disabled={enviando} onClick={() => void cerrar()}>
                  Confirmar cierre total
                </button>
                <button type="button" className={styles.btnSecondary} disabled={enviando} onClick={() => setConfirmar(false)}>
                  Cancelar
                </button>
              </div>
            </Modal>
          )}
        </>
      )}
    </section>
  );
}
