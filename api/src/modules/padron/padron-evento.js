// Administración del padrón de una edición: comparsas, participantes, sujetos
// evaluables y orden de presentación por noche.
// La congelación y las reglas de integridad viven en la migración 0008; este
// módulo traduce sus violaciones a códigos de dominio y registra auditoría.

import { ErrorConfiguracion, exigirEdicion, normalizarBooleano, normalizarNombre, normalizarOrden } from "../ediciones/configuracion-edicion.js";
import { registrarAuditoria } from "../../shared/auditoria.js";

const categoriasDeComparsa = new Set(["PRIMERA", "AGRUPACION"]);
export const tiposDeSujeto = new Set([
  "PERSONA",
  "PAREJA",
  "GRUPO",
  "TRAJE",
  "CARRO",
  "CARROZA_REINA",
  "BATERIA",
  "BANDA_MUSICAL",
  "TEMA_INEDITO",
  "COMPARSA",
]);

const columnasComparsa = "id, edicion_id, nombre, categoria, activa";
const columnasParticipante = "id, edicion_id, nombre_completo, es_menor, activo";
const columnasSujeto = "id, edicion_id, comparsa_id, tipo_sujeto, participante_id, nombre, activo";

function filaAComparsa(fila) {
  return {
    id: fila.id,
    edicionId: fila.edicion_id,
    nombre: fila.nombre,
    categoria: fila.categoria,
    activa: fila.activa,
  };
}

function filaAParticipante(fila) {
  return {
    id: fila.id,
    edicionId: fila.edicion_id,
    nombreCompleto: fila.nombre_completo,
    esMenor: fila.es_menor,
    activo: fila.activo,
  };
}

function filaASujeto(fila) {
  return {
    id: fila.id,
    edicionId: fila.edicion_id,
    comparsaId: fila.comparsa_id,
    tipoSujeto: fila.tipo_sujeto,
    participanteId: fila.participante_id,
    nombre: fila.nombre,
    activo: fila.activo,
  };
}

// Traduce las violaciones de la base a errores de dominio; las demás se relanzan.
function traducirErrorPadron(error) {
  const mensaje = error.message ?? "";
  if (error.code === "23514") {
    if (mensaje.includes("PADRON_CONGELADO")) {
      return new ErrorConfiguracion("padron_congelado", "El padrón está congelado: hay una noche abierta.");
    }
    if (mensaje.includes("COMPARSA_CON_PADRON")) {
      return new ErrorConfiguracion("comparsa_con_padron", "La comparsa tiene padrón cargado y no puede desactivarse.");
    }
    if (mensaje.includes("COMPARSA_INACTIVA")) {
      return new ErrorConfiguracion("comparsa_inactiva", "La comparsa está inactiva y no entra en el padrón.");
    }
    if (mensaje.includes("ORDEN_CONGELADO")) {
      return new ErrorConfiguracion("noche_no_editable", "Solo se modifica el orden de una noche en DRAFT.");
    }
    if (error.constraint?.startsWith("sujeto_evaluable_check")) {
      return new ErrorConfiguracion("sujeto_datos_invalidos", "Los datos del sujeto no son coherentes con su tipo.");
    }
  }
  if (error.code === "23505") {
    if (error.constraint === "comparsa_edicion_id_nombre_key") {
      return new ErrorConfiguracion("nombre_existente", "Ya existe una comparsa con ese nombre en la edición.");
    }
    if (error.constraint === "sujeto_evaluable_participante_comparsa_uidx") {
      return new ErrorConfiguracion("participante_ya_en_comparsa", "El participante ya es sujeto de esa comparsa.");
    }
    if (error.constraint === "orden_presentacion_noche_posicion_uk") {
      return new ErrorConfiguracion("orden_existente", "Dos comparsas no pueden ocupar el mismo lugar de la noche.");
    }
  }
  if (error.code === "23503") {
    return new ErrorConfiguracion("referencia_inexistente", "Alguna referencia no existe en la edición.");
  }
  if (error.code === "23001") {
    return new ErrorConfiguracion("con_dependencias", "El registro tiene historial asociado y no puede borrarse.");
  }
  return error;
}

// Ejecuta la operación en una transacción con auditoría y traduce errores de la base.
async function transaccion(pool, operacion) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const resultado = await operacion(client);
    await client.query("COMMIT");
    return resultado;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw traducirErrorPadron(error);
  } finally {
    client.release();
  }
}

// Arma un UPDATE con solo los campos recibidos. Devuelve la fila actualizada o null si no existe.
async function actualizarFila(client, { tabla, columnas, id, edicionId, cambios }) {
  const nombresColumnas = Object.keys(cambios);
  if (nombresColumnas.length === 0) {
    throw new ErrorConfiguracion("sin_cambios", "No se recibió ningún campo para actualizar.");
  }
  const asignaciones = nombresColumnas.map((columna, indice) => `${columna} = $${indice + 1}`);
  const valores = nombresColumnas.map((columna) => cambios[columna]);
  const { rows } = await client.query(
    `UPDATE ${tabla}
        SET ${asignaciones.join(", ")}
      WHERE id = $${nombresColumnas.length + 1} AND edicion_id = $${nombresColumnas.length + 2}
      RETURNING ${columnas}`,
    [...valores, id, edicionId],
  );
  return rows[0] ?? null;
}

function camposPresentes(datos, nombres) {
  return nombres.filter((nombre) => Object.hasOwn(datos ?? {}, nombre));
}

function normalizarCategoria(categoria) {
  if (!categoriasDeComparsa.has(categoria)) {
    throw new ErrorConfiguracion("categoria_invalida", "La categoría de la comparsa no es válida.");
  }
  return categoria;
}

function normalizarTipoSujeto(tipo) {
  if (!tiposDeSujeto.has(tipo)) {
    throw new ErrorConfiguracion("tipo_sujeto_invalido", "El tipo de sujeto evaluable no es válido.");
  }
  return tipo;
}

// ---------------------------------------------------------------------------
// Comparsas
// ---------------------------------------------------------------------------

export async function listarComparsas(pool, edicionId) {
  await exigirEdicion(pool, edicionId);
  const { rows } = await pool.query(
    `SELECT ${columnasComparsa} FROM comparsa WHERE edicion_id = $1 ORDER BY nombre`,
    [edicionId],
  );
  return { items: rows.map(filaAComparsa) };
}

export async function crearComparsa(pool, { edicionId, actorId, datos }) {
  const nombre = normalizarNombre(datos?.nombre);
  const categoria = normalizarCategoria(datos?.categoria);
  const activa =
    datos?.activa === undefined ? true : normalizarBooleano(datos.activa, "activa_invalida");

  return transaccion(pool, async (client) => {
    await exigirEdicion(client, edicionId, { proteger: true });
    const { rows: [fila] } = await client.query(
      `INSERT INTO comparsa (edicion_id, nombre, categoria, activa)
       VALUES ($1, $2, $3, $4)
       RETURNING ${columnasComparsa}`,
      [edicionId, nombre, categoria, activa],
    );
    await registrarAuditoria(client, {
      actorId,
      operacion: "comparsa_creada",
      entidadTipo: "comparsa",
      entidadId: fila.id,
    });
    return filaAComparsa(fila);
  });
}

export async function actualizarComparsa(pool, { edicionId, comparsaId, actorId, datos }) {
  const cambios = {};
  if (camposPresentes(datos, ["nombre"]).length) cambios.nombre = normalizarNombre(datos.nombre);
  if (camposPresentes(datos, ["categoria"]).length) cambios.categoria = normalizarCategoria(datos.categoria);
  if (camposPresentes(datos, ["activa"]).length) {
    cambios.activa = normalizarBooleano(datos.activa, "activa_invalida");
  }

  return transaccion(pool, async (client) => {
    const fila = await actualizarFila(client, {
      tabla: "comparsa",
      columnas: columnasComparsa,
      id: comparsaId,
      edicionId,
      cambios,
    });
    if (!fila) {
      throw new ErrorConfiguracion("comparsa_inexistente", "La comparsa no existe en la edición.");
    }
    await registrarAuditoria(client, {
      actorId,
      operacion: "comparsa_actualizada",
      entidadTipo: "comparsa",
      entidadId: comparsaId,
    });
    return filaAComparsa(fila);
  });
}

export async function eliminarComparsa(pool, { edicionId, comparsaId, actorId }) {
  await transaccion(pool, async (client) => {
    const { rowCount } = await client.query(
      "DELETE FROM comparsa WHERE id = $1 AND edicion_id = $2",
      [comparsaId, edicionId],
    );
    if (rowCount === 0) {
      throw new ErrorConfiguracion("comparsa_inexistente", "La comparsa no existe en la edición.");
    }
    await registrarAuditoria(client, {
      actorId,
      operacion: "comparsa_eliminada",
      edicionId,
      entidadTipo: "comparsa",
      entidadId: comparsaId,
    });
  });
}

// ---------------------------------------------------------------------------
// Participantes
// ---------------------------------------------------------------------------

export async function listarParticipantes(pool, edicionId) {
  await exigirEdicion(pool, edicionId);
  const { rows } = await pool.query(
    `SELECT ${columnasParticipante} FROM participante WHERE edicion_id = $1 ORDER BY nombre_completo`,
    [edicionId],
  );
  return { items: rows.map(filaAParticipante) };
}

export async function crearParticipante(pool, { edicionId, actorId, datos }) {
  const nombreCompleto = normalizarNombre(datos?.nombreCompleto);
  const esMenor =
    datos?.esMenor === undefined ? false : normalizarBooleano(datos.esMenor, "es_menor_invalido");
  const activo = datos?.activo === undefined ? true : normalizarBooleano(datos.activo, "activo_invalido");

  return transaccion(pool, async (client) => {
    await exigirEdicion(client, edicionId, { proteger: true });
    const { rows: [fila] } = await client.query(
      `INSERT INTO participante (edicion_id, nombre_completo, es_menor, activo)
       VALUES ($1, $2, $3, $4)
       RETURNING ${columnasParticipante}`,
      [edicionId, nombreCompleto, esMenor, activo],
    );
    await registrarAuditoria(client, {
      actorId,
      operacion: "participante_creado",
      entidadTipo: "participante",
      entidadId: fila.id,
    });
    return filaAParticipante(fila);
  });
}

export async function actualizarParticipante(pool, { edicionId, participanteId, actorId, datos }) {
  const cambios = {};
  if (camposPresentes(datos, ["nombreCompleto"]).length) {
    cambios.nombre_completo = normalizarNombre(datos.nombreCompleto);
  }
  if (camposPresentes(datos, ["esMenor"]).length) {
    cambios.es_menor = normalizarBooleano(datos.esMenor, "es_menor_invalido");
  }
  if (camposPresentes(datos, ["activo"]).length) {
    cambios.activo = normalizarBooleano(datos.activo, "activo_invalido");
  }

  return transaccion(pool, async (client) => {
    const fila = await actualizarFila(client, {
      tabla: "participante",
      columnas: columnasParticipante,
      id: participanteId,
      edicionId,
      cambios,
    });
    if (!fila) {
      throw new ErrorConfiguracion("participante_inexistente", "El participante no existe en la edición.");
    }
    await registrarAuditoria(client, {
      actorId,
      operacion: "participante_actualizado",
      entidadTipo: "participante",
      entidadId: participanteId,
    });
    return filaAParticipante(fila);
  });
}

// ---------------------------------------------------------------------------
// Sujetos evaluables
// ---------------------------------------------------------------------------

export async function listarSujetos(pool, { edicionId, comparsaId }) {
  await exigirEdicion(pool, edicionId);
  const { rows: comparsas } = await pool.query(
    "SELECT 1 FROM comparsa WHERE id = $1 AND edicion_id = $2",
    [comparsaId, edicionId],
  );
  if (comparsas.length === 0) {
    throw new ErrorConfiguracion("comparsa_inexistente", "La comparsa no existe en la edición.");
  }
  const { rows } = await pool.query(
    `SELECT ${columnasSujeto} FROM sujeto_evaluable
      WHERE edicion_id = $1 AND comparsa_id = $2
      ORDER BY tipo_sujeto, nombre`,
    [edicionId, comparsaId],
  );
  return { items: rows.map(filaASujeto) };
}

// Una PERSONA referencia a un participante; los demás tipos llevan un nombre propio.
function normalizarSujeto(datos) {
  const tipoSujeto = normalizarTipoSujeto(datos?.tipoSujeto);
  if (tipoSujeto === "PERSONA") {
    if (typeof datos?.participanteId !== "string" || datos.participanteId.trim() === "") {
      throw new ErrorConfiguracion("sujeto_datos_invalidos", "Una persona requiere un participante.");
    }
    return { tipoSujeto, participanteId: datos.participanteId.trim(), nombre: null };
  }
  if (datos?.participanteId !== undefined && datos.participanteId !== null) {
    throw new ErrorConfiguracion("sujeto_datos_invalidos", "Solo una persona referencia a un participante.");
  }
  return { tipoSujeto, participanteId: null, nombre: normalizarNombre(datos?.nombre) };
}

export async function crearSujeto(pool, { edicionId, comparsaId, actorId, datos }) {
  const sujeto = normalizarSujeto(datos);
  const activo = datos?.activo === undefined ? true : normalizarBooleano(datos.activo, "activo_invalido");

  return transaccion(pool, async (client) => {
    await exigirEdicion(client, edicionId, { proteger: true });
    const { rows: [fila] } = await client.query(
      `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, participante_id, nombre, activo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${columnasSujeto}`,
      [edicionId, comparsaId, sujeto.tipoSujeto, sujeto.participanteId, sujeto.nombre, activo],
    );
    await registrarAuditoria(client, {
      actorId,
      operacion: "sujeto_creado",
      entidadTipo: "sujeto_evaluable",
      entidadId: fila.id,
    });
    return filaASujeto(fila);
  });
}

// Solo se cambian el nombre y el estado. Tipo y participante se fijan al crear.
export async function actualizarSujeto(pool, { edicionId, sujetoId, actorId, datos }) {
  const cambios = {};
  if (camposPresentes(datos, ["nombre"]).length) cambios.nombre = normalizarNombre(datos.nombre);
  if (camposPresentes(datos, ["activo"]).length) {
    cambios.activo = normalizarBooleano(datos.activo, "activo_invalido");
  }

  return transaccion(pool, async (client) => {
    const { rows: [actual] } = await client.query(
      "SELECT tipo_sujeto FROM sujeto_evaluable WHERE id = $1 AND edicion_id = $2",
      [sujetoId, edicionId],
    );
    if (!actual) {
      throw new ErrorConfiguracion("sujeto_inexistente", "El sujeto evaluable no existe en la edición.");
    }
    if (actual.tipo_sujeto === "PERSONA" && cambios.nombre !== undefined) {
      throw new ErrorConfiguracion("sujeto_datos_invalidos", "El nombre de una persona sale de su participante.");
    }
    const fila = await actualizarFila(client, {
      tabla: "sujeto_evaluable",
      columnas: columnasSujeto,
      id: sujetoId,
      edicionId,
      cambios,
    });
    await registrarAuditoria(client, {
      actorId,
      operacion: "sujeto_actualizado",
      entidadTipo: "sujeto_evaluable",
      entidadId: sujetoId,
    });
    return filaASujeto(fila);
  });
}

export async function eliminarSujeto(pool, { edicionId, sujetoId, actorId }) {
  await transaccion(pool, async (client) => {
    const { rowCount } = await client.query(
      "DELETE FROM sujeto_evaluable WHERE id = $1 AND edicion_id = $2",
      [sujetoId, edicionId],
    );
    if (rowCount === 0) {
      throw new ErrorConfiguracion("sujeto_inexistente", "El sujeto evaluable no existe en la edición.");
    }
    await registrarAuditoria(client, {
      actorId,
      operacion: "sujeto_eliminado",
      edicionId,
      entidadTipo: "sujeto_evaluable",
      entidadId: sujetoId,
    });
  });
}

// ---------------------------------------------------------------------------
// Orden de presentación por noche
// ---------------------------------------------------------------------------

export async function listarOrdenPresentacion(pool, { edicionId, nocheId }) {
  await exigirEdicion(pool, edicionId);
  const { rows: noches } = await pool.query(
    "SELECT 1 FROM noche WHERE id = $1 AND edicion_id = $2",
    [nocheId, edicionId],
  );
  if (noches.length === 0) {
    throw new ErrorConfiguracion("noche_inexistente", "La noche no existe en la edición.");
  }
  const { rows } = await pool.query(
    `SELECT comparsa_id, orden_presentacion, estado
       FROM orden_presentacion
      WHERE noche_id = $1 AND edicion_id = $2
      ORDER BY orden_presentacion`,
    [nocheId, edicionId],
  );
  return {
    items: rows.map((fila) => ({
      comparsaId: fila.comparsa_id,
      orden: fila.orden_presentacion,
      estado: fila.estado,
    })),
  };
}

// Reemplaza el orden completo de la noche. La noche debe estar en DRAFT; la
// restricción de posición se difiere para permitir el intercambio de lugares.
export async function guardarOrdenPresentacion(pool, { edicionId, nocheId, actorId, datos }) {
  const items = datos?.items;
  if (!Array.isArray(items)) {
    throw new ErrorConfiguracion("orden_invalido", "El orden debe enviarse como lista de comparsas.");
  }
  const normalizados = items.map((item) => ({
    comparsaId: typeof item?.comparsaId === "string" ? item.comparsaId.trim() : "",
    orden: normalizarOrden(item?.orden),
  }));
  if (normalizados.some((item) => item.comparsaId === "")) {
    throw new ErrorConfiguracion("orden_invalido", "Cada posición necesita una comparsa.");
  }
  if (new Set(normalizados.map((item) => item.comparsaId)).size !== normalizados.length) {
    throw new ErrorConfiguracion("orden_existente", "Una comparsa aparece más de una vez en el orden.");
  }
  if (new Set(normalizados.map((item) => item.orden)).size !== normalizados.length) {
    throw new ErrorConfiguracion("orden_existente", "Dos comparsas no pueden ocupar el mismo lugar de la noche.");
  }

  return transaccion(pool, async (client) => {
    await exigirEdicion(client, edicionId);
    const { rows: noches } = await client.query(
      "SELECT estado FROM noche WHERE id = $1 AND edicion_id = $2 FOR UPDATE",
      [nocheId, edicionId],
    );
    if (noches.length === 0) {
      throw new ErrorConfiguracion("noche_inexistente", "La noche no existe en la edición.");
    }
    if (noches[0].estado !== "DRAFT") {
      throw new ErrorConfiguracion("noche_no_editable", "Solo se modifica el orden de una noche en DRAFT.");
    }

    await client.query("SET CONSTRAINTS orden_presentacion_noche_posicion_uk DEFERRED");
    await client.query(
      `DELETE FROM orden_presentacion
        WHERE noche_id = $1 AND edicion_id = $2 AND NOT (comparsa_id = ANY($3::uuid[]))`,
      [nocheId, edicionId, normalizados.map((item) => item.comparsaId)],
    );
    for (const item of normalizados) {
      await client.query(
        `INSERT INTO orden_presentacion (edicion_id, noche_id, comparsa_id, orden_presentacion)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (noche_id, comparsa_id) DO UPDATE SET orden_presentacion = EXCLUDED.orden_presentacion`,
        [edicionId, nocheId, item.comparsaId, item.orden],
      );
    }
    await registrarAuditoria(client, {
      actorId,
      operacion: "orden_presentacion_guardado",
      entidadTipo: "noche",
      entidadId: nocheId,
    });
    return { items: normalizados.sort((a, b) => a.orden - b.orden) };
  });
}
