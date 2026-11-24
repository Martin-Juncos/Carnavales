// Servicio de penalizaciones digitales (P6B / D14).
// Las penalizaciones son evidencia separada de la evaluación artística del jurado:
// solo el Escribano las registra o anula mientras la edición está OPEN, y quedan
// congeladas al cerrar la votación completa (CLOSED).

const patronUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tiposValidos = new Set([
  "RETRASO_INGRESO",
  "RETRASO_SALIDA",
  "EXCESO_SHOW_BATERIA",
  "MINIMO_INTEGRANTES",
]);

export class ErrorPenalizacion extends Error {
  constructor(codigo, mensaje = codigo, status = undefined) {
    super(mensaje);
    this.codigo = codigo;
    if (status !== undefined) this.status = status;
  }
}

function uuidValido(valor, mensaje) {
  if (typeof valor !== "string" || !patronUuid.test(valor.trim())) {
    throw new ErrorPenalizacion("campos_invalidos", mensaje);
  }
  return valor.trim().toLowerCase();
}

function textoRequerido(valor, mensaje) {
  const limpio = typeof valor === "string" ? valor.trim() : "";
  if (!limpio) throw new ErrorPenalizacion("campos_invalidos", mensaje);
  return limpio;
}

function normalizarRegistro(datos) {
  const operationId = uuidValido(datos?.operationId, "El identificador de operación debe ser un UUID válido.");
  const nocheId = uuidValido(datos?.nocheId, "La noche es obligatoria.");
  const comparsaId = uuidValido(datos?.comparsaId, "La comparsa es obligatoria.");
  const tipo = typeof datos?.tipo === "string" ? datos.tipo.trim() : "";
  if (!tiposValidos.has(tipo)) {
    throw new ErrorPenalizacion("penalizacion_invalida", "El tipo de penalización no es válido.");
  }
  const motivo = textoRequerido(datos?.motivo, "El motivo es obligatorio.");
  const referenciaActa = textoRequerido(datos?.referenciaActa, "La referencia de acta es obligatoria.");

  let minutos = null;
  let rubroVersionId = null;
  let puntosDescuento = 0;
  let cedioTurno = false;
  let impidePremiosComparsa = false;

  if (tipo === "MINIMO_INTEGRANTES") {
    if (datos?.minutos !== undefined && datos?.minutos !== null) {
      throw new ErrorPenalizacion("penalizacion_invalida", "El incumplimiento de mínimo de integrantes no lleva minutos.");
    }
    if (datos?.rubroVersionId !== undefined && datos?.rubroVersionId !== null) {
      throw new ErrorPenalizacion("penalizacion_invalida", "El incumplimiento de mínimo de integrantes no lleva rubro.");
    }
    impidePremiosComparsa = true;
  } else {
    if (!Number.isInteger(datos?.minutos) || datos.minutos <= 0 || datos.minutos > 9999) {
      throw new ErrorPenalizacion("penalizacion_invalida", "Los minutos deben ser un número entero positivo.");
    }
    minutos = datos.minutos;
    if (tipo === "EXCESO_SHOW_BATERIA") {
      if (typeof datos?.rubroVersionId !== "string" || !patronUuid.test(datos.rubroVersionId.trim())) {
        throw new ErrorPenalizacion("penalizacion_invalida", "El exceso del show de batería requiere un rubro evaluable.");
      }
      rubroVersionId = datos.rubroVersionId.trim().toLowerCase();
      puntosDescuento = Number((minutos * 0.5).toFixed(2));
    } else {
      if (datos?.rubroVersionId !== undefined && datos?.rubroVersionId !== null) {
        throw new ErrorPenalizacion("penalizacion_invalida", "Los retrasos de ingreso o salida no llevan rubro específico.");
      }
      if (tipo === "RETRASO_INGRESO") {
        cedioTurno = minutos > 30;
        puntosDescuento = Number((Math.min(minutos, 30) * 0.5).toFixed(2));
      } else {
        puntosDescuento = Number((minutos * 0.5).toFixed(2));
      }
    }
  }

  return {
    operationId,
    nocheId,
    comparsaId,
    rubroVersionId,
    tipo,
    minutos,
    puntosDescuento,
    cedioTurno,
    impidePremiosComparsa,
    motivo,
    referenciaActa,
  };
}

function filaAPenalizacion(fila) {
  return {
    id: fila.id,
    operationId: fila.operation_id,
    edicionId: fila.edicion_id,
    noche: { id: fila.noche_id, nombre: fila.noche_nombre, orden: fila.noche_orden },
    comparsa: { id: fila.comparsa_id, nombre: fila.comparsa_nombre },
    rubro: fila.rubro_version_id
      ? { id: fila.rubro_version_id, codigo: fila.rubro_codigo, nombre: fila.rubro_nombre }
      : null,
    tipo: fila.tipo,
    minutos: fila.minutos,
    puntosDescuento: Number(fila.puntos_descuento),
    cedioTurno: fila.cedio_turno,
    impidePremiosComparsa: fila.impide_premios_comparsa,
    motivo: fila.motivo,
    referenciaActa: fila.referencia_acta,
    estado: fila.estado,
    registradaEn: fila.registrada_en.toISOString(),
    anulacion: fila.estado === "ANULADA"
      ? {
          anuladaEn: fila.anulada_en.toISOString(),
          motivo: fila.motivo_anulacion,
          referenciaActa: fila.referencia_acta_anulacion,
        }
      : null,
  };
}

const consultaPenalizaciones = `
  SELECT p.id, p.operation_id, p.edicion_id, p.noche_id, p.comparsa_id, p.rubro_version_id,
         p.tipo, p.minutos, p.puntos_descuento, p.cedio_turno, p.impide_premios_comparsa,
         p.motivo, p.referencia_acta, p.estado, p.registrada_en,
         p.anulada_en, p.motivo_anulacion, p.referencia_acta_anulacion,
         n.nombre AS noche_nombre, n.orden AS noche_orden,
         c.nombre AS comparsa_nombre,
         rv.codigo AS rubro_codigo, rv.nombre AS rubro_nombre
    FROM penalizacion p
    JOIN noche n ON n.id = p.noche_id
    JOIN comparsa c ON c.id = p.comparsa_id
    LEFT JOIN rubro_version rv ON rv.id = p.rubro_version_id
`;

async function cargarPenalizacion(client, id) {
  const { rows: [fila] } = await client.query(`${consultaPenalizaciones} WHERE p.id = $1`, [id]);
  return fila ? filaAPenalizacion(fila) : null;
}

export async function obtenerContextoPenalizaciones(pool, { edicionId }) {
  const { rows: [edicion] } = await pool.query(
    "SELECT id, nombre, anio, estado FROM edicion WHERE id = $1 AND retirada_en IS NULL",
    [edicionId],
  );
  if (!edicion) throw new ErrorPenalizacion("edicion_inexistente", "La edición no existe.");

  const { rows: noches } = await pool.query(
    `SELECT id, orden, nombre, estado
       FROM noche
      WHERE edicion_id = $1 AND tipo = 'COMPETENCIA' AND estado IN ('OPEN', 'CLOSED')
      ORDER BY orden, id`,
    [edicionId],
  );
  const { rows: participaciones } = await pool.query(
    `SELECT op.noche_id, c.id, c.nombre, c.categoria, op.orden_presentacion
       FROM orden_presentacion op
       JOIN comparsa c ON c.id = op.comparsa_id AND c.edicion_id = op.edicion_id
       JOIN noche n ON n.id = op.noche_id AND n.edicion_id = op.edicion_id
      WHERE op.edicion_id = $1 AND op.estado = 'SCHEDULED'
        AND n.tipo = 'COMPETENCIA' AND n.estado IN ('OPEN', 'CLOSED')
      ORDER BY op.orden_presentacion, c.nombre`,
    [edicionId],
  );
  const comparsasPorNoche = new Map();
  for (const fila of participaciones) {
    if (!comparsasPorNoche.has(fila.noche_id)) comparsasPorNoche.set(fila.noche_id, []);
    comparsasPorNoche.get(fila.noche_id).push({
      id: fila.id,
      nombre: fila.nombre,
      categoria: fila.categoria,
    });
  }

  const { rows: rubros } = await pool.query(
    `SELECT rv.id, rv.codigo, rv.nombre, rv.tipo_sujeto
       FROM rubro_version rv
       JOIN version_reglamento v ON v.id = rv.version_id
      WHERE rv.edicion_id = $1 AND v.estado IN ('PUBLICADA', 'CONGELADA') AND rv.evaluable
      ORDER BY rv.orden, rv.id`,
    [edicionId],
  );

  return {
    edicion,
    noches: noches.map((n) => ({
      id: n.id,
      orden: n.orden,
      nombre: n.nombre,
      estado: n.estado,
      comparsas: comparsasPorNoche.get(n.id) ?? [],
    })),
    rubros: rubros.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      tipoSujeto: r.tipo_sujeto,
    })),
  };
}

export async function listarPenalizaciones(pool, { edicionId }) {
  const { rows: [edicion] } = await pool.query(
    "SELECT id FROM edicion WHERE id = $1 AND retirada_en IS NULL",
    [edicionId],
  );
  if (!edicion) throw new ErrorPenalizacion("edicion_inexistente", "La edición no existe.");

  const { rows } = await pool.query(
    `${consultaPenalizaciones}
      WHERE p.edicion_id = $1
      ORDER BY p.registrada_en DESC, p.id`,
    [edicionId],
  );
  return { items: rows.map(filaAPenalizacion) };
}

function coincideConPrevia(previa, edicionId, datos) {
  return previa.edicion_id === edicionId
    && previa.noche_id === datos.nocheId
    && previa.comparsa_id === datos.comparsaId
    && (previa.rubro_version_id ?? null) === datos.rubroVersionId
    && previa.tipo === datos.tipo
    && (previa.minutos ?? null) === datos.minutos
    && previa.motivo === datos.motivo
    && previa.referencia_acta === datos.referenciaActa;
}

export async function registrarPenalizacion(pool, { edicionId, actorId, datos }) {
  const edicionNormalizada = edicionId.toLowerCase();
  const norm = normalizarRegistro(datos);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('penalizacion:' || $1::text, 0))",
      [norm.operationId],
    );
    const { rows: [previa] } = await client.query(
      `SELECT p.*, e.retirada_en AS edicion_retirada_en
         FROM penalizacion p
         JOIN edicion e ON e.id = p.edicion_id
        WHERE p.operation_id = $1`,
      [norm.operationId],
    );
    if (previa) {
      if (coincideConPrevia(previa, edicionNormalizada, norm)) {
        if (previa.edicion_retirada_en) {
          throw new ErrorPenalizacion("edicion_retirada", "La edición retirada es de solo lectura.");
        }
        const penalizacion = await cargarPenalizacion(client, previa.id);
        await client.query("COMMIT");
        return { repetida: true, penalizacion };
      }
      throw new ErrorPenalizacion("operacion_conflictiva", "El identificador de operación ya se usó con otros datos.");
    }

    // Orden canónico de bloqueos: noche FOR SHARE -> edicion FOR SHARE.
    const { rows: [noche] } = await client.query(
      "SELECT id, tipo, estado FROM noche WHERE id = $1 AND edicion_id = $2 FOR SHARE",
      [norm.nocheId, edicionNormalizada],
    );
    const { rows: [edicion] } = await client.query(
      "SELECT id, estado, retirada_en FROM edicion WHERE id = $1 FOR SHARE",
      [edicionNormalizada],
    );
    if (!edicion) throw new ErrorPenalizacion("edicion_inexistente", "La edición no existe.");
    if (edicion.retirada_en) throw new ErrorPenalizacion("edicion_retirada", "La edición retirada es de solo lectura.");
    if (edicion.estado === "CLOSED") {
      throw new ErrorPenalizacion("edicion_cerrada", "La edición ya cerró su votación y las penalizaciones están congeladas.");
    }
    if (edicion.estado !== "OPEN") {
      throw new ErrorPenalizacion("edicion_no_abierta", "La edición debe estar abierta para registrar penalizaciones.");
    }
    if (!noche) throw new ErrorPenalizacion("noche_inexistente", "La noche no existe en la edición.", 404);
    if (noche.tipo !== "COMPETENCIA" || (noche.estado !== "OPEN" && noche.estado !== "CLOSED")) {
      throw new ErrorPenalizacion("noche_no_penalizable", "Solo se pueden registrar penalizaciones sobre noches competitivas abiertas o cerradas.");
    }

    const { rows: [comparsa] } = await client.query(
      "SELECT id FROM comparsa WHERE id = $1 AND edicion_id = $2",
      [norm.comparsaId, edicionId],
    );
    if (!comparsa) throw new ErrorPenalizacion("comparsa_inexistente", "La comparsa no existe en la edición.");

    const { rowCount: programada } = await client.query(
      `SELECT 1 FROM orden_presentacion
        WHERE edicion_id = $1 AND noche_id = $2 AND comparsa_id = $3 AND estado = 'SCHEDULED'`,
      [edicionId, norm.nocheId, norm.comparsaId],
    );
    if (!programada) {
      throw new ErrorPenalizacion("comparsa_no_programada_en_noche", "La comparsa no está programada en esa noche.");
    }

    if (norm.rubroVersionId) {
      const { rowCount: rubroValido } = await client.query(
        `SELECT 1 FROM rubro_version rv JOIN version_reglamento v ON v.id = rv.version_id
          WHERE rv.id = $1 AND rv.edicion_id = $2 AND v.estado IN ('PUBLICADA', 'CONGELADA') AND rv.evaluable`,
        [norm.rubroVersionId, edicionId],
      );
      if (!rubroValido) {
        throw new ErrorPenalizacion("rubro_penalizacion_invalido", "El rubro no corresponde a un rubro evaluable del reglamento vigente.");
      }
    }

    const { rows: [creada] } = await client.query(
      `INSERT INTO penalizacion
         (operation_id, edicion_id, noche_id, comparsa_id, rubro_version_id, tipo, minutos,
          puntos_descuento, cedio_turno, impide_premios_comparsa, motivo, referencia_acta, registrada_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        norm.operationId,
        edicionId,
        norm.nocheId,
        norm.comparsaId,
        norm.rubroVersionId,
        norm.tipo,
        norm.minutos,
        norm.puntosDescuento,
        norm.cedioTurno,
        norm.impidePremiosComparsa,
        norm.motivo,
        norm.referenciaActa,
        actorId,
      ],
    );
    const penalizacion = await cargarPenalizacion(client, creada.id);
    await client.query("COMMIT");
    return { repetida: false, penalizacion };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function anularPenalizacion(pool, { edicionId, penalizacionId, actorId, datos }) {
  const motivo = textoRequerido(datos?.motivoAnulacion, "El motivo de anulación es obligatorio.");
  const referenciaActa = textoRequerido(datos?.referenciaActaAnulacion, "La referencia de acta de anulación es obligatoria.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [ref] } = await client.query(
      "SELECT noche_id FROM penalizacion WHERE id = $1 AND edicion_id = $2",
      [penalizacionId, edicionId],
    );
    if (!ref) throw new ErrorPenalizacion("penalizacion_inexistente", "La penalización no existe en esta edición.");

    // Orden canónico de bloqueos: noche FOR SHARE -> edicion FOR SHARE -> penalizacion FOR UPDATE.
    await client.query("SELECT id FROM noche WHERE id = $1 FOR SHARE", [ref.noche_id]);
    const { rows: [edicion] } = await client.query(
      "SELECT id, estado, retirada_en FROM edicion WHERE id = $1 FOR SHARE",
      [edicionId],
    );
    const { rows: [penalizacion] } = await client.query(
      "SELECT * FROM penalizacion WHERE id = $1 AND edicion_id = $2 FOR UPDATE",
      [penalizacionId, edicionId],
    );
    if (!penalizacion) throw new ErrorPenalizacion("penalizacion_inexistente", "La penalización no existe en esta edición.");
    if (edicion.retirada_en) throw new ErrorPenalizacion("edicion_retirada", "La edición retirada es de solo lectura.");
    if (edicion.estado === "CLOSED") {
      throw new ErrorPenalizacion("edicion_cerrada", "La edición ya cerró su votación y las penalizaciones están congeladas.");
    }
    if (edicion.estado !== "OPEN") {
      throw new ErrorPenalizacion("edicion_no_abierta", "La edición no está abierta.");
    }

    if (penalizacion.estado === "ANULADA") {
      if (penalizacion.motivo_anulacion === motivo && penalizacion.referencia_acta_anulacion === referenciaActa) {
        const existente = await cargarPenalizacion(client, penalizacion.id);
        await client.query("COMMIT");
        return existente;
      }
      throw new ErrorPenalizacion("penalizacion_ya_anulada", "La penalización ya fue anulada.");
    }

    await client.query(
      `UPDATE penalizacion
          SET estado = 'ANULADA', anulada_por = $2, motivo_anulacion = $3, referencia_acta_anulacion = $4
        WHERE id = $1`,
      [penalizacionId, actorId, motivo, referenciaActa],
    );
    const actualizada = await cargarPenalizacion(client, penalizacionId);
    await client.query("COMMIT");
    return actualizada;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
