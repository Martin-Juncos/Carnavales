import express from "express";

// Datos propios de la persona con sesión. Solo devuelve sus roles; nunca los de otros usuarios.
export function crearRutasMiCuenta({ pool, obtenerSesion }) {
  const router = express.Router();

  // GET /roles — códigos de roles asignados al usuario de la sesión, ordenados.
  router.get("/roles", async (request, response, next) => {
    try {
      const sesion = await obtenerSesion(request);
      if (!sesion?.user) {
        response.status(401).json({ error: "no_autenticado" });
        return;
      }
      const { rows } = await pool.query(
        `SELECT r.codigo FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
          WHERE ur.usuario_id = $1 ORDER BY r.codigo`,
        [sesion.user.id],
      );
      response.status(200).json({ roles: rows.map((fila) => fila.codigo) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
