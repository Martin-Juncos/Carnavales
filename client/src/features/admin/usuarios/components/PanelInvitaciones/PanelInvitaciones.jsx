import { useEffect, useState } from "react";
import { etiquetaDeRol, roles } from "../../../../../shared/utils/roles.js";
import { paginasTotales } from "../../../../../shared/utils/paginacion.js";
import styles from "../../PersonasYAccesos.module.css";

// Tamaño de página del listado. Debe respetar el máximo de la API (100).
const limite = 20;
const estados = [
  { valor: "", etiqueta: "Todos" },
  { valor: "pendiente", etiqueta: "Pendiente" },
  { valor: "vencida", etiqueta: "Vencida" },
  { valor: "aceptada", etiqueta: "Aceptada" },
  { valor: "revocada", etiqueta: "Revocada" },
];

const ESTILO_ESTADO = {
  pendiente: styles.estadoAmbar,
  aceptada: styles.estadoVerde,
  vencida: styles.estadoNeutro,
  revocada: styles.estadoRojo,
};

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
      <div className={styles.cabecera}>
        <div className={styles.cabeceraTexto}>
          <h2 className={styles.titulo}>Invitaciones</h2>
          <p className={styles.subtitulo}>
            Enviá enlaces de alta por correo y revisá el estado de las invitaciones emitidas.
          </p>
        </div>
        {datos && (
          <span className={styles.contador}>
            {datos.total} {datos.total === 1 ? "invitación" : "invitaciones"}
          </span>
        )}
      </div>

      <div className={styles.bloqueAlta}>
        <h3 className={styles.bloqueAltaTitulo}>Enviar nueva invitación</h3>
        <p className={styles.bloqueAltaAyuda}>
          La persona recibirá un enlace por correo para crear su contraseña con el rol inicial elegido.
        </p>
        <form className={styles.formBarra} onSubmit={invitar}>
          <label className={styles.campoCrece}>
            Correo
            <input
              type="email"
              placeholder="nombre@ejemplo.com"
              value={nuevoCorreo}
              onChange={(e) => setNuevoCorreo(e.target.value)}
              required
            />
          </label>
          <label className={styles.campoFijo}>
            Rol inicial
            <select value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)}>
              {roles.map((rol) => (
                <option key={rol.codigo} value={rol.codigo}>{rol.etiqueta}</option>
              ))}
            </select>
          </label>
          <button type="submit">Invitar</button>
        </form>
      </div>

      <form className={styles.formBarra} onSubmit={filtrar}>
        <label className={styles.campoFijo}>
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            {estados.map((opcion) => (
              <option key={opcion.valor || "todos"} value={opcion.valor}>{opcion.etiqueta}</option>
            ))}
          </select>
        </label>
        <label className={styles.campoCrece}>
          Correo
          <input
            placeholder="Filtrar por dirección de correo"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
        </label>
        <button type="submit">Filtrar</button>
      </form>

      {mensaje && <p className={styles.avisoExito} role="status">{mensaje}</p>}

      {datos && (
        <>
          {datos.items.length > 0 && (
            <div className="admin-tabla" role="region" aria-label="Listado de invitaciones" tabIndex={0}>
              <table>
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
                  {datos.items.map((invitacion) => {
                    const claseEstado = ESTILO_ESTADO[invitacion.estado] ?? styles.estadoNeutro;
                    return (
                      <tr key={invitacion.id}>
                        <td>
                          <span className={styles.personaNombre}>{invitacion.correo}</span>
                        </td>
                        <td>
                          <span className={styles.rolChipSimple}>{etiquetaDeRol(invitacion.rol)}</span>
                        </td>
                        <td>
                          <span className={`${styles.estadoBadge} ${claseEstado}`}>
                            <span className={styles.estadoPunto} aria-hidden="true" />
                            {invitacion.estado}
                          </span>
                        </td>
                        <td>
                          <span className={styles.fechaTexto}>
                            {new Date(invitacion.venceEn).toLocaleString()}
                          </span>
                        </td>
                        <td>
                          <div className={styles.grupoAsignar}>
                            {(invitacion.estado === "pendiente" || invitacion.estado === "vencida") && (
                              <button
                                type="button"
                                className={styles.btnAccion}
                                onClick={() => reenviar(invitacion.id)}
                              >
                                Reenviar
                              </button>
                            )}
                            {invitacion.estado === "pendiente" && (
                              <button
                                type="button"
                                className={styles.btnPeligroSuave}
                                onClick={() => revocar(invitacion.id)}
                              >
                                Revocar
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
            <p className={styles.vacio}>No hay invitaciones para mostrar.</p>
          )}
          <nav className={styles.paginacion} aria-label="Paginación de invitaciones">
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
