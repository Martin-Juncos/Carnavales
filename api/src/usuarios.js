import { escaparLike } from "./texto.js";

export class ErrorUsuario extends Error {
  constructor(codigo, mensaje = codigo) {
    super(mensaje);
    this.codigo = codigo;
  }
}

const limiteMaximo = 100;
const limitePorDefecto = 20;

function validarPaginacion({ pagina, limite }) {
  if (!Number.isInteger(pagina) || pagina < 1) {
    throw new ErrorUsuario("parametros_invalidos", "La página debe ser un entero mayor o igual a 1.");
  }
  if (!Number.isInteger(limite) || limite < 1 || limite > limiteMaximo) {
    throw new ErrorUsuario("parametros_invalidos", `El límite debe estar entre 1 y ${limiteMaximo}.`);
  }
}

// Listado administrativo de usuarios. No devuelve hashes, tokens ni secretos del segundo factor.
export async function listarUsuarios(pool, { pagina = 1, limite = limitePorDefecto, buscar, ahora = new Date() } = {}) {
  validarPaginacion({ pagina, limite });

  const termino = buscar?.trim() ? `%${escaparLike(buscar.trim())}%` : null;
  const filtro = `($1::text IS NULL OR u.correo ILIKE $1 ESCAPE '\\' OR u.nombre ILIKE $1 ESCAPE '\\')`;

  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, u.correo, u.creado_en,
            COALESCE(
              (SELECT array_agg(r.codigo ORDER BY r.codigo)
                 FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
                WHERE ur.usuario_id = u.id),
              '{}'
            ) AS roles,
            EXISTS (SELECT 1 FROM sesion s WHERE s.usuario_id = u.id AND s.vence_en > $2) AS sesion_activa
       FROM usuario u
      WHERE ${filtro}
      ORDER BY u.creado_en DESC, u.id
      LIMIT $3 OFFSET $4`,
    [termino, ahora, limite, (pagina - 1) * limite],
  );

  const { rows: [{ total }] } = await pool.query(
    `SELECT count(*)::int AS total FROM usuario u WHERE ${filtro}`,
    [termino],
  );

  return {
    items: rows.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      correo: fila.correo,
      roles: fila.roles,
      creadoEn: fila.creado_en.toISOString(),
      sesionActiva: fila.sesion_activa,
    })),
    pagina,
    limite,
    total,
  };
}

// Elimina la cuenta; sus sesiones, segundo factor y asignaciones se borran en cascada.
// El primer administrador lo impide el trigger de la migración 0003 (check_violation).
export async function eliminarUsuario(pool, { usuarioId }) {
  const { rows } = await pool.query("SELECT id FROM usuario WHERE id = $1", [usuarioId]);
  if (rows.length === 0) {
    throw new ErrorUsuario("usuario_no_encontrado", "El usuario no existe.");
  }
  try {
    await pool.query("DELETE FROM usuario WHERE id = $1", [usuarioId]);
  } catch (error) {
    if (error.code === "23514") {
      throw new ErrorUsuario("usuario_protegido", "No se puede eliminar al primer administrador.");
    }
    throw error;
  }
  return { id: usuarioId };
}
