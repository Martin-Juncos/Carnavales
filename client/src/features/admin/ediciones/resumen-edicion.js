/*
 * Pasos de configuración de una edición y su progreso. Las mismas reglas alimentan la tarjeta
 * de cada evento en el panel y la lista de etapas de "Administrar evento", para que ambos
 * muestren lo mismo. Si falta algún dato, no se inventa un progreso: se devuelve null.
 */

export const PASOS_EDICION = [
  {
    id: "jornadas",
    numero: 1,
    etiqueta: "Noches y especialidades",
    descripcion: "Definí las noches de la votación y las especialidades que se puntúan.",
  },
  {
    id: "evaluacion",
    numero: 2,
    etiqueta: "Reglamento y puntajes",
    descripcion: "Cargá los rubros de la planilla y sus escalas de puntaje.",
  },
  {
    id: "comparsas",
    numero: 3,
    etiqueta: "Comparsas y orden de salida",
    descripcion: "Cargá las comparsas, sus figuras y el orden de salida de cada noche.",
  },
  {
    id: "habilitacion",
    numero: 4,
    etiqueta: "Planilla y apertura",
    descripcion: "Generá las planillas y abrí la votación cuando todo esté listo.",
  },
];

export const ETIQUETA_ESTADO_PASO = {
  completo: "Completo",
  en_curso: "En curso",
  pendiente: "Pendiente",
  bloqueado: "Bloqueado",
};

const ULTIMO_PASO = PASOS_EDICION.length - 1;

// Un paso se cumple cuando: hay noches y especialidades; el reglamento está publicado;
// hay comparsas; y la edición está abierta (o cerrada). La apertura queda bloqueada
// mientras los pasos 1 a 3 no estén cumplidos.
export function estadosDePasos({ estado, noches, especialidades, comparsas, reglamentoPublicado }) {
  const conteosConocidos = [noches, especialidades, comparsas].every((n) => typeof n === "number");
  if (!conteosConocidos || typeof reglamentoPublicado !== "boolean") return null;

  const abierta = estado === "OPEN" || estado === "CLOSED";
  const cumplidos = [
    noches > 0 && especialidades > 0,
    reglamentoPublicado,
    comparsas > 0,
    abierta,
  ];
  const primerIncompleto = cumplidos.indexOf(false);
  const previosCumplidos = cumplidos.slice(0, ULTIMO_PASO).every(Boolean);

  return PASOS_EDICION.map((paso, indice) => {
    let estado;
    if (cumplidos[indice]) estado = "completo";
    else if (indice === ULTIMO_PASO && !previosCumplidos) estado = "bloqueado";
    else if (indice === primerIncompleto) estado = "en_curso";
    else estado = "pendiente";
    return { ...paso, estado };
  });
}

export function progresoDeEdicion(pasos) {
  return {
    completos: pasos.filter((paso) => paso.estado === "completo").length,
    total: pasos.length,
  };
}

// Cuenta los elementos de un listado de la API. Si la llamada falla o la función no existe,
// devuelve null para que la interfaz no muestre un dato falso.
async function contarItems(llamada) {
  try {
    const resultado = await llamada();
    return resultado?.ok && Array.isArray(resultado.cuerpo?.items) ? resultado.cuerpo.items.length : null;
  } catch {
    return null;
  }
}

export async function cargarResumenEdicion(api, edicionId, signal) {
  const [noches, especialidades, comparsas] = await Promise.all([
    contarItems(() => api.listarNochesEdicion?.(edicionId, signal)),
    contarItems(() => api.listarEspecialidadesEdicion?.(edicionId, signal)),
    contarItems(() => api.listarComparsas?.(edicionId, signal)),
  ]);
  return { noches, especialidades, comparsas };
}
