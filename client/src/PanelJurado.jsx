import { useEffect, useRef, useState } from "react";
import { borradorVacio, confirmar, notas, planillaCompleta, puntuar } from "./planilla-local.js";

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
        if (vigente && local?.estado === "pendiente") {
          setCarga((previa) => previa && { ...previa, local });
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
        if (vigente) {
          setCarga({ planilla: cuerpo, local: local ?? borradorVacio });
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
      setCarga((previa) => previa.local.estado === "pendiente" ? previa : { ...previa, local });
      if (local.estado === "pendiente") canal.current?.postMessage(clave);
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

  if (!carga) return error ? <p role="alert">{error}</p> : <p role="status">Cargando planilla…</p>;
  const { planilla, local } = carga;
  const titulo = <h3>{planilla.noche.nombre} · {planilla.especialidad.nombre}</h3>;
  if (local.estado === "pendiente") return (
    <>
      {titulo}
      <p role="status"><strong>Pendiente de recepción</strong>. La planilla quedó bloqueada en este dispositivo. El servidor todavía no la recibió.</p>
    </>
  );
  if (planilla.noche.estado !== "OPEN") return (
    <>{titulo}<p>La noche no está abierta para puntuar.</p></>
  );

  const rubrosPadre = new Set(planilla.filas.map(({ rubro }) => rubro.padreId).filter(Boolean));
  const requeridas = new Set(planilla.filas
    .filter(({ evaluable, rubro }) => evaluable && !rubrosPadre.has(rubro.id))
    .map(({ id }) => id));
  const completa = planillaCompleta(planilla.filas, requeridas, local.puntajes);
  return (
    <>
      {titulo}
      <p>Podés completar esta planilla sin conexión mientras siga abierta. Para volver a abrirla, necesitás conexión.</p>
      {error ? <p role="alert">{error}</p> : null}
      <fieldset disabled={escribiendo || revisar}>
        <legend>Puntuaciones</legend>
        {planilla.filas.map(({ id, rubro, sujeto }) => {
          const comparsa = sujeto.comparsa.nombre;
          const nombre = `${rubro.nombre} · ${sujeto.nombre ? `${sujeto.nombre} (${comparsa})` : comparsa}`;
          if (!requeridas.has(id)) return <p key={id}>{nombre} — Fila informativa</p>;
          return (
            <p key={id}>
              <label>
                {nombre}{" "}
                <select value={local.puntajes[id] ?? ""} onChange={({ target: { value } }) => {
                  if (value !== "") void guardarCambio((actual) => puntuar(actual, requeridas, id, Number(value)));
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
      {!planilla.filas.length ? <p>La planilla no tiene filas para confirmar.</p> : !requeridas.size ? (
        <p>Esta planilla solo tiene filas informativas. Podés confirmarla sin puntajes.</p>
      ) : (
        <p>{completa ? "Planilla completa." : "Completá todos los puntajes requeridos para confirmar."}</p>
      )}
      {revisar ? (
        <section aria-label="Confirmación local">
          <p>Si confirmás, ya no vas a poder editar los puntajes. Esto no envía la planilla al servidor.</p>
          <button type="button" disabled={escribiendo} onClick={() =>
            guardarCambio((actual) => confirmar(actual, planilla.filas, requeridas, local.puntajes), true)}>
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
