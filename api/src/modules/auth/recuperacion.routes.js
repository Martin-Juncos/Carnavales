import express from "express";
import { manejarErrores } from "../../http/manejo-errores.js";

// Mensaje único para token ausente, inválido, vencido o ya consumido.
const mensajeTokenInvalido = "El enlace de recuperación no es válido o venció. Pedí uno nuevo.";

// Comprueba que el token del enlace de recuperación siga vigente.
// No consume el token: solo consulta la verificación temporal de Better Auth.
export async function tokenDeRecuperacionVigente(pool, { token, ahora = new Date() } = {}) {
  if (!token) return false;
  const { rows } = await pool.query(
    "SELECT 1 FROM verificacion WHERE identificador = $1 AND vence_en > $2",
    [`reset-password:${token}`, ahora],
  );
  return rows.length > 0;
}

// Ruta pública de verificación previa al formulario de nueva contraseña.
export function crearRutasRecuperacion({ pool }) {
  const router = express.Router();

  // GET /validar?token=... — responde 200 si el enlace puede usarse una vez.
  router.get("/validar", async (request, response, next) => {
    try {
      const token = typeof request.query.token === "string" ? request.query.token : "";
      const vigente = await tokenDeRecuperacionVigente(pool, { token, ahora: new Date() });
      if (!vigente) {
        response.status(400).json({ error: "token_invalido", mensaje: mensajeTokenInvalido });
        return;
      }
      response.status(200).json({ valido: true });
    } catch (error) {
      next(error);
    }
  });

  router.use(manejarErrores);
  return router;
}
