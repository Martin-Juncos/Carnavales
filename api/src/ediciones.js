import { registrarAuditoria } from "./configuracion-edicion.js";

// Error de dominio para ediciones. `codigo` identifica el caso para que la ruta elija el estado HTTP.
export class ErrorEdicion extends Error {
  constructor(codigo, mensaje = codigo) {
    super(mensaje);
    this.codigo = codigo;
  }
}

// Texto de origen de la primera versión: la edición nace sin reglamento copiado de otra.
const fuenteInicial = "Edición nueva sin reglamento copiado";
// La columna `anio` es integer: el máximo representable es 2147483647.
const anioMaximo = 2147483647;

// Nombre obligatorio: sin espacios sobrantes y no vacío.
function normalizarNombre(nombre) {
  const limpio = typeof nombre === "string" ? nombre.trim() : "";
  if (limpio === "") {
    throw new ErrorEdicion("nombre_invalido", "El nombre de la edición es obligatorio.");
  }
  return limpio;
}

// Año: entero positivo, recibido como número o como texto de solo dígitos.
function normalizarAnio(anio) {
  const texto = typeof anio === "number" ? String(anio) : typeof anio === "string" ? anio.trim() : "";
  const valor = /^\d+$/.test(texto) ? Number(texto) : NaN;
  if (!Number.isInteger(valor) || valor < 1 || valor > anioMaximo) {
    throw new ErrorEdicion("anio_invalido", "El año debe ser un número entero positivo.");
  }
  return valor;
}

// Crea una edición vacía: estado CONFIGURING y una primera versión de reglamento en BORRADOR.
// Ambas filas se escriben en una sola transacción: si el año ya existe, no queda nada a medias.
export async function crearEdicion(pool, { nombre, anio, creadaPor }) {
  const nombreLimpio = normalizarNombre(nombre);
  const anioValido = normalizarAnio(anio);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [edicion] } = await client.query(
      `INSERT INTO edicion (nombre, anio, estado, creada_por)
       VALUES ($1, $2, 'CONFIGURING', $3)
       RETURNING id, nombre, anio, estado`,
      [nombreLimpio, anioValido, creadaPor],
    );
    const { rows: [version] } = await client.query(
      `INSERT INTO version_reglamento (edicion_id, numero, estado, fuente, creada_por)
       VALUES ($1, 1, 'BORRADOR', $2, $3)
       RETURNING numero, estado`,
      [edicion.id, fuenteInicial, creadaPor],
    );
    await client.query("COMMIT");
    return {
      id: edicion.id,
      nombre: edicion.nombre,
      anio: edicion.anio,
      estado: edicion.estado,
      version: { numero: version.numero, estado: version.estado },
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    // 23505: unique_violation sobre `anio` (la única restricción única que puede fallar aquí).
    if (error.code === "23505") {
      throw new ErrorEdicion("anio_existente", "Ya existe una edición para ese año.");
    }
    throw error;
  } finally {
    client.release();
  }
}

// Lista todas las ediciones, de la más reciente a la más antigua, con la versión de reglamento más nueva.
export async function listarEdiciones(pool, { retiradas = false } = {}) {
  const { rows } = await pool.query(
    `SELECT e.id, e.nombre, e.anio, e.estado, e.retirada_en, v.numero AS version_numero, v.estado AS version_estado
       FROM edicion e
       LEFT JOIN LATERAL (
         SELECT numero, estado
           FROM version_reglamento
          WHERE edicion_id = e.id
          ORDER BY numero DESC
          LIMIT 1
       ) v ON true
      WHERE (e.retirada_en IS NOT NULL) = $1
      ORDER BY e.anio DESC`, [retiradas],
  );
  return rows.map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    anio: fila.anio,
    estado: fila.estado,
    ...(retiradas ? { retiradaEn: fila.retirada_en.toISOString() } : {}),
    version: fila.version_numero === null ? null : { numero: fila.version_numero, estado: fila.version_estado },
  }));
}

export async function retirarEdicion(pool, { edicionId, actorId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    const { rows: [edicion] } = await client.query(
      "SELECT retirada_en FROM edicion WHERE id = $1 FOR UPDATE", [edicionId],
    );
    if (!edicion) throw new ErrorEdicion("edicion_inexistente", "La edición no existe.");
    let retiro = edicion.retirada_en;
    if (!retiro) {
      // Read night state only after acquiring the lock shared by night writes.
      const { rows: [resultado] } = await client.query(
        "UPDATE edicion SET retirada_en = now(), retirada_por = $2 WHERE id = $1 RETURNING retirada_en",
        [edicionId, actorId],
      );
      retiro = resultado.retirada_en;
    }
    await client.query("COMMIT");
    return { edicionId, retiradaEn: retiro.toISOString() };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function eliminarEdicion(pool, { edicionId, actorId }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [edicion] } = await client.query(
      "SELECT estado, creada_en, retirada_en FROM edicion WHERE id = $1 FOR UPDATE", [edicionId],
    );
    if (!edicion) throw new ErrorEdicion("edicion_inexistente", "La edición no existe.");
    if (edicion.retirada_en) throw new ErrorEdicion("edicion_retirada", "La edición retirada es de solo lectura.");
    if (edicion.estado !== "CONFIGURING") {
      throw new ErrorEdicion("edicion_no_borrable", "No se puede eliminar una edición que ya se abrió.");
    }

    const { rows: versiones } = await client.query(
      `SELECT id, numero, estado, fuente, copiada_de_id, publicada_en, publicada_por, congelada_en
         FROM version_reglamento WHERE edicion_id = $1 FOR UPDATE`, [edicionId],
    );
    const [version] = versiones;
    if (versiones.length !== 1 || version.numero !== 1 || version.estado !== "BORRADOR"
        || version.fuente !== fuenteInicial || version.copiada_de_id || version.publicada_en
        || version.publicada_por || version.congelada_en) {
      throw new ErrorEdicion("edicion_no_borrable", "Solo se puede eliminar una edición con su reglamento inicial en borrador.");
    }

    const dependencias = () => new ErrorEdicion(
      "edicion_con_dependencias", "La edición tiene configuración o historial y no se puede eliminar.",
    );

    // RESTRICT protects both rows. A concurrent child deletion can unblock
    // this transaction, so check audit in a fresh statement after both deletes.
    try {
      await client.query("DELETE FROM version_reglamento WHERE id = $1", [version.id]);
      await client.query("DELETE FROM edicion WHERE id = $1", [edicionId]);
    } catch (error) {
      if (error.code === "23503" || error.code === "23001") throw dependencias();
      throw error;
    }
    const { rowCount } = await client.query(
      `SELECT 1 FROM auditoria WHERE edicion_id = $1::uuid
        OR (entidad_tipo = 'edicion' AND entidad_id = $1::text)
        OR (entidad_tipo = 'version_reglamento' AND entidad_id = $2)
        OR (edicion_id IS NULL AND ocurrida_en >= $3 AND operacion IN (
          'noche_eliminada', 'especialidad_eliminada', 'comparsa_eliminada',
          'sujeto_eliminado', 'rubro_eliminado', 'requisito_eliminado', 'premio_eliminado', 'nominacion_eliminada'
        )) LIMIT 1`,
      [edicionId, version.id, edicion.creada_en],
    );
    if (rowCount) throw dependencias();

    await registrarAuditoria(client, { actorId, operacion: "edicion_eliminada", entidadTipo: "edicion", entidadId: edicionId, edicionId });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
