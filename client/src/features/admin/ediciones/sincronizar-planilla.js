// Orquesta la preparación automática de planillas contra la API existente:
// 1) Asegura la escala 1–5 en borrador.
// 2) Crea los sujetos no-PERSONA faltantes por comparsa activa según los rubros configurados.
// 3) Genera las filas nominativas de la planilla base.
// 4) Guarda automáticamente las selecciones de planilla por jornada DRAFT y especialidad activa
//    que todavía no tenían selección configurada.

export async function sincronizarPlanillaEdicion({
  edicionId,
  versionActiva,
  noches = [],
  especialidades = [],
  api,
  planillas,
}) {
  const versionId = versionActiva?.id;
  if (!versionId) {
    return { ok: false, mensaje: "La edición no tiene una versión de reglamento disponible." };
  }

  const esBorrador = versionActiva.estado === "BORRADOR";
  let sujetosCreados = 0;
  let seleccionesGuardadas = 0;

  try {
    // 1. Escala 1–5 automática en borrador
    if (esBorrador && typeof api.obtenerEscala === "function" && typeof api.guardarEscala === "function") {
      const resEscala = await api.obtenerEscala(edicionId, versionId);
      if (resEscala.ok && !resEscala.cuerpo?.minimo) {
        const resGuardar = await api.guardarEscala(edicionId, versionId, 1, 5);
        if (!resGuardar.ok) {
          return { ok: false, mensaje: resGuardar.cuerpo?.mensaje ?? "No se pudo configurar la escala 1–5." };
        }
      }
    }

    // 2. Sujetos automáticos (no-PERSONA) por comparsa activa
    if (
      typeof api.listarRubros === "function"
      && typeof api.listarComparsas === "function"
      && typeof api.listarSujetosComparsa === "function"
      && typeof api.crearSujetoComparsa === "function"
    ) {
      const [resRubros, resComparsas] = await Promise.all([
        api.listarRubros(edicionId, versionId),
        api.listarComparsas(edicionId),
      ]);
      if (resRubros.ok && resComparsas.ok) {
        const tiposRequeridos = [
          ...new Set(
            (resRubros.cuerpo.items ?? [])
              .map((r) => r.tipoSujeto)
              .filter((tipo) => tipo && tipo !== "PERSONA"),
          ),
        ];
        const comparsasActivas = (resComparsas.cuerpo.items ?? []).filter((c) => c.activa !== false);
        for (const comparsa of comparsasActivas) {
          if (tiposRequeridos.length === 0) break;
          const resSujetos = await api.listarSujetosComparsa(edicionId, comparsa.id);
          if (!resSujetos.ok) continue;
          const existentes = new Set((resSujetos.cuerpo.items ?? []).map((s) => s.tipoSujeto));
          for (const tipoSujeto of tiposRequeridos) {
            if (!existentes.has(tipoSujeto)) {
              const resCrear = await api.crearSujetoComparsa(edicionId, comparsa.id, {
                tipoSujeto,
                nombre: comparsa.nombre,
              });
              if (resCrear.ok) sujetosCreados += 1;
            }
          }
        }
      }
    }

    // 3. Generación de filas nominativas en la planilla base
    if (esBorrador && typeof api.generarPlanillaVersion === "function") {
      const resGen = await api.generarPlanillaVersion(edicionId, versionId);
      if (!resGen.ok) {
        return { ok: false, mensaje: resGen.cuerpo?.mensaje ?? "No se pudieron generar las filas de planilla." };
      }
    }

    // 4. Sincronización automática de planillas por noche DRAFT y especialidad activa
    let nochesEfectivas = noches;
    let especialidadesEfectivas = especialidades;
    if (nochesEfectivas.length === 0 && typeof api.listarNochesEdicion === "function") {
      const resNoches = await api.listarNochesEdicion(edicionId);
      if (resNoches.ok) nochesEfectivas = resNoches.cuerpo?.items ?? [];
    }
    if (especialidadesEfectivas.length === 0 && typeof api.listarEspecialidadesEdicion === "function") {
      const resEsp = await api.listarEspecialidadesEdicion(edicionId);
      if (resEsp.ok) especialidadesEfectivas = resEsp.cuerpo?.items ?? [];
    }
    const nochesDraft = nochesEfectivas.filter((n) => n.tipo === "COMPETENCIA" && n.estado === "DRAFT");
    const espActivas = especialidadesEfectivas.filter((e) => e.activa !== false);

    if (
      planillas
      && typeof planillas.obtenerSeleccion === "function"
      && typeof planillas.listarCandidatas === "function"
      && typeof planillas.guardarSeleccion === "function"
    ) {
      for (const noche of nochesDraft) {
        for (const esp of espActivas) {
          const resSel = await planillas.obtenerSeleccion(edicionId, versionId, noche.id, esp.id);
          if (!resSel.ok || resSel.cuerpo?.configurada) continue;
          const resCand = await planillas.listarCandidatas(edicionId, versionId, noche.id, esp.id);
          if (!resCand.ok) continue;
          const ids = (resCand.cuerpo?.items ?? []).map((f) => f.id);
          if (ids.length === 0) continue;
          const resGuardado = await planillas.guardarSeleccion(edicionId, versionId, noche.id, esp.id, ids);
          if (resGuardado.ok) seleccionesGuardadas += 1;
        }
      }
    }

    return {
      ok: true,
      sujetosCreados,
      seleccionesGuardadas,
      jornadasSincronizadas: nochesDraft.length,
    };
  } catch {
    return { ok: false, mensaje: "No se pudieron sincronizar las planillas. Revisá la conexión." };
  }
}
