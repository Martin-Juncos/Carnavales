import { useEffect, useRef, useState } from "react";
import { Modal } from "../../components/Modal/Modal.jsx";
import {
  bloquearBorradorParaTraspaso, borradorVacio, confirmar, esTraspaso, guardarAcuseTraspaso,
  notas, planillaCompleta, puntuar, sePuedeVincularBorrador, vincularBorrador,
} from "./planilla-local.js";
import { RecepcionPlanilla } from "./RecepcionPlanilla.jsx";
import styles from "./PanelJurado.module.css";

function useEstadoConexion() {
  const [enLinea, setEnLinea] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    function conectar() { setEnLinea(true); }
    function desconectar() { setEnLinea(false); }
    window.addEventListener("online", conectar);
    window.addEventListener("offline", desconectar);
    return () => {
      window.removeEventListener("online", conectar);
      window.removeEventListener("offline", desconectar);
    };
  }, []);
  return enLinea;
}

function etiquetaEstadoNoche(estado) {
  if (estado === "OPEN") return { texto: "Abierta", clase: styles.badgeSuccess };
  if (estado === "CLOSED") return { texto: "Cerrada", clase: styles.badgeNeutral };
  return { texto: "En preparación", clase: styles.badgeWarning };
}

function textoParticipante(rubroNombre, comparsaNombre, sujetoNombre) {
  if (!sujetoNombre) return null;
  const limpio = sujetoNombre.trim();
  if (!limpio) return null;
  const normal = limpio.toLowerCase();
  if (normal === comparsaNombre.trim().toLowerCase() || normal === rubroNombre.trim().toLowerCase()) return null;
  return limpio;
}

function formatearFechaAcuse(iso) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  try {
    return new Date(iso).toLocaleString("es-AR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function IconoCheck({ size = 18 }) {
  return (
    <svg className={styles.icon} width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="currentColor" />
      <path d="M6.2 10.2l2.6 2.6 5-5.4" stroke="var(--color-white)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconoPendiente() {
  return (
    <svg className={styles.icon} width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 2.5" opacity="0.6" />
      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconoAlerta({ size = 16 }) {
  return (
    <svg className={styles.icon} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3L2 20h20L12 3z" fill="currentColor" />
      <path d="M12 9v5M12 17h.01" stroke="var(--color-white)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function IconoTraspaso({ size = 24 }) {
  return (
    <svg className={styles.icon} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M8 10h8m0 0l-2.5-2.5M16 10l-2.5 2.5M16 14H8m0 0l2.5-2.5M8 14l2.5 2.5" stroke="var(--color-white)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CabeceraJurado({ contexto, estadoPlanilla, enLinea, nombre, onCambiarRol, onCerrarSesion }) {
  return (
    <header role="banner" className={styles.topBar}>
      <div className={styles.topBarContext}>
        <span className={styles.brandMark}>
          {contexto?.noche?.edicion?.nombre ?? "Carnavales · Votación"}
        </span>
        {contexto ? (
          <>
            <span className={styles.topBarSep} aria-hidden="true" />
            <span className={styles.topBarNight}>{contexto.noche.nombre}</span>
            <span className={styles.specialtyPill}>{contexto.especialidad.nombre}</span>
            {estadoPlanilla ? <span className={styles.sheetStatusText}>{estadoPlanilla}</span> : null}
          </>
        ) : null}
      </div>

      <div className={styles.topBarRight}>
        <span className={`${styles.connPill} ${enLinea ? styles.connOnline : styles.connOffline}`}>
          <span className={styles.connDot} aria-hidden="true" />
          {enLinea ? "Con conexión" : "Sin conexión"}
        </span>
        {nombre ? (
          <span className={styles.userTag}>
            <strong>{nombre}</strong> · Jurado
          </span>
        ) : null}
        {onCambiarRol ? (
          <button type="button" className={styles.topActionBtn} onClick={onCambiarRol}>
            Cambiar rol
          </button>
        ) : null}
        {onCerrarSesion ? (
          <button type="button" className={styles.topActionBtn} onClick={onCerrarSesion}>
            Cerrar sesión
          </button>
        ) : null}
      </div>
    </header>
  );
}

export function PanelJurado({ api, juradoId, guardar, nombre, onCambiarRol, onCerrarSesion }) {
  const [contextos, setContextos] = useState(null);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  const [seleccion, setSeleccion] = useState(null);
  const [estadoPlanilla, setEstadoPlanilla] = useState("");
  const enLinea = useEstadoConexion();

  useEffect(() => {
    let vigente = true;
    async function cargar() {
      try {
        const { ok, cuerpo } = await api.listarContextosJurado();
        if (!ok || !Array.isArray(cuerpo?.items)) throw new Error();
        if (vigente) setContextos(cuerpo.items);
      } catch {
        if (vigente) setError(true);
      }
    }
    cargar();
    return () => { vigente = false; };
  }, [api, intento]);

  function volverAlInicio() {
    setSeleccion(null);
    setEstadoPlanilla("");
  }

  return (
    <div className={`jurado-contenido ${styles.shell}`}>
      <CabeceraJurado
        contexto={seleccion}
        estadoPlanilla={estadoPlanilla}
        enLinea={enLinea}
        nombre={nombre}
        onCambiarRol={onCambiarRol}
        onCerrarSesion={onCerrarSesion}
      />
      <section aria-labelledby="titulo-planilla" className={styles.container}>
        {seleccion ? (
          <Planilla
            key={seleccion.asignacionId}
            api={api}
            juradoId={juradoId}
            guardar={guardar}
            contexto={seleccion}
            onVolver={volverAlInicio}
            onCambioEstado={setEstadoPlanilla}
          />
        ) : (
          <>
            <div className={styles.pageHeader}>
              <div>
                <h2 id="titulo-planilla" className={styles.pageTitle}>Planilla del jurado</h2>
                <p className={styles.pageSubtitle}>
                  Elegí una noche y especialidad asignada para evaluar. Tus puntuaciones se guardan localmente en este dispositivo.
                </p>
              </div>
            </div>

            {error ? (
              <div className={`${styles.stateCard} ${styles.stateCardDanger}`}>
                <p role="alert" className={styles.stateCopy}>
                  No se pudieron consultar las asignaciones. Revisá la conexión.
                </p>
                <div className={styles.stateActions}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => { setError(false); setIntento(intento + 1); }}
                  >
                    Volver a consultar
                  </button>
                </div>
              </div>
            ) : !contextos ? (
              <div className={styles.stateCard}>
                <p role="status" className={styles.stateCopy}>Cargando asignaciones…</p>
              </div>
            ) : contextos.length === 0 ? (
              <div className={styles.stateCard}>
                <p className={styles.stateCopy}>No tenés asignaciones activas.</p>
              </div>
            ) : (
              <ul className={styles.contextGrid}>
                {contextos.map((contexto) => {
                  const badgeNoche = etiquetaEstadoNoche(contexto.noche.estado);
                  return (
                    <li key={contexto.asignacionId}>
                      <button
                        type="button"
                        className={`${styles.contextCard} ${contexto.noche.estado === "OPEN" ? styles.contextCardOpen : ""}`}
                        onClick={() => setSeleccion(contexto)}
                      >
                        <div className={styles.contextMetaRow}>
                          <span className={styles.contextEdition}>{contexto.noche.edicion.nombre}</span>
                          <span className={`${styles.badge} ${badgeNoche.clase}`}>{badgeNoche.texto}</span>
                        </div>
                        <span className={styles.contextNight}>{contexto.noche.nombre}</span>
                        <span className={styles.contextSpec}>{contexto.especialidad.nombre}</span>
                        <span className={styles.contextCta}>
                          {contexto.noche.estado === "OPEN" ? "Abrir planilla →" : "Ver planilla →"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Planilla({ api, juradoId, contexto, guardar, onVolver, onCambioEstado }) {
  const { asignacionId } = contexto;
  const [carga, setCarga] = useState(null);
  const [error, setError] = useState("");
  const [escriturasActivas, setEscriturasActivas] = useState(0);
  const [revisar, setRevisar] = useState(false);
  const [verResumen, setVerResumen] = useState(false);
  const [prepararTraspaso, setPrepararTraspaso] = useState(false);
  const [comparsaActiva, setComparsaActiva] = useState("TODAS");
  const canal = useRef(null);
  const escribiendo = escriturasActivas > 0;

  useEffect(() => {
    let vigente = true;
    const clave = [juradoId, asignacionId];
    let autorizado = false;
    // El mensaje no transporta votos ni autoriza una lectura.
    const avisos = typeof BroadcastChannel === "function"
      ? new BroadcastChannel("carnavales-planillas") : null;
    canal.current = avisos;

    async function actualizarLocal() {
      try {
        const local = await guardar(clave, (actual) => actual);
        if (vigente && (local?.estado === "pendiente" || local?.estado === "recibida" || esTraspaso(local))) {
          setCarga((previa) => {
            if (!previa || previa.local.estado === "recibida") return previa;
            const actual = previa.local;
            // IndexedDB devuelve otra instancia incluso si no cambió nada.
            if (actual.estado === local.estado && actual.operationId === local.operationId
              && actual.conflicto === local.conflicto) return previa;
            return { ...previa, local };
          });
        }
      } catch {
        if (vigente) setError("No se pudo consultar el guardado de este dispositivo.");
      }
    }
    if (avisos) {
      avisos.onmessage = ({ data }) => {
        if (autorizado && data?.[0] === juradoId && data?.[1] === asignacionId) void actualizarLocal();
      };
    }
    function alVolver() {
      if (autorizado && document.visibilityState === "visible") void actualizarLocal();
    }
    document.addEventListener("visibilitychange", alVolver);

    async function cargar() {
      try {
        const { ok, cuerpo } = await api.obtenerPlanillaJurado(asignacionId);
        if (!vigente) return;
        if (!ok || cuerpo?.asignacionId !== asignacionId || !Array.isArray(cuerpo.filas)) {
          throw new Error();
        }
        const local = await guardar(clave, (actual) => actual);
        if (!vigente) return;
        let planilla = cuerpo;
        let dispositivoId;
        if (cuerpo.requiereDispositivo && cuerpo.noche.estado === "OPEN" && cuerpo.filas.length
          && local?.estado !== "recibida") {
          dispositivoId = await guardar([...clave, "dispositivo"], (actual) => actual ?? crypto.randomUUID());
          if (!vigente) return;
          const reclamo = esTraspaso(local) ? null : await api.abrirEdicionPlanillaJurado(asignacionId, dispositivoId);
          if (!vigente) return;
          if (reclamo?.status === 409 && reclamo.cuerpo?.error === "dispositivo_no_autorizado") {
            setError("Esta planilla ya se abrió para editar en otro dispositivo.");
            return;
          }
          if (reclamo) {
            if (!reclamo.ok || reclamo.cuerpo?.asignacionId !== asignacionId
              || !reclamo.cuerpo.recepcionHabilitada || !Array.isArray(reclamo.cuerpo.filas)) throw new Error();
            planilla = reclamo.cuerpo;
          }
        }
        if (vigente) {
          setCarga({ planilla, local: local ?? borradorVacio, dispositivoId });
          autorizado = true;
        }
      } catch {
        if (vigente) setError("No se pudo abrir la planilla. Revisá la conexión y el almacenamiento del dispositivo.");
      }
    }
    cargar();
    return () => {
      vigente = false;
      avisos?.close();
      canal.current = null;
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [api, asignacionId, guardar, juradoId]);

  const estadoBarra = !carga ? "Cargando…"
    : carga.local.estado === "recibida" ? "Recibida oficialmente"
    : esTraspaso(carga.local) ? "Traspaso en curso"
    : carga.local.estado === "pendiente" ? "Pendiente de recepción"
    : carga.planilla.noche.estado !== "OPEN" ? "Noche no abierta"
    : "Planilla abierta";

  useEffect(() => {
    onCambioEstado(estadoBarra);
  }, [estadoBarra, onCambioEstado]);

  async function guardarCambio(cambiar, esConfirmacion = false) {
    setEscriturasActivas((n) => n + 1);
    setError("");
    try {
      const clave = [juradoId, asignacionId];
      const local = await guardar(clave, cambiar);
      setCarga((previa) => (previa.local.estado === "borrador" ? { ...previa, local } : previa));
      if (local.estado === "pendiente" || esTraspaso(local)) canal.current?.postMessage(clave);
      else if (esConfirmacion) {
        setRevisar(false);
        setError("La planilla cambió en otra pestaña. Revisá los puntajes antes de confirmar.");
      }
    } catch {
      setError("No se pudo guardar en este dispositivo. Volvé a intentarlo.");
    } finally {
      setEscriturasActivas((n) => Math.max(0, n - 1));
    }
  }

  async function guardarTraspaso(preparar) {
    const clave = [juradoId, asignacionId];
    setEscriturasActivas((n) => n + 1);
    setError("");
    try {
      const local = await guardar(clave, preparar ?? ((actual) => actual));
      if (!local) throw new Error();
      setCarga((previa) => ({ ...previa, local }));
      setPrepararTraspaso(false);
      if (preparar && local.estado === "borrador") {
        setError("La planilla cambió en otra pestaña. Revisá los puntajes antes de preparar el traspaso.");
        return;
      }
      if (local.estado !== "traspaso_pendiente") return;
      canal.current?.postMessage(clave);
      const { operationId, versionId, puntajes } = local;
      const { ok, cuerpo } = await api.congelarBorradorTraspaso(asignacionId, {
        operationId,
        versionId,
        dispositivoId: carga.dispositivoId,
        puntajes: Object.entries(puntajes).map(([filaId, valor]) => ({ filaId, valor, noPresentado: valor === 0 })),
      });
      if (!ok || cuerpo?.estado !== "BORRADOR_CONGELADO" || cuerpo.asignacionId !== asignacionId
        || cuerpo.operationId !== operationId
        || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(cuerpo.confirmacionId ?? "")) throw new Error();
      const confirmado = await api.confirmarAcuseTraspaso(asignacionId, {
        operationId,
        dispositivoId: carga.dispositivoId,
        confirmacionId: cuerpo.confirmacionId,
      });
      if (!confirmado.ok || confirmado.cuerpo?.estado !== "TRASPASO_CONFIRMADO"
        || confirmado.cuerpo.asignacionId !== asignacionId || confirmado.cuerpo.operationId !== operationId) throw new Error();
      const siguiente = await guardar(clave, (actual) => guardarAcuseTraspaso(actual, operationId));
      setCarga((previa) => ({ ...previa, local: siguiente }));
      canal.current?.postMessage(clave);
    } catch {
      setError("No se pudo guardar el borrador para el traspaso. Volvé a intentarlo con conexión.");
    } finally {
      setEscriturasActivas((n) => Math.max(0, n - 1));
    }
  }

  if (!carga) {
    return (
      <div className={styles.stateCard}>
        <button type="button" className={styles.linkBtn} onClick={onVolver}>← Volver a las asignaciones</button>
        <h2 id="titulo-planilla" className={styles.stateHeading}>
          {contexto.noche.nombre} · {contexto.especialidad.nombre}
        </h2>
        {error ? (
          <p role="alert" className={`${styles.banner} ${styles.bannerAlert}`}>{error}</p>
        ) : (
          <p role="status" className={styles.stateCopy}>Cargando planilla…</p>
        )}
      </div>
    );
  }

  const { planilla, local, dispositivoId } = carga;

  // Estado 1: Recibida oficialmente por el servidor (mantiene el mismo diseño nuevo!)
  if (local.estado === "recibida") {
    const fechaAcuse = formatearFechaAcuse(local.recibidaEn);
    return (
      <article className={`${styles.stateCard} ${styles.stateCardSuccess}`}>
        <div className={styles.stateHeader}>
          <div className={styles.stateHeadingGroup} style={{ color: "var(--color-jurado-success)" }}>
            <IconoCheck size={26} />
            <h2 id="titulo-planilla" className={styles.stateHeading}>
              {planilla.noche.nombre} · {planilla.especialidad.nombre}
            </h2>
          </div>
          <span className={`${styles.badge} ${styles.badgeSuccess}`}>Acuse oficial</span>
        </div>
        <p role="status" className={styles.stateCopy}>
          <strong>Recibida</strong> por el servidor. Tus puntuaciones quedaron registradas e inmutables para el cierre de noche.
        </p>
        {(fechaAcuse || local.operationId) ? (
          <div className={styles.stateMetaBox}>
            {fechaAcuse ? `Recibida el ${fechaAcuse}` : "Recepción verificada"}
            {local.operationId ? ` · ID: ${local.operationId}` : ""}
          </div>
        ) : null}
        <div className={styles.stateActions}>
          <button type="button" className={styles.btnSecondary} onClick={onVolver}>
            Volver a las asignaciones
          </button>
        </div>
      </article>
    );
  }

  // Estado 2: Traspaso a suplente (mantiene el mismo diseño nuevo!)
  if (esTraspaso(local)) {
    const guardado = local.estado === "traspaso_guardado";
    return (
      <article className={`${styles.stateCard} ${guardado ? styles.stateCardAccent : styles.stateCardWarning}`}>
        <div className={styles.stateHeader}>
          <div className={styles.stateHeadingGroup} style={{ color: guardado ? "var(--color-jurado-accent)" : "var(--color-jurado-warning)" }}>
            <IconoTraspaso size={26} />
            <h2 id="titulo-planilla" className={styles.stateHeading}>
              {planilla.noche.nombre} · {planilla.especialidad.nombre}
            </h2>
          </div>
          <span className={`${styles.badge} ${guardado ? styles.badgeAccent : styles.badgeWarning}`}>
            {guardado ? "Borrador congelado" : "Traspaso pendiente"}
          </span>
        </div>
        <p role="status" className={styles.stateCopy}>
          {guardado
            ? "Borrador guardado en el servidor. La planilla quedó bloqueada."
            : "Borrador pendiente de guardar para el traspaso."}
        </p>
        {error ? <p role="alert" className={`${styles.banner} ${styles.bannerAlert}`}>{error}</p> : null}
        <div className={styles.stateActions}>
          {!guardado ? (
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={escribiendo || !dispositivoId}
              onClick={() => void guardarTraspaso()}
            >
              Reintentar guardar borrador
            </button>
          ) : null}
          <button type="button" className={styles.btnSecondary} onClick={onVolver}>
            Volver a las asignaciones
          </button>
        </div>
      </article>
    );
  }

  // Estado 3: Confirmada localmente, pendiente de recepción oficial (mantiene el mismo diseño nuevo!)
  if (local.estado === "pendiente") {
    return (
      <>
        <h2 id="titulo-planilla" className={styles.legendSrOnly}>
          {planilla.noche.nombre} · {planilla.especialidad.nombre}
        </h2>
        <RecepcionPlanilla
          api={api}
          guardar={guardar}
          juradoId={juradoId}
          planilla={planilla}
          local={local}
          setCarga={setCarga}
          dispositivoId={dispositivoId}
          onVolver={onVolver}
        />
      </>
    );
  }

  // Estado 4: Noche no abierta
  if (planilla.noche.estado !== "OPEN") {
    return (
      <article className={styles.stateCard}>
        <div className={styles.stateHeader}>
          <h2 id="titulo-planilla" className={styles.stateHeading}>
            {planilla.noche.nombre} · {planilla.especialidad.nombre}
          </h2>
          <span className={`${styles.badge} ${styles.badgeNeutral}`}>Solo lectura</span>
        </div>
        <p className={styles.stateCopy}>La noche no está abierta para puntuar.</p>
        <div className={styles.stateActions}>
          <button type="button" className={styles.btnSecondary} onClick={onVolver}>
            Volver a las asignaciones
          </button>
        </div>
      </article>
    );
  }

  // Estado 5: Noche histórica / versión no verificable
  if (!planilla.recepcionHabilitada || !planilla.versionId || (local.versionId && local.versionId !== planilla.versionId)) {
    return (
      <article className={styles.stateCard}>
        <div className={styles.stateHeader}>
          <h2 id="titulo-planilla" className={styles.stateHeading}>
            {planilla.noche.nombre} · {planilla.especialidad.nombre}
          </h2>
          <span className={`${styles.badge} ${styles.badgeNeutral}`}>Solo consulta</span>
        </div>
        <p className={styles.stateCopy}>
          Esta planilla no tiene una versión verificable para enviarse. No se modificaron los datos locales.
        </p>
        <ul className={styles.historicalList}>
          {planilla.filas.map(({ id, rubro, sujeto }) => (
            <li key={id} className={styles.historicalItem}>
              {rubro.nombre} · {sujeto.nombre ?? sujeto.comparsa.nombre}
            </li>
          ))}
        </ul>
        <div className={styles.stateActions}>
          <button type="button" className={styles.btnSecondary} onClick={onVolver}>
            Volver a las asignaciones
          </button>
        </div>
      </article>
    );
  }

  // Estado 6: Evaluación activa (borrador local editable)
  const rubrosPadre = new Set(planilla.filas.map(({ rubro }) => rubro.padreId).filter(Boolean));
  const heredadas = new Set(planilla.filasHeredadas ?? []);
  const requeridas = new Set(
    planilla.filas
      .filter(({ id, evaluable, rubro }) => evaluable && !heredadas.has(id) && !rubrosPadre.has(rubro.id))
      .map(({ id }) => id),
  );
  const completa = planillaCompleta(planilla.filas, requeridas, local.puntajes);
  const anteriorSinVersion = local !== borradorVacio && !local.versionId;
  const puedeVincular = anteriorSinVersion && sePuedeVincularBorrador(local, requeridas);
  const camposDeshabilitados = revisar || anteriorSinVersion || prepararTraspaso;

  // Agrupación por comparsa conservando el orden de la planilla
  const comparsasOrdenadas = [];
  const comparsaMapa = new Map();
  for (const filaActual of planilla.filas) {
    const nombreComparsa = filaActual.sujeto.comparsa.nombre;
    if (!comparsaMapa.has(nombreComparsa)) {
      const grupo = { nombre: nombreComparsa, filas: [], requeridas: 0, completadas: 0 };
      comparsaMapa.set(nombreComparsa, grupo);
      comparsasOrdenadas.push(grupo);
    }
    const grupo = comparsaMapa.get(nombreComparsa);
    grupo.filas.push(filaActual);
    if (requeridas.has(filaActual.id)) {
      grupo.requeridas += 1;
      const v = local.puntajes[filaActual.id];
      if (v === 0 || notas.includes(v)) grupo.completadas += 1;
    }
  }

  const totalRequeridas = requeridas.size;
  const totalCompletadas = [...requeridas].filter((id) => {
    const v = local.puntajes[id];
    return v === 0 || notas.includes(v);
  }).length;
  const faltantes = totalRequeridas - totalCompletadas;
  const porcentaje = totalRequeridas > 0 ? Math.round((totalCompletadas / totalRequeridas) * 100) : 100;

  const filasVisibles = comparsaActiva === "TODAS"
    ? planilla.filas
    : planilla.filas.filter((f) => f.sujeto.comparsa.nombre === comparsaActiva);

  const primeraPendiente = planilla.filas.find(({ id }) => {
    if (!requeridas.has(id)) return false;
    const v = local.puntajes[id];
    return !(v === 0 || notas.includes(v));
  });

  function irAFila(id, comparsaNombre) {
    setVerResumen(false);
    if (comparsaActiva !== "TODAS" && comparsaActiva !== comparsaNombre) {
      setComparsaActiva(comparsaNombre);
    }
    requestAnimationFrame(() => {
      document.getElementById(`fila-jurado-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  return (
    <>
      <div className={styles.pageHeader}>
        <div>
          <button type="button" className={styles.linkBtn} onClick={onVolver}>
            ← Volver a las asignaciones
          </button>
          <h2 id="titulo-planilla" className={styles.pageTitle}>
            {verResumen ? "Revisá tu planilla" : "Evaluación"}
          </h2>
          <p className={styles.pageSubtitle}>
            {verResumen
              ? "El cierre incluye todas las comparsas de esta planilla. No se cierra una sola comparsa."
              : "Podés completar esta planilla sin conexión mientras siga abierta. Para volver a abrirla, necesitás conexión."}
          </p>
        </div>

        <div className={styles.footerActions}>
          {planilla.filas.length > 0 ? (
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => setVerResumen((anterior) => !anterior)}
            >
              {verResumen ? "Volver a puntuar" : "Revisar planilla"}
            </button>
          ) : null}
          {dispositivoId && !anteriorSinVersion && !revisar ? (
            <button
              type="button"
              className={styles.btnSecondary}
              disabled={escribiendo}
              onClick={() => setPrepararTraspaso(true)}
            >
              Preparar traspaso
            </button>
          ) : null}
        </div>
      </div>

      {/* Progreso general (sin sumas numéricas de puntaje) */}
      <div className={styles.progressPanel}>
        <div className={styles.progressInfo}>
          <p className={styles.progressTitle}>Avance de la planilla</p>
          <p className={styles.progressHint}>
            {!planilla.filas.length
              ? "La planilla no tiene filas para confirmar."
              : !totalRequeridas
                ? (heredadas.size
                  ? "No quedan puntajes pendientes. Podés confirmar la planilla."
                  : "Esta planilla solo tiene filas informativas. Podés confirmarla sin puntajes.")
                : completa
                  ? "Planilla completa."
                  : `Faltan ${faltantes} ${faltantes === 1 ? "puntuación" : "puntuaciones"} para confirmar.`}
          </p>
        </div>
        {totalRequeridas > 0 ? (
          <div className={styles.progressMeterWrap}>
            <div className={styles.progressMeterHeader}>
              <span>Ítems evaluados</span>
              <strong>{totalCompletadas} de {totalRequeridas}</strong>
            </div>
            <div className={styles.progressTrack} aria-hidden="true">
              <div className={styles.progressFill} style={{ width: `${porcentaje}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p role="alert" className={`${styles.banner} ${styles.bannerAlert}`}>{error}</p> : null}

      {puedeVincular ? (
        <div className={`${styles.banner} ${styles.bannerWarning}`}>
          <div>
            <p className={styles.bannerTitle}>Borrador anterior sin versión vinculada</p>
            <p className={styles.bannerBody}>
              Este borrador se guardó antes de registrar la versión. Revisá los puntajes que ves contra estas filas antes de vincularlo al reglamento de la noche.
            </p>
          </div>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={escribiendo}
            onClick={() => guardarCambio((actual) => vincularBorrador(actual, planilla.versionId, requeridas, local.puntajes))}
          >
            Vincular borrador revisado
          </button>
        </div>
      ) : anteriorSinVersion ? (
        <p className={`${styles.banner} ${styles.bannerWarning}`}>
          El borrador anterior contiene puntajes que no coinciden con estas filas. Se conservó sin cambios.
        </p>
      ) : null}

      {verResumen ? (
        <div className={styles.reviewTableCard}>
          {comparsasOrdenadas.map((grupo) => {
            const grupoCompleto = grupo.completadas === grupo.requeridas;
            return (
              <div key={grupo.nombre}>
                <div className={styles.reviewGroupHeader}>
                  <span>{grupo.nombre}</span>
                  <span className={`${styles.badge} ${grupoCompleto ? styles.badgeSuccess : styles.badgeNeutral}`}>
                    {grupoCompleto ? <IconoCheck size={14} /> : null}
                    {grupoCompleto ? "Completa" : `${grupo.completadas}/${grupo.requeridas}`}
                  </span>
                </div>
                {grupo.filas.map((f) => {
                  const valor = local.puntajes[f.id];
                  const esHeredada = heredadas.has(f.id);
                  const esReq = requeridas.has(f.id);
                  const participante = textoParticipante(f.rubro.nombre, f.sujeto.comparsa.nombre, f.sujeto.nombre);
                  return (
                    <div key={f.id} className={styles.reviewRow}>
                      <div>
                        <div className={styles.reviewRowTitle}>{f.rubro.nombre}</div>
                        {participante ? <div className={styles.reviewRowSub}>{participante}</div> : null}
                      </div>
                      {esHeredada ? (
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>Puntaje heredado</span>
                      ) : !esReq ? (
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>Informativa</span>
                      ) : valor === 0 ? (
                        <span className={`${styles.badge} ${styles.badgeWarning}`}>No se presentó (0)</span>
                      ) : notas.includes(valor) ? (
                        <span className={styles.reviewScore}>{valor}</span>
                      ) : (
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>Sin puntuar</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.workspace}>
          {/* Barra lateral de comparsas y resumen */}
          <aside className={styles.sidebar} aria-label="Navegación de comparsas">
            <div className={styles.sidebarCard}>
              <h3 className={styles.sidebarHeading}>Comparsas</h3>
              <div className={styles.comparsaTabsRow}>
                {comparsasOrdenadas.length > 1 ? (
                  <button
                    type="button"
                    className={`${styles.comparsaTab} ${comparsaActiva === "TODAS" ? styles.comparsaTabActive : ""}`}
                    onClick={() => setComparsaActiva("TODAS")}
                  >
                    <span>Todas</span>
                    <span className={`${styles.comparsaCount} ${completa ? styles.comparsaCountDone : ""}`}>
                      {totalCompletadas}/{totalRequeridas}
                    </span>
                  </button>
                ) : null}
                {comparsasOrdenadas.map((grupo, idx) => {
                  const activo = comparsaActiva === grupo.nombre || (comparsasOrdenadas.length === 1);
                  const done = grupo.requeridas > 0 && grupo.completadas === grupo.requeridas;
                  return (
                    <button
                      key={grupo.nombre}
                      type="button"
                      className={`${styles.comparsaTab} ${activo ? styles.comparsaTabActive : ""}`}
                      onClick={() => setComparsaActiva(comparsasOrdenadas.length === 1 ? "TODAS" : grupo.nombre)}
                    >
                      <span>{idx + 1}. {grupo.nombre}</span>
                      <span className={`${styles.comparsaCount} ${done ? styles.comparsaCountDone : ""}`}>
                        {grupo.completadas}/{grupo.requeridas}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {filasVisibles.length > 0 ? (
              <div className={`${styles.sidebarCard} ${styles.summaryCard}`}>
                <h3 className={styles.sidebarHeading}>Resumen</h3>
                <ul className={styles.summaryList}>
                  {filasVisibles.map((f) => {
                    const v = local.puntajes[f.id];
                    const puntuada = v === 0 || notas.includes(v);
                    const esHeredada = heredadas.has(f.id);
                    const esReq = requeridas.has(f.id);
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          className={styles.summaryItemBtn}
                          onClick={() => irAFila(f.id, f.sujeto.comparsa.nombre)}
                        >
                          <span style={{ color: puntuada || esHeredada ? "var(--color-jurado-success)" : "var(--color-admin-muted)" }}>
                            {puntuada || esHeredada ? <IconoCheck size={16} /> : <IconoPendiente />}
                          </span>
                          <span>{f.rubro.nombre}{!esReq && !esHeredada ? " (Info)" : ""}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </aside>

          {/* Tarjetas de votación */}
          <div className={styles.mainCol}>
            <fieldset disabled={camposDeshabilitados} className={styles.fieldsetReset}>
              <legend className={styles.legendSrOnly}>Puntuaciones</legend>
              {filasVisibles.map(({ id, rubro, sujeto }) => {
                const comparsa = sujeto.comparsa.nombre;
                const participante = textoParticipante(rubro.nombre, comparsa, sujeto.nombre);

                if (heredadas.has(id)) {
                  return (
                    <article key={id} id={`fila-jurado-${id}`} className={`${styles.scoreCard} ${styles.scoreCardMuted}`}>
                      <div className={styles.scoreCardHeader}>
                        <div className={styles.scoreCardTitles}>
                          <p className={styles.comparsaLabel}>{comparsa}</p>
                          <h3 className={styles.rubroTitle}>{rubro.nombre}</h3>
                          {participante ? <p className={styles.participantSubtitle}>{participante}</p> : null}
                        </div>
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>Puntaje heredado (no editable)</span>
                      </div>
                    </article>
                  );
                }

                if (!requeridas.has(id)) {
                  return (
                    <article key={id} id={`fila-jurado-${id}`} className={`${styles.scoreCard} ${styles.scoreCardMuted}`}>
                      <div className={styles.scoreCardHeader}>
                        <div className={styles.scoreCardTitles}>
                          <p className={styles.comparsaLabel}>{comparsa}</p>
                          <h3 className={styles.rubroTitle}>{rubro.nombre}</h3>
                          {participante ? <p className={styles.participantSubtitle}>{participante}</p> : null}
                        </div>
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>Fila informativa</span>
                      </div>
                    </article>
                  );
                }

                const valor = local.puntajes[id];
                const tieneNota = notas.includes(valor);
                const ausente = valor === 0;
                const evaluada = tieneNota || ausente;

                return (
                  <div
                    key={id}
                    id={`fila-jurado-${id}`}
                    role="group"
                    aria-label={`${comparsa} · ${rubro.nombre}`}
                    className={`${styles.scoreCard} ${evaluada ? styles.scoreCardScored : ""}`}
                  >
                    <div className={styles.scoreCardHeader}>
                      <div className={styles.scoreCardTitles}>
                        <p className={styles.comparsaLabel}>{comparsa}</p>
                        <h3 className={styles.rubroTitle}>{rubro.nombre}</h3>
                        {participante ? <p className={styles.participantSubtitle}>{participante}</p> : null}
                      </div>
                      {evaluada ? (
                        <span className={`${styles.badge} ${ausente ? styles.badgeWarning : styles.badgeSuccess}`}>
                          <IconoCheck size={14} />
                          {ausente ? "No se presentó" : `${valor} pts`}
                        </span>
                      ) : (
                        <span className={`${styles.badge} ${styles.badgeNeutral}`}>Sin puntuar</span>
                      )}
                    </div>

                    <div className={styles.scaleGrid}>
                      {notas.map((nota) => {
                        const seleccionada = valor === nota;
                        return (
                          <button
                            key={nota}
                            type="button"
                            aria-pressed={seleccionada}
                            disabled={camposDeshabilitados}
                            className={`${styles.scoreTile} ${seleccionada ? styles.scoreTileSelected : ""}`}
                            onClick={() => void guardarCambio((actual) => puntuar(actual, planilla.versionId, requeridas, id, nota))}
                          >
                            {nota}
                          </button>
                        );
                      })}
                    </div>

                    <div className={styles.cardActionsRow}>
                      <button
                        type="button"
                        aria-pressed={ausente}
                        disabled={camposDeshabilitados}
                        className={`${styles.btnWarning} ${ausente ? styles.btnWarningActive : ""}`}
                        onClick={() => void guardarCambio((actual) => puntuar(actual, planilla.versionId, requeridas, id, 0))}
                      >
                        <IconoAlerta size={15} />
                        No se presentó
                      </button>

                      {evaluada ? (
                        <span className={`${styles.savedStrip} ${ausente ? styles.savedStripWarning : styles.savedStripSuccess}`}>
                          <IconoCheck size={16} />
                          {ausente ? "Ausencia guardada en borrador local" : "Guardado en borrador local"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </fieldset>
          </div>
        </div>
      )}

      {/* Pie de confirmación (sin subtotales acumulados) */}
      <div className={styles.footerCard}>
        <div>
          <p className={styles.bannerTitle}>
            {completa ? "Planilla lista para confirmar" : "Completá todos los puntajes requeridos para confirmar."}
          </p>
          <p className={styles.bannerBody}>
            {completa
              ? "Todas las comparsas requeridas están evaluadas. Confirmá para bloquear y enviar tu planilla."
              : "Podés ajustar cualquier nota antes del cierre definitivo."}
          </p>
        </div>

        <div className={styles.footerActions}>
          {!completa && primeraPendiente ? (
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => irAFila(primeraPendiente.id, primeraPendiente.sujeto.comparsa.nombre)}
            >
              Ir al próximo ítem pendiente
            </button>
          ) : null}
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!completa || escribiendo || anteriorSinVersion || prepararTraspaso}
            onClick={() => setRevisar(true)}
          >
            Confirmar planilla
          </button>
        </div>
      </div>

      {/* Modal de cierre definitivo (sin subtotales: solo ícono de completo) */}
      {revisar ? (
        <Modal title="Cierre definitivo de planilla" onClose={() => setRevisar(false)} showCloseButton>
          <div className={styles.modalBody}>
            <p className={styles.modalWarningText}>
              Si confirmás, ya no vas a poder editar los puntajes. Quedará pendiente hasta que el servidor confirme la recepción.
            </p>
            <ul className={styles.modalComparsaList}>
              {comparsasOrdenadas.map((grupo) => (
                <li key={grupo.nombre} className={styles.modalComparsaItem}>
                  <div>
                    <div className={styles.modalComparsaName}>{grupo.nombre}</div>
                    <div className={styles.modalComparsaCount}>
                      {grupo.requeridas > 0
                        ? `${grupo.completadas} de ${grupo.requeridas} ítems evaluados`
                        : "Sin ítems puntuables requeridos"}
                    </div>
                  </div>
                  <span className={`${styles.badge} ${styles.badgeSuccess}`}>
                    <IconoCheck size={14} />
                    Completa
                  </span>
                </li>
              ))}
            </ul>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnSecondary} disabled={escribiendo} onClick={() => setRevisar(false)}>
                Volver a editar
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={escribiendo}
                onClick={() => guardarCambio((actual) => confirmar(actual, planilla.versionId, planilla.filas, requeridas, local.puntajes), true)}
              >
                Guardar y bloquear
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Modal de traspaso a suplente */}
      {prepararTraspaso ? (
        <Modal title="Preparar traspaso a suplente" onClose={() => setPrepararTraspaso(false)} showCloseButton>
          <div className={styles.modalBody}>
            <p className={styles.modalWarningText}>
              Si bloqueás el borrador, ya no vas a poder editarlo ni confirmar la planilla desde este dispositivo.
            </p>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnSecondary} disabled={escribiendo} onClick={() => setPrepararTraspaso(false)}>
                Cancelar traspaso
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={escribiendo}
                onClick={() => void guardarTraspaso((actual) => bloquearBorradorParaTraspaso(actual, planilla.versionId, requeridas, local.puntajes))}
              >
                Bloquear y guardar borrador
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
