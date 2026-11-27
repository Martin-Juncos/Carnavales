// Actas oficiales de resultados (P6D): generación atómica, versionada,
// idempotente por operationId y con hash SHA-256 sobre los bytes emitidos.

import { createHash } from "node:crypto";
import { ErrorDominio } from "../../shared/errores.js";
import { exigirEdicionCerrada, hidratarSnapshot } from "../resultados/resultados.js";
import { construirContenidoActa, generarCsv, generarPdf } from "./acta-contenido.js";

const patronUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const formatos = new Map([
  ["PDF", { extension: "pdf", contentType: "application/pdf" }],
  ["CSV", { extension: "csv", contentType: "text/csv; charset=utf-8" }],
]);

export class ErrorActa extends ErrorDominio {}

function uuidRequerido(valor, codigo, mensaje) {
  if (typeof valor !== "string" || !patronUuid.test(valor.trim())) {
    throw new ErrorActa(codigo, mensaje, 400);
  }
  return valor.trim().toLowerCase();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function serializarActa(fila) {
  return {
    id: fila.id,
    edicionId: fila.edicion_id,
    calculoId: fila.calculo_id,
    numero: fila.numero,
    generadaEn: fila.generada_en.toISOString(),
    representaciones: (fila.representaciones ?? []).map((representacion) => ({
      formato: representacion.formato,
      contentType: representacion.content_type,
      tamanioBytes: representacion.tamanio_bytes,
      sha256: representacion.hash_sha256,
    })),
  };
}

const seleccionActa = `
  SELECT a.id, a.edicion_id, a.calculo_id, a.numero, a.generada_en,
         COALESCE(
           json_agg(
             json_build_object(
               'formato', r.formato,
               'content_type', r.content_type,
               'tamanio_bytes', r.tamanio_bytes,
               'hash_sha256', r.hash_sha256
             )
           ) FILTER (WHERE r.id IS NOT NULL),
           '[]'::json
         ) AS representaciones
    FROM acta_resultado a
    LEFT JOIN acta_representacion r ON r.acta_id = a.id
`;

async function leerActa(client, where, parametros) {
  const { rows } = await client.query(
    `${seleccionActa} WHERE ${where} GROUP BY a.id, a.edicion_id, a.calculo_id, a.numero, a.generada_en`,
    parametros,
  );
  return rows[0] ? serializarActa(rows[0]) : null;
}

async function leerPenalizaciones(client, edicionId) {
  const { rows } = await client.query(
    `SELECT p.tipo, c.nombre AS comparsa, p.minutos, p.motivo, p.referencia_acta AS "referenciaActa"
       FROM penalizacion p
       JOIN comparsa c ON c.id = p.comparsa_id
      WHERE p.edicion_id = $1 AND p.estado = 'ACTIVA'
      ORDER BY p.registrada_en, p.id`,
    [edicionId],
  );
  return rows;
}

export async function generarActa(pool, { edicionId, calculoId, actorId, datos }) {
  const edicionNorm = uuidRequerido(edicionId, "edicion_inexistente", "La edición no existe.");
  const calculoNorm = uuidRequerido(calculoId, "calculo_inexistente", "El cálculo indicado no existe.");
  const operationId = uuidRequerido(
    datos?.operationId,
    "operation_id_requerido",
    "El identificador de operación debe ser un UUID válido.",
  );
  if (datos?.confirmar !== true) {
    throw new ErrorActa("confirmacion_requerida", "La emisión requiere confirmación explícita.", 400);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('actas:' || $1::text, 0))",
      [edicionNorm],
    );

    const { rows: [edicion] } = await client.query(
      "SELECT id, nombre, anio, estado, cerrada_en, retirada_en FROM edicion WHERE id = $1 FOR SHARE",
      [edicionNorm],
    );
    if (!edicion || edicion.retirada_en) {
      throw new ErrorActa("edicion_inexistente", "La edición no existe.", 404);
    }

    const existente = await leerActa(client, "a.operation_id = $1", [operationId]);
    if (existente) {
      if (existente.edicionId !== edicionNorm || existente.calculoId !== calculoNorm) {
        throw new ErrorActa("operacion_conflictiva", "La operación ya fue utilizada.", 409);
      }
      const { rows: [cabecera] } = await client.query(
        "SELECT generada_por FROM acta_resultado WHERE operation_id = $1",
        [operationId],
      );
      if (cabecera.generada_por !== actorId) {
        throw new ErrorActa("operacion_conflictiva", "La operación ya fue utilizada.", 409);
      }
      await client.query("COMMIT");
      return { repetida: true, acta: existente };
    }

    if (edicion.estado !== "CLOSED") {
      throw new ErrorActa("edicion_no_cerrada", "Las actas solo se emiten tras el cierre total.", 409);
    }

    const { rows: [calculo] } = await client.query(
      "SELECT id, estado, version_reglamento_id FROM calculo_resultado WHERE id = $1 AND edicion_id = $2 FOR SHARE",
      [calculoNorm, edicionNorm],
    );
    if (!calculo) {
      throw new ErrorActa("calculo_inexistente", "El cálculo indicado no existe en esta edición.", 404);
    }
    if (calculo.estado !== "PUBLICADO") {
      throw new ErrorActa("resultado_no_publicado", "El acta requiere un resultado publicado.", 409);
    }

    const snapshot = await hidratarSnapshot(client, calculo.id);
    const penalizaciones = await leerPenalizaciones(client, edicionNorm);
    const { rows: [actor] } = await client.query(
      "SELECT nombre FROM usuario WHERE id = $1",
      [actorId],
    );

    const contenido = construirContenidoActa({
      edicion: {
        id: edicion.id,
        nombre: edicion.nombre,
        anio: edicion.anio,
        cerradaEn: edicion.cerrada_en?.toISOString() ?? null,
      },
      snapshot,
      penalizaciones,
      generadaEn: new Date().toISOString(),
      generador: { id: actorId, nombre: actor?.nombre ?? actorId },
    });

    const [csv, pdf] = await Promise.all([generarCsv(contenido), generarPdf(contenido)]);
    const representaciones = [
      { formato: "CSV", contenido: csv, contentType: formatos.get("CSV").contentType },
      { formato: "PDF", contenido: pdf, contentType: formatos.get("PDF").contentType },
    ];

    const { rows: [{ siguiente }] } = await client.query(
      "SELECT COALESCE(MAX(numero), 0)::int + 1 AS siguiente FROM acta_resultado WHERE edicion_id = $1",
      [edicionNorm],
    );

    const { rows: [cabecera] } = await client.query(
      `INSERT INTO acta_resultado (edicion_id, calculo_id, numero, generada_por, operation_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, generada_en`,
      [edicionNorm, calculoNorm, siguiente, actorId, operationId],
    );

    for (const representacion of representaciones) {
      await client.query(
        `INSERT INTO acta_representacion
           (acta_id, edicion_id, formato, contenido, hash_sha256, tamanio_bytes, content_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          cabecera.id,
          edicionNorm,
          representacion.formato,
          representacion.contenido,
          sha256(representacion.contenido),
          representacion.contenido.length,
          representacion.contentType,
        ],
      );
    }

    const acta = await leerActa(client, "a.id = $1", [cabecera.id]);
    await client.query("COMMIT");
    return { repetida: false, acta };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function listarActas(pool, { edicionId }) {
  const edicionNorm = uuidRequerido(edicionId, "edicion_inexistente", "La edición no existe.");
  await exigirEdicionCerrada(pool, edicionNorm, { paraLectura: true });
  const { rows } = await pool.query(
    `${seleccionActa} WHERE a.edicion_id = $1 GROUP BY a.id, a.edicion_id, a.calculo_id, a.numero, a.generada_en
      ORDER BY a.numero DESC`,
    [edicionNorm],
  );
  return { items: rows.map(serializarActa) };
}

async function leerRepresentacion(pool, { edicionId, actaId, formato }) {
  const edicionNorm = uuidRequerido(edicionId, "edicion_inexistente", "La edición no existe.");
  const actaNorm = uuidRequerido(actaId, "acta_inexistente", "El acta no existe.");
  await exigirEdicionCerrada(pool, edicionNorm, { paraLectura: true });
  const { rows: [fila] } = await pool.query(
    `SELECT r.contenido, r.hash_sha256, r.formato, r.content_type, a.numero
       FROM acta_representacion r
       JOIN acta_resultado a ON a.id = r.acta_id AND a.edicion_id = r.edicion_id
      WHERE a.edicion_id = $1 AND r.acta_id = $2 AND r.formato = $3`,
    [edicionNorm, actaNorm, formato],
  );
  if (!fila) throw new ErrorActa("acta_inexistente", "El acta o la representación solicitada no existe.", 404);
  return fila;
}

export async function descargarActa(pool, parametros) {
  const fila = await leerRepresentacion(pool, parametros);
  const configuracion = formatos.get(fila.formato);
  return {
    contenido: fila.contenido,
    contentType: fila.content_type,
    filename: `acta-${parametros.edicionId.toLowerCase()}-v${fila.numero}.${configuracion.extension}`,
    sha256: fila.hash_sha256,
  };
}

export async function verificarActa(pool, parametros) {
  const fila = await leerRepresentacion(pool, parametros);
  const hashRecalculado = sha256(fila.contenido);
  return {
    coincide: hashRecalculado === fila.hash_sha256,
    hashAlmacenado: fila.hash_sha256,
    hashRecalculado,
  };
}

export function normalizarFormato(valor) {
  if (typeof valor !== "string" || !formatos.has(valor.toUpperCase())) {
    throw new ErrorActa("formato_invalido", "El formato debe ser PDF o CSV.", 400);
  }
  return valor.toUpperCase();
}
