import { ErrorAsignacion } from "./asignaciones.js";
import { ErrorEdicion } from "./ediciones.js";
import { ErrorInvitacion } from "./invitaciones.js";
import { ErrorPenalizacion } from "./penalizaciones.js";
import { ErrorResultado } from "./resultados.js";
import { ErrorRol } from "./roles.js";
import { ErrorUsuario } from "./usuarios.js";

// Un único lugar para traducir los códigos de dominio a estados HTTP. Antes cada
// router tenía su propia tabla, con el riesgo de que el mismo código respondiera
// distinto según la ruta.
const estadosDeError = {
  // Asignaciones
  campos_invalidos: 400,
  jurado_invalido: 400,
  noche_inexistente: 400,
  especialidad_invalida: 400,
  noche_abierta: 409,
  asignacion_duplicada: 409,
  suplentes_ya_registrados: 409,
  asignacion_con_suplentes: 409,
  reemplazo_requiere_suplencia: 409,
  planilla_abierta_para_editar: 409,
  dispositivo_no_autorizado: 409,
  borrador_traspaso_congelado: 409,
  acuse_traspaso_invalido: 409,
  asignacion_no_encontrada: 404,
  asignacion_no_activa: 409,
  especialidad_sin_planilla: 409,
  planilla_ya_recibida: 409,
  operacion_conflictiva: 409,
  planilla_no_receptiva: 409,
  version_no_coincide: 409,
  puntajes_invalidos: 422,
  // Ediciones
  nombre_invalido: 400,
  anio_invalido: 400,
  anio_existente: 409,
  edicion_inexistente: 404,
  edicion_no_borrable: 409,
  edicion_en_votacion: 409,
  edicion_con_dependencias: 409,
  eliminacion_edicion_no_configurada: 503,
  edicion_retirada: 409,
  edicion_cerrada: 409,
  // Penalizaciones
  confirmacion_requerida: 400,
  penalizacion_invalida: 422,
  penalizacion_inexistente: 404,
  comparsa_inexistente: 404,
  edicion_no_abierta: 409,
  noche_no_penalizable: 409,
  comparsa_no_programada_en_noche: 409,
  rubro_penalizacion_invalido: 409,
  penalizacion_ya_anulada: 409,
  // Resultados y publicación
  edicion_no_cerrada: 409,
  calculo_inexistente: 404,
  empate_inexistente: 404,
  empates_pendientes: 409,
  empate_ya_resuelto: 409,
  resultado_ya_publicado: 409,
  candidato_empate_invalido: 422,
  sin_datos_calculo: 409,
  // Invitaciones (administración y aceptación pública)
  cuenta_existente: 409,
  pendiente_existente: 409,
  no_reenviable: 409,
  no_revocable: 409,
  no_encontrada: 404,
  rol_invalido: 400,
  correo_invalido: 400,
  invitacion_invalida: 400,
  datos_invalidos: 422,
  // Roles y usuarios (parametros_invalidos también lo usa el listado de usuarios)
  parametros_invalidos: 400,
  usuario_no_encontrado: 404,
  no_asignado: 404,
  rol_ya_asignado: 409,
  rol_protegido: 409,
  usuario_protegido: 409,
  usuario_con_historial: 409,
};

const clasesDeDominio = [ErrorAsignacion, ErrorEdicion, ErrorInvitacion, ErrorPenalizacion, ErrorResultado, ErrorRol, ErrorUsuario];

// Errores esperables de Express, como los del parser de JSON, que antes
// respondían HTML con detalles internos.
const respuestasPorTipo = {
  "entity.parse.failed": {
    status: 400,
    error: "campos_invalidos",
    mensaje: "El cuerpo debe ser un JSON válido.",
  },
  "entity.too.large": {
    status: 413,
    error: "cuerpo_demasiado_grande",
    mensaje: "El cuerpo de la petición es demasiado grande.",
  },
};

function esErrorDeDominio(error) {
  return clasesDeDominio.some((Clase) => error instanceof Clase);
}

// Middleware de error: responde siempre JSON controlado. Se monta al final de
// createApp y al final de cada router para que ambos funcionen por separado.
export function manejarErrores(error, request, response, next) {
  // Si ya se enviaron cabeceras no se puede responder de nuevo; Express debe
  // cerrar la conexión con su manejador por defecto.
  if (response.headersSent) {
    next(error);
    return;
  }

  if (esErrorDeDominio(error)) {
    response.status(error.status ?? estadosDeError[error.codigo] ?? 400).json({ error: error.codigo, mensaje: error.message });
    return;
  }

  if (error?.code === "23514") {
    if (error.message === "EDICION_RETIRADA") {
      return response.status(409).json({ error: "edicion_retirada", mensaje: "La edición retirada es de solo lectura." });
    }
    if (error.message === "EDICION_CERRADA") {
      return response.status(409).json({
        error: "edicion_cerrada",
        mensaje: "La edición ya cerró su votación y no admite cambios operativos.",
      });
    }
    if (error.message === "EDICION_EN_VOTACION") {
      return response.status(409).json({ error: "edicion_en_votacion", mensaje: "Hay una jornada competitiva en votación." });
    }
    if (error.message === "RETIRO_REQUIERE_ADMINISTRADOR"
      || error.message === "PENALIZACION_REQUIERE_ESCRIBANO"
      || error.message === "RESULTADO_REQUIERE_ESCRIBANO") {
      return response.status(403).json({ error: "sin_permiso" });
    }
  }

  const respuesta = respuestasPorTipo[error?.type];
  if (respuesta) {
    response.status(respuesta.status).json({ error: respuesta.error, mensaje: respuesta.mensaje });
    return;
  }

  // No se registra el mensaje: los errores de PostgreSQL pueden incluir SQL o
  // datos personales. Tampoco la ruta: podría contener un token. El método es
  // la única información de la petición que nunca es una credencial.
  console.error(`[error] ${request.method}: fallo no manejado`);
  response.status(500).json({ error: "error_interno", mensaje: "No se pudo completar la operación." });
}
