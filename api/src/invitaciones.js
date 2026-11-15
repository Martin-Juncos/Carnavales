import { createHash, randomBytes, randomUUID } from "node:crypto";

const duracionMs = 72 * 60 * 60 * 1000;

export class ErrorInvitacion extends Error {
  constructor(codigo, mensaje = codigo) {
    super(mensaje);
    this.codigo = codigo;
  }
}

// El token nunca se guarda: solo su hash. Es aleatorio de 256 bits, así que SHA-256 basta.
export function hashDeToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function generarToken() {
  return randomBytes(32).toString("base64url");
}

function normalizarCorreo(correo) {
  const limpio = String(correo ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) {
    throw new ErrorInvitacion("correo_invalido", "El correo no es válido.");
  }
  return limpio;
}

function enlaceDe(appUrl, token) {
  return `${appUrl}/aceptar-invitacion?token=${encodeURIComponent(token)}`;
}

// La entrega no es parte de la transacción: si falla, la invitación queda pendiente y se informa.
async function entregar(enviar, correo, enlace) {
  try {
    await enviar({ correo, enlace });
    return "enviada";
  } catch {
    return "fallida";
  }
}

async function existeCuenta(client, correo) {
  const { rows } = await client.query("SELECT 1 FROM usuario WHERE correo = $1", [correo]);
  return rows.length > 0;
}

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

export async function crearInvitacion(pool, { correo, rolCodigo, creadaPor, ahora, appUrl, enviar }) {
  const correoNormalizado = normalizarCorreo(correo);

  const { id, enlace } = await transaccion(pool, async (client) => {
    if (await existeCuenta(client, correoNormalizado)) {
      throw new ErrorInvitacion("cuenta_existente", "Ya existe una cuenta con ese correo.");
    }
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
    const { rows: pendientes } = await client.query(
      "SELECT 1 FROM invitacion WHERE correo_invitado = $1 AND estado = 'pendiente'",
      [correoNormalizado],
    );
    if (pendientes.length > 0) {
      throw new ErrorInvitacion("pendiente_existente", "Ya hay una invitación pendiente para ese correo.");
    }

    return emitir(client, { correo: correoNormalizado, rolId: rol.id, creadaPor, ahora, appUrl });
  });

  const entrega = await entregar(enviar, correoNormalizado, enlace);
  return { id, entrega };
}

export async function reenviarInvitacion(pool, { id, creadaPor, ahora, appUrl, enviar }) {
  const { id: nuevaId, enlace, correo } = await transaccion(pool, async (client) => {
    const { rows: [original] } = await client.query(
      "SELECT correo_invitado, rol_inicial_id, estado, vence_en FROM invitacion WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!original) {
      throw new ErrorInvitacion("no_encontrada", "La invitación no existe.");
    }

    const vencida = original.estado === "vencida" || (original.estado === "pendiente" && original.vence_en <= ahora);
    if (original.estado === "pendiente" && !vencida) {
      await client.query(
        "UPDATE invitacion SET estado = 'revocada', revocada_en = $2 WHERE id = $1",
        [id, ahora],
      );
    } else if (vencida) {
      await client.query("UPDATE invitacion SET estado = 'vencida' WHERE id = $1", [id]);
    } else {
      throw new ErrorInvitacion("no_reenviable", "Solo se reenvían invitaciones pendientes o vencidas.");
    }

    if (await existeCuenta(client, original.correo_invitado)) {
      throw new ErrorInvitacion("cuenta_existente", "Ya existe una cuenta con ese correo.");
    }

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

export async function revocarInvitacion(pool, { id, ahora }) {
  const { rows } = await pool.query(
    `UPDATE invitacion SET estado = 'revocada', revocada_en = $2
      WHERE id = $1 AND estado = 'pendiente'
      RETURNING id`,
    [id, ahora],
  );
  if (rows.length === 1) {
    return { id, estado: "revocada" };
  }

  const { rows: existentes } = await pool.query("SELECT 1 FROM invitacion WHERE id = $1", [id]);
  if (existentes.length === 0) {
    throw new ErrorInvitacion("no_encontrada", "La invitación no existe.");
  }
  throw new ErrorInvitacion("no_revocable", "Solo se revocan invitaciones pendientes.");
}
