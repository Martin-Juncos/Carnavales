import { useEffect, useState } from "react";
import { etiquetaDeRol, roles } from "../../../../../shared/utils/roles.js";
import { paginasTotales } from "../../../../../shared/utils/paginacion.js";

// Tamaño de página del listado. Debe respetar el máximo de la API (100).
const limite = 20;
const estados = ["", "pendiente", "vencida", "aceptada", "revocada"];

// Mensajes de la API (campo mensaje) para errores de negocio; si no llega ninguno, uno genérico.
function mensajeDeError(resultado) {
  return resultado.cuerpo?.mensaje ?? "No se pudo completar la operación. Intentá de nuevo.";
}

// Panel administrativo de invitaciones: invitar, filtrar, reenviar y revocar.
// La API decide quién es administrador: si responde 403, el panel no se muestra.
export function PanelInvitaciones({ api }) {
  const [pagina, setPagina] = useState(1);
  const [estado, setEstado] = useState("");
  const [correo, setCorreo] = useState("");
  const [consulta, setConsulta] = useState({ estado: "", correo: "" });
  const [recargar, setRecargar] = useState(0);
  const [datos, setDatos] = useState(null);
  const [sinPermiso, setSinPermiso] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [nuevoCorreo, setNuevoCorreo] = useState("");
  const [nuevoRol, setNuevoRol] = useState(roles[1].codigo);

  // Cada cambio de página, filtro o acción vuelve a pedir el listado a la API.
  useEffect(() => {
    let cancelado = false;
    api.listarInvitaciones({ pagina, limite, estado: consulta.estado, correo: consulta.correo }).then((resultado) => {
      if (cancelado) return;
      if (resultado.status === 403) {
        setSinPermiso(true);
        return;
      }
      if (resultado.ok) setDatos(resultado.cuerpo);
      else setMensaje(mensajeDeError(resultado));
    });
    return () => {
      cancelado = true;
    };
  }, [api, pagina, consulta, recargar]);

  // Sin permiso de administrador no se muestra nada de administración.
  if (sinPermiso) {
    return null;
  }

  // Muestra el resultado de una alta o reenvío: si el correo no salió, la invitación queda y se puede reenviar.
  function informarEntrega(resultado) {
    if (resultado.ok && resultado.cuerpo?.entrega === "enviada") {
      setMensaje("Invitación enviada.");
    } else if (resultado.status === 502) {
      setMensaje("La invitación se creó, pero el correo no se pudo enviar. Podés reenviarla desde la lista.");
    } else {
      setMensaje(mensajeDeError(resultado));
    }
  }

  async function invitar(evento) {
    evento.preventDefault();
    const resultado = await api.crearInvitacion(nuevoCorreo.trim(), nuevoRol);
    informarEntrega(resultado);
    if (resultado.ok || resultado.status === 502) {
      setNuevoCorreo("");
      setRecargar((n) => n + 1);
    }
  }

  async function reenviar(id) {
    informarEntrega(await api.reenviarInvitacion(id));
    setRecargar((n) => n + 1);
  }

  async function revocar(id) {
    const resultado = await api.revocarInvitacion(id);
    setMensaje(resultado.ok ? "Invitación revocada." : mensajeDeError(resultado));
    setRecargar((n) => n + 1);
  }

  // Aplica los filtros y vuelve a la primera página.
  function filtrar(evento) {
    evento.preventDefault();
    setPagina(1);
    setConsulta({ estado, correo });
  }

  const totalPaginas = datos ? paginasTotales(datos.total, limite) : 1;

  return (
    <section>
      <h2>Invitaciones</h2>
      <form onSubmit={invitar}>
        <label>
          Correo
          <input type="email" value={nuevoCorreo} onChange={(e) => setNuevoCorreo(e.target.value)} required />
        </label>
        <label>
          Rol inicial
          <select value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)}>
            {roles.map((rol) => (
              <option key={rol.codigo} value={rol.codigo}>{rol.etiqueta}</option>
            ))}
          </select>
        </label>
        <button type="submit">Invitar</button>
      </form>

      <form onSubmit={filtrar}>
        <label>
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            {estados.map((valor) => (
              <option key={valor || "todos"} value={valor}>{valor || "Todos"}</option>
            ))}
          </select>
        </label>
        <label>
          Correo
          <input value={correo} onChange={(e) => setCorreo(e.target.value)} />
        </label>
        <button type="submit">Filtrar</button>
      </form>

      {mensaje && <p role="status">{mensaje}</p>}

      {datos && (
        <>
          {datos.items.length > 0 && <div className="admin-tabla" role="region" aria-label="Listado de invitaciones" tabIndex={0}><table>
            <thead>
              <tr>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Vence</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((invitacion) => (
                <tr key={invitacion.id}>
                  <td>{invitacion.correo}</td>
                  <td>{etiquetaDeRol(invitacion.rol)}</td>
                  <td>{invitacion.estado}</td>
                  <td>{new Date(invitacion.venceEn).toLocaleString()}</td>
                  <td>
                    {(invitacion.estado === "pendiente" || invitacion.estado === "vencida") && (
                      <button type="button" onClick={() => reenviar(invitacion.id)}>Reenviar</button>
                    )}
                    {invitacion.estado === "pendiente" && (
                      <button type="button" onClick={() => revocar(invitacion.id)}>Revocar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>}
          {datos.items.length === 0 && <p>No hay invitaciones para mostrar.</p>}
          <nav>
            <button type="button" onClick={() => setPagina((p) => p - 1)} disabled={pagina <= 1}>Anterior</button>
            <span> Página {pagina} de {totalPaginas} </span>
            <button type="button" onClick={() => setPagina((p) => p + 1)} disabled={pagina >= totalPaginas}>Siguiente</button>
          </nav>
        </>
      )}
    </section>
  );
}
