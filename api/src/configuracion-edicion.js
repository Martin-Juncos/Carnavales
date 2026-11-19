// Configuración administrativa de una edición: noches y especialidades.
// La API es la autoridad funcional; la base valida integridad y congelación.
// Las operaciones sensibles se registran en `auditoria` dentro de la misma transacción.

// Error de dominio con un código que la ruta traduce a un estado HTTP.
export class ErrorConfiguracion extends Error {
  constructor(codigo, mensaje = codigo) {
    super(mensaje);
    this.codigo = codigo;
  }
}

const ordenMaximo = 2147483647;
const tiposDeNoche = new Set(["COMPETENCIA", "PREMIACION"]);

export function normalizarNombre(nombre) {
  const limpio = typeof nombre === "string" ? nombre.trim() : "";
  if (limpio === "") {
    throw new ErrorConfiguracion("nombre_invalido", "El nombre es obligatorio.");
  }
  return limpio;
}

function normalizarCodigo(codigo) {
  const limpio = typeof codigo === "string" ? codigo.trim() : "";
  if (limpio === "") {
    throw new ErrorConfiguracion("codigo_invalido", "El código es obligatorio.");
  }
  return limpio;
}

export function normalizarOrden(orden) {
  const texto = typeof orden === "number" ? String(orden) : typeof orden === "string" ? orden.trim() : "";
  const valor = /^\d+$/.test(texto) ? Number(texto) : NaN;
  if (!Number.isInteger(valor) || valor < 1 || valor > ordenMaximo) {
    throw new ErrorConfiguracion("orden_invalido", "El orden debe ser un número entero positivo.");
  }
  return valor;
}

// Fecha de calendario en formato YYYY-MM-DD, o null para dejarla sin definir.
function normalizarFecha(fecha) {
  if (fecha === undefined || fecha === null) return null;
  if (typeof fecha !== "string") {
    throw new ErrorConfiguracion("fecha_invalida", "La fecha debe tener el formato AAAA-MM-DD.");
  }
  const texto = fecha.trim();
  if (texto === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    throw new ErrorConfiguracion("fecha_invalida", "La fecha debe tener el formato AAAA-MM-DD.");
  }
  const [anio, mes, dia] = texto.split("-").map(Number);
  const comprobacion = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    anio < 1 ||
    comprobacion.getUTCFullYear() !== anio ||
    comprobacion.getUTCMonth() !== mes - 1 ||
    comprobacion.getUTCDate() !== dia
  ) {
    throw new ErrorConfiguracion("fecha_invalida", "La fecha no existe en el calendario.");
  }
  return texto;
}

function normalizarTipo(tipo) {
  if (!tiposDeNoche.has(tipo)) {
    throw new ErrorConfiguracion("tipo_invalido", "El tipo de noche no es válido.");
  }
  return tipo;
}

export function normalizarBooleano(valor, codigo) {
  if (typeof valor !== "boolean") {
    throw new ErrorConfiguracion(codigo, "El valor debe ser booleano.");
  }
  return valor;
}

// Devuelve true si la edición tiene alguna noche que ya no está en DRAFT.
// El bloqueo FOR SHARE serializa la comprobación con una apertura concurrente.
async function padronCongelado(client, edicionId) {
  await client.query("SELECT 1 FROM noche WHERE edicion_id = $1 FOR SHARE", [edicionId]);
  const { rows } = await client.query(
    "SELECT 1 FROM noche WHERE edicion_id = $1 AND estado <> 'DRAFT' LIMIT 1",
    [edicionId],
  );
  return rows.length > 0;
}

export async function exigirEdicion(client, edicionId) {
  const { rows } = await client.query("SELECT 1 FROM edicion WHERE id = $1", [edicionId]);
  if (rows.length === 0) {
    throw new ErrorConfiguracion("edicion_inexistente", "La edición no existe.");
  }
}

export async function registrarAuditoria(client, { actorId, operacion, entidadTipo, entidadId }) {
  await client.query(
    `INSERT INTO auditoria (actor_id, operacion, entidad_tipo, entidad_id)
     VALUES ($1, $2, $3, $4)`,
    [actorId, operacion, entidadTipo, entidadId],
  );
}

function filaANoche(fila) {
  return {
    id: fila.id,
    edicionId: fila.edicion_id,
    orden: fila.orden,
    nombre: fila.nombre,
    fecha: fila.fecha,
    tipo: fila.tipo,
    cuentaParaPuntaje: fila.cuenta_para_puntaje,
    estado: fila.estado,
    abiertaEn: fila.abierta_en?.toISOString() ?? null,
    cerradaEn: fila.cerrada_en?.toISOString() ?? null,
  };
}

function filaAEspecialidad(fila) {
  return {
    id: fila.id,
    edicionId: fila.edicion_id,
    nombre: fila.nombre,
    codigo: fila.codigo,
    orden: fila.orden,
    activa: fila.activa,
  };
}

// ---------------------------------------------------------------------------
// Noches
// ---------------------------------------------------------------------------

export async function listarNoches(pool, edicionId) {
  await exigirEdicion(pool, edicionId);
  const { rows } = await pool.query(
    `SELECT id, edicion_id, orden, nombre, fecha::text AS fecha, tipo,
            cuenta_para_puntaje, estado, abierta_en, cerrada_en
       FROM noche
      WHERE edicion_id = $1
      ORDER BY orden`,
    [edicionId],
  );
  return { items: rows.map(filaANoche) };
}

// Crea una noche en DRAFT. Se admite tanto en CONFIGURING como en OPEN.
export async function crearNoche(pool, { edicionId, actorId, datos }) {
  const nombre = normalizarNombre(datos?.nombre);
  const orden = normalizarOrden(datos?.orden);
  const fecha = normalizarFecha(datos?.fecha);
  const tipo = normalizarTipo(datos?.tipo);
  const cuentaParaPuntaje =
    datos?.cuentaParaPuntaje === undefined
      ? true
      : normalizarBooleano(datos.cuentaParaPuntaje, "cuenta_para_puntaje_invalido");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await exigirEdicion(client, edicionId);
    const { rows: [noche] } = await client.query(
      `INSERT INTO noche (edicion_id, orden, nombre, fecha, tipo, cuenta_para_puntaje)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, edicion_id, orden, nombre, fecha::text AS fecha, tipo,
                 cuenta_para_puntaje, estado, abierta_en, cerrada_en`,
      [edicionId, orden, nombre, fecha, tipo, cuentaParaPuntaje],
    );
    await registrarAuditoria(client, {
      actorId,
      operacion: "noche_creada",
      entidadTipo: "noche",
      entidadId: noche.id,
    });
    await client.query("COMMIT");
    return filaANoche(noche);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") {
      throw new ErrorConfiguracion("orden_existente", "Ya existe una noche con ese orden en la edición.");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function actualizarNoche(pool, { edicionId, nocheId, actorId, datos }) {
  const cambios = {};
  if (Object.hasOwn(datos ?? {}, "nombre")) cambios.nombre = normalizarNombre(datos.nombre);
  if (Object.hasOwn(datos ?? {}, "orden")) cambios.orden = normalizarOrden(datos.orden);
  if (Object.hasOwn(datos ?? {}, "fecha")) cambios.fecha = normalizarFecha(datos.fecha);
  if (Object.hasOwn(datos ?? {}, "tipo")) cambios.tipo = normalizarTipo(datos.tipo);
  if (Object.hasOwn(datos ?? {}, "cuentaParaPuntaje")) {
    cambios.cuenta_para_puntaje = normalizarBooleano(datos.cuentaParaPuntaje, "cuenta_para_puntaje_invalido");
  }
  if (Object.keys(cambios).length === 0) {
    throw new ErrorConfiguracion("sin_cambios", "No se recibió ningún campo para actualizar.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, estado FROM noche WHERE id = $1 AND edicion_id = $2 FOR UPDATE`,
      [nocheId, edicionId],
    );
    if (rows.length === 0) {
      throw new ErrorConfiguracion("noche_inexistente", "La noche no existe en la edición.");
    }
    if (rows[0].estado !== "DRAFT") {
      throw new ErrorConfiguracion("noche_no_editable", "Solo se modifica una noche en DRAFT.");
    }

    const columnas = Object.keys(cambios);
    const asignaciones = columnas.map((columna, indice) => `${columna} = $${indice + 1}`);
    const valores = columnas.map((columna) => cambios[columna]);
    const { rows: [noche] } = await client.query(
      `UPDATE noche
          SET ${asignaciones.join(", ")}
        WHERE id = $${columnas.length + 1} AND edicion_id = $${columnas.length + 2}
        RETURNING id, edicion_id, orden, nombre, fecha::text AS fecha, tipo,
                  cuenta_para_puntaje, estado, abierta_en, cerrada_en`,
      [...valores, nocheId, edicionId],
    );
    await registrarAuditoria(client, {
      actorId,
      operacion: "noche_actualizada",
      entidadTipo: "noche",
      entidadId: nocheId,
    });
    await client.query("COMMIT");
    return filaANoche(noche);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") {
      throw new ErrorConfiguracion("orden_existente", "Ya existe una noche con ese orden en la edición.");
    }
    throw error;
  } finally {
    client.release();
  }
}

// Borra físicamente solo una noche en DRAFT sin asignaciones: son evidencia.
export async function eliminarNoche(pool, { edicionId, nocheId, actorId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, estado FROM noche WHERE id = $1 AND edicion_id = $2 FOR UPDATE`,
      [nocheId, edicionId],
    );
    if (rows.length === 0) {
      throw new ErrorConfiguracion("noche_inexistente", "La noche no existe en la edición.");
    }
    if (rows[0].estado !== "DRAFT") {
      throw new ErrorConfiguracion("noche_no_editable", "Solo se borra una noche en DRAFT.");
    }
    const { rows: dependencias } = await client.query(
      "SELECT 1 FROM asignacion_jurado WHERE noche_id = $1 LIMIT 1",
      [nocheId],
    );
    if (dependencias.length > 0) {
      throw new ErrorConfiguracion(
        "noche_con_dependencias",
        "La noche tiene asignaciones de jurado y no puede borrarse.",
      );
    }
    await client.query("DELETE FROM noche WHERE id = $1 AND edicion_id = $2", [nocheId, edicionId]);
    await registrarAuditoria(client, {
      actorId,
      operacion: "noche_eliminada",
      entidadTipo: "noche",
      entidadId: nocheId,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Especialidades
// ---------------------------------------------------------------------------

export async function listarEspecialidades(pool, edicionId) {
  await exigirEdicion(pool, edicionId);
  const { rows } = await pool.query(
    `SELECT id, edicion_id, nombre, codigo, orden, activa
       FROM especialidad
      WHERE edicion_id = $1
      ORDER BY orden`,
    [edicionId],
  );
  return { items: rows.map(filaAEspecialidad) };
}

export async function crearEspecialidad(pool, { edicionId, actorId, datos }) {
  const nombre = normalizarNombre(datos?.nombre);
  const codigo = normalizarCodigo(datos?.codigo);
  const orden = normalizarOrden(datos?.orden);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await exigirEdicion(client, edicionId);
    if (await padronCongelado(client, edicionId)) {
      throw new ErrorConfiguracion("padron_congelado", "El padrón está congelado: hay una noche abierta.");
    }
    const { rows: [especialidad] } = await client.query(
      `INSERT INTO especialidad (edicion_id, nombre, codigo, orden)
       VALUES ($1, $2, $3, $4)
       RETURNING id, edicion_id, nombre, codigo, orden, activa`,
      [edicionId, nombre, codigo, orden],
    );
    await registrarAuditoria(client, {
      actorId,
      operacion: "especialidad_creada",
      entidadTipo: "especialidad",
      entidadId: especialidad.id,
    });
    await client.query("COMMIT");
    return filaAEspecialidad(especialidad);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") {
      const campo = error.constraint?.includes("codigo") ? "codigo_existente" : "orden_existente";
      const mensaje =
        campo === "codigo_existente"
          ? "Ya existe una especialidad con ese código en la edición."
          : "Ya existe una especialidad con ese orden en la edición.";
      throw new ErrorConfiguracion(campo, mensaje);
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function actualizarEspecialidad(pool, { edicionId, especialidadId, actorId, datos }) {
  const cambios = {};
  if (Object.hasOwn(datos ?? {}, "nombre")) cambios.nombre = normalizarNombre(datos.nombre);
  if (Object.hasOwn(datos ?? {}, "codigo")) cambios.codigo = normalizarCodigo(datos.codigo);
  if (Object.hasOwn(datos ?? {}, "orden")) cambios.orden = normalizarOrden(datos.orden);
  if (Object.hasOwn(datos ?? {}, "activa")) cambios.activa = normalizarBooleano(datos.activa, "activa_invalida");
  if (Object.keys(cambios).length === 0) {
    throw new ErrorConfiguracion("sin_cambios", "No se recibió ningún campo para actualizar.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT id FROM especialidad WHERE id = $1 AND edicion_id = $2 FOR UPDATE",
      [especialidadId, edicionId],
    );
    if (rows.length === 0) {
      throw new ErrorConfiguracion("especialidad_inexistente", "La especialidad no existe en la edición.");
    }
    if (await padronCongelado(client, edicionId)) {
      throw new ErrorConfiguracion("padron_congelado", "El padrón está congelado: hay una noche abierta.");
    }

    const columnas = Object.keys(cambios);
    const asignaciones = columnas.map((columna, indice) => `${columna} = $${indice + 1}`);
    const valores = columnas.map((columna) => cambios[columna]);
    const { rows: [especialidad] } = await client.query(
      `UPDATE especialidad
          SET ${asignaciones.join(", ")}
        WHERE id = $${columnas.length + 1} AND edicion_id = $${columnas.length + 2}
        RETURNING id, edicion_id, nombre, codigo, orden, activa`,
      [...valores, especialidadId, edicionId],
    );
    await registrarAuditoria(client, {
      actorId,
      operacion: "especialidad_actualizada",
      entidadTipo: "especialidad",
      entidadId: especialidadId,
    });
    await client.query("COMMIT");
    return filaAEspecialidad(especialidad);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23505") {
      const campo = error.constraint?.includes("codigo") ? "codigo_existente" : "orden_existente";
      const mensaje =
        campo === "codigo_existente"
          ? "Ya existe una especialidad con ese código en la edición."
          : "Ya existe una especialidad con ese orden en la edición.";
      throw new ErrorConfiguracion(campo, mensaje);
    }
    throw error;
  } finally {
    client.release();
  }
}

// Borra físicamente solo una especialidad sin asignaciones y con el padrón editable.
export async function eliminarEspecialidad(pool, { edicionId, especialidadId, actorId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT id FROM especialidad WHERE id = $1 AND edicion_id = $2 FOR UPDATE",
      [especialidadId, edicionId],
    );
    if (rows.length === 0) {
      throw new ErrorConfiguracion("especialidad_inexistente", "La especialidad no existe en la edición.");
    }
    if (await padronCongelado(client, edicionId)) {
      throw new ErrorConfiguracion("padron_congelado", "El padrón está congelado: hay una noche abierta.");
    }
    const { rows: dependencias } = await client.query(
      "SELECT 1 FROM asignacion_jurado WHERE especialidad_id = $1 LIMIT 1",
      [especialidadId],
    );
    if (dependencias.length > 0) {
      throw new ErrorConfiguracion(
        "especialidad_con_dependencias",
        "La especialidad tiene asignaciones de jurado y no puede borrarse.",
      );
    }
    await client.query("DELETE FROM especialidad WHERE id = $1 AND edicion_id = $2", [
      especialidadId,
      edicionId,
    ]);
    await registrarAuditoria(client, {
      actorId,
      operacion: "especialidad_eliminada",
      entidadTipo: "especialidad",
      entidadId: especialidadId,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (error.code === "23503") {
      throw new ErrorConfiguracion(
        "especialidad_con_dependencias",
        "La especialidad tiene dependencias y no puede borrarse.",
      );
    }
    throw error;
  } finally {
    client.release();
  }
}
