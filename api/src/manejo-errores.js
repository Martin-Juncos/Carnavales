import { ErrorAsignacion } from "./asignaciones.js";
import { ErrorEdicion } from "./ediciones.js";
import { ErrorInvitacion } from "./invitaciones.js";
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
  planilla_abierta_para_editar: 409,
  dispositivo_no_autorizado: 409,
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

const clasesDeDominio = [ErrorAsignacion, ErrorEdicion, ErrorInvitacion, ErrorRol, ErrorUsuario];

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
    response.status(estadosDeError[error.codigo] ?? 400).json({ error: error.codigo, mensaje: error.message });
    return;
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
