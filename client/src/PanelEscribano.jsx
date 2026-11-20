import { useEffect, useState } from "react";
import { Modal } from "./components/Modal/Modal.jsx";

const bloqueos = {
  noche_cerrada: "Noche cerrada.",
  noche_no_abierta: "La noche no está abierta.",
  instantanea_no_disponible: "No hay un registro verificable de las planillas esperadas.",
  sin_planillas_esperadas: "No se puede cerrar una noche sin planillas esperadas.",
  planillas_pendientes: "Hay planillas esperadas que el servidor todavía no recibió.",
};

export function PanelEscribano({ api }) {
  const [noches, setNoches] = useState(null);
  const [seleccion, setSeleccion] = useState(null);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);
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
  return (
    <section aria-labelledby="titulo-cierre-noches">
      <h2 id="titulo-cierre-noches">Cierre de noche</h2>
      {error ? <>
        <p role="alert">{error}</p>
        <button type="button" onClick={() => { setError(""); setIntento(intento + 1); }}>Reintentar</button>
      </> : !noches ? <p role="status">Cargando noches…</p> : !noches.length ? <p>No hay noches competitivas.</p> : (
        <>
          <ul>{noches.map((item) => <li key={item.id}>
            <button type="button" aria-pressed={seleccion === item.id} onClick={() => setSeleccion(item.id)}>
              {item.edicion.nombre} · {item.nombre}
            </button>
          </li>)}</ul>
          {noche && <CierreNoche key={noche.id} api={api} noche={noche}
            alCerrar={() => setNoches((actual) => actual.map((item) =>
              item.id === noche.id ? { ...item, estado: "CLOSED" } : item))} />}
        </>
      )}
    </section>
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
    <section>
      <h3>{noche.nombre}</h3>
      {cerrada ? <p role="status">Noche cerrada.</p> : <>
        {error ? <p role="alert">{error}</p> : <p role="status">{estado
          ? (estado.puedeCerrar ? "La noche puede cerrarse." : bloqueos[estado.motivo] ?? "La noche no puede cerrarse.")
          : "Consultando estado…"}</p>}
        <button type="button" disabled={enviando || confirmar} onClick={() => {
          setEstado(null);
          setError("");
          setIntento(intento + 1);
        }}>Actualizar estado</button>{" "}
        <button type="button" disabled={!estado?.puedeCerrar || enviando} onClick={() => setConfirmar(true)}>
          Cerrar noche
        </button>
        {confirmar && <Modal title="Confirmar cierre de noche" onClose={() => { if (!enviando) setConfirmar(false); }}>
          <p>Vas a cerrar {noche.nombre}. Esta acción no se puede deshacer.</p>
          <button type="button" disabled={enviando} onClick={() => void cerrar()}>Confirmar cierre</button>{" "}
          <button type="button" disabled={enviando} onClick={() => setConfirmar(false)}>Cancelar</button>
        </Modal>}
      </>}
    </section>
  );
}
