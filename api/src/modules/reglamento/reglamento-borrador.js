// Contenido del reglamento en borrador: rubros, escala por versión, especialidades de cada
// rubro, requisitos de presentación y premios. Las migraciones 0006 y 0010 solo permiten
// escribir mientras la versión está en BORRADOR; aquí se traducen esos errores de la base.

import { ErrorConfiguracion, exigirEdicion, normalizarBooleano, normalizarNombre } from "../ediciones/configuracion-edicion.js";
import { registrarAuditoria } from "../../shared/auditoria.js";
import { tiposDeSujeto } from "../padron/padron-evento.js";

const tiposDeRubro = new Set(["NOMINATIVO", "ALEATORIO"]);
const modalidadesDePremio = new Set(["INDIVIDUAL", "GRUPAL"]);

function traducirErrorReglamento(error) {
  const mensaje = error.message ?? "";
  if (error.code === "23514" && mensaje.includes("VERSION_NO_BORRADOR")) {
    return new ErrorConfiguracion("version_no_borrador", "La versión ya no está en borrador y no admite cambios.");
  }
  if (error.code === "23505") {
    if (error.constraint === "rubro_version_version_id_codigo_key" || error.constraint === "requisito_version_version_id_codigo_key") {
      return new ErrorConfiguracion("codigo_existente", "Ya existe un elemento con ese código en la versión.");
    }
    if (error.constraint === "rubro_version_orden_uk") {
      return new ErrorConfiguracion("orden_existente", "Ya existe un rubro con ese orden en la versión.");
    }
    if (error.constraint === "premio_version_version_id_nombre_key") {
      return new ErrorConfiguracion("nombre_existente", "Ya existe un premio con ese nombre en la versión.");
    }
  }
  if (error.code === "23503") {
    return new ErrorConfiguracion("referencia_inexistente", "Alguna referencia no existe en la edición.");
  }
  if (error.code === "23001") {
    return new ErrorConfiguracion("con_dependencias", "El elemento tiene historial asociado y no puede borrarse.");
  }
  return error;
}

async function transaccion(pool, operacion) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const resultado = await operacion(client);
    await client.query("COMMIT");
    return resultado;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw traducirErrorReglamento(error);
  } finally {
    client.release();
  }
}

async function exigirVersion(client, edicionId, versionId) {
  const { rows } = await client.query(
    "SELECT id FROM version_reglamento WHERE id = $1 AND edicion_id = $2",
    [versionId, edicionId],
  );
  if (rows.length === 0) {
    throw new ErrorConfiguracion("version_inexistente", "La versión no existe en la edición.");
  }
}

function entero(valor, codigo, mensaje) {
  if (!Number.isInteger(valor) || valor < 1) {
    throw new ErrorConfiguracion(codigo, mensaje);
  }
  return valor;
}

function enteroOpcional(valor, codigo, mensaje) {
  if (valor === undefined || valor === null) return null;
  return entero(valor, codigo, mensaje);
}

function booleanoOpcional(valor, valorPorDefecto, codigo) {
  return valor === undefined ? valorPorDefecto : normalizarBooleano(valor, codigo);
}

function textoObligatorio(valor, codigo, mensaje) {
  const limpio = typeof valor === "string" ? valor.trim() : "";
  if (limpio === "") {
    throw new ErrorConfiguracion(codigo, mensaje);
  }
  return limpio;
}

// Cada entidad describe su tabla, cómo se lee, cómo se traduce al dominio y cómo se normaliza su entrada.
// Así rubros, requisitos y premios comparten las mismas operaciones de CRUD.
const rubro = {
  tabla: "rubro_version",
  nombre: "rubro",
  noEncontrado: "rubro_inexistente",
  seleccion: `t.id, t.codigo, t.nombre, t.tipo_sujeto, t.evaluable, t.suma_a_comparsa, t.tipo_rubro,
    t.nominados_maximos, t.nominados_maximos_por_comparsa, t.permite_no_presentado, t.orden,
    ARRAY(SELECT re.especialidad_id FROM rubro_especialidad re
           WHERE re.rubro_version_id = t.id ORDER BY re.especialidad_id) AS especialidad_ids`,
  aDominio: (fila) => ({
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    tipoSujeto: fila.tipo_sujeto,
    evaluable: fila.evaluable,
    sumaAComparsa: fila.suma_a_comparsa,
    tipoRubro: fila.tipo_rubro,
    nominadosMaximos: fila.nominados_maximos,
    nominadosMaximosPorComparsa: fila.nominados_maximos_por_comparsa,
    permiteNoPresentado: fila.permite_no_presentado,
    orden: fila.orden,
    especialidadIds: fila.especialidad_ids ?? [],
  }),
  normalizar: (datos) => {
    const tipoSujeto = datos.tipoSujeto;
    if (!tiposDeSujeto.has(tipoSujeto)) {
      throw new ErrorConfiguracion("tipo_sujeto_invalido", "El tipo de sujeto evaluable no es válido.");
    }
    const tipoRubro = datos.tipoRubro ?? null;
    if (tipoRubro !== null && !tiposDeRubro.has(tipoRubro)) {
      throw new ErrorConfiguracion("tipo_rubro_invalido", "El tipo de rubro debe ser NOMINATIVO o ALEATORIO.");
    }
    const nominadosMaximos = enteroOpcional(datos.nominadosMaximos, "nominados_invalidos", "Los nominados deben ser un entero positivo.");
    const nominadosMaximosPorComparsa = enteroOpcional(
      datos.nominadosMaximosPorComparsa,
      "nominados_invalidos",
      "Los nominados por comparsa deben ser un entero positivo.",
    );
    if (tipoRubro === "ALEATORIO" && nominadosMaximos === null && nominadosMaximosPorComparsa === null) {
      throw new ErrorConfiguracion(
        "nominados_requeridos",
        "Un rubro aleatorio necesita un máximo de nominados por comparsa o por edición.",
      );
    }
    return {
      codigo: textoObligatorio(datos.codigo, "codigo_invalido", "El código es obligatorio."),
      nombre: normalizarNombre(datos.nombre),
      tipo_sujeto: tipoSujeto,
      evaluable: booleanoOpcional(datos.evaluable, true, "evaluable_invalido"),
      suma_a_comparsa: booleanoOpcional(datos.sumaAComparsa, true, "suma_a_comparsa_invalida"),
      tipo_rubro: tipoRubro,
      nominados_maximos: nominadosMaximos,
      nominados_maximos_por_comparsa: nominadosMaximosPorComparsa,
      permite_no_presentado: booleanoOpcional(datos.permiteNoPresentado, true, "permite_no_presentado_invalido"),
      orden: entero(datos.orden, "orden_invalido", "El orden debe ser un entero positivo."),
    };
  },
};

const requisito = {
  tabla: "requisito_version",
  nombre: "requisito",
  noEncontrado: "requisito_inexistente",
  seleccion: "t.id, t.codigo, t.nombre, t.cantidad_minima, t.puede_puntuar, t.orden",
  aDominio: (fila) => ({
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    cantidadMinima: fila.cantidad_minima,
    puedePuntuar: fila.puede_puntuar,
    orden: fila.orden,
  }),
  normalizar: (datos) => ({
    codigo: textoObligatorio(datos.codigo, "codigo_invalido", "El código es obligatorio."),
    nombre: normalizarNombre(datos.nombre),
    cantidad_minima: entero(datos.cantidadMinima, "cantidad_minima_invalida", "La cantidad mínima debe ser un entero positivo."),
    puede_puntuar: booleanoOpcional(datos.puedePuntuar, false, "puede_puntuar_invalido"),
    orden: entero(datos.orden, "orden_invalido", "El orden debe ser un entero positivo."),
  }),
};

const premio = {
  tabla: "premio_version",
  nombre: "premio",
  noEncontrado: "premio_inexistente",
  seleccion: "t.id, t.nombre, t.modalidad, t.orden",
  aDominio: (fila) => ({ id: fila.id, nombre: fila.nombre, modalidad: fila.modalidad, orden: fila.orden }),
  normalizar: (datos) => {
    if (!modalidadesDePremio.has(datos.modalidad)) {
      throw new ErrorConfiguracion("modalidad_invalida", "La modalidad debe ser INDIVIDUAL o GRUPAL.");
    }
    return {
      nombre: normalizarNombre(datos.nombre),
      modalidad: datos.modalidad,
      orden: entero(datos.orden, "orden_invalido", "El orden debe ser un entero positivo."),
    };
  },
};

// Columnas y marcadores $n de una fila; `desde` salta los parámetros ya usados por la consulta.
function asignacionesDe(valores, desde = 1) {
  const columnas = Object.keys(valores);
  return {
    columnas,
    marcadores: columnas.map((_, indice) => `$${indice + desde}`),
    asignaciones: columnas.map((columna, indice) => `${columna} = $${indice + desde}`),
    valores: columnas.map((columna) => valores[columna]),
  };
}

async function leerElemento(client, entidad, id) {
  const { rows } = await client.query(
    `SELECT ${entidad.seleccion} FROM ${entidad.tabla} t WHERE t.id = $1`,
    [id],
  );
  return rows[0] ? entidad.aDominio(rows[0]) : null;
}

export async function listarElementos(pool, { edicionId, versionId, entidad }) {
  await exigirEdicion(pool, edicionId);
  await exigirVersion(pool, edicionId, versionId);
  const { rows } = await pool.query(
    `SELECT ${entidad.seleccion} FROM ${entidad.tabla} t
      WHERE t.version_id = $1 AND t.edicion_id = $2
      ORDER BY t.orden`,
    [versionId, edicionId],
  );
  return { items: rows.map(entidad.aDominio) };
}

export async function crearElemento(pool, { edicionId, versionId, entidad, actorId, datos }) {
  const valores = entidad.normalizar(datos ?? {});
  return transaccion(pool, async (client) => {
    await exigirVersion(client, edicionId, versionId);
    const { columnas, marcadores, valores: lista } = asignacionesDe(valores, 3);
    const { rows: [fila] } = await client.query(
      `INSERT INTO ${entidad.tabla} (edicion_id, version_id, ${columnas.join(", ")})
       VALUES ($1, $2, ${marcadores.join(", ")})
       RETURNING id`,
      [edicionId, versionId, ...lista],
    );
    await registrarAuditoria(client, {
      actorId,
      operacion: `${entidad.nombre}_creado`,
      entidadTipo: entidad.tabla,
      entidadId: fila.id,
    });
    return leerElemento(client, entidad, fila.id);
  });
}

export async function actualizarElemento(pool, { edicionId, versionId, elementoId, entidad, actorId, datos }) {
  if (Object.keys(datos ?? {}).length === 0) {
    throw new ErrorConfiguracion("sin_cambios", "No se recibió ningún campo para actualizar.");
  }
  return transaccion(pool, async (client) => {
    await exigirVersion(client, edicionId, versionId);
    const actual = await leerElemento(client, entidad, elementoId);
    if (actual === null) {
      throw new ErrorConfiguracion(entidad.noEncontrado, `El ${entidad.nombre} no existe en la versión.`);
    }
    const valores = entidad.normalizar({ ...actual, ...datos });
    const { asignaciones, valores: lista } = asignacionesDe(valores);
    await client.query(
      `UPDATE ${entidad.tabla} SET ${asignaciones.join(", ")}
        WHERE id = $${lista.length + 1} AND version_id = $${lista.length + 2} AND edicion_id = $${lista.length + 3}`,
      [...lista, elementoId, versionId, edicionId],
    );
    await registrarAuditoria(client, {
      actorId,
      operacion: `${entidad.nombre}_actualizado`,
      entidadTipo: entidad.tabla,
      entidadId: elementoId,
    });
    return leerElemento(client, entidad, elementoId);
  });
}

export async function eliminarElemento(pool, { edicionId, versionId, elementoId, entidad, actorId }) {
  await transaccion(pool, async (client) => {
    await exigirVersion(client, edicionId, versionId);
    const { rowCount } = await client.query(
      `DELETE FROM ${entidad.tabla} WHERE id = $1 AND version_id = $2 AND edicion_id = $3`,
      [elementoId, versionId, edicionId],
    );
    if (rowCount === 0) {
      throw new ErrorConfiguracion(entidad.noEncontrado, `El ${entidad.nombre} no existe en la versión.`);
    }
    await registrarAuditoria(client, {
      actorId,
      operacion: `${entidad.nombre}_eliminado`,
      edicionId,
      entidadTipo: entidad.tabla,
      entidadId: elementoId,
    });
  });
}

// Reemplaza las especialidades que evalúan un rubro. Solo acepta especialidades de la misma edición.
export async function guardarEspecialidadesDeRubro(pool, { edicionId, versionId, rubroId, actorId, especialidadIds }) {
  if (!Array.isArray(especialidadIds)) {
    throw new ErrorConfiguracion("especialidades_invalidas", "Las especialidades deben enviarse como lista.");
  }
  const ids = especialidadIds.map((id) => (typeof id === "string" ? id.trim() : ""));
  if (ids.some((id) => id === "")) {
    throw new ErrorConfiguracion("especialidades_invalidas", "Cada especialidad debe ser un identificador.");
  }
  if (new Set(ids).size !== ids.length) {
    throw new ErrorConfiguracion("especialidades_duplicadas", "Una especialidad aparece más de una vez.");
  }

  return transaccion(pool, async (client) => {
    await exigirVersion(client, edicionId, versionId);
    const { rows: existentes } = await client.query(
      "SELECT id FROM rubro_version WHERE id = $1 AND version_id = $2 AND edicion_id = $3",
      [rubroId, versionId, edicionId],
    );
    if (existentes.length === 0) {
      throw new ErrorConfiguracion("rubro_inexistente", "El rubro no existe en la versión.");
    }
    await client.query("DELETE FROM rubro_especialidad WHERE rubro_version_id = $1", [rubroId]);
    for (const especialidadId of ids) {
      await client.query(
        `INSERT INTO rubro_especialidad (rubro_version_id, especialidad_id, edicion_id)
         VALUES ($1, $2, $3)`,
        [rubroId, especialidadId, edicionId],
      );
    }
    await registrarAuditoria(client, {
      actorId,
      operacion: "rubro_especialidades_guardadas",
      entidadTipo: "rubro_version",
      entidadId: rubroId,
    });
    return leerElemento(client, rubro, rubroId);
  });
}

// Reordena todos los rubros de una versión en una sola transacción. La restricción de orden
// es diferible, así que se pueden intercambiar posiciones sin chocar con una posición ocupada.
export async function reordenarRubros(pool, { edicionId, versionId, actorId, items }) {
  if (!Array.isArray(items)) {
    throw new ErrorConfiguracion("orden_invalido", "El orden debe enviarse como lista de rubros.");
  }
  const normalizados = items.map((item) => ({
    rubroId: typeof item?.rubroId === "string" ? item.rubroId.trim() : "",
    orden: entero(item?.orden, "orden_invalido", "El orden debe ser un entero positivo."),
  }));
  if (normalizados.some((item) => item.rubroId === "")) {
    throw new ErrorConfiguracion("orden_invalido", "Cada posición necesita un rubro.");
  }
  if (new Set(normalizados.map((item) => item.rubroId)).size !== normalizados.length) {
    throw new ErrorConfiguracion("rubros_duplicados", "Un rubro aparece más de una vez en el orden.");
  }
  if (new Set(normalizados.map((item) => item.orden)).size !== normalizados.length) {
    throw new ErrorConfiguracion("orden_existente", "Dos rubros no pueden ocupar la misma posición.");
  }

  return transaccion(pool, async (client) => {
    await exigirVersion(client, edicionId, versionId);
    await client.query("SET CONSTRAINTS rubro_version_orden_uk DEFERRED");
    for (const item of normalizados) {
      const { rowCount } = await client.query(
        `UPDATE rubro_version SET orden = $1
          WHERE id = $2 AND version_id = $3 AND edicion_id = $4`,
        [item.orden, item.rubroId, versionId, edicionId],
      );
      if (rowCount === 0) {
        throw new ErrorConfiguracion("rubro_inexistente", "Un rubro no existe en la versión.");
      }
    }
    await registrarAuditoria(client, {
      actorId,
      operacion: "rubros_reordenados",
      entidadTipo: "rubro_version",
      entidadId: versionId,
    });
    const { rows } = await client.query(
      `SELECT ${rubro.seleccion} FROM rubro_version t
        WHERE t.version_id = $1 AND t.edicion_id = $2
        ORDER BY t.orden`,
      [versionId, edicionId],
    );
    return { items: rows.map(rubro.aDominio) };
  });
}

// La escala es una sola por versión: se crea o se reemplaza.
export async function guardarEscala(pool, { edicionId, versionId, actorId, datos }) {
  const minimo = entero(datos?.minimo, "escala_invalida", "El mínimo debe ser un entero de al menos 1.");
  const maximo = entero(datos?.maximo, "escala_invalida", "El máximo debe ser un entero de al menos 1.");
  if (minimo !== 1 || maximo !== 5) {
    throw new ErrorConfiguracion("escala_invalida", "La escala para 2027 es de 1 a 5.");
  }

  return transaccion(pool, async (client) => {
    await exigirVersion(client, edicionId, versionId);
    await client.query(
      `INSERT INTO escala_puntaje_version (version_id, edicion_id, minimo, maximo)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (version_id) DO UPDATE SET minimo = EXCLUDED.minimo, maximo = EXCLUDED.maximo`,
      [versionId, edicionId, minimo, maximo],
    );
    await registrarAuditoria(client, {
      actorId,
      operacion: "escala_guardada",
      entidadTipo: "escala_puntaje_version",
      entidadId: versionId,
    });
    return { minimo, maximo };
  });
}

export async function leerEscala(pool, { edicionId, versionId }) {
  await exigirEdicion(pool, edicionId);
  await exigirVersion(pool, edicionId, versionId);
  const { rows } = await pool.query(
    "SELECT minimo, maximo FROM escala_puntaje_version WHERE version_id = $1 AND edicion_id = $2",
    [versionId, edicionId],
  );
  return rows[0] ? { minimo: rows[0].minimo, maximo: rows[0].maximo } : null;
}

export const entidadesDeReglamento = { rubro, requisito, premio };
