import { useEffect, useState } from "react";
import { etiquetaDeRol, rolesDisponibles } from "../../../shared/roles.js";
import { paginasTotales } from "../../../shared/paginacion.js";

// Tamaño de página del listado. Debe respetar el máximo de la API (100).
const limite = 20;

// Mensaje de la API (campo mensaje) para errores de negocio; si no llega ninguno, uno genérico.
function mensajeDeError(resultado) {
  return resultado.cuerpo?.mensaje ?? "No se pudo completar la operación. Intentá de nuevo.";
}

// Listado administrativo de usuarios: búsqueda, paginación, estado de sesión y gestión de roles y cuentas.
// La API decide quién es administrador: si responde 403, el panel no se muestra.
export function PanelUsuarios({ api, alCambiarJurados }) {
  const [pagina, setPagina] = useState(1);
  const [buscar, setBuscar] = useState("");
  const [consulta, setConsulta] = useState("");
  const [recargar, setRecargar] = useState(0);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [sinPermiso, setSinPermiso] = useState(false);
  // Usuario con la eliminación pendiente de confirmar (paso 2 de 2).
  const [eliminarId, setEliminarId] = useState(null);
  // Rol elegido para asignar, por usuario.
  const [rolElegido, setRolElegido] = useState({});

  // Cada cambio de página, búsqueda o acción vuelve a pedir el listado a la API.
  useEffect(() => {
    let cancelado = false;
    api.listarUsuarios({ pagina, limite, buscar: consulta }).then((resultado) => {
      if (cancelado) return;
      if (resultado.status === 403) {
        setSinPermiso(true);
        return;
      }
      if (!resultado.ok) {
        setError("No se pudo cargar el listado. Intentá de nuevo.");
        return;
      }
      setError("");
      setDatos(resultado.cuerpo);
    });
    return () => {
      cancelado = true;
    };
  }, [api, pagina, consulta, recargar]);

  // Sin permiso de administrador no se muestra nada de administración.
  if (sinPermiso) {
    return null;
  }

  // Buscar reinicia a la primera página.
  function buscarUsuarios(evento) {
    evento.preventDefault();
    setPagina(1);
    setConsulta(buscar);
  }

  // Asigna el rol elegido para ese usuario y recarga el listado.
  async function asignar(usuario) {
    const codigo = rolElegido[usuario.id] ?? rolesDisponibles(usuario.roles)[0]?.codigo;
    if (!codigo) return;
    const resultado = await api.asignarRol(usuario.id, codigo);
    setMensaje(resultado.ok ? `Rol ${etiquetaDeRol(codigo)} asignado a ${usuario.nombre}.` : mensajeDeError(resultado));
    if (resultado.ok && codigo === "JURADO") alCambiarJurados?.();
    setRecargar((n) => n + 1);
  }

  async function quitar(usuario, codigo) {
    const resultado = await api.retirarRol(usuario.id, codigo);
    setMensaje(resultado.ok ? `Rol ${etiquetaDeRol(codigo)} quitado a ${usuario.nombre}.` : mensajeDeError(resultado));
    if (resultado.ok && codigo === "JURADO") alCambiarJurados?.();
    setRecargar((n) => n + 1);
  }

  async function eliminar(usuario) {
    const resultado = await api.eliminarUsuario(usuario.id);
    setEliminarId(null);
    setMensaje(resultado.ok ? `Cuenta de ${usuario.nombre} eliminada.` : mensajeDeError(resultado));
    if (resultado.ok && usuario.roles.includes("JURADO")) alCambiarJurados?.();
    setRecargar((n) => n + 1);
  }

  const totalPaginas = datos ? paginasTotales(datos.total, limite) : 1;

  return (
    <section>
      <h2>Usuarios</h2>
      <form onSubmit={buscarUsuarios}>
        <label>
          Buscar por nombre o correo
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </label>
        <button type="submit">Buscar</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {mensaje && <p role="status">{mensaje}</p>}
      {datos && (
        <>
          {datos.items.length > 0 && <div className="admin-tabla" role="region" aria-label="Listado de usuarios" tabIndex={0}><table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Roles</th>
                <th>Sesión activa</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((usuario) => (
                <tr key={usuario.id}>
                  <td>{usuario.nombre}</td>
                  <td>{usuario.correo}</td>
                  <td>
                    {usuario.roles.length === 0 && "Sin roles"}
                    {usuario.roles.map((codigo) => (
                      <span key={codigo}>
                        {etiquetaDeRol(codigo)}{" "}
                        <button type="button" onClick={() => quitar(usuario, codigo)}>Quitar</button>{" "}
                      </span>
                    ))}
                  </td>
                  <td>{usuario.sesionActiva ? "Sí" : "No"}</td>
                  <td>
                    {rolesDisponibles(usuario.roles).length > 0 && (
                      <>
                        <select
                          aria-label={`Rol para ${usuario.nombre}`}
                          value={rolElegido[usuario.id] ?? rolesDisponibles(usuario.roles)[0].codigo}
                          onChange={(e) => setRolElegido((previo) => ({ ...previo, [usuario.id]: e.target.value }))}
                        >
                          {rolesDisponibles(usuario.roles).map((rol) => (
                            <option key={rol.codigo} value={rol.codigo}>{rol.etiqueta}</option>
                          ))}
                        </select>{" "}
                        <button type="button" onClick={() => asignar(usuario)}>Asignar</button>{" "}
                      </>
                    )}
                    {eliminarId === usuario.id ? (
                      <>
                        <button type="button" onClick={() => eliminar(usuario)}>Confirmar eliminación</button>{" "}
                        <button type="button" onClick={() => setEliminarId(null)}>Cancelar</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setEliminarId(usuario.id)}>Eliminar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>}
          {datos.items.length === 0 && <p>No hay usuarios para mostrar.</p>}
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
