// Valida el formato UUID de los parámetros de ruta antes de consultar la base.
// Un identificador mal formado responde 404 con el código del recurso, no un error interno.

const patronUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// `mapa` asocia cada parámetro con el código de error de su recurso.
export function validarIdentificadores(router, mapa) {
  for (const [parametro, codigo] of Object.entries(mapa)) {
    router.param(parametro, (request, response, next, valor) => {
      if (patronUuid.test(valor)) {
        next();
        return;
      }
      response.status(404).json({ error: codigo, mensaje: "El recurso no existe." });
    });
  }
}

export const codigosDeIdentificador = {
  edicionId: "edicion_inexistente",
  versionId: "version_inexistente",
  rubroId: "rubro_inexistente",
  requisitoId: "requisito_inexistente",
  premioId: "premio_inexistente",
  nocheId: "noche_inexistente",
  comparsaId: "comparsa_inexistente",
  participanteId: "participante_inexistente",
  sujetoId: "sujeto_inexistente",
  especialidadId: "especialidad_inexistente",
  filaId: "fila_inexistente",
  penalizacionId: "penalizacion_inexistente",
  calculoId: "calculo_inexistente",
  actaId: "acta_inexistente",
  empateId: "empate_inexistente",
  elementoId: "recurso_inexistente",
};
