// Motor puro GOYA_2026_V1: no conoce HTTP, PostgreSQL ni snapshots.

function round2(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
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

