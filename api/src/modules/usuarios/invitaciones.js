import { ErrorDominio } from "../../shared/errores.js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createAuth } from "../auth/auth.js";
import { escaparLike } from "../../shared/texto.js";

// Mensaje único para token inválido, vencido, revocado o ya usado: no revela cuál era el caso.
export const mensajeInvitacionInvalida =
  "El enlace no es válido o venció. Solicita una nueva invitación al administrador.";

// Vigencia de cada enlace: 72 horas, en milisegundos.
const duracionMs = 72 * 60 * 60 * 1000;

// Error de dominio para invitaciones. `codigo` identifica el caso para que la ruta elija el estado HTTP.
export class ErrorInvitacion extends ErrorDominio {}

// El token nunca se guarda: solo su hash. Es aleatorio de 256 bits, así que SHA-256 basta.
export function hashDeToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

// Genera un token aleatorio de 32 bytes (256 bits), en formato seguro para URLs.
function generarToken() {
  return randomBytes(32).toString("base64url");
}

// Limpia el correo (sin espacios, en minúsculas) y valida que tenga forma de correo.
function normalizarCorreo(correo) {
  const limpio = String(correo ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
    throw new ErrorInvitacion("correo_invalido", "El correo no es válido.");
  }
  return limpio;
}

// Arma el enlace que recibe la persona invitada, apuntando al cliente web.
function enlaceDe(appUrl, token) {
  return `${appUrl}/aceptar-invitacion?token=${encodeURIComponent(token)}`;
}

// La entrega no es parte de la transacción: si falla, la invitación queda pendiente y se informa.
// Devuelve "enviada" o "fallida" sin lanzar error.
async function entregar(enviar, correo, enlace) {
  try {
    await enviar({ correo, enlace });
    return "enviada";
  } catch {
    return "fallida";
  }
}

// Indica si ya existe una cuenta con ese correo.
async function existeCuenta(client, correo) {
  const { rows } = await client.query("SELECT 1 FROM usuario WHERE correo = $1", [correo]);
  return rows.length > 0;
}

// Inserta una invitación pendiente con el hash del token (nunca el token) y devuelve su id y el enlace.
async function emitir(client, { correo, rolId, creadaPor, ahora, appUrl }) {
  const token = generarToken();
  const id = randomUUID();
  await client.query(
    `INSERT INTO invitacion (id, correo_invitado, rol_inicial_id, hash_token, estado, vence_en, creada_por, creada_en)
     VALUES ($1, $2, $3, $4, 'pendiente', $5, $6, $7)`,
    [id, correo, rolId, hashDeToken(token), new Date(ahora.getTime() + duracionMs), creadaPor, ahora],
  );
  return { id, enlace: enlaceDe(appUrl, token) };
}

// Ejecuta `operacion` dentro de una transacción: confirma si todo sale bien y revierte si algo falla.
async function transaccion(pool, operacion) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const resultado = await operacion(client);
    await client.query("COMMIT");
    return resultado;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Crea una invitación nueva para un correo que no tiene cuenta y no tiene invitación pendiente.
export async function crearInvitacion(pool, { correo, rolCodigo, creadaPor, ahora, appUrl, enviar }) {
  const correoNormalizado = normalizarCorreo(correo);

  const { id, enlace } = await transaccion(pool, async (client) => {
    // No se invita a quien ya tiene cuenta.
    if (await existeCuenta(client, correoNormalizado)) {
      throw new ErrorInvitacion("cuenta_existente", "Ya existe una cuenta con ese correo.");
    }
    // El rol debe existir en el catálogo.
    const { rows: [rol] } = await client.query("SELECT id FROM rol WHERE codigo = $1", [rolCodigo]);
    if (!rol) {
      throw new ErrorInvitacion("rol_invalido", "El rol no existe.");
    }

    // Una pendiente vencida se marca como vencida antes de emitir otra.
    await client.query(
      `UPDATE invitacion SET estado = 'vencida'
        WHERE correo_invitado = $1 AND estado = 'pendiente' AND vence_en <= $2`,
      [correoNormalizado, ahora],
    );
    // Solo puede haber una pendiente por correo.
    const { rows: pendientes } = await client.query(
      "SELECT 1 FROM invitacion WHERE correo_invitado = $1 AND estado = 'pendiente'",
      [correoNormalizado],
    );
    if (pendientes.length > 0) {
      throw new ErrorInvitacion("pendiente_existente", "Ya hay una invitación pendiente para ese correo.");
    }

    return emitir(client, { correo: correoNormalizado, rolId: rol.id, creadaPor, ahora, appUrl });
  });

  // La entrega se hace fuera de la transacción: el envío no debe revertir la invitación.
  const entrega = await entregar(enviar, correoNormalizado, enlace);
  return { id, entrega };
}

// Reenvía una invitación pendiente o vencida: revoca la anterior (si sigue pendiente) y emite una nueva.
export async function reenviarInvitacion(pool, { id, creadaPor, ahora, appUrl, enviar }) {
  const { id: nuevaId, enlace, correo } = await transaccion(pool, async (client) => {
    // Bloquea la fila para que dos reenvíos simultáneos no compitan.
    const { rows: [original] } = await client.query(
      "SELECT correo_invitado, rol_inicial_id, estado, vence_en FROM invitacion WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!original) {
      throw new ErrorInvitacion("no_encontrada", "La invitación no existe.");
    }

    // Vencida si su estado ya lo dice o si la fecha ya pasó aunque el estado siga "pendiente".
    const vencida = original.estado === "vencida" || (original.estado === "pendiente" && original.vence_en <= ahora);
    if (original.estado === "pendiente" && !vencida) {
      // Vigente: se revoca para que su enlace deje de servir.
      await client.query(
        "UPDATE invitacion SET estado = 'revocada', revocada_en = $2 WHERE id = $1",
        [id, ahora],
      );
    } else if (vencida) {
      // Vencida: se marca como vencida (si todavía decía pendiente).
      await client.query("UPDATE invitacion SET estado = 'vencida' WHERE id = $1", [id]);
    } else {
      // Aceptada o revocada no se reenvían.
      throw new ErrorInvitacion("no_reenviable", "Solo se reenvían invitaciones pendientes o vencidas.");
    }

    // Si mientras tanto el correo ya tiene cuenta, no se emite una nueva invitación.
    if (await existeCuenta(client, original.correo_invitado)) {
      throw new ErrorInvitacion("cuenta_existente", "Ya existe una cuenta con ese correo.");
    }

    // Nueva invitación con el mismo correo y rol que la original.
    const emitida = await emitir(client, {
      correo: original.correo_invitado,
      rolId: original.rol_inicial_id,
      creadaPor,
      ahora,
      appUrl,
    });
    return { ...emitida, correo: original.correo_invitado };
  });

  const entrega = await entregar(enviar, correo, enlace);
  return { id: nuevaId, entrega };
}

// Revoca una invitación pendiente. Solo cambia el estado si todavía está pendiente.
export async function revocarInvitacion(pool, { id, ahora }) {
  // Intento directo: la actualización solo afecta filas pendientes.
  const { rows } = await pool.query(
    `UPDATE invitacion SET estado = 'revocada', revocada_en = $2
      WHERE id = $1 AND estado = 'pendiente'
      RETURNING id`,
    [id, ahora],
  );
  if (rows.length === 1) {
    return { id, estado: "revocada" };
  }

  // No se revocó: se distingue si no existe o si existe pero no está pendiente.
  const { rows: existentes } = await pool.query("SELECT 1 FROM invitacion WHERE id = $1", [id]);
  if (existentes.length === 0) {
    throw new ErrorInvitacion("no_encontrada", "La invitación no existe.");
  }
  throw new ErrorInvitacion("no_revocable", "Solo se revocan invitaciones pendientes.");
}

// Estados que acepta el filtro del listado.
const estadosListables = ["pendiente", "vencida", "aceptada", "revocada"];

// Listado administrativo. El estado es el efectivo: una pendiente ya vencida figura como vencida
// aunque su estado almacenado no cambie hasta el próximo reenvío. Nunca devuelve hash_token.
export async function listarInvitaciones(pool, { pagina = 1, limite = 20, estado, correo, ahora = new Date() } = {}) {
  // Validación de paginación y del filtro de estado.
  if (!Number.isInteger(pagina) || pagina < 1) {
    throw new ErrorInvitacion("parametros_invalidos", "La página debe ser un entero mayor o igual a 1.");
  }
  if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
    throw new ErrorInvitacion("parametros_invalidos", "El límite debe estar entre 1 y 100.");
  }
  if (estado !== undefined && !estadosListables.includes(estado)) {
    throw new ErrorInvitacion("parametros_invalidos", "El estado no es válido.");
  }

  // Término de búsqueda por correo: parcial, en minúsculas y con los comodines escapados.
  const termino = correo?.trim() ? `%${escaparLike(correo.trim().toLowerCase())}%` : null;
  // Estado efectivo: una pendiente con fecha vencida cuenta como "vencida".
  const estadoEfectivo = `CASE WHEN i.estado = 'pendiente' AND i.vence_en <= $2 THEN 'vencida' ELSE i.estado END`;
  // Filtros opcionales: estado (sobre el efectivo) y correo parcial.
  const filtro = `($1::text IS NULL OR ${estadoEfectivo} = $1)
                  AND ($3::text IS NULL OR i.correo_invitado LIKE $3 ESCAPE '\\')`;
  const parametros = [estado ?? null, ahora, termino];

  // Página de invitaciones, de la más reciente a la más antigua.
  const { rows } = await pool.query(
    `SELECT i.id, i.correo_invitado, r.codigo AS rol, ${estadoEfectivo} AS estado,
            i.creada_en, i.vence_en, i.aceptada_en, i.revocada_en
       FROM invitacion i JOIN rol r ON r.id = i.rol_inicial_id
      WHERE ${filtro}
      ORDER BY i.creada_en DESC, i.id
      LIMIT $4 OFFSET $5`,
    [...parametros, limite, (pagina - 1) * limite],
  );
  // Total que cumple el filtro, para que el cliente calcule las páginas.
  const { rows: [{ total }] } = await pool.query(
    `SELECT count(*)::int AS total FROM invitacion i WHERE ${filtro}`,
    parametros,
  );

  // Devuelve solo campos públicos, con fechas en formato ISO.
  return {
    items: rows.map((fila) => ({
      id: fila.id,
      correo: fila.correo_invitado,
      rol: fila.rol,
      estado: fila.estado,
      creadaEn: fila.creada_en.toISOString(),
      venceEn: fila.vence_en.toISOString(),
      aceptadaEn: fila.aceptada_en?.toISOString() ?? null,
      revocadaEn: fila.revocada_en?.toISOString() ?? null,
    })),
    pagina,
    limite,
    total,
  };
}

// Consulta los datos públicos de una invitación pendiente sin consumir el token.
// Sirve para precargar el correo y el nombre antes de aceptar. Un token inválido
// responde con el mismo mensaje genérico que la aceptación.
export async function consultarInvitacion(pool, { token, ahora = new Date() }) {
  const { rows: [invitacion] } = await pool.query(
    `SELECT correo_invitado, vence_en, estado
       FROM invitacion WHERE hash_token = $1`,
    [hashDeToken(String(token ?? ""))],
  );
  if (!invitacion || invitacion.estado !== "pendiente" || invitacion.vence_en <= ahora) {
    throw new ErrorInvitacion("invitacion_invalida", mensajeInvitacionInvalida);
  }
  if (await existeCuenta(pool, invitacion.correo_invitado)) {
    throw new ErrorInvitacion("invitacion_invalida", mensajeInvitacionInvalida);
  }
  return {
    correo: invitacion.correo_invitado,
    nombre: null,
    venceEn: invitacion.vence_en.toISOString(),
  };
}

// Acepta una invitación: crea la cuenta con Better Auth, verifica el correo, activa el segundo factor,
// asigna el rol inicial y marca la invitación como aceptada. No inicia sesión.
export async function aceptarInvitacion(pool, { token, nombre, contrasena, ahora, secret, baseUrl }) {
  const client = await pool.connect();
  // Id del usuario creado, para poder borrarlo si la transacción falla después.
  let usuarioCreado = null;
  try {
    await client.query("BEGIN");

    // El bloqueo de la fila serializa aceptaciones simultáneas del mismo token.
    const { rows: [invitacion] } = await client.query(
      `SELECT id, correo_invitado, rol_inicial_id, creada_por, estado, vence_en
         FROM invitacion WHERE hash_token = $1 FOR UPDATE`,
      [hashDeToken(String(token ?? ""))],
    );
    // Token desconocido, ya usado, revocado o vencido: mismo mensaje para todos los casos.
    if (!invitacion || invitacion.estado !== "pendiente" || invitacion.vence_en <= ahora) {
      throw new ErrorInvitacion("invitacion_invalida", mensajeInvitacionInvalida);
    }
    // Si el correo ya tiene cuenta, la invitación tampoco sirve.
    if (await existeCuenta(client, invitacion.correo_invitado)) {
      throw new ErrorInvitacion("invitacion_invalida", mensajeInvitacionInvalida);
    }

    // Alta con el flujo de Better Auth: aplica la política de contraseñas y el hash.
    const auth = createAuth({ pool, secret, baseUrl, allowSignUp: true });
    let usuario;
    try {
      ({ user: usuario } = await auth.api.signUpEmail({
        body: { name: nombre, email: invitacion.correo_invitado, password: contrasena },
      }));
    } catch {
      // Contraseña o datos que no cumplen la política: mensaje genérico sin detalles internos.
      throw new ErrorInvitacion("datos_invalidos", "No se pudo crear la cuenta con esos datos.");
    }
    usuarioCreado = usuario.id;

    // Confirma el correo (aceptar la invitación lo prueba) y activa el segundo factor.
    await client.query(
      "UPDATE usuario SET correo_verificado = true, doble_factor_habilitado = true WHERE id = $1",
      [usuario.id],
    );
    // Asigna el rol inicial de la invitación, registrando quién la creó.
    await client.query(
      `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
       VALUES ($1, $2, $3, false)`,
      [usuario.id, invitacion.rol_inicial_id, invitacion.creada_por],
    );
    // Marca la invitación como aceptada: el enlace queda consumido.
    await client.query(
      "UPDATE invitacion SET estado = 'aceptada', aceptada_en = $2 WHERE id = $1",
      [invitacion.id, ahora],
    );

    await client.query("COMMIT");
    return usuario.id;
  } catch (error) {
    await client.query("ROLLBACK");
    // Si la cuenta ya se creó pero la asignación falló, se elimina para no dejar un usuario sin rol.
    if (usuarioCreado) {
      await pool.query("DELETE FROM usuario WHERE id = $1", [usuarioCreado]);
    }
    throw error;
  } finally {
    client.release();
  }
}
