// Consultas, altas, revocaciones y reemplazos de asignaciones de jurado. No
// exponen puntajes ni secretos: solo la relación jurado/noche/especialidad y los
// estados necesarios para detectar coberturas faltantes antes de abrir una noche.

// Error de dominio para altas de asignaciones. `codigo` identifica el caso para
// que la ruta elija el estado HTTP y devuelva un mensaje controlado.
export class ErrorAsignacion extends Error {
  constructor(codigo, mensaje = codigo) {
    super(mensaje);
    this.codigo = codigo;
  }
}

// Formato de los identificadores uuid de noche y especialidad. Los ids de usuario
// son texto (p. ej. "u-jurado-1"), por eso se validan de forma distinta.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const indiceAsignacionActiva = "asignacion_jurado_activa_unica";
const mensajeDuplicado = "Ya existe una asignación activa para ese jurado, noche y especialidad.";
const estadoActiva = "ACTIVA";
const estadoRevocada = "REVOCADA";
const entidadAsignacion = "asignacion_jurado";
const operacionCreacion = "asignacion_creada";
const operacionRevocacion = "asignacion_revocada";
const operacionReemplazo = "asignacion_reemplazada";

function textoRequerido(valor, mensaje) {
  const limpio = typeof valor === "string" ? valor.trim() : "";
  if (limpio === "") {
    throw new ErrorAsignacion("campos_invalidos", mensaje);
  }
  return limpio;
}

export function uuidRequerido(valor, mensaje) {
  const limpio = textoRequerido(valor, mensaje);
  if (!uuid.test(limpio)) {
    throw new ErrorAsignacion("campos_invalidos", mensaje);
  }
  return limpio;
}

// Proyección compartida por el listado y por la respuesta de creación: ambos
// devuelven la misma forma, así que el contrato no depende de dos SELECT distintos.
const consultaAsignaciones = `
  SELECT a.id, a.estado, a.creada_en, a.revocada_en,
         u.id AS jurado_id, u.nombre AS jurado_nombre,
         EXISTS (
           SELECT 1 FROM usuario_rol ur
           JOIN rol r ON r.id = ur.rol_id
          WHERE ur.usuario_id = u.id AND r.codigo = 'JURADO'
         ) AS jurado_activo,
         n.id AS noche_id, n.nombre AS noche_nombre, n.orden AS noche_orden,
         n.estado AS noche_estado,
         e.id AS especialidad_id, e.nombre AS especialidad_nombre,
         e.codigo AS especialidad_codigo, e.activa AS especialidad_activa
    FROM asignacion_jurado a
    JOIN edicion ed ON ed.id = a.edicion_id
    JOIN usuario u ON u.id = a.jurado_id
    JOIN noche n ON n.id = a.noche_id AND n.edicion_id = a.edicion_id
    JOIN especialidad e ON e.id = a.especialidad_id AND e.edicion_id = a.edicion_id`;

function mapearAsignacion(fila) {
  return {
    id: fila.id,
    estado: fila.estado,
    creadaEn: fila.creada_en.toISOString(),
    revocadaEn: fila.revocada_en ? fila.revocada_en.toISOString() : null,
    jurado: { id: fila.jurado_id, nombre: fila.jurado_nombre, activo: fila.jurado_activo },
    noche: {
      id: fila.noche_id,
      nombre: fila.noche_nombre,
      orden: fila.noche_orden,
      estado: fila.noche_estado,
    },
    especialidad: {
      id: fila.especialidad_id,
      nombre: fila.especialidad_nombre,
      codigo: fila.especialidad_codigo,
      activa: fila.especialidad_activa,
    },
  };
}

// Lista todas las asignaciones, activas y revocadas, ordenadas por edición, noche,
// especialidad y jurado. Incluir las revocadas conserva la trazabilidad de la cobertura.
export async function listarAsignaciones(pool) {
  const { rows } = await pool.query(`${consultaAsignaciones}
   ORDER BY ed.anio DESC, n.orden, e.orden, u.nombre, a.id`);
  return { items: rows.map(mapearAsignacion) };
}

// Catálogos de solo lectura que el panel necesita para armar el formulario de
// alta: sin ellos no se podría asignar una noche que todavía no tiene cobertura.
// No exponen puntajes ni reglas de cálculo.
export async function listarNoches(pool) {
  const { rows } = await pool.query(
    `SELECT n.id, n.nombre, n.orden, n.estado,
            ed.id AS edicion_id, ed.nombre AS edicion_nombre, ed.anio AS edicion_anio
       FROM noche n
       JOIN edicion ed ON ed.id = n.edicion_id
      ORDER BY ed.anio DESC, n.orden, n.id`,
  );
  return {
    items: rows.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      orden: fila.orden,
      estado: fila.estado,
      edicion: { id: fila.edicion_id, nombre: fila.edicion_nombre, anio: fila.edicion_anio },
    })),
  };
}

export async function listarEspecialidades(pool) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre, e.codigo, e.activa,
            ed.id AS edicion_id, ed.nombre AS edicion_nombre, ed.anio AS edicion_anio
       FROM especialidad e
       JOIN edicion ed ON ed.id = e.edicion_id
      ORDER BY ed.anio DESC, e.orden, e.id`,
  );
  return {
    items: rows.map((fila) => ({
      id: fila.id,
      nombre: fila.nombre,
      codigo: fila.codigo,
      activa: fila.activa,
      edicion: { id: fila.edicion_id, nombre: fila.edicion_nombre, anio: fila.edicion_anio },
    })),
  };
}

// Usuarios con rol JURADO disponibles para asignar. No devuelve hashes ni secretos.
export async function listarJurados(pool) {
  const { rows } = await pool.query(
    `SELECT u.id, u.nombre, u.correo
       FROM usuario u
       JOIN usuario_rol ur ON ur.usuario_id = u.id
       JOIN rol r ON r.id = ur.rol_id AND r.codigo = 'JURADO'
      ORDER BY u.nombre, u.id`,
  );
  return { items: rows.map((fila) => ({ id: fila.id, nombre: fila.nombre, correo: fila.correo })) };
}

// Cada validación es una consulta pequeña y devuelve un error de dominio, nunca
// un error de PostgreSQL. Se ejecutan dentro de la transacción de creación.
async function exigirJurado(client, juradoId) {
  const { rows: [jurado] } = await client.query(
    `SELECT 1
       FROM usuario u
       JOIN usuario_rol ur ON ur.usuario_id = u.id
       JOIN rol r ON r.id = ur.rol_id AND r.codigo = 'JURADO'
      WHERE u.id = $1`,
    [juradoId],
  );
  if (!jurado) {
    throw new ErrorAsignacion("jurado_invalido", "El jurado no existe o no tiene el rol JURADO.");
  }
}

// FOR SHARE bloquea la fila frente a una apertura concurrente de la noche:
// la decisión de si se admiten altas se toma con el estado aún vigente.
async function exigirNocheDraft(client, nocheId) {
  const { rows: [noche] } = await client.query(
    "SELECT edicion_id, estado FROM noche WHERE id = $1 FOR SHARE",
    [nocheId],
  );
  if (!noche) {
    throw new ErrorAsignacion("noche_inexistente", "La noche no existe.");
  }
  if (noche.estado !== "DRAFT") {
    throw new ErrorAsignacion("noche_abierta", "La noche ya está abierta o cerrada; no se admiten altas.");
  }
  return noche.edicion_id;
}

// La FK compuesta de la migración 0007 impide mezclar ediciones; se comprueba
// aquí también para devolver un error de dominio en vez de un error de PostgreSQL.
async function exigirEspecialidadActiva(client, especialidadId, edicionId) {
  const { rows: [especialidad] } = await client.query(
    `SELECT 1 FROM especialidad
      WHERE id = $1 AND edicion_id = $2 AND activa = true`,
    [especialidadId, edicionId],
  );
  if (!especialidad) {
    throw new ErrorAsignacion(
      "especialidad_invalida",
      "La especialidad no existe, está inactiva o pertenece a otra edición.",
    );
  }
}

async function rechazarDuplicado(client, { juradoId, nocheId, especialidadId }) {
  const { rows: [duplicado] } = await client.query(
    `SELECT 1 FROM asignacion_jurado
      WHERE jurado_id = $1 AND noche_id = $2 AND especialidad_id = $3 AND estado = 'ACTIVA'`,
    [juradoId, nocheId, especialidadId],
  );
  if (duplicado) {
    throw new ErrorAsignacion("asignacion_duplicada", mensajeDuplicado);
  }
}

// Ejecuta una operación completa en una transacción y libera siempre la conexión.
// El índice único resuelve la carrera de dos peticiones que pasaron la
// comprobación previa; otros 23505 se dejan pasar como error no previsto.
async function conTransaccion(pool, operacion) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const resultado = await operacion(client);
    await client.query("COMMIT");
    return resultado;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505" && error.constraint === indiceAsignacionActiva) {
      throw new ErrorAsignacion("asignacion_duplicada", mensajeDuplicado);
    }
    throw error;
  } finally {
    client.release();
  }
}

function registrarAuditoria(client, actorId, operacion, entidadId) {
  return client.query(
    `INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id)
     VALUES ($1, $2, $3, $4)`,
    [actorId, operacion, entidadAsignacion, entidadId],
  );
}

// Baja lógica compartida. El trigger de la migración 0007 garantiza que esta
// sea la única transición posible y que la identidad de la fila no cambie.
function marcarRevocada(client, id, actorId) {
  return client.query(
    `UPDATE asignacion_jurado
        SET estado = $2, revocada_por = $3, revocada_en = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [id, estadoRevocada, actorId],
  );
}

async function leerAsignacion(client, id) {
  const { rows: [fila] } = await client.query(`${consultaAsignaciones} WHERE a.id = $1`, [id]);
  return mapearAsignacion(fila);
}

// Crea una asignación activa. Solo se admiten altas mientras la noche siga en
// DRAFT, aunque la edición ya esté OPEN (preparación de jornadas futuras).
export async function crearAsignacion(pool, { juradoId, nocheId, especialidadId, creadaPor }) {
  const datos = {
    juradoId: textoRequerido(juradoId, "El jurado es obligatorio."),
    nocheId: uuidRequerido(nocheId, "La noche debe ser un identificador válido."),
    especialidadId: uuidRequerido(especialidadId, "La especialidad debe ser un identificador válido."),
  };

  return conTransaccion(pool, async (client) => {
    await exigirJurado(client, datos.juradoId);
    const edicionId = await exigirNocheDraft(client, datos.nocheId);
    await exigirEspecialidadActiva(client, datos.especialidadId, edicionId);
    await rechazarDuplicado(client, datos);

    const { rows: [insertada] } = await client.query(
      `INSERT INTO asignacion_jurado (edicion_id, jurado_id, noche_id, especialidad_id, creada_por)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [edicionId, datos.juradoId, datos.nocheId, datos.especialidadId, creadaPor],
    );
    await registrarAuditoria(client, creadaPor, operacionCreacion, insertada.id);
    return leerAsignacion(client, insertada.id);
  });
}

// Bloquea la fila y exige que siga activa. FOR UPDATE evita que dos revocaciones
// o un reemplazo concurrente actúen sobre el mismo estado.
async function exigirAsignacionActiva(client, id) {
  const { rows: [asignacion] } = await client.query(
    `SELECT id, edicion_id, jurado_id, noche_id, especialidad_id, estado
       FROM asignacion_jurado WHERE id = $1 FOR UPDATE`,
    [id],
  );
  if (!asignacion) {
    throw new ErrorAsignacion("asignacion_no_encontrada", "La asignación no existe.");
  }
  if (asignacion.estado !== estadoActiva) {
    throw new ErrorAsignacion("asignacion_no_activa", "La asignación ya está revocada.");
  }
  return asignacion;
}

// Da de baja la asignación sin borrarla: el trigger de la migración 0007 rechaza
// cualquier DELETE y solo admite la transición ACTIVA → REVOCADA. La evidencia
// de la fila original (identidad, creador y fecha) permanece intacta.
export async function revocarAsignacion(pool, { id, actorId }) {
  const asignacionId = uuidRequerido(id, "La asignación debe ser un identificador válido.");

  return conTransaccion(pool, async (client) => {
    await exigirAsignacionActiva(client, asignacionId);
    await marcarRevocada(client, asignacionId, actorId);
    await registrarAuditoria(client, actorId, operacionRevocacion, asignacionId);
    return leerAsignacion(client, asignacionId);
  });
}

// Reemplaza jurado y/o especialidad revocando la asignación original y creando
// una nueva en la misma transacción. El trigger impide mutar la identidad de la
// fila original, así que el reemplazo nunca es un UPDATE de sus campos.
// La noche y la edición se heredan: no se reasigna a otra jornada.
export async function reemplazarAsignacion(pool, { id, juradoId, especialidadId, actorId }) {
  const asignacionId = uuidRequerido(id, "La asignación debe ser un identificador válido.");
  const cambios = {
    juradoId: juradoId === undefined || juradoId === null ? undefined : textoRequerido(juradoId, "El jurado es obligatorio."),
    especialidadId:
      especialidadId === undefined || especialidadId === null
        ? undefined
        : uuidRequerido(especialidadId, "La especialidad debe ser un identificador válido."),
  };
  if (cambios.juradoId === undefined && cambios.especialidadId === undefined) {
    throw new ErrorAsignacion("campos_invalidos", "El reemplazo debe indicar un jurado o una especialidad.");
  }

  return conTransaccion(pool, async (client) => {
    // Lock the night before the assignment, as opening also takes the night lock first.
    await client.query(
      `SELECT 1 FROM noche n JOIN asignacion_jurado a ON a.noche_id = n.id
        WHERE a.id = $1 FOR SHARE OF n`, [asignacionId],
    );
    const original = await exigirAsignacionActiva(client, asignacionId);
    const juradoEfectivo = cambios.juradoId ?? original.jurado_id;
    const especialidadEfectiva = cambios.especialidadId ?? original.especialidad_id;
    if (juradoEfectivo === original.jurado_id && especialidadEfectiva === original.especialidad_id) {
      throw new ErrorAsignacion("campos_invalidos", "El reemplazo debe cambiar el jurado o la especialidad.");
    }

    await exigirJurado(client, juradoEfectivo);
    await exigirEspecialidadActiva(client, especialidadEfectiva, original.edicion_id);
    if (especialidadEfectiva !== original.especialidad_id) {
      const { rowCount } = await client.query(
        `SELECT 1 FROM instantanea_planillas_esperadas i
          WHERE i.noche_id = $1 AND i.filas_configuradas
            AND NOT EXISTS (
              SELECT 1 FROM configuracion_planilla_noche c
               WHERE c.noche_id = i.noche_id AND c.version_id = i.version_id AND c.especialidad_id = $2
            )`, [original.noche_id, especialidadEfectiva],
      );
      if (rowCount) {
        throw new ErrorAsignacion("especialidad_sin_planilla", "La especialidad no tiene planilla fijada para esta noche.");
      }
    }
    await rechazarDuplicado(client, {
      juradoId: juradoEfectivo,
      nocheId: original.noche_id,
      especialidadId: especialidadEfectiva,
    });

    await marcarRevocada(client, asignacionId, actorId);
    await registrarAuditoria(client, actorId, operacionReemplazo, asignacionId);

    const { rows: [insertada] } = await client.query(
      `INSERT INTO asignacion_jurado (edicion_id, jurado_id, noche_id, especialidad_id, creada_por)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [original.edicion_id, juradoEfectivo, original.noche_id, especialidadEfectiva, actorId],
    );
    await registrarAuditoria(client, actorId, operacionCreacion, insertada.id);
    return leerAsignacion(client, insertada.id);
  });
}
