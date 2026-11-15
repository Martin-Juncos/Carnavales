export class ErrorRol extends Error {
  constructor(codigo, mensaje = codigo) {
    super(mensaje);
    this.codigo = codigo;
  }
}

// Código de error de los triggers de la migración 0003 (check_violation).
const errorDeTrigger = "23514";

// Asigna un rol a la vez. La clave primaria de usuario_rol impide duplicados aunque haya dos peticiones simultáneas.
export async function asignarRol(pool, { usuarioId, rolCodigo, asignadoPor }) {
  const { rows: [usuario] } = await pool.query("SELECT id FROM usuario WHERE id = $1", [usuarioId]);
  if (!usuario) {
    throw new ErrorRol("usuario_no_encontrado", "El usuario no existe.");
  }
  const { rows: [rol] } = await pool.query("SELECT id FROM rol WHERE codigo = $1", [rolCodigo]);
  if (!rol) {
    throw new ErrorRol("rol_invalido", "El rol no existe.");
  }

  try {
    await pool.query(
      `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
       VALUES ($1, $2, $3, false)`,
      [usuarioId, rol.id, asignadoPor],
    );
  } catch (error) {
    if (error.code === "23505") {
      throw new ErrorRol("rol_ya_asignado", "El usuario ya tiene ese rol.");
    }
    throw error;
  }
  return { usuarioId, rol: rolCodigo };
}

// Quita un rol. La asignación inicial de ADMINISTRADOR nunca se quita.
export async function retirarRol(pool, { usuarioId, rolCodigo }) {
  const { rows: [asignacion] } = await pool.query(
    `SELECT ur.es_inicial FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
      WHERE ur.usuario_id = $1 AND r.codigo = $2`,
    [usuarioId, rolCodigo],
  );
  if (!asignacion) {
    throw new ErrorRol("no_asignado", "El usuario no tiene ese rol.");
  }
  if (asignacion.es_inicial) {
    throw new ErrorRol("rol_protegido", "La asignación inicial de administrador no puede quitarse.");
  }

  try {
    await pool.query(
      `DELETE FROM usuario_rol
        WHERE usuario_id = $1 AND rol_id = (SELECT id FROM rol WHERE codigo = $2)`,
      [usuarioId, rolCodigo],
    );
  } catch (error) {
    if (error.code === errorDeTrigger) {
      throw new ErrorRol("rol_protegido", "La asignación inicial de administrador no puede quitarse.");
    }
    throw error;
  }
  return { usuarioId, rol: rolCodigo };
}
