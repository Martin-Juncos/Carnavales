import { useEffect, useState } from "react";
import { Modal } from "./components/Modal/Modal.jsx";

// Muestra el mensaje de la API junto con su código para que se pueda identificar
// el motivo; si no llega ninguno, usa uno genérico.
function mensajeDeError(resultado) {
  const mensaje = resultado.cuerpo?.mensaje ?? "No se pudo completar la operación. Intentá de nuevo.";
  const codigo = resultado.cuerpo?.error;
  return codigo ? `${mensaje} (${codigo})` : mensaje;
}

// Identificador legible de una fila, para que la confirmación diga qué se va a cambiar.
function nombreDe(asignacion) {
  return `${asignacion.jurado.nombre} · ${asignacion.noche.nombre} · ${asignacion.especialidad.nombre}`;
}

function Selector({ etiqueta, valor, onChange, opciones, placeholder }) {
  return (
    <label>
      {etiqueta}
      <select value={valor} onChange={(evento) => onChange(evento.target.value)}>
        {placeholder && <option value="">{placeholder}</option>}
        {opciones.map((opcion) => (
          <option key={opcion.value} value={opcion.value}>
            {opcion.texto}
          </option>
        ))}
      </select>
    </label>
  );
}

// Modal de confirmación compartido por las tres operaciones sensibles. Mientras
// se envía, mantiene el diálogo abierto y deshabilita las acciones como feedback.
function ModalConfirmacion({ titulo, alConfirmar, alCancelar, enviando, deshabilitar = false, children }) {
  return (
    <Modal title={titulo} onClose={enviando ? () => {} : alCancelar}>
      {children}
      <button type="button" onClick={alConfirmar} disabled={enviando || deshabilitar}>
        {enviando ? "Enviando…" : titulo}
      </button>{" "}
      <button type="button" onClick={alCancelar} disabled={enviando}>
        Cancelar
      </button>
    </Modal>
  );
}

// Panel administrativo de asignaciones. La API es la autoridad: si responde 403
// no se muestra nada. Toda operación sensible pasa por un modal de confirmación;
// cancelar no produce ninguna petición.
export function PanelAsignaciones({ api }) {
  const [datosPanel, setDatosPanel] = useState(null);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [mensaje, setMensaje] = useState("");
  // null = aún no eligió (se muestra la primera noche); "" = ver todas.
  const [nocheSeleccionada, setNocheSeleccionada] = useState(null);
  const [alta, setAlta] = useState({ juradoId: "", nocheId: "", especialidadId: "" });
  const [confirmacion, setConfirmacion] = useState(null);
  const [reemplazo, setReemplazo] = useState({ juradoId: "", especialidadId: "" });
  const [suplentes, setSuplentes] = useState(["", ""]);
  const [enviando, setEnviando] = useState(false);
  const [recargar, setRecargar] = useState(0);

  // Las cuatro consultas son independientes, así que van en paralelo.
  useEffect(() => {
    let cancelado = false;
    // Un 403 pudo ser transitorio: cada recarga vuelve a consultar al API.
    setSinPermiso(false);
    Promise.all([api.listarJurados(), api.listarNoches(), api.listarEspecialidades(), api.listarAsignaciones()])
      .then(([jurados, noches, especialidades, asignaciones]) => {
        if (cancelado) return;
        const respuestas = [jurados, noches, especialidades, asignaciones];
        if (respuestas.some((respuesta) => respuesta.status === 403)) {
          setSinPermiso(true);
          return;
        }
        const fallida = respuestas.find((respuesta) => !respuesta.ok);
        if (fallida) {
          setMensaje(mensajeDeError(fallida));
          return;
        }
        setDatosPanel({
          jurados: jurados.cuerpo.items,
          noches: noches.cuerpo.items,
          especialidades: especialidades.cuerpo.items,
          asignaciones: asignaciones.cuerpo.items,
        });
      })
      .catch(() => {
        if (!cancelado) setMensaje("No se pudo cargar el catálogo de asignaciones.");
      });
    return () => {
      cancelado = true;
    };
  }, [api, recargar]);

  if (sinPermiso) {
    return null;
  }

  // La noche en vista se deriva de la selección o de la primera disponible: no
  // se duplica en estado ni se sincroniza con un efecto.
  const nocheEnVista =
    nocheSeleccionada === null ? (datosPanel?.noches?.[0]?.id ?? "") : nocheSeleccionada;
  const asignacionesVisibles = datosPanel
    ? datosPanel.asignaciones.filter(
        (asignacion) => !nocheEnVista || asignacion.noche.id === nocheEnVista,
      )
    : [];
  const opcionesJurado = (datosPanel?.jurados ?? []).map((jurado) => ({ value: jurado.id, texto: jurado.nombre }));
  const opcionesNoche = (datosPanel?.noches ?? []).map((noche) => ({
    value: noche.id,
    texto: `${noche.nombre} (${noche.estado}) · ${noche.edicion.nombre}`,
  }));
  const opcionesEspecialidad = (datosPanel?.especialidades ?? [])
    .filter((especialidad) => especialidad.activa)
    .map((especialidad) => ({ value: especialidad.id, texto: `${especialidad.nombre} (${especialidad.codigo})` }));

  function abrirReemplazo(asignacion) {
    // Si el jurado perdió el rol o la especialidad está inactiva, no están en el
    // catálogo: se deja el campo vacío para obligar a elegir una opción válida.
    setReemplazo({
      juradoId: opcionesJurado.some((opcion) => opcion.value === asignacion.jurado.id)
        ? asignacion.jurado.id
        : "",
      especialidadId: opcionesEspecialidad.some((opcion) => opcion.value === asignacion.especialidad.id)
        ? asignacion.especialidad.id
        : "",
    });
    setConfirmacion({ tipo: "reemplazo", asignacion });
  }

  async function confirmar() {
    if (enviando || !confirmacion) return;
    setEnviando(true);
    setMensaje("");
    let resultado;
    let exito;
    try {
      if (confirmacion.tipo === "alta") {
        resultado = await api.crearAsignacion(alta.juradoId, alta.nocheId, alta.especialidadId);
        exito = "Asignación creada.";
      } else if (confirmacion.tipo === "revocacion") {
        resultado = await api.revocarAsignacion(confirmacion.asignacion.id);
        exito = "Asignación revocada.";
      } else if (confirmacion.tipo === "registroSuplentes") {
        resultado = await api.registrarSuplentes(confirmacion.asignacion.id, suplentes);
        exito = "Suplentes registrados.";
      } else if (confirmacion.tipo === "activarSuplente") {
        resultado = await api.activarSuplente(confirmacion.asignacion.id, suplentes[0]);
        exito = "Suplente activado.";
      } else {
        resultado = await api.reemplazarAsignacion(
          confirmacion.asignacion.id,
          reemplazo.juradoId,
          reemplazo.especialidadId,
        );
        exito = "Asignación reemplazada.";
      }
    } catch {
      resultado = { ok: false };
    }
    setEnviando(false);
    setConfirmacion(null);
    setMensaje(resultado.ok ? exito : mensajeDeError(resultado));
    if (resultado.ok) {
      setAlta({ juradoId: "", nocheId: "", especialidadId: "" });
      setRecargar((n) => n + 1);
    }
  }

  return (
    <section>
      <h2>Asignaciones de jurado</h2>

      {datosPanel === null && mensaje === "" && <p>Cargando asignaciones…</p>}
      {mensaje && <p role="status">{mensaje}</p>}

      {datosPanel && (
        <>
          <label>
            Noche en vista
            <select value={nocheEnVista} onChange={(evento) => setNocheSeleccionada(evento.target.value)}>
              <option value="">Todas</option>
              {opcionesNoche.map((opcion) => (
                <option key={opcion.value} value={opcion.value}>
                  {opcion.texto}
                </option>
              ))}
            </select>
          </label>

          <h3>Nueva asignación</h3>
          <form
            onSubmit={(evento) => {
              evento.preventDefault();
              setConfirmacion({ tipo: "alta" });
            }}
          >
            <Selector
              etiqueta="Jurado"
              valor={alta.juradoId}
              onChange={(juradoId) => setAlta((valores) => ({ ...valores, juradoId }))}
              opciones={opcionesJurado}
              placeholder="Elegir jurado"
            />
            <Selector
              etiqueta="Noche"
              valor={alta.nocheId}
              onChange={(nocheId) => setAlta((valores) => ({ ...valores, nocheId }))}
              opciones={opcionesNoche}
              placeholder="Elegir noche"
            />
            <Selector
              etiqueta="Especialidad"
              valor={alta.especialidadId}
              onChange={(especialidadId) => setAlta((valores) => ({ ...valores, especialidadId }))}
              opciones={opcionesEspecialidad}
              placeholder="Elegir especialidad"
            />
            <button type="submit" disabled={!alta.juradoId || !alta.nocheId || !alta.especialidadId}>
              Asignar jurado
            </button>
          </form>

          <h3>Cobertura</h3>
          {asignacionesVisibles.length === 0 ? (
            <p>No hay asignaciones para esta noche.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Jurado</th>
                  <th>Noche</th>
                  <th>Especialidad</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {asignacionesVisibles.map((asignacion) => (
                  <tr key={asignacion.id}>
                    <td>{asignacion.jurado.nombre}</td>
                    <td>{asignacion.noche.nombre}</td>
                    <td>{asignacion.especialidad.nombre}</td>
                    <td>{asignacion.estado}</td>
                    <td>
                      {asignacion.estado === "ACTIVA" && !asignacion.suplencia && (
                        <>
                          <button type="button" onClick={() => abrirReemplazo(asignacion)}>
                            Reemplazar
                          </button>{" "}
                          <button
                            type="button"
                            onClick={() => setConfirmacion({ tipo: "revocacion", asignacion })}
                          >
                            Revocar
                          </button>
                          {asignacion.noche.estado === "DRAFT" && (
                            <button type="button" onClick={() => {
                              setSuplentes(["", ""]);
                              setConfirmacion({ tipo: "registroSuplentes", asignacion });
                            }}>Registrar suplentes</button>
                          )}
                        </>
                      )}
                      {asignacion.estado === "ACTIVA" && asignacion.suplencia && (
                        asignacion.suplencia.abiertaParaEditar
                          ? <span>Planilla abierta para editar. Relevo directo bloqueado.</span>
                          : asignacion.noche.estado !== "CLOSED" && (
                            <button type="button" onClick={() => {
                              setSuplentes(["", ""]);
                              setConfirmacion({ tipo: "activarSuplente", asignacion });
                            }}>Activar suplente</button>
                          )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {confirmacion?.tipo === "alta" && (
            <ModalConfirmacion
              titulo="Confirmar alta"
              alConfirmar={confirmar}
              alCancelar={() => setConfirmacion(null)}
              enviando={enviando}
            >
              <p>
                Asignar a {opcionesJurado.find((opcion) => opcion.value === alta.juradoId)?.texto} en{" "}
                {opcionesNoche.find((opcion) => opcion.value === alta.nocheId)?.texto} con{" "}
                {opcionesEspecialidad.find((opcion) => opcion.value === alta.especialidadId)?.texto}.
              </p>
            </ModalConfirmacion>
          )}

          {confirmacion?.tipo === "revocacion" && (
            <ModalConfirmacion
              titulo="Confirmar revocación"
              alConfirmar={confirmar}
              alCancelar={() => setConfirmacion(null)}
              enviando={enviando}
            >
              <p>Revocar la asignación de {nombreDe(confirmacion.asignacion)}.</p>
            </ModalConfirmacion>
          )}

          {["registroSuplentes", "activarSuplente"].includes(confirmacion?.tipo) && (() => {
            const { asignacion, tipo } = confirmacion;
            const registrar = tipo === "registroSuplentes";
            const opciones = opcionesJurado.filter(({ value }) => value !== asignacion.jurado.id
              && (registrar || asignacion.suplencia.suplenteIds.includes(value)));
            return (
              <ModalConfirmacion
                titulo={registrar ? "Registrar suplentes" : "Activar suplente"}
                alConfirmar={confirmar}
                alCancelar={() => setConfirmacion(null)}
                enviando={enviando}
                deshabilitar={!suplentes[0] || (registrar && (!suplentes[1] || suplentes[0] === suplentes[1]))}
              >
                <p>{nombreDe(asignacion)}</p>
                <Selector etiqueta={registrar ? "Primer suplente" : "Suplente"} valor={suplentes[0]}
                  onChange={(id) => setSuplentes(([_, segundo]) => [id, segundo])}
                  opciones={opciones} placeholder="Elegir suplente" />
                {registrar && <Selector etiqueta="Segundo suplente" valor={suplentes[1]}
                  onChange={(id) => setSuplentes(([primero]) => [primero, id])}
                  opciones={opciones.filter(({ value }) => value !== suplentes[0])} placeholder="Elegir suplente" />}
              </ModalConfirmacion>
            );
          })()}

          {confirmacion?.tipo === "reemplazo" && (
            <ModalConfirmacion
              titulo="Confirmar reemplazo"
              alConfirmar={confirmar}
              alCancelar={() => setConfirmacion(null)}
              enviando={enviando}
              deshabilitar={!reemplazo.juradoId || !reemplazo.especialidadId}
            >
              <p>Reemplazar la asignación de {nombreDe(confirmacion.asignacion)}.</p>
              <Selector
                etiqueta="Jurado"
                valor={reemplazo.juradoId}
                onChange={(juradoId) => setReemplazo((valores) => ({ ...valores, juradoId }))}
                opciones={opcionesJurado}
                placeholder="Elegir jurado"
              />
              <Selector
                etiqueta="Especialidad"
                valor={reemplazo.especialidadId}
                onChange={(especialidadId) => setReemplazo((valores) => ({ ...valores, especialidadId }))}
                opciones={opcionesEspecialidad}
                placeholder="Elegir especialidad"
              />
            </ModalConfirmacion>
          )}
        </>
      )}
    </section>
  );
}
