// Exige una sesión autenticada cuyo usuario tenga un rol determinado en este
// momento. El rol se consulta en la base en cada petición, así que un cambio de
// roles rige de inmediato. obtenerSesion(request) devuelve { user } o null; en
// la aplicación lo implementa Better Auth.
function requerirRoles({ pool, obtenerSesion, codigos }) {
  return async (request, response, next) => {
    try {
      // Sin sesión válida, se responde 401 y la petición no sigue.
      const sesion = await obtenerSesion(request);
      if (!sesion?.user) {
        response.status(401).json({ error: "no_autenticado" });
        return;
      }

      // Con sesión, se verifica en la base que el usuario tenga alguno de los roles indicados.
      const { rows } = await pool.query(
        `SELECT 1
           FROM usuario_rol ur
           JOIN rol r ON r.id = ur.rol_id
          WHERE ur.usuario_id = $1 AND r.codigo = ANY($2::text[])
          LIMIT 1`,
        [sesion.user.id, codigos],
      );
      // Sesión válida pero sin el rol: 403 (sabe quién es, pero no puede).
      if (rows.length === 0) {
        response.status(403).json({ error: "sin_permiso" });
        return;
      }

      // Deja el id del usuario disponible para las rutas siguientes y continúa.
      request.usuario = { id: sesion.user.id };
      next();
    } catch (error) {
      // Cualquier error inesperado pasa al manejador de errores de Express.
      next(error);
    }
  };
}

export function requerirAdministrador({ pool, obtenerSesion }) {
  return requerirRoles({ pool, obtenerSesion, codigos: ["ADMINISTRADOR"] });
}

export function requerirJurado({ pool, obtenerSesion }) {
  return requerirRoles({ pool, obtenerSesion, codigos: ["JURADO"] });
}

export function requerirEscribano({ pool, obtenerSesion }) {
  return requerirRoles({ pool, obtenerSesion, codigos: ["ESCRIBANO"] });
}

export function requerirAlgunRol({ pool, obtenerSesion, codigos }) {
  return requerirRoles({ pool, obtenerSesion, codigos });
}
