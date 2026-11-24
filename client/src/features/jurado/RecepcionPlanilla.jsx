import { useEffect, useRef, useState } from "react";
import { guardarRespuestaRecepcion } from "./planilla-local.js";
import styles from "./PanelJurado.module.css";

const transitorios = new Set([429, 502, 503, 504]);
const maxIntentos = 3;

function acuseValido(cuerpo, envio) {
  return cuerpo?.estado === "RECIBIDA" && cuerpo.operationId === envio.operationId
    && cuerpo.asignacionId === envio.asignacionId
    && typeof cuerpo.recibidaEn === "string" && Number.isFinite(Date.parse(cuerpo.recibidaEn));
}

function IconoSinConexion() {
  return (
    <svg className={styles.icon} width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 10.5a7 7 0 0 1 9 0M9.8 13.5a3.5 3.5 0 0 1 4.4 0M12 16.5h.01M6.5 6.5l11 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconoConflicto() {
  return (
    <svg className={styles.icon} width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M12 7v6M12 16.5h.01" stroke="var(--color-white)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function RecepcionPlanilla({ api, guardar, juradoId, planilla, local, setCarga, dispositivoId, onVolver }) {
  const [intentoManual, setIntentoManual] = useState(0);
  const [estado, setEstado] = useState("pendiente");
  const intentos = useRef(0);
  const detenido = useRef(false);
  const { asignacionId, recepcionHabilitada, versionId } = planilla;
  const verificable = recepcionHabilitada && local.versionId && local.versionId === versionId;

  useEffect(() => {
    if (!verificable || local.conflicto || detenido.current) return;
    const controlador = new AbortController();
    let ocupado = false;
    let temporizador;
    const envio = {
      operationId: local.operationId,
      asignacionId,
      versionId: local.versionId,
      ...(dispositivoId && { dispositivoId }),
      puntajes: Object.entries(local.puntajes).map(([filaId, valor]) => ({ filaId, valor, noPresentado: valor === 0 })),
    };
    async function enviar() {
      if (ocupado || detenido.current || controlador.signal.aborted || intentos.current >= maxIntentos) return;
      if (navigator.onLine === false) return;
      ocupado = true;
      clearTimeout(temporizador);
      setEstado("enviando");
      intentos.current += 1;
      let respuesta;
      try {
        respuesta = await api.recibirPlanillaJurado(
          envio,
          AbortSignal.any([controlador.signal, AbortSignal.timeout(6000)]),
        );
      } catch {
        // Una desconexión o timeout puede ocurrir después de recibir la planilla.
      }
      if (controlador.signal.aborted) return;
      ocupado = false;
      if ((respuesta?.ok && acuseValido(respuesta.cuerpo, envio)) || respuesta?.status === 409) {
        detenido.current = true;
        const conflicto = respuesta.status === 409;
        try {
          const siguiente = await guardar(
            [juradoId, asignacionId],
            (actual) => guardarRespuestaRecepcion(actual, local.operationId, conflicto ? null : respuesta.cuerpo),
          );
          if (!controlador.signal.aborted && siguiente) {
            setCarga((previa) => ({ ...previa, local: siguiente }));
          }
        } catch {
          if (!controlador.signal.aborted) setEstado(conflicto ? "conflicto" : "almacenamiento");
        }
      } else {
        setEstado("error");
        if ((!respuesta || transitorios.has(respuesta.status)) && intentos.current < maxIntentos) {
          temporizador = setTimeout(enviar, 200 * 2 ** (intentos.current - 1) * (1 + Math.random()));
        } else {
          intentos.current = maxIntentos;
        }
      }
    }
    function alConectar() { void enviar(); }
    // StrictMode cancela la primera suscripción sin consumir un intento.
    queueMicrotask(alConectar);
    window.addEventListener("online", alConectar);
    return () => {
      controlador.abort();
      clearTimeout(temporizador);
      window.removeEventListener("online", alConectar);
    };
  }, [api, asignacionId, dispositivoId, guardar, intentoManual, juradoId, local, setCarga, verificable]);

  const esConflicto = Boolean(local.conflicto || estado === "conflicto");
  const claseTarjeta = esConflicto
    ? `${styles.stateCard} ${styles.stateCardDanger}`
    : `${styles.stateCard} ${styles.stateCardWarning}`;

  return (
    <article className={claseTarjeta}>
      <div className={styles.stateHeader}>
        <div className={styles.stateHeadingGroup} style={{ color: esConflicto ? "var(--color-jurado-danger)" : "var(--color-jurado-warning)" }}>
          {esConflicto ? <IconoConflicto /> : <IconoSinConexion />}
          <h3 className={styles.stateHeading}>{esConflicto ? "Conflicto de recepción" : "Envío de planilla"}</h3>
        </div>
        <span className={`${styles.badge} ${esConflicto ? styles.badgeDanger : styles.badgeWarning}`}>
          {esConflicto ? "Reintentos detenidos" : estado === "enviando" ? "Enviando…" : "Confirmada localmente"}
        </span>
      </div>

      <p role="status" className={styles.stateCopy}>
        <strong>Pendiente de recepción</strong>. La planilla está bloqueada en este dispositivo.
      </p>

      {!verificable ? (
        <p className={styles.stateCopy}>
          No se puede enviar una planilla sin una versión verificable y una selección congelada.
        </p>
      ) : esConflicto ? (
        <p role="alert" className={`${styles.banner} ${styles.bannerAlert}`}>
          El servidor rechazó el envío. La planilla sigue bloqueada; no se reintentará automáticamente.
        </p>
      ) : (
        <>
          {estado === "error" ? (
            <p className={`${styles.banner} ${styles.bannerWarning}`}>
              No se pudo obtener el acuse del servidor.
            </p>
          ) : null}
          {estado === "almacenamiento" ? (
            <p className={`${styles.banner} ${styles.bannerAlert}`}>
              No se pudo guardar el acuse en este dispositivo.
            </p>
          ) : null}
        </>
      )}

      {local.operationId ? (
        <div className={styles.stateMetaBox}>
          ID de operación: {local.operationId}
        </div>
      ) : null}

      <div className={styles.stateActions}>
        {verificable && !esConflicto ? (
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={estado === "enviando"}
            onClick={() => {
              intentos.current = 0;
              detenido.current = false;
              setIntentoManual((anterior) => anterior + 1);
            }}
          >
            Reintentar ahora
          </button>
        ) : null}
        {onVolver ? (
          <button type="button" className={styles.btnSecondary} onClick={onVolver}>
            Volver a las asignaciones
          </button>
        ) : null}
      </div>
    </article>
  );
}
