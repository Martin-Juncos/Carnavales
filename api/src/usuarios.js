import { escaparLike } from "./texto.js";

// Error de dominio para el módulo de usuarios. `codigo` identifica el caso para que la ruta elija el estado HTTP.
export class ErrorUsuario extends Error {
  constructor(codigo, mensaje = codigo) {
    super(mensaje);
    this.codigo = codigo;
  }
}

// Límite máximo de filas por página y tamaño de página por defecto.
const limiteMaximo = 100;
const limitePorDefecto = 20;

// Valida que la página sea un entero >= 1 y el límite esté entre 1 y limiteMaximo.
function validarPaginacion({ pagina, limite }) {
  if (!Number.isInteger(pagina) || pagina < 1) {
    throw new ErrorUsuario("parametros_invalidos", "La página debe ser un entero mayor o igual a 1.");
  }
  if (!Number.isInteger(limite) || limite < 1 || limite > limiteMaximo) {
    throw new ErrorUsuario("parametros_invalidos", `El límite debe estar entre 1 y ${limiteMaximo}.`);
  }
}

// Listado administrativo de usuarios. No devuelve hashes, tokens ni secretos del segundo factor.
// Permite buscar por nombre o correo (sin distinguir mayúsculas) y pagina los resultados.
export async function listarUsuarios(pool, { pagina = 1, limite = limitePorDefecto, buscar, ahora = new Date() } = {}) {
  validarPaginacion({ pagina, limite });

  // Término de búsqueda con comodines % a cada lado, escapando los caracteres especiales. Sin búsqueda, null.
  const termino = buscar?.trim() ? `%${escaparLike(buscar.trim())}%` : null;
  // Filtro: si no hay término, pasa todo; si lo hay, busca en correo o nombre.
  const filtro = `($1::text IS NULL OR u.correo ILIKE $1 ESCAPE '\\' OR u.nombre ILIKE $1 ESCAPE '\\')`;

  // Página de usuarios con sus roles y si tienen una sesión que todavía no venció.
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

  // Total de usuarios que cumplen el filtro (no solo los de esta página).
  const { rows: [{ total }] } = await pool.query(
    `SELECT count(*)::int AS total FROM usuario u WHERE ${filtro}`,
    [termino],
  );

  // Devuelve solo los campos públicos, con nombres en camelCase para el cliente.
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

// Elimina la cuenta; sesiones, segundo factor y roles se borran en cascada.
// Las asignaciones y la auditoría no se borran: sus FK con RESTRICT (migración 0007)
// impiden la eliminación mientras haya evidencia asociada.
// El primer administrador lo impide el trigger de la migración 0003 (check_violation).
export async function eliminarUsuario(pool, { usuarioId }) {
  // Primero se comprueba que exista, para responder "no encontrado" con un mensaje claro.
  const { rows } = await pool.query("SELECT id FROM usuario WHERE id = $1", [usuarioId]);
  if (rows.length === 0) {
    throw new ErrorUsuario("usuario_no_encontrado", "El usuario no existe.");
  }
  try {
    await pool.query("DELETE FROM usuario WHERE id = $1", [usuarioId]);
  } catch (error) {
    // 23514: el trigger protege al primer administrador y rechaza el borrado.
    if (error.code === "23514") {
      throw new ErrorUsuario("usuario_protegido", "No se puede eliminar al primer administrador.");
    }
    // Con RESTRICT, PostgreSQL 18+ devuelve 23001 (restrict_violation); en
    // versiones anteriores (y con NO ACTION) devuelve 23503 (foreign_key_violation).
    // En este DELETE ambos significan que el usuario tiene historial: se traduce
    // a un código de dominio sin filtrar SQL.
    if (error.code === "23001" || error.code === "23503") {
      throw new ErrorUsuario(
        "usuario_con_historial",
        "El usuario tiene historial asociado y no puede eliminarse.",
      );
    }
    throw error;
  }
  return { id: usuarioId };
}
