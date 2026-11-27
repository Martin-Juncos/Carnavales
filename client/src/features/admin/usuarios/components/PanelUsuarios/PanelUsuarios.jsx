import { useEffect, useState } from "react";
import { etiquetaDeRol, rolesDisponibles } from "../../../../../shared/utils/roles.js";
import { paginasTotales } from "../../../../../shared/utils/paginacion.js";
import styles from "../../PersonasYAccesos.module.css";

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
      <div className={styles.cabecera}>
        <div className={styles.cabeceraTexto}>
          <h2 className={styles.titulo}>Usuarios</h2>
          <p className={styles.subtitulo}>
            Cuentas activas en el sistema. Asigná o quitá roles según la función que cumpla cada persona.
          </p>
        </div>
        {datos && (
          <span className={styles.contador}>
            {datos.total} {datos.total === 1 ? "registrado" : "registrados"}
          </span>
        )}
      </div>

      <form className={styles.formBarra} onSubmit={buscarUsuarios}>
        <label className={styles.campoCrece}>
          Buscar por nombre o correo
          <input
            placeholder="Ej: Lucía o correo@ejemplo.com"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
          />
        </label>
        <button type="submit">Buscar</button>
      </form>

      {error && <p className={styles.avisoError} role="alert">{error}</p>}
      {mensaje && <p className={styles.avisoExito} role="status">{mensaje}</p>}

      {datos && (
        <>
          {datos.items.length > 0 && (
            <div className="admin-tabla" role="region" aria-label="Listado de usuarios" tabIndex={0}>
              <table>
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
                  {datos.items.map((usuario) => {
                    const disponibles = rolesDisponibles(usuario.roles);
                    return (
                      <tr key={usuario.id}>
                        <td>
                          <span className={styles.personaNombre}>{usuario.nombre}</span>
                        </td>
                        <td>
                          <span className={styles.correoTexto}>{usuario.correo}</span>
                        </td>
                        <td>
                          <div className={styles.rolesLista}>
                            {usuario.roles.length === 0 && (
                              <span className={styles.rolVacio}>Sin roles</span>
                            )}
                            {usuario.roles.map((codigo) => (
                              <span key={codigo} className={styles.rolChip}>
                                {etiquetaDeRol(codigo)}{" "}
                                <button
                                  type="button"
                                  className={styles.btnQuitarRol}
                                  onClick={() => quitar(usuario, codigo)}
                                >
                                  Quitar
                                </button>
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`${styles.estadoBadge} ${
                              usuario.sesionActiva ? styles.estadoVerde : styles.estadoNeutro
                            }`}
                          >
                            <span className={styles.estadoPunto} aria-hidden="true" />
                            {usuario.sesionActiva ? "Sí" : "No"}
                          </span>
                        </td>
                        <td>
                          <div className={styles.accionesCelda}>
                            {disponibles.length > 0 ? (
                              <div className={styles.grupoAsignar}>
                                <select
                                  className={styles.selectCompacto}
                                  aria-label={`Rol para ${usuario.nombre}`}
                                  value={rolElegido[usuario.id] ?? disponibles[0].codigo}
                                  onChange={(e) =>
                                    setRolElegido((previo) => ({ ...previo, [usuario.id]: e.target.value }))
                                  }
                                >
                                  {disponibles.map((rol) => (
                                    <option key={rol.codigo} value={rol.codigo}>{rol.etiqueta}</option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className={styles.btnAccion}
                                  onClick={() => asignar(usuario)}
                                >
                                  Asignar
                                </button>
                              </div>
                            ) : (
                              <span />
                            )}

                            {eliminarId === usuario.id ? (
                              <div className={styles.confirmacionEnFila}>
                                <button
                                  type="button"
                                  className={styles.btnPeligroFuerte}
                                  onClick={() => eliminar(usuario)}
                                >
                                  Confirmar eliminación
                                </button>
                                <button
                                  type="button"
                                  className={styles.btnAccion}
                                  onClick={() => setEliminarId(null)}
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={styles.btnPeligroSuave}
                                onClick={() => setEliminarId(usuario.id)}
                              >
                                Eliminar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {datos.items.length === 0 && (
            <p className={styles.vacio}>No hay usuarios para mostrar.</p>
          )}
          <nav className={styles.paginacion} aria-label="Paginación de usuarios">
            <button type="button" onClick={() => setPagina((p) => p - 1)} disabled={pagina <= 1}>
              Anterior
            </button>
            <span className={styles.paginacionTexto}> Página {pagina} de {totalPaginas} </span>
            <button type="button" onClick={() => setPagina((p) => p + 1)} disabled={pagina >= totalPaginas}>
              Siguiente
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
