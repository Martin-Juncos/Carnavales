import { createAuth } from "./auth.js";

// Lock de asesoramiento propio del bootstrap, distinto del de las migraciones.
const bootstrapLock = 731904222;
const yaExisteMensaje = "Ya existe un primer administrador.";

// Crea el primer administrador. Pensado para ejecutarse una sola vez, fuera de una ruta pública.
// La contraseña la maneja Better Auth; este código nunca la guarda ni la registra.
export async function bootstrapFirstAdmin({ pool, secret, baseUrl, name, email, password }) {
  const correo = email.trim().toLowerCase();

  // Chequeo rápido: evita crear un usuario si ya hay un administrador inicial.
  if (await existePrimerAdministrador(pool)) {
    throw new Error(yaExisteMensaje);
  }

  // Alta de la cuenta con el flujo de Better Auth, que aplica la política de contraseñas y el hash.
  // Solo esta instancia temporal permite el alta; la aplicación mantiene el registro cerrado.
  const auth = createAuth({ pool, secret, baseUrl, allowSignUp: true });
  const { user } = await auth.api.signUpEmail({
    body: { name, email: correo, password },
  });
  const userId = user.id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serializa la asignación inicial: si dos bootstraps corren a la vez, solo uno llega aquí.
    await client.query("SELECT pg_advisory_xact_lock($1)", [bootstrapLock]);

    const { rows: existentes } = await client.query(
      "SELECT 1 FROM usuario_rol WHERE es_inicial LIMIT 1",
    );
    if (existentes.length > 0) {
      throw new Error(yaExisteMensaje);
    }

    // El alta por invitación confirma el correo y deja el segundo factor activo.
    await client.query(
      "UPDATE usuario SET correo_verificado = true, doble_factor_habilitado = true WHERE id = $1",
      [userId],
    );
    const { rows: [rol] } = await client.query(
      "SELECT id FROM rol WHERE codigo = 'ADMINISTRADOR'",
    );
    await client.query(
      "INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial) VALUES ($1, $2, NULL, true)",
      [userId, rol.id],
    );
    await client.query("COMMIT");
    return userId;
  } catch (error) {
    await client.query("ROLLBACK");
    // Si la asignación no se pudo completar, se elimina el usuario recién creado
    // para no dejar una cuenta sin rol. Sus credenciales y sesiones se borran en cascada.
    await pool.query("DELETE FROM usuario WHERE id = $1", [userId]);
    throw error;
  } finally {
    client.release();
  }
}

export async function existePrimerAdministrador(pool) {
  const { rows } = await pool.query("SELECT 1 FROM usuario_rol WHERE es_inicial LIMIT 1");
  return rows.length > 0;
}
