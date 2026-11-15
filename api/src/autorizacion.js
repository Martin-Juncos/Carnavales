// Exige una sesión autenticada cuyo usuario tenga el rol ADMINISTRADOR en este momento.
// El rol se consulta en la base en cada petición, así que un cambio de roles rige de inmediato.
// obtenerSesion(request) devuelve { user } o null; en la aplicación lo implementa Better Auth.
export function requerirAdministrador({ pool, obtenerSesion }) {
  return async (request, response, next) => {
    try {
      const sesion = await obtenerSesion(request);
      if (!sesion?.user) {
        response.status(401).json({ error: "no_autenticado" });
        return;
      }

      const { rows } = await pool.query(
        `SELECT 1
           FROM usuario_rol ur
           JOIN rol r ON r.id = ur.rol_id
          WHERE ur.usuario_id = $1 AND r.codigo = 'ADMINISTRADOR'
          LIMIT 1`,
        [sesion.user.id],
      );
      if (rows.length === 0) {
        response.status(403).json({ error: "sin_permiso" });
        return;
      }

      request.usuario = { id: sesion.user.id };
      next();
    } catch (error) {
      next(error);
    }
  };
}
