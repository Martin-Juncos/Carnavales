import { useEffect, useRef, useState } from "react";
import { guardarRespuestaRecepcion } from "./planilla-local.js";

const transitorios = new Set([429, 502, 503, 504]);
const maxIntentos = 3;

function acuseValido(cuerpo, envio) {
  return cuerpo?.estado === "RECIBIDA" && cuerpo.operationId === envio.operationId
    && cuerpo.asignacionId === envio.asignacionId
    && typeof cuerpo.recibidaEn === "string" && Number.isFinite(Date.parse(cuerpo.recibidaEn));
}

export function RecepcionPlanilla({ api, guardar, juradoId, planilla, local, setCarga, dispositivoId }) {
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
      operationId: local.operationId, asignacionId, versionId: local.versionId,
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
        respuesta = await api.recibirPlanillaJurado(envio,
          AbortSignal.any([controlador.signal, AbortSignal.timeout(6000)]));
      } catch {
        // Una desconexión o timeout puede ocurrir después de recibir la planilla.
      }
      if (controlador.signal.aborted) return;
      ocupado = false;
      if ((respuesta?.ok && acuseValido(respuesta.cuerpo, envio)) || respuesta?.status === 409) {
        detenido.current = true;
        const conflicto = respuesta.status === 409;
        try {
          const siguiente = await guardar([juradoId, asignacionId],
            (actual) => guardarRespuestaRecepcion(actual, local.operationId, conflicto ? null : respuesta.cuerpo));
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

  return (
    <>
      <p role="status"><strong>Pendiente de recepción</strong>. La planilla está bloqueada en este dispositivo.</p>
      {!verificable ? <p>No se puede enviar una planilla sin una versión verificable y una selección congelada.</p> :
        local.conflicto || estado === "conflicto" ? <p role="alert">El servidor rechazó el envío. La planilla sigue bloqueada; no se reintentará automáticamente.</p> :
        <>
          {estado === "error" ? <p>No se pudo obtener el acuse del servidor.</p> : null}
          {estado === "almacenamiento" ? <p>No se pudo guardar el acuse en este dispositivo.</p> : null}
          <button type="button" disabled={estado === "enviando"} onClick={() => {
            intentos.current = 0;
            detenido.current = false;
            setIntentoManual((anterior) => anterior + 1);
          }}>Reintentar ahora</button>
        </>}
    </>
  );
}
