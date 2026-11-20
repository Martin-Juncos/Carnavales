import { createHash, randomUUID } from "node:crypto";
import { ErrorAsignacion, uuidRequerido } from "./asignaciones.js";
import { registrarAuditoria } from "./configuracion-edicion.js";

function validarEnvio(cuerpo) {
  return {
    operationId: uuidRequerido(cuerpo?.operationId, "El identificador de operación es obligatorio.").toLowerCase(),
    asignacionId: uuidRequerido(cuerpo?.asignacionId, "La asignación es obligatoria.").toLowerCase(),
    versionId: uuidRequerido(cuerpo?.versionId, "La versión del reglamento es obligatoria.").toLowerCase(),
    puntajes: cuerpo?.puntajes,
  };
}

function normalizarPuntajes(puntajes) {
  if (!Array.isArray(puntajes)) throw new ErrorAsignacion("puntajes_invalidos", "Los puntajes no son válidos.");
  const notas = new Map();
  for (const item of puntajes) {
    const filaId = uuidRequerido(item?.filaId, "La fila debe ser un identificador válido.").toLowerCase();
    const { valor, noPresentado } = item;
    if (notas.has(filaId) || !(noPresentado === true && valor === 0
      || noPresentado === false && Number.isInteger(valor) && valor >= 1 && valor <= 5)) {
      throw new ErrorAsignacion("puntajes_invalidos", "Los puntajes no son válidos.");
    }
    notas.set(filaId, { filaId, valor, noPresentado });
  }
  return [...notas.keys()].sort().map((id) => notas.get(id));
}

function acuse(fila) {
  return {
    estado: "RECIBIDA",
    asignacionId: fila.asignacion_id,
    operationId: fila.operation_id,
    recibidaEn: fila.recibida_en.toISOString(),
  };
}

async function recibir(client, juradoId, datos) {
  const { asignacionId, operationId, versionId } = datos;
  const { rows: [noche] } = await client.query(
    `SELECT n.id, n.estado FROM noche n JOIN asignacion_jurado a ON a.noche_id = n.id
      WHERE a.id = $1 AND a.jurado_id = $2 AND n.tipo = 'COMPETENCIA' FOR SHARE OF n`,
    [asignacionId, juradoId],
  );
  const { rows: [asignacion] } = noche ? await client.query(
    `SELECT especialidad_id FROM asignacion_jurado
      WHERE id = $1 AND jurado_id = $2 AND estado = 'ACTIVA' FOR UPDATE`, [asignacionId, juradoId],
  ) : { rows: [] };
  if (!asignacion) throw new ErrorAsignacion("asignacion_no_encontrada", "La asignación no existe o no está activa para este jurado.");

  const auditar = (operacion, entidadId) => registrarAuditoria(client, {
    actorId: juradoId, operacion, entidadTipo: "planilla", entidadId,
  });
  const rechazar = (codigo, mensaje) => { throw new ErrorAsignacion(codigo, mensaje); };
  try {
    const puntajes = normalizarPuntajes(datos.puntajes);
    const hash = createHash("sha256").update(JSON.stringify([asignacionId, versionId, puntajes])).digest("hex");
    // El UUID es global. El bloqueo ordena envíos con el mismo UUID en distintas
    // asignaciones; la unicidad de PostgreSQL sigue siendo la restricción final.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('recepcion_planilla:' || $1::text, 0))", [operationId]);
    const { rows: [previa] } = await client.query("SELECT * FROM planilla_recibida WHERE operation_id = $1", [operationId]);
    if (previa) {
      if (previa.asignacion_id === asignacionId && previa.hash_contenido === hash) {
        return { repetida: true, acuse: acuse(previa) };
      }
      rechazar("operacion_conflictiva", "El identificador de operación ya está asociado a otro envío.");
    }
    if ((await client.query("SELECT 1 FROM planilla_recibida WHERE asignacion_id = $1", [asignacionId])).rowCount) {
      rechazar("planilla_ya_recibida", "La asignación ya tiene una planilla recibida.");
    }
    const { rows: [instantanea] } = await client.query(
      "SELECT version_id, filas_configuradas FROM instantanea_planillas_esperadas WHERE noche_id = $1", [noche.id],
    );
    if (noche.estado !== "OPEN" || !instantanea?.filas_configuradas) {
      rechazar("planilla_no_receptiva", "La noche no admite recepción de planillas.");
    }
    if (instantanea.version_id !== versionId) {
      rechazar("version_no_coincide", "La versión no coincide con el reglamento congelado.");
    }
    const { rows: filas } = await client.query("SELECT * FROM filas_recepcion_planilla($1, $2, $3)", [
      noche.id, versionId, asignacion.especialidad_id,
    ]);
    const requeridas = new Set(filas.filter((f) => f.evaluable).map((f) => f.fila_id));
    if (!filas.length || puntajes.length !== requeridas.size || !puntajes.every((p) => requeridas.has(p.filaId))) {
      rechazar("puntajes_invalidos", "El envío debe incluir todas y solo las filas que requieren puntaje.");
    }
    const id = randomUUID();
    await client.query(
      `INSERT INTO puntaje_recibido (planilla_id, fila_id, valor, no_presentado)
       SELECT $1, * FROM unnest($2::uuid[], $3::smallint[], $4::boolean[])`,
      [id, puntajes.map((p) => p.filaId), puntajes.map((p) => p.valor), puntajes.map((p) => p.noPresentado)],
    );
    const { rows: [fila] } = await client.query(
      `INSERT INTO planilla_recibida (id, operation_id, asignacion_id, version_id, hash_contenido)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`, [id, operationId, asignacionId, versionId, hash],
    );
    await auditar("planilla_recibida", id);
    return { repetida: false, acuse: acuse(fila) };
  } catch (error) {
    if (!(error instanceof ErrorAsignacion)) throw error;
    await auditar("planilla_rechazada", asignacionId);
    return { error };
  }
}

export async function recibirPlanilla(pool, juradoId, cuerpo) {
  const datos = validarEnvio(cuerpo);
  const client = await pool.connect();
  let resultado;
  try {
    await client.query("BEGIN");
    resultado = await recibir(client, juradoId, datos);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  if (resultado.error) throw resultado.error;
  return resultado;
}
