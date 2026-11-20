import { useEffect, useRef, useState } from "react";
import {
  bloquearBorradorParaTraspaso, borradorVacio, confirmar, esTraspaso, guardarAcuseTraspaso,
  notas, planillaCompleta, puntuar, sePuedeVincularBorrador, vincularBorrador,
} from "./planilla-local.js";
import { RecepcionPlanilla } from "./RecepcionPlanilla.jsx";

export function PanelJurado({ api, juradoId, guardar }) {
  const [contextos, setContextos] = useState(null);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);
  const [seleccion, setSeleccion] = useState(null);

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

  return (
    <section aria-labelledby="titulo-planilla">
      <h2 id="titulo-planilla">Planilla del jurado</h2>
      {seleccion ? (
        <>
          <button type="button" onClick={() => setSeleccion(null)}>Volver a las asignaciones</button>
          <Planilla key={seleccion.asignacionId} api={api} juradoId={juradoId} guardar={guardar} contexto={seleccion} />
        </>
      ) : error ? (
        <>
          <p role="alert">No se pudieron consultar las asignaciones. Revisá la conexión.</p>
          <button type="button" onClick={() => { setError(false); setIntento(intento + 1); }}>Volver a consultar</button>
        </>
      ) : !contextos ? (
        <p role="status">Cargando asignaciones…</p>
      ) : contextos.length === 0 ? (
        <p>No tenés asignaciones activas.</p>
      ) : (
        <ul>{contextos.map((contexto) => (
          <li key={contexto.asignacionId}>
            <button type="button" onClick={() => setSeleccion(contexto)}>
              {contexto.noche.edicion.nombre} · {contexto.noche.nombre} · {contexto.especialidad.nombre}
            </button>
          </li>
        ))}</ul>
      )}
    </section>
  );
}

function Planilla({ api, juradoId, contexto, guardar }) {
  const { asignacionId } = contexto;
  const [carga, setCarga] = useState(null);
  const [error, setError] = useState("");
  const [escribiendo, setEscribiendo] = useState(false);
  const [revisar, setRevisar] = useState(false);
  const [prepararTraspaso, setPrepararTraspaso] = useState(false);
  const canal = useRef(null);

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
    if (avisos) avisos.onmessage = ({ data }) => {
      if (autorizado && data?.[0] === juradoId && data?.[1] === asignacionId) void actualizarLocal();
    };
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

  async function guardarCambio(cambiar, esConfirmacion = false) {
    setEscribiendo(true);
    setError("");
    try {
      const clave = [juradoId, asignacionId];
      const local = await guardar(clave, cambiar);
      setCarga((previa) => previa.local.estado === "borrador" ? { ...previa, local } : previa);
      if (local.estado === "pendiente" || esTraspaso(local)) canal.current?.postMessage(clave);
      else if (esConfirmacion) {
        setRevisar(false);
        setError("La planilla cambió en otra pestaña. Revisá los puntajes antes de confirmar.");
      }
    } catch {
      setError("No se pudo guardar en este dispositivo. Volvé a intentarlo.");
    } finally {
      setEscribiendo(false);
    }
  }

  async function guardarTraspaso(preparar) {
    const clave = [juradoId, asignacionId];
    setEscribiendo(true);
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
        operationId, versionId, dispositivoId: carga.dispositivoId,
        puntajes: Object.entries(puntajes).map(([filaId, valor]) => ({ filaId, valor, noPresentado: valor === 0 })),
      });
      if (!ok || cuerpo?.estado !== "BORRADOR_CONGELADO" || cuerpo.asignacionId !== asignacionId
        || cuerpo.operationId !== operationId
        || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(cuerpo.confirmacionId ?? "")) throw new Error();
      const confirmado = await api.confirmarAcuseTraspaso(asignacionId, {
        operationId, dispositivoId: carga.dispositivoId, confirmacionId: cuerpo.confirmacionId,
      });
      if (!confirmado.ok || confirmado.cuerpo?.estado !== "TRASPASO_CONFIRMADO"
        || confirmado.cuerpo.asignacionId !== asignacionId || confirmado.cuerpo.operationId !== operationId) throw new Error();
      const siguiente = await guardar(clave, (actual) => guardarAcuseTraspaso(actual, operationId));
      setCarga((previa) => ({ ...previa, local: siguiente }));
      canal.current?.postMessage(clave);
    } catch {
      setError("No se pudo guardar el borrador para el traspaso. Volvé a intentarlo con conexión.");
    } finally {
      setEscribiendo(false);
    }
  }

  if (!carga) return error ? <p role="alert">{error}</p> : <p role="status">Cargando planilla…</p>;
  const { planilla, local, dispositivoId } = carga;
  const titulo = <h3>{planilla.noche.nombre} · {planilla.especialidad.nombre}</h3>;
  if (local.estado === "recibida") return <>{titulo}<p role="status"><strong>Recibida</strong> por el servidor.</p></>;
  if (esTraspaso(local)) return (
    <>
      {titulo}
      <p role="status">{local.estado === "traspaso_guardado"
        ? "Borrador guardado en el servidor. La planilla quedó bloqueada."
        : "Borrador pendiente de guardar para el traspaso."}</p>
      {error && <p role="alert">{error}</p>}
      {local.estado === "traspaso_pendiente" && (
        <button type="button" disabled={escribiendo || !dispositivoId} onClick={() => void guardarTraspaso()}>
          Reintentar guardar borrador
        </button>
      )}
    </>
  );
  if (local.estado === "pendiente") return (
    <>
      {titulo}
      <RecepcionPlanilla api={api} guardar={guardar} juradoId={juradoId} planilla={planilla}
        local={local} setCarga={setCarga} dispositivoId={dispositivoId} />
    </>
  );
  if (planilla.noche.estado !== "OPEN") return (
    <>{titulo}<p>La noche no está abierta para puntuar.</p></>
  );
  if (!planilla.recepcionHabilitada || !planilla.versionId || local.versionId && local.versionId !== planilla.versionId) {
    return (
      <>
        {titulo}
        <p>Esta planilla no tiene una versión verificable para enviarse. No se modificaron los datos locales.</p>
        <ul>{planilla.filas.map(({ id, rubro, sujeto }) => (
          <li key={id}>{rubro.nombre} · {sujeto.nombre ?? sujeto.comparsa.nombre}</li>
        ))}</ul>
      </>
    );
  }

  const rubrosPadre = new Set(planilla.filas.map(({ rubro }) => rubro.padreId).filter(Boolean));
  const heredadas = new Set(planilla.filasHeredadas ?? []);
  const requeridas = new Set(planilla.filas
    .filter(({ id, evaluable, rubro }) => evaluable && !heredadas.has(id) && !rubrosPadre.has(rubro.id))
    .map(({ id }) => id));
  const completa = planillaCompleta(planilla.filas, requeridas, local.puntajes);
  const anteriorSinVersion = local !== borradorVacio && !local.versionId;
  const puedeVincular = anteriorSinVersion && sePuedeVincularBorrador(local, requeridas);
  return (
    <>
      {titulo}
      <p>Podés completar esta planilla sin conexión mientras siga abierta. Para volver a abrirla, necesitás conexión.</p>
      {error ? <p role="alert">{error}</p> : null}
      <fieldset disabled={escribiendo || revisar || anteriorSinVersion || prepararTraspaso}>
        <legend>Puntuaciones</legend>
        {planilla.filas.map(({ id, rubro, sujeto }) => {
          const comparsa = sujeto.comparsa.nombre;
          const nombre = `${rubro.nombre} · ${sujeto.nombre ? `${sujeto.nombre} (${comparsa})` : comparsa}`;
          if (heredadas.has(id)) return <p key={id}>{nombre} — Puntaje heredado (no editable)</p>;
          if (!requeridas.has(id)) return <p key={id}>{nombre} — Fila informativa</p>;
          return (
            <p key={id}>
              <label>
                {nombre}{" "}
                <select value={local.puntajes[id] ?? ""} onChange={({ target: { value } }) => {
                  if (value !== "") void guardarCambio((actual) => puntuar(actual, planilla.versionId, requeridas, id, Number(value)));
                }}>
                  <option value="" disabled>Sin puntuar</option>
                  <optgroup label="Puntaje">{notas.map((nota) => <option key={nota}>{nota}</option>)}</optgroup>
                  <optgroup label="Ausencia"><option value="0">No se presentó</option></optgroup>
                </select>
              </label>
            </p>
          );
        })}
      </fieldset>
      {puedeVincular ? (
        <>
          <p>Este borrador se guardó antes de registrar la versión. Revisá los puntajes que ves contra estas filas antes de vincularlo al reglamento de la noche.</p>
          <button type="button" disabled={escribiendo} onClick={() => guardarCambio(
            (actual) => vincularBorrador(actual, planilla.versionId, requeridas, local.puntajes),
          )}>Vincular borrador revisado</button>
        </>
      ) : anteriorSinVersion ? <p>El borrador anterior contiene puntajes que no coinciden con estas filas. Se conservó sin cambios.</p> : null}
      {!planilla.filas.length ? <p>La planilla no tiene filas para confirmar.</p> : !requeridas.size ? (
        <p>{heredadas.size ? "No quedan puntajes pendientes. Podés confirmar la planilla."
          : "Esta planilla solo tiene filas informativas. Podés confirmarla sin puntajes."}</p>
      ) : (
        <p>{completa ? "Planilla completa." : "Completá todos los puntajes requeridos para confirmar."}</p>
      )}
      {dispositivoId && !anteriorSinVersion && !revisar && (prepararTraspaso ? (
        <section aria-label="Confirmación de traspaso">
          <p>Si bloqueás el borrador, ya no vas a poder editarlo ni confirmar la planilla desde este dispositivo.</p>
          <button type="button" disabled={escribiendo} onClick={() => void guardarTraspaso(
            (actual) => bloquearBorradorParaTraspaso(actual, planilla.versionId, requeridas, local.puntajes),
          )}>Bloquear y guardar borrador</button>{" "}
          <button type="button" disabled={escribiendo} onClick={() => setPrepararTraspaso(false)}>Cancelar traspaso</button>
        </section>
      ) : (
        <button type="button" disabled={escribiendo} onClick={() => setPrepararTraspaso(true)}>Preparar traspaso</button>
      ))}
      {anteriorSinVersion || prepararTraspaso ? null : revisar ? (
        <section aria-label="Confirmación local">
          <p>Si confirmás, ya no vas a poder editar los puntajes. Quedará pendiente hasta que el servidor confirme la recepción.</p>
          <button type="button" disabled={escribiendo} onClick={() =>
            guardarCambio((actual) => confirmar(actual, planilla.versionId, planilla.filas, requeridas, local.puntajes), true)}>
            Guardar y bloquear
          </button>{" "}
          <button type="button" disabled={escribiendo} onClick={() => setRevisar(false)}>Volver a editar</button>
        </section>
      ) : (
        <button type="button" disabled={!completa || escribiendo} onClick={() => setRevisar(true)}>
          Confirmar planilla
        </button>
      )}
    </>
  );
}
