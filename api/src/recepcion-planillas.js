import { createHash, randomUUID } from "node:crypto";
import { ErrorAsignacion, uuidRequerido } from "./asignaciones.js";
import { registrarAuditoria } from "./configuracion-edicion.js";

function validarEnvio(cuerpo) {
  return {
    operationId: uuidRequerido(cuerpo?.operationId, "El identificador de operación es obligatorio.").toLowerCase(),
    asignacionId: uuidRequerido(cuerpo?.asignacionId, "La asignación es obligatoria.").toLowerCase(),
    versionId: uuidRequerido(cuerpo?.versionId, "La versión del reglamento es obligatoria.").toLowerCase(),
    puntajes: cuerpo?.puntajes,
    dispositivoId: typeof cuerpo?.dispositivoId === "string" ? cuerpo.dispositivoId.toLowerCase() : null,
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

async function bloquearContexto(client, juradoId, asignacionId, permitirAcuseHistorico = false) {
  const { rows: [noche] } = await client.query(
    `SELECT n.id, n.estado, ed.retirada_en FROM noche n JOIN asignacion_jurado a ON a.noche_id = n.id
      JOIN edicion ed ON ed.id = a.edicion_id
      WHERE a.id = $1 AND a.jurado_id = $2 AND n.tipo = 'COMPETENCIA' FOR SHARE OF n, ed`,
    [asignacionId, juradoId],
  );
  const { rows: [asignacion] } = noche ? await client.query(
    `SELECT especialidad_id FROM asignacion_jurado
      WHERE id = $1 AND jurado_id = $2 AND estado = 'ACTIVA' FOR UPDATE`, [asignacionId, juradoId],
  ) : { rows: [] };
  if (!asignacion) throw new ErrorAsignacion("asignacion_no_encontrada", "La asignación no existe o no está activa para este jurado.");
  if (noche.retirada_en && !permitirAcuseHistorico) {
    throw new ErrorAsignacion("edicion_retirada", "La edición retirada es de solo lectura.");
  }
  const { rows: [suplencia] } = await client.query(
    "SELECT dispositivo_id FROM suplentes_asignacion_jurado WHERE asignacion_activa_id = $1", [asignacionId],
  );
  return { noche, asignacion, suplencia };
}

async function recibir(client, juradoId, datos) {
  const { asignacionId, operationId, versionId } = datos;
  const { noche, asignacion, suplencia } = await bloquearContexto(client, juradoId, asignacionId, true);
  if (suplencia && (!suplencia.dispositivo_id || suplencia.dispositivo_id !== datos.dispositivoId)) {
    throw new ErrorAsignacion("dispositivo_no_autorizado", "El envío debe salir del dispositivo que abrió la planilla.");
  }
  if (suplencia && (await buscarBorrador(client, asignacionId))) {
    throw new ErrorAsignacion("borrador_traspaso_congelado", "La planilla está congelada para el traspaso.");
  }

  const auditar = (operacion, entidadId) => registrarAuditoria(client, {
    actorId: juradoId, operacion, entidadTipo: "planilla", entidadId,
  });
  const rechazar = (codigo, mensaje) => { throw new ErrorAsignacion(codigo, mensaje); };
  if (noche.retirada_en) {
    const puntajes = normalizarPuntajes(datos.puntajes);
    const hash = huellaRecepcion(asignacionId, versionId, puntajes);
    const { rows: [previa] } = await client.query(
      "SELECT * FROM planilla_recibida WHERE operation_id = $1 AND asignacion_id = $2 AND hash_contenido = $3",
      [operationId, asignacionId, hash],
    );
    if (previa) return { repetida: true, acuse: acuse(previa) };
    rechazar("edicion_retirada", "La edición retirada es de solo lectura.");
  }
  try {
    const puntajes = normalizarPuntajes(datos.puntajes);
    const hash = huellaRecepcion(asignacionId, versionId, puntajes);
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
    const { rows: heredados } = suplencia ? await client.query(
      "SELECT * FROM puntajes_heredados_traspaso($1)", [asignacionId],
    ) : { rows: [] };
    for (const { fila_id } of heredados) requeridas.delete(fila_id);
    if (!filas.length || puntajes.length !== requeridas.size || !puntajes.every((p) => requeridas.has(p.filaId))) {
      rechazar("puntajes_invalidos", "El envío debe incluir todas y solo las filas que requieren puntaje.");
    }
    const id = randomUUID();
    const completos = [
      ...heredados,
      ...puntajes.map((p) => ({ fila_id: p.filaId, valor: p.valor, no_presentado: p.noPresentado, autor_id: juradoId })),
    ];
    await client.query(
      `INSERT INTO puntaje_recibido (planilla_id, fila_id, valor, no_presentado, autor_id)
       SELECT $1, * FROM unnest($2::uuid[], $3::smallint[], $4::boolean[], $5::text[])`,
      [id, completos.map((p) => p.fila_id), completos.map((p) => p.valor),
        completos.map((p) => p.no_presentado), completos.map((p) => p.autor_id)],
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

function huellaRecepcion(asignacionId, versionId, puntajes) {
  return createHash("sha256").update(JSON.stringify([asignacionId, versionId, puntajes])).digest("hex");
}

export async function recibirPlanilla(pool, juradoId, cuerpo) {
  const datos = validarEnvio(cuerpo);
  const resultado = await conTransaccion(pool, (client) => recibir(client, juradoId, datos));
  if (resultado.error) throw resultado.error;
  return resultado;
}

async function conTransaccion(pool, operacion) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const resultado = await operacion(client);
    await client.query("COMMIT");
    return resultado;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function buscarBorrador(client, asignacionId) {
  const { rows: [borrador] } = await client.query(
    `SELECT operation_id, version_id, puntajes, confirmacion_id, confirmado_en
       FROM borrador_traspaso_jurado WHERE asignacion_id = $1`,
    [asignacionId],
  );
  return borrador;
}

export async function congelarBorradorTraspaso(pool, juradoId, asignacionId, cuerpo) {
  const datos = validarEnvio({ ...cuerpo, asignacionId });
  const dispositivoId = uuidRequerido(datos.dispositivoId, "El dispositivo es obligatorio.");
  const acuse = { estado: "BORRADOR_CONGELADO", asignacionId: datos.asignacionId, operationId: datos.operationId };
  return conTransaccion(pool, async (client) => {
    const { noche, asignacion, suplencia } = await bloquearContexto(client, juradoId, datos.asignacionId);
    if (!suplencia?.dispositivo_id || suplencia.dispositivo_id !== dispositivoId) {
      throw new ErrorAsignacion("dispositivo_no_autorizado", "Solo el dispositivo registrado puede congelar el borrador.");
    }
    const puntajes = normalizarPuntajes(datos.puntajes);
    const serializados = JSON.stringify(puntajes);
    const previo = await buscarBorrador(client, datos.asignacionId);
    if (previo) {
      const mismosPuntajes = previo.puntajes.length === puntajes.length && previo.puntajes.every((p, i) =>
        p.filaId === puntajes[i].filaId && p.valor === puntajes[i].valor && p.noPresentado === puntajes[i].noPresentado);
      if (previo.operation_id === datos.operationId && previo.version_id === datos.versionId && mismosPuntajes) {
        return { repetida: true, acuse: { ...acuse, confirmacionId: previo.confirmacion_id } };
      }
      throw new ErrorAsignacion("borrador_traspaso_congelado", "El borrador ya está congelado.");
    }
    if ((await client.query("SELECT 1 FROM planilla_recibida WHERE asignacion_id = $1", [datos.asignacionId])).rowCount) {
      throw new ErrorAsignacion("planilla_ya_recibida", "La asignación ya tiene una planilla recibida.");
    }
    const { rows: [instantanea] } = await client.query(
      "SELECT version_id, filas_configuradas FROM instantanea_planillas_esperadas WHERE noche_id = $1", [noche.id],
    );
    if (noche.estado !== "OPEN" || !instantanea?.filas_configuradas) {
      throw new ErrorAsignacion("planilla_no_receptiva", "La noche no admite el traspaso de borradores.");
    }
    if (instantanea.version_id !== datos.versionId) {
      throw new ErrorAsignacion("version_no_coincide", "La versión no coincide con el reglamento congelado.");
    }
    const { rows: filas } = await client.query("SELECT * FROM filas_recepcion_planilla($1, $2, $3)", [
      noche.id, datos.versionId, asignacion.especialidad_id,
    ]);
    const requeridas = new Set(filas.filter((f) => f.evaluable).map((f) => f.fila_id));
    const { rows: heredados } = await client.query(
      "SELECT fila_id FROM puntajes_heredados_traspaso($1)", [datos.asignacionId],
    );
    for (const { fila_id } of heredados) requeridas.delete(fila_id);
    if (!filas.length || !puntajes.every(({ filaId }) => requeridas.has(filaId))) {
      throw new ErrorAsignacion("puntajes_invalidos", "El borrador contiene filas que no requieren puntaje.");
    }
    const { rows: [guardado] } = await client.query(
      `INSERT INTO borrador_traspaso_jurado (asignacion_id, operation_id, version_id, autor_id, puntajes)
       VALUES ($1, $2, $3, $4, $5) RETURNING confirmacion_id`,
      [datos.asignacionId, datos.operationId, datos.versionId, juradoId, serializados],
    );
    await registrarAuditoria(client, {
      actorId: juradoId, operacion: "borrador_traspaso_congelado", entidadTipo: "asignacion_jurado",
      entidadId: datos.asignacionId,
    });
    return { repetida: false, acuse: { ...acuse, confirmacionId: guardado.confirmacion_id } };
  });
}

export async function confirmarAcuseTraspaso(pool, juradoId, id, cuerpo) {
  const asignacionId = uuidRequerido(id, "La asignación es obligatoria.").toLowerCase();
  const operationId = uuidRequerido(cuerpo?.operationId, "El identificador de operación es obligatorio.").toLowerCase();
  const dispositivoId = uuidRequerido(cuerpo?.dispositivoId, "El dispositivo es obligatorio.").toLowerCase();
  const confirmacionId = uuidRequerido(cuerpo?.confirmacionId, "La confirmación es obligatoria.").toLowerCase();
  return conTransaccion(pool, async (client) => {
    const { suplencia } = await bloquearContexto(client, juradoId, asignacionId);
    if (suplencia?.dispositivo_id !== dispositivoId) {
      throw new ErrorAsignacion("dispositivo_no_autorizado", "Solo el dispositivo registrado puede confirmar el acuse.");
    }
    const previo = await buscarBorrador(client, asignacionId);
    if (!previo || previo.operation_id !== operationId || previo.confirmacion_id !== confirmacionId) {
      throw new ErrorAsignacion("acuse_traspaso_invalido", "El acuse no corresponde al borrador congelado.");
    }
    if (!previo.confirmado_en) {
      await client.query(
        "UPDATE borrador_traspaso_jurado SET confirmado_en = CURRENT_TIMESTAMP WHERE asignacion_id = $1", [asignacionId],
      );
      await registrarAuditoria(client, {
        actorId: juradoId, operacion: "acuse_traspaso_confirmado", entidadTipo: "asignacion_jurado", entidadId: asignacionId,
      });
    }
    return { estado: "TRASPASO_CONFIRMADO", asignacionId, operationId };
  });
}
