// Motor de cálculo de resultados v1 (GOYA_2026_V1), snapshots inmutables,
// resolución manual de empates y publicación oficial (P6C).
// Invariante D15: ningún puntaje ni resultado es calculable o consultable antes
// del cierre total (edicion.estado = 'CLOSED').

import { createHash } from "node:crypto";

const patronUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const categoriasValidas = new Set(["PRIMERA", "AGRUPACION"]);

export class ErrorResultado extends Error {
  constructor(codigo, mensaje = codigo, status = undefined) {
    super(mensaje);
    this.codigo = codigo;
    if (status !== undefined) this.status = status;
  }
}

function round2(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

function normalizarParametros(datos) {
  let maxCarrosComparsa = 2;
  if (datos?.maxCarrosComparsa !== undefined) {
    if (!Number.isInteger(datos.maxCarrosComparsa) || datos.maxCarrosComparsa < 1 || datos.maxCarrosComparsa > 20) {
      throw new ErrorResultado("campos_invalidos", "maxCarrosComparsa debe ser un entero entre 1 y 20.", 400);
    }
    maxCarrosComparsa = datos.maxCarrosComparsa;
  }

  let categoriasGenerales = ["PRIMERA"];
  if (datos?.categoriasGenerales !== undefined) {
    if (!Array.isArray(datos.categoriasGenerales) || datos.categoriasGenerales.length === 0
        || !datos.categoriasGenerales.every((c) => categoriasValidas.has(c))) {
      throw new ErrorResultado("campos_invalidos", "categoriasGenerales debe contener categorías válidas.", 400);
    }
    categoriasGenerales = [...new Set(datos.categoriasGenerales)].sort();
  }

  return { maxCarrosComparsa, categoriasGenerales };
}

function textoRequerido(valor, mensaje) {
  const limpio = typeof valor === "string" ? valor.trim() : "";
  if (!limpio) throw new ErrorResultado("campos_invalidos", mensaje, 400);
  return limpio;
}

function uuidRequerido(valor, mensaje) {
  if (typeof valor !== "string" || !patronUuid.test(valor.trim())) {
    throw new ErrorResultado("campos_invalidos", mensaje, 400);
  }
  return valor.trim().toLowerCase();
}

function asignarPosiciones(lista, campoPuntaje) {
  const ordenada = [...lista].sort((a, b) => (b[campoPuntaje] - a[campoPuntaje]) || a.claveOrden.localeCompare(b.claveOrden));
  const conteos = new Map();
  for (const item of ordenada) {
    const k = item[campoPuntaje].toFixed(2);
    conteos.set(k, (conteos.get(k) ?? 0) + 1);
  }
  let posicion = 0;
  let puntajePrevio = null;
  return ordenada.map((item, indice) => {
    if (puntajePrevio === null || item[campoPuntaje] !== puntajePrevio) {
      posicion = indice + 1;
      puntajePrevio = item[campoPuntaje];
    }
    const empatado = (conteos.get(item[campoPuntaje].toFixed(2)) ?? 0) > 1;
    return { ...item, posicion, empatado };
  });
}

// Motor puro GOYA_2026_V1: determinístico y libre de efectos secundarios.
export function calcularResultadosV1({ comparsas, sujetos, rubros, puntajes, penalizaciones, parametros }) {
  const rubrosEvaluables = rubros.filter((r) => r.evaluable);
  const rubroPorId = new Map(rubrosEvaluables.map((r) => [r.id, r]));
  const hijosPorPadre = new Map();
  for (const r of rubrosEvaluables) {
    if (r.padreId && rubroPorId.has(r.padreId)) {
      if (!hijosPorPadre.has(r.padreId)) hijosPorPadre.set(r.padreId, []);
      hijosPorPadre.get(r.padreId).push(r.id);
    }
  }
  const sujetoPorId = new Map(sujetos.map((s) => [s.id, s]));

  // 1. Suma de puntajes artísticos por (rubro hoja, sujeto)
  const artistico = new Map(); // `${rubroId}:${sujetoId}` -> number
  const claveRS = (rId, sId) => `${rId}:${sId}`;
  const sujetosPorRubro = new Map();
  const registrarScore = (rId, sId, delta) => {
    const k = claveRS(rId, sId);
    artistico.set(k, round2((artistico.get(k) ?? 0) + delta));
    if (!sujetosPorRubro.has(rId)) sujetosPorRubro.set(rId, new Set());
    sujetosPorRubro.get(rId).add(sId);
  };

  for (const p of puntajes) {
    if (!rubroPorId.has(p.rubroVersionId) || !sujetoPorId.has(p.sujetoId)) continue;
    if (hijosPorPadre.has(p.rubroVersionId)) continue; // D25: padre nunca recibe nota manual
    registrarScore(p.rubroVersionId, p.sujetoId, Number(p.valor));
  }

  // 2. Roll-up recursivo de rubros padre (suma de hijos — D25 / AGENTS.md §2)
  const resueltos = new Set();
  function resolverPadre(rubroId) {
    if (resueltos.has(rubroId)) return;
    resueltos.add(rubroId);
    const hijos = hijosPorPadre.get(rubroId);
    if (!hijos?.length) return;
    for (const hijoId of hijos) resolverPadre(hijoId);
    const sujetosEnHijos = new Set();
    for (const hijoId of hijos) {
      for (const sId of sujetosPorRubro.get(hijoId) ?? []) sujetosEnHijos.add(sId);
    }
    for (const sId of sujetosEnHijos) {
      let suma = 0;
      for (const hijoId of hijos) suma += artistico.get(claveRS(hijoId, sId)) ?? 0;
      registrarScore(rubroId, sId, suma);
    }
  }
  for (const r of rubrosEvaluables) resolverPadre(r.id);

  // 3. Penalizaciones activas agrupadas
  const descuentoBateria = new Map(); // `${comparsaId}:${rubroId}` -> number
  const descuentoGeneralPorComparsa = new Map();
  const descalificadaPorComparsa = new Set();
  for (const pen of penalizaciones) {
    if (pen.impidePremiosComparsa) {
      descalificadaPorComparsa.add(pen.comparsaId);
    } else if (pen.tipo === "EXCESO_SHOW_BATERIA" && pen.rubroVersionId) {
      const k = `${pen.comparsaId}:${pen.rubroVersionId}`;
      descuentoBateria.set(k, round2((descuentoBateria.get(k) ?? 0) + Number(pen.puntosDescuento)));
    } else if (pen.tipo === "RETRASO_INGRESO" || pen.tipo === "RETRASO_SALIDA") {
      descuentoGeneralPorComparsa.set(
        pen.comparsaId,
        round2((descuentoGeneralPorComparsa.get(pen.comparsaId) ?? 0) + Number(pen.puntosDescuento)),
      );
    }
  }

  // 4. Resultados y ranking por rubro evaluable (premios individuales y grupales)
  const netoPorRS = new Map(); // `${rubroId}:${sujetoId}` -> { artistico, descuento, neto, comparsaId }
  const resultadosRubroSujeto = [];
  const empates = [];

  for (const rubro of rubrosEvaluables) {
    const sIds = [...(sujetosPorRubro.get(rubro.id) ?? [])];
    if (sIds.length === 0) continue;
    const candidatos = sIds.map((sId) => {
      const sujeto = sujetoPorId.get(sId);
      const art = artistico.get(claveRS(rubro.id, sId)) ?? 0;
      const desc = descuentoBateria.get(`${sujeto.comparsaId}:${rubro.id}`) ?? 0;
      const neto = round2(Math.max(0, art - desc));
      netoPorRS.set(claveRS(rubro.id, sId), { artistico: art, descuento: desc, neto, comparsaId: sujeto.comparsaId });
      return {
        rubroVersionId: rubro.id,
        sujetoId: sId,
        comparsaId: sujeto.comparsaId,
        puntajeArtistico: art,
        descuentoRubro: desc,
        puntajeNeto: neto,
        claveOrden: sId,
      };
    });
    const rankeados = asignarPosiciones(candidatos, "puntajeNeto");
    for (const item of rankeados) {
      resultadosRubroSujeto.push({
        rubroVersionId: item.rubroVersionId,
        sujetoId: item.sujetoId,
        comparsaId: item.comparsaId,
        puntajeArtistico: item.puntajeArtistico,
        descuentoRubro: item.descuentoRubro,
        puntajeNeto: item.puntajeNeto,
        posicion: item.posicion,
        empatado: item.empatado,
      });
    }
    const lideres = rankeados.filter((x) => x.posicion === 1);
    if (!rubro.padreId && lideres.length >= 2) {
      empates.push({
        ambito: "RUBRO",
        rubroVersionId: rubro.id,
        posicionEmpatada: 1,
        puntajeEmpatado: lideres[0].puntajeNeto,
        candidatosIds: lideres.map((x) => x.sujetoId),
      });
    }
  }

  // 5. Resultado general de comparsas (D24 + A10 + D14)
  const rubrosRaizComparsa = rubrosEvaluables.filter(
    (r) => !r.padreId && r.sumaAComparsa && r.tipoRubro !== "ALEATORIO",
  );
  const categoriasElegibles = new Set(parametros.categoriasGenerales);
  const comparsasElegibles = comparsas.filter((c) => categoriasElegibles.has(c.categoria));

  const calculadas = comparsasElegibles.map((comparsa) => {
    let puntajeFijos = 0;
    let puntajeNominativos = 0;
    let descuentoRubros = 0;
    const carrosTotales = new Map(); // sujetoId -> total neto
    const detalleRubros = [];

    for (const rubro of rubrosRaizComparsa) {
      const filasComparsa = [...(sujetosPorRubro.get(rubro.id) ?? [])]
        .filter((sId) => sujetoPorId.get(sId)?.comparsaId === comparsa.id)
        .map((sId) => ({ sId, ...netoPorRS.get(claveRS(rubro.id, sId)) }));

      if (filasComparsa.length === 0) continue;

      const descRubroComparsa = descuentoBateria.get(`${comparsa.id}:${rubro.id}`) ?? 0;
      descuentoRubros = round2(descuentoRubros + descRubroComparsa);

      if (rubro.tipoSujeto === "CARRO") {
        for (const f of filasComparsa) {
          carrosTotales.set(f.sId, round2((carrosTotales.get(f.sId) ?? 0) + f.neto));
        }
      } else if (rubro.tipoRubro === "NOMINATIVO") {
        const mejor = Math.max(...filasComparsa.map((f) => f.neto));
        puntajeNominativos = round2(puntajeNominativos + mejor);
        detalleRubros.push({ rubroId: rubro.id, codigo: rubro.codigo, modo: "MEJOR_NOMINATIVO", puntaje: mejor });
      } else {
        // Rubro fijo (tipo_rubro NULL): suma neta; si hubiera múltiples sujetos con batería descontada se aplica una sola vez
        const sumaArt = round2(filasComparsa.reduce((acc, f) => acc + f.artistico, 0));
        const netoRubro = round2(Math.max(0, sumaArt - descRubroComparsa));
        puntajeFijos = round2(puntajeFijos + netoRubro);
        detalleRubros.push({ rubroId: rubro.id, codigo: rubro.codigo, modo: "FIJO", puntaje: netoRubro });
      }
    }

    const carrosOrdenados = [...carrosTotales.entries()]
      .map(([sujetoId, puntaje]) => ({ sujetoId, puntaje }))
      .sort((a, b) => (b.puntaje - a.puntaje) || a.sujetoId.localeCompare(b.sujetoId));
    const carrosComputados = carrosOrdenados.slice(0, parametros.maxCarrosComparsa);
    const puntajeCarros = round2(carrosComputados.reduce((acc, c) => acc + c.puntaje, 0));

    const descuentoGeneral = descuentoGeneralPorComparsa.get(comparsa.id) ?? 0;
    const puntajeTotal = round2(Math.max(0, puntajeFijos + puntajeNominativos + puntajeCarros - descuentoGeneral));
    const descalificadaComparsa = descalificadaPorComparsa.has(comparsa.id);

    return {
      comparsaId: comparsa.id,
      categoria: comparsa.categoria,
      puntajeFijos,
      puntajeNominativos,
      puntajeCarros,
      descuentoRubros,
      descuentoGeneral,
      puntajeTotal,
      descalificadaComparsa,
      claveOrden: comparsa.id,
      detalle: { rubros: detalleRubros, carrosComputados },
    };
  });

  const habilitadas = asignarPosiciones(
    calculadas.filter((c) => !c.descalificadaComparsa),
    "puntajeTotal",
  );
  const descalificadas = calculadas
    .filter((c) => c.descalificadaComparsa)
    .sort((a, b) => a.claveOrden.localeCompare(b.claveOrden))
    .map((c) => ({ ...c, posicion: null, empatado: false }));

  const resultadosComparsa = [...habilitadas, ...descalificadas].map(({ claveOrden: _k, ...resto }) => resto);
  const lideresComparsa = habilitadas.filter((c) => c.posicion === 1);
  if (lideresComparsa.length >= 2) {
    empates.push({
      ambito: "COMPARSA",
      rubroVersionId: null,
      posicionEmpatada: 1,
      puntajeEmpatado: lideresComparsa[0].puntajeTotal,
      candidatosIds: lideresComparsa.map((c) => c.comparsaId),
    });
  }

  return { resultadosComparsa, resultadosRubroSujeto, empates };
}

async function exigirEdicionCerrada(client, edicionId, { paraLectura = false } = {}) {
  const { rows: [edicion] } = await client.query(
    `SELECT id, nombre, anio, estado, cerrada_en, retirada_en
       FROM edicion WHERE id = $1 ${paraLectura ? "" : "FOR SHARE"}`,
    [edicionId],
  );
  if (!edicion || (paraLectura && edicion.retirada_en)) {
    throw new ErrorResultado("edicion_inexistente", "La edición no existe.", 404);
  }
  if (edicion.retirada_en) {
    throw new ErrorResultado("edicion_retirada", "La edición retirada es de solo lectura.", 409);
  }
  if (edicion.estado !== "CLOSED") {
    throw new ErrorResultado(
      "edicion_no_cerrada",
      "Los resultados y puntajes solo están disponibles tras el cierre total de la votación.",
      409,
    );
  }
  return edicion;
}

async function hidratarSnapshot(client, calculoId) {
  const { rows: [calc] } = await client.query(
    `SELECT id, edicion_id, version_reglamento_id, numero, algoritmo, parametros, hash_entradas,
            estado, calculado_en, publicado_en
       FROM calculo_resultado WHERE id = $1`,
    [calculoId],
  );
  if (!calc) return null;

  const { rows: comparsas } = await client.query(
    `SELECT rc.*, c.nombre AS comparsa_nombre
       FROM resultado_comparsa rc
       JOIN comparsa c ON c.id = rc.comparsa_id
      WHERE rc.calculo_id = $1
      ORDER BY rc.descalificada_comparsa ASC, rc.posicion ASC NULLS LAST, c.nombre ASC`,
    [calculoId],
  );

  const { rows: rubrosFilas } = await client.query(
    `SELECT rrs.*, rv.codigo AS rubro_codigo, rv.nombre AS rubro_nombre,
            rv.tipo_rubro, rv.tipo_sujeto, rv.suma_a_comparsa, rv.padre_id, rv.orden AS rubro_orden,
            s.nombre AS sujeto_nombre, p.nombre_completo AS participante_nombre,
            c.nombre AS comparsa_nombre
       FROM resultado_rubro_sujeto rrs
       JOIN rubro_version rv ON rv.id = rrs.rubro_version_id
       JOIN sujeto_evaluable s ON s.id = rrs.sujeto_id
       LEFT JOIN participante p ON p.id = s.participante_id
       JOIN comparsa c ON c.id = rrs.comparsa_id
      WHERE rrs.calculo_id = $1
      ORDER BY rv.orden ASC, rrs.posicion ASC, rrs.sujeto_id ASC`,
    [calculoId],
  );

  const rubrosMap = new Map();
  for (const f of rubrosFilas) {
    if (!rubrosMap.has(f.rubro_version_id)) {
      rubrosMap.set(f.rubro_version_id, {
        rubro: {
          id: f.rubro_version_id,
          codigo: f.rubro_codigo,
          nombre: f.rubro_nombre,
          tipoRubro: f.tipo_rubro,
          tipoSujeto: f.tipo_sujeto,
          sumaAComparsa: f.suma_a_comparsa,
          padreId: f.padre_id,
        },
        resultados: [],
      });
    }
    rubrosMap.get(f.rubro_version_id).resultados.push({
      sujeto: { id: f.sujeto_id, nombre: f.sujeto_nombre ?? f.participante_nombre },
      comparsa: { id: f.comparsa_id, nombre: f.comparsa_nombre },
      puntajeArtistico: Number(f.puntaje_artistico),
      descuentoRubro: Number(f.descuento_rubro),
      puntajeNeto: Number(f.puntaje_neto),
      posicion: f.posicion,
      empatado: f.empatado,
    });
  }

  const { rows: empatesFilas } = await client.query(
    `SELECT e.*, rv.codigo AS rubro_codigo, rv.nombre AS rubro_nombre
       FROM empate_resultado e
       LEFT JOIN rubro_version rv ON rv.id = e.rubro_version_id
      WHERE e.calculo_id = $1
      ORDER BY e.ambito ASC, rv.orden ASC NULLS FIRST, e.id ASC`,
    [calculoId],
  );

  const nombresComparsa = new Map(comparsas.map((c) => [c.comparsa_id, c.comparsa_nombre]));
  const nombresSujeto = new Map(rubrosFilas.map((f) => [
    f.sujeto_id,
    { nombre: f.sujeto_nombre ?? f.participante_nombre, comparsaNombre: f.comparsa_nombre },
  ]));

  const empates = empatesFilas.map((e) => ({
    id: e.id,
    ambito: e.ambito,
    rubro: e.rubro_version_id ? { id: e.rubro_version_id, codigo: e.rubro_codigo, nombre: e.rubro_nombre } : null,
    posicionEmpatada: e.posicion_empatada,
    puntajeEmpatado: Number(e.puntaje_empatado),
    estado: e.estado,
    candidatos: e.candidatos_ids.map((id) => (
      e.ambito === "COMPARSA"
        ? { id, nombre: nombresComparsa.get(id) ?? id }
        : {
            id,
            nombre: nombresSujeto.get(id)?.nombre ?? id,
            comparsaNombre: nombresSujeto.get(id)?.comparsaNombre ?? null,
          }
    )),
    resolucion: e.estado === "RESUELTO"
      ? {
          ganadorId: e.ambito === "COMPARSA" ? e.ganador_comparsa_id : e.ganador_sujeto_id,
          motivo: e.motivo_resolucion,
          referenciaActa: e.referencia_acta,
          resueltoEn: e.resuelto_en.toISOString(),
        }
      : null,
  }));

  return {
    id: calc.id,
    edicionId: calc.edicion_id,
    versionReglamentoId: calc.version_reglamento_id,
    numero: calc.numero,
    algoritmo: calc.algoritmo,
    parametros: calc.parametros,
    hashEntradas: calc.hash_entradas,
    estado: calc.estado,
    calculadoEn: calc.calculado_en.toISOString(),
    publicadoEn: calc.publicado_en ? calc.publicado_en.toISOString() : null,
    comparsas: comparsas.map((c) => ({
      comparsa: { id: c.comparsa_id, nombre: c.comparsa_nombre, categoria: c.categoria },
      puntajeFijos: Number(c.puntaje_fijos),
      puntajeNominativos: Number(c.puntaje_nominativos),
      puntajeCarros: Number(c.puntaje_carros),
      descuentoRubros: Number(c.descuento_rubros),
      descuentoGeneral: Number(c.descuento_general),
      puntajeTotal: Number(c.puntaje_total),
      descalificadaComparsa: c.descalificada_comparsa,
      posicion: c.posicion,
      empatado: c.empatado,
      detalle: c.detalle,
    })),
    rubros: [...rubrosMap.values()],
    empates,
  };
}

export async function calcularResultadosEdicion(pool, { edicionId, actorId, datos }) {
  const edicionNorm = edicionId.toLowerCase();
  const parametros = normalizarParametros(datos);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('resultados:' || $1::text, 0))", [edicionNorm]);
    await exigirEdicionCerrada(client, edicionNorm);

    const { rowCount: yaPublicado } = await client.query(
      "SELECT 1 FROM calculo_resultado WHERE edicion_id = $1 AND estado = 'PUBLICADO'",
      [edicionNorm],
    );
    if (yaPublicado) {
      throw new ErrorResultado("resultado_ya_publicado", "La edición ya tiene resultados oficiales publicados.", 409);
    }

    const { rows: versiones } = await client.query(
      `SELECT DISTINCT i.version_id
         FROM instantanea_planillas_esperadas i
         JOIN noche n ON n.id = i.noche_id
        WHERE i.edicion_id = $1 AND n.tipo = 'COMPETENCIA' AND n.cuenta_para_puntaje = true AND n.estado = 'CLOSED'`,
      [edicionNorm],
    );
    if (versiones.length !== 1) {
      throw new ErrorResultado("sin_datos_calculo", "No se encontró una única versión congelada en las noches puntuables cerradas.", 409);
    }
    const versionId = versiones[0].version_id;

    const { rows: comparsas } = await client.query(
      "SELECT id, nombre, categoria FROM comparsa WHERE edicion_id = $1 AND activa ORDER BY id",
      [edicionNorm],
    );
    const { rows: sujetos } = await client.query(
      `SELECT s.id, s.comparsa_id AS "comparsaId", s.tipo_sujeto AS "tipoSujeto",
              COALESCE(s.nombre, p.nombre_completo) AS nombre
         FROM sujeto_evaluable s
         LEFT JOIN participante p ON p.id = s.participante_id
        WHERE s.edicion_id = $1 AND s.activo
        ORDER BY s.id`,
      [edicionNorm],
    );
    const { rows: rubros } = await client.query(
      `SELECT id, codigo, nombre, tipo_sujeto AS "tipoSujeto", tipo_rubro AS "tipoRubro",
              suma_a_comparsa AS "sumaAComparsa", padre_id AS "padreId", evaluable, orden
         FROM rubro_version
        WHERE edicion_id = $1 AND version_id = $2
        ORDER BY orden, id`,
      [edicionNorm, versionId],
    );

    // Solo puntajes de planillas oficiales recibidas que satisfacen la instantánea de noches puntuables cerradas.
    const { rows: puntajes } = await client.query(
      `SELECT pr.id AS "planillaId", pr.hash_contenido AS "hashPlanilla",
              pu.fila_id AS "filaId", f.rubro_version_id AS "rubroVersionId",
              f.sujeto_id AS "sujetoId", s.comparsa_id AS "comparsaId",
              pu.valor, pu.no_presentado AS "noPresentado"
         FROM noche n
         JOIN instantanea_planillas_esperadas i ON i.noche_id = n.id
         JOIN instantanea_planilla_esperada_detalle d ON d.instantanea_id = i.id
         LEFT JOIN suplentes_asignacion_jurado sup ON sup.detalle_esperado_id = d.id
         JOIN planilla_recibida pr
           ON pr.asignacion_id = COALESCE(sup.asignacion_activa_id, d.asignacion_id)
          AND pr.version_id = i.version_id
         JOIN puntaje_recibido pu ON pu.planilla_id = pr.id
         JOIN fila_planilla f ON f.id = pu.fila_id
         JOIN sujeto_evaluable s ON s.id = f.sujeto_id
        WHERE n.edicion_id = $1 AND n.tipo = 'COMPETENCIA' AND n.cuenta_para_puntaje = true AND n.estado = 'CLOSED'
        ORDER BY pr.id, pu.fila_id`,
      [edicionNorm],
    );

    const { rows: penalizaciones } = await client.query(
      `SELECT p.id, p.comparsa_id AS "comparsaId", p.rubro_version_id AS "rubroVersionId",
              p.tipo, p.puntos_descuento AS "puntosDescuento",
              p.impide_premios_comparsa AS "impidePremiosComparsa"
         FROM penalizacion p
         JOIN noche n ON n.id = p.noche_id
        WHERE p.edicion_id = $1 AND p.estado = 'ACTIVA'
          AND n.tipo = 'COMPETENCIA' AND n.cuenta_para_puntaje = true AND n.estado = 'CLOSED'
        ORDER BY p.id`,
      [edicionNorm],
    );

    const hashEntradas = createHash("sha256")
      .update(JSON.stringify({ versionId, parametros, puntajes, penalizaciones }))
      .digest("hex");

    const calculado = calcularResultadosV1({
      comparsas, sujetos, rubros, puntajes, penalizaciones, parametros,
    });

    const { rows: [{ siguiente }] } = await client.query(
      "SELECT COALESCE(MAX(numero), 0)::int + 1 AS siguiente FROM calculo_resultado WHERE edicion_id = $1",
      [edicionNorm],
    );

    const { rows: [cabecera] } = await client.query(
      `INSERT INTO calculo_resultado
         (edicion_id, version_reglamento_id, numero, algoritmo, parametros, hash_entradas, calculado_por)
       VALUES ($1, $2, $3, 'GOYA_2026_V1', $4::jsonb, $5, $6)
       RETURNING id`,
      [edicionNorm, versionId, siguiente, JSON.stringify(parametros), hashEntradas, actorId],
    );

    for (const rc of calculado.resultadosComparsa) {
      await client.query(
        `INSERT INTO resultado_comparsa
           (calculo_id, edicion_id, comparsa_id, categoria, puntaje_fijos, puntaje_nominativos,
            puntaje_carros, descuento_rubros, descuento_general, puntaje_total,
            descalificada_comparsa, posicion, empatado, detalle)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)`,
        [
          cabecera.id, edicionNorm, rc.comparsaId, rc.categoria, rc.puntajeFijos, rc.puntajeNominativos,
          rc.puntajeCarros, rc.descuentoRubros, rc.descuentoGeneral, rc.puntajeTotal,
          rc.descalificadaComparsa, rc.posicion, rc.empatado, JSON.stringify(rc.detalle),
        ],
      );
    }

    for (const rrs of calculado.resultadosRubroSujeto) {
      await client.query(
        `INSERT INTO resultado_rubro_sujeto
           (calculo_id, edicion_id, rubro_version_id, sujeto_id, comparsa_id,
            puntaje_artistico, descuento_rubro, puntaje_neto, posicion, empatado)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          cabecera.id, edicionNorm, rrs.rubroVersionId, rrs.sujetoId, rrs.comparsaId,
          rrs.puntajeArtistico, rrs.descuentoRubro, rrs.puntajeNeto, rrs.posicion, rrs.empatado,
        ],
      );
    }

    for (const emp of calculado.empates) {
      await client.query(
        `INSERT INTO empate_resultado
           (calculo_id, edicion_id, ambito, rubro_version_id, posicion_empatada, puntaje_empatado, candidatos_ids)
         VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[])`,
        [cabecera.id, edicionNorm, emp.ambito, emp.rubroVersionId, emp.posicionEmpatada, emp.puntajeEmpatado, emp.candidatosIds],
      );
    }

    const snapshot = await hidratarSnapshot(client, cabecera.id);
    await client.query("COMMIT");
    return snapshot;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function resolverEmpateResultado(pool, { edicionId, calculoId, empateId, actorId, datos }) {
  const edicionNorm = edicionId.toLowerCase();
  const ganadorId = uuidRequerido(datos?.ganadorId, "El ganador seleccionado debe ser un UUID válido.");
  const motivo = textoRequerido(datos?.motivoResolucion, "El motivo de resolución del empate es obligatorio.");
  const acta = textoRequerido(datos?.referenciaActa, "La referencia de acta es obligatoria.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('resultados:' || $1::text, 0))", [edicionNorm]);
    await exigirEdicionCerrada(client, edicionNorm);

    const { rows: [calc] } = await client.query(
      "SELECT id, estado FROM calculo_resultado WHERE id = $1 AND edicion_id = $2 FOR SHARE",
      [calculoId, edicionNorm],
    );
    if (!calc) throw new ErrorResultado("calculo_inexistente", "El cálculo indicado no existe en esta edición.", 404);

    const { rows: [emp] } = await client.query(
      "SELECT * FROM empate_resultado WHERE id = $1 AND calculo_id = $2 AND edicion_id = $3 FOR UPDATE",
      [empateId, calculoId, edicionNorm],
    );
    if (!emp) throw new ErrorResultado("empate_inexistente", "El empate indicado no existe en este cálculo.", 404);

    if (emp.estado === "RESUELTO") {
      const ganadorPrevio = emp.ambito === "COMPARSA" ? emp.ganador_comparsa_id : emp.ganador_sujeto_id;
      if (ganadorPrevio === ganadorId && emp.motivo_resolucion === motivo && emp.referencia_acta === acta) {
        const snap = await hidratarSnapshot(client, calculoId);
        await client.query("COMMIT");
        return snap.empates.find((x) => x.id === emp.id);
      }
      throw new ErrorResultado("empate_ya_resuelto", "El empate ya fue resuelto anteriormente.", 409);
    }

    if (calc.estado !== "CALCULADO") {
      throw new ErrorResultado("resultado_ya_publicado", "No se pueden modificar empates de un resultado ya publicado.", 409);
    }
    if (!emp.candidatos_ids.includes(ganadorId)) {
      throw new ErrorResultado("candidato_empate_invalido", "El ganador elegido no forma parte de los candidatos empatados.", 422);
    }

    await client.query(
      `UPDATE empate_resultado
          SET estado = 'RESUELTO',
              ganador_comparsa_id = CASE WHEN ambito = 'COMPARSA' THEN $2::uuid ELSE NULL END,
              ganador_sujeto_id   = CASE WHEN ambito = 'RUBRO'    THEN $2::uuid ELSE NULL END,
              motivo_resolucion = $3,
              referencia_acta = $4,
              resuelto_por = $5
        WHERE id = $1`,
      [emp.id, ganadorId, motivo, acta, actorId],
    );

    const snap = await hidratarSnapshot(client, calculoId);
    await client.query("COMMIT");
    return snap.empates.find((x) => x.id === emp.id);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function publicarResultadoEdicion(pool, { edicionId, calculoId, actorId }) {
  const edicionNorm = edicionId.toLowerCase();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('resultados:' || $1::text, 0))", [edicionNorm]);
    await exigirEdicionCerrada(client, edicionNorm);

    const { rows: [calc] } = await client.query(
      "SELECT id, estado FROM calculo_resultado WHERE id = $1 AND edicion_id = $2 FOR UPDATE",
      [calculoId, edicionNorm],
    );
    if (!calc) throw new ErrorResultado("calculo_inexistente", "El cálculo indicado no existe en esta edición.", 404);

    if (calc.estado === "PUBLICADO") {
      const snap = await hidratarSnapshot(client, calc.id);
      await client.query("COMMIT");
      return snap;
    }

    const { rowCount: otroPublicado } = await client.query(
      "SELECT 1 FROM calculo_resultado WHERE edicion_id = $1 AND estado = 'PUBLICADO'",
      [edicionNorm],
    );
    if (otroPublicado) {
      throw new ErrorResultado("resultado_ya_publicado", "La edición ya tiene otro snapshot publicado oficialmente.", 409);
    }

    const { rowCount: pendientes } = await client.query(
      "SELECT 1 FROM empate_resultado WHERE calculo_id = $1 AND estado = 'PENDIENTE'",
      [calc.id],
    );
    if (pendientes) {
      throw new ErrorResultado("empates_pendientes", "Hay empates pendientes de resolución oficial antes de publicar.", 409);
    }

    await client.query(
      "UPDATE calculo_resultado SET estado = 'PUBLICADO', publicado_por = $2 WHERE id = $1",
      [calc.id, actorId],
    );
    const snap = await hidratarSnapshot(client, calc.id);
    await client.query("COMMIT");
    return snap;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function obtenerResultadosEdicion(pool, { edicionId, calculoId }) {
  const edicionNorm = edicionId.toLowerCase();
  const edicion = await exigirEdicionCerrada(pool, edicionNorm, { paraLectura: true });

  const { rows: snapshots } = await pool.query(
    `SELECT id, numero, algoritmo, parametros, hash_entradas, estado, calculado_en, publicado_en
       FROM calculo_resultado
      WHERE edicion_id = $1
      ORDER BY numero DESC`,
    [edicionNorm],
  );

  let elegidoId = null;
  if (calculoId) {
    const solicitado = snapshots.find((s) => s.id === calculoId.toLowerCase());
    if (!solicitado) throw new ErrorResultado("calculo_inexistente", "El cálculo indicado no existe en esta edición.", 404);
    elegidoId = solicitado.id;
  } else {
    const publicado = snapshots.find((s) => s.estado === "PUBLICADO");
    elegidoId = publicado?.id ?? snapshots[0]?.id ?? null;
  }

  const activo = elegidoId ? await hidratarSnapshot(pool, elegidoId) : null;
  return {
    edicion: {
      id: edicion.id,
      nombre: edicion.nombre,
      anio: edicion.anio,
      estado: edicion.estado,
      cerradaEn: edicion.cerrada_en.toISOString(),
    },
    snapshots: snapshots.map((s) => ({
      id: s.id,
      numero: s.numero,
      algoritmo: s.algoritmo,
      parametros: s.parametros,
      hashEntradas: s.hash_entradas,
      estado: s.estado,
      calculadoEn: s.calculado_en.toISOString(),
      publicadoEn: s.publicado_en ? s.publicado_en.toISOString() : null,
    })),
    activo,
  };
}

export async function obtenerPuntajesDetalladosEdicion(pool, { edicionId }) {
  const edicionNorm = edicionId.toLowerCase();
  const edicion = await exigirEdicionCerrada(pool, edicionNorm, { paraLectura: true });

  const { rows } = await pool.query(
    `SELECT n.id AS noche_id, n.orden AS noche_orden, n.nombre AS noche_nombre,
            e.id AS especialidad_id, e.codigo AS especialidad_codigo, e.nombre AS especialidad_nombre,
            u.id AS autor_id, u.nombre AS autor_nombre,
            c.id AS comparsa_id, c.nombre AS comparsa_nombre,
            s.id AS sujeto_id, COALESCE(s.nombre, pa.nombre_completo) AS sujeto_nombre,
            rv.id AS rubro_id, rv.codigo AS rubro_codigo, rv.nombre AS rubro_nombre,
            pu.valor, pu.no_presentado, pr.id AS planilla_id, pr.recibida_en
       FROM noche n
       JOIN instantanea_planillas_esperadas i ON i.noche_id = n.id
       JOIN instantanea_planilla_esperada_detalle d ON d.instantanea_id = i.id
       LEFT JOIN suplentes_asignacion_jurado sup ON sup.detalle_esperado_id = d.id
       JOIN planilla_recibida pr
         ON pr.asignacion_id = COALESCE(sup.asignacion_activa_id, d.asignacion_id)
        AND pr.version_id = i.version_id
       JOIN asignacion_jurado a ON a.id = pr.asignacion_id
       JOIN especialidad e ON e.id = a.especialidad_id
       JOIN puntaje_recibido pu ON pu.planilla_id = pr.id
       JOIN usuario u ON u.id = pu.autor_id
       JOIN fila_planilla f ON f.id = pu.fila_id
       JOIN rubro_version rv ON rv.id = f.rubro_version_id
       JOIN sujeto_evaluable s ON s.id = f.sujeto_id
       LEFT JOIN participante pa ON pa.id = s.participante_id
       JOIN comparsa c ON c.id = s.comparsa_id
      WHERE n.edicion_id = $1 AND n.tipo = 'COMPETENCIA' AND n.cuenta_para_puntaje = true AND n.estado = 'CLOSED'
      ORDER BY n.orden, e.orden, c.nombre, rv.orden, s.id`,
    [edicionNorm],
  );

  return {
    edicion: {
      id: edicion.id,
      nombre: edicion.nombre,
      anio: edicion.anio,
      estado: edicion.estado,
      cerradaEn: edicion.cerrada_en.toISOString(),
    },
    items: rows.map((r) => ({
      noche: { id: r.noche_id, orden: r.noche_orden, nombre: r.noche_nombre },
      especialidad: { id: r.especialidad_id, codigo: r.especialidad_codigo, nombre: r.especialidad_nombre },
      autor: { id: r.autor_id, nombre: r.autor_nombre },
      comparsa: { id: r.comparsa_id, nombre: r.comparsa_nombre },
      sujeto: { id: r.sujeto_id, nombre: r.sujeto_nombre },
      rubro: { id: r.rubro_id, codigo: r.rubro_codigo, nombre: r.rubro_nombre },
      valor: r.valor,
      noPresentado: r.no_presentado,
      planillaId: r.planilla_id,
      recibidaEn: r.recibida_en.toISOString(),
    })),
  };
}
