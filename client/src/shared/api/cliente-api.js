// Cliente HTTP de la API de autenticación. Usa fetch inyectable para poder probarlo sin red.
// Las cookies de sesión viajan solas porque el cliente y la API comparten origen.

import { crearLlamador } from "./http.js";

// Crea un cliente con las operaciones de acceso. Cada método devuelve { ok, status, cuerpo }.
export function crearClienteApi(fetchImpl = globalThis.fetch) {
  // Envía una petición JSON (POST por defecto) y normaliza la respuesta.
  const llamar = crearLlamador(fetchImpl, { metodoPorDefecto: "POST" });

  return {
    // Paso 1: correo y contraseña. Si la contraseña es correcta, la API pide el segundo factor.
    iniciarSesion: (email, password) => llamar("/api/auth/sign-in/email", { cuerpo: { email, password } }),
    // Envía (o reenvía) el código OTP al correo de la cuenta.
    pedirCodigo: () => llamar("/api/auth/two-factor/send-otp", { cuerpo: {} }),
    // Paso 2: verifica el código. Si es correcto, la API deja la cookie de sesión.
    verificarCodigo: (code) => llamar("/api/auth/two-factor/verify-otp", { cuerpo: { code } }),
    // Datos de la sesión actual (GET). Sin sesión, la API responde sin usuario.
    obtenerSesion: () => llamar("/api/auth/get-session", { metodo: "GET" }),
    // Acepta una invitación (ruta pública): crea la cuenta con el token del enlace.
    aceptarInvitacion: (token, nombre, contrasena) =>
      llamar("/api/invitaciones/aceptar", { cuerpo: { token, nombre, contrasena } }),
    // Listado administrativo de ediciones (GET), de la más reciente a la más antigua.
    listarEdiciones: () => llamar("/api/admin/ediciones", { metodo: "GET" }),
    // Crea una edición vacía con nombre y año. La API responde conflicto si el año ya existe.
    crearEdicion: (nombre, anio) => llamar("/api/admin/ediciones", { cuerpo: { nombre, anio } }),
    retirarEdicion: (id) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}/retiro`, {
        cuerpo: { confirmar: true },
      }),
    abrirEdicion: (id, claveOperacion) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}/apertura`, {
        cuerpo: { claveOperacion },
      }),
    eliminarEdicion: (id) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}`, {
        metodo: "DELETE", cuerpo: { confirmar: true },
      }),
    listarVersionesEdicion: (id, signal) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}/versiones`, { metodo: "GET", cache: "no-store", signal }),
    listarNochesEdicion: (id, signal) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}/noches`, { metodo: "GET", cache: "no-store", signal }),
    crearNocheEdicion: (id, cuerpo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}/noches`, { cuerpo }),
    actualizarNocheEdicion: (id, nocheId, cuerpo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}/noches/${encodeURIComponent(nocheId)}`, {
        metodo: "PATCH", cuerpo,
      }),
    eliminarNocheEdicion: (id, nocheId) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}/noches/${encodeURIComponent(nocheId)}`, {
        metodo: "DELETE",
      }),
    abrirNoche: (id, nocheId, claveOperacion) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}/noches/${encodeURIComponent(nocheId)}/apertura`, {
        cuerpo: { claveOperacion },
      }),
    listarEspecialidadesEdicion: (id, signal) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}/especialidades`, { metodo: "GET", cache: "no-store", signal }),
    crearEspecialidadEdicion: (id, cuerpo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}/especialidades`, { cuerpo }),
    actualizarEspecialidadEdicion: (id, especialidadId, cuerpo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}/especialidades/${encodeURIComponent(especialidadId)}`, {
        metodo: "PATCH", cuerpo,
      }),
    eliminarEspecialidadEdicion: (id, especialidadId) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}/especialidades/${encodeURIComponent(especialidadId)}`, {
        metodo: "DELETE",
      }),
    // Reglamento en borrador
    listarCategoriasRubro: (edicionId, versionId, signal) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/categorias`, {
        metodo: "GET", cache: "no-store", signal,
      }),
    crearCategoriaRubro: (edicionId, versionId, cuerpo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/categorias`, {
        cuerpo,
      }),
    eliminarCategoriaRubro: (edicionId, versionId, categoriaId) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/categorias/${encodeURIComponent(categoriaId)}`, {
        metodo: "DELETE",
      }),
    listarRubros: (edicionId, versionId, signal) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/rubros`, {
        metodo: "GET", cache: "no-store", signal,
      }),
    crearRubro: (edicionId, versionId, cuerpo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/rubros`, {
        cuerpo,
      }),
    actualizarRubro: (edicionId, versionId, rubroId, cuerpo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/rubros/${encodeURIComponent(rubroId)}`, {
        metodo: "PATCH", cuerpo,
      }),
    eliminarRubro: (edicionId, versionId, rubroId) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/rubros/${encodeURIComponent(rubroId)}`, {
        metodo: "DELETE",
      }),
    reordenarRubros: (edicionId, versionId, items) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/rubros/orden`, {
        metodo: "PUT", cuerpo: { items },
      }),
    asignarEspecialidadesRubro: (edicionId, versionId, rubroId, especialidadIds) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/rubros/${encodeURIComponent(rubroId)}/especialidades`, {
        metodo: "PUT", cuerpo: { especialidadIds },
      }),
    obtenerEscala: (edicionId, versionId, signal) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/escala`, {
        metodo: "GET", cache: "no-store", signal,
      }),
    guardarEscala: (edicionId, versionId, minimo, maximo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/escala`, {
        metodo: "PUT", cuerpo: { minimo, maximo },
      }),
    // Padrón y orden de salida
    listarComparsas: (edicionId, signal) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/comparsas`, { metodo: "GET", cache: "no-store", signal }),
    crearComparsa: (edicionId, cuerpo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/comparsas`, { cuerpo }),
    actualizarComparsa: (edicionId, comparsaId, cuerpo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/comparsas/${encodeURIComponent(comparsaId)}`, {
        metodo: "PATCH", cuerpo,
      }),
    eliminarComparsa: (edicionId, comparsaId) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/comparsas/${encodeURIComponent(comparsaId)}`, {
        metodo: "DELETE",
      }),
    listarParticipantes: (edicionId, signal) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/participantes`, { metodo: "GET", cache: "no-store", signal }),
    crearParticipante: (edicionId, cuerpo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/participantes`, { cuerpo }),
    listarSujetosComparsa: (edicionId, comparsaId, signal) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/comparsas/${encodeURIComponent(comparsaId)}/sujetos`, {
        metodo: "GET", cache: "no-store", signal,
      }),
    crearSujetoComparsa: (edicionId, comparsaId, cuerpo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/comparsas/${encodeURIComponent(comparsaId)}/sujetos`, {
        cuerpo,
      }),
    actualizarSujeto: (edicionId, sujetoId, cuerpo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/sujetos/${encodeURIComponent(sujetoId)}`, {
        metodo: "PATCH", cuerpo,
      }),
    listarIntegrantesGrupo: (edicionId, sujetoId, signal) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/sujetos/${encodeURIComponent(sujetoId)}/integrantes`, {
        metodo: "GET", cache: "no-store", signal,
      }),
    agregarIntegranteGrupo: (edicionId, sujetoId, participanteId) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/sujetos/${encodeURIComponent(sujetoId)}/integrantes`, {
        cuerpo: { participanteId },
      }),
    quitarIntegranteGrupo: (edicionId, sujetoId, participanteId) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/sujetos/${encodeURIComponent(sujetoId)}/integrantes/${encodeURIComponent(participanteId)}`, {
        metodo: "DELETE",
      }),
    eliminarSujeto: (edicionId, sujetoId) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/sujetos/${encodeURIComponent(sujetoId)}`, {
        metodo: "DELETE",
      }),
    obtenerOrdenNoche: (edicionId, nocheId, signal) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/noches/${encodeURIComponent(nocheId)}/orden`, {
        metodo: "GET", cache: "no-store", signal,
      }),
    guardarOrdenNoche: (edicionId, nocheId, items) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/noches/${encodeURIComponent(nocheId)}/orden`, {
        metodo: "PUT", cuerpo: { items },
      }),
    // Planilla base, checklist, vista previa y publicación
    listarPlanillaVersion: (edicionId, versionId, signal) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/planilla`, {
        metodo: "GET", cache: "no-store", signal,
      }),
    generarPlanillaVersion: (edicionId, versionId) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/planilla/generar`, {
        cuerpo: {},
      }),
    nominarEnRubro: (edicionId, versionId, rubroId, cuerpo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/rubros/${encodeURIComponent(rubroId)}/nominaciones`, {
        cuerpo,
      }),
    actualizarFilaPlanilla: (edicionId, versionId, filaId, cuerpo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/planilla/${encodeURIComponent(filaId)}`, {
        metodo: "PATCH", cuerpo,
      }),
    eliminarFilaPlanilla: (edicionId, versionId, filaId) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/planilla/${encodeURIComponent(filaId)}`, {
        metodo: "DELETE",
      }),
    obtenerChecklistPublicacion: (edicionId, versionId, signal) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/checklist-publicacion`, {
        metodo: "GET", cache: "no-store", signal,
      }),
    obtenerVistaPreviaVersion: (edicionId, versionId, signal) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/vista-previa`, {
        metodo: "GET", cache: "no-store", signal,
      }),
    publicarVersion: (edicionId, versionId) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(edicionId)}/versiones/${encodeURIComponent(versionId)}/publicar`, {
        cuerpo: {},
      }),
    // Listado administrativo de usuarios (GET). La búsqueda se omite si está vacía.
    listarUsuarios: ({ pagina, limite, buscar }) => {
      const params = new URLSearchParams({ pagina: String(pagina), limite: String(limite) });
      if (buscar?.trim()) params.set("buscar", buscar.trim());
      return llamar(`/api/admin/usuarios?${params}`, { metodo: "GET" });
    },
    // Listado administrativo de invitaciones (GET), con filtros opcionales por estado y correo.
    listarInvitaciones: ({ pagina, limite, estado, correo }) => {
      const params = new URLSearchParams({ pagina: String(pagina), limite: String(limite) });
      if (estado) params.set("estado", estado);
      if (correo?.trim()) params.set("correo", correo.trim());
      return llamar(`/api/admin/invitaciones?${params}`, { metodo: "GET" });
    },
    // Crea una invitación con un rol inicial. La API envía el enlace por el canal configurado.
    crearInvitacion: (correo, rol) => llamar("/api/admin/invitaciones", { cuerpo: { correo, rol } }),
    // Reenvía una invitación pendiente o vencida (invalida el enlace anterior).
    reenviarInvitacion: (id) => llamar(`/api/admin/invitaciones/${encodeURIComponent(id)}/reenviar`, { cuerpo: {} }),
    // Revoca una invitación pendiente.
    revocarInvitacion: (id) => llamar(`/api/admin/invitaciones/${encodeURIComponent(id)}/revocar`, { cuerpo: {} }),
    // Asigna un rol a un usuario (de a uno).
    asignarRol: (usuarioId, codigo) =>
      llamar(`/api/admin/usuarios/${encodeURIComponent(usuarioId)}/roles/${encodeURIComponent(codigo)}`, { cuerpo: {} }),
    // Quita un rol a un usuario.
    retirarRol: (usuarioId, codigo) =>
      llamar(`/api/admin/usuarios/${encodeURIComponent(usuarioId)}/roles/${encodeURIComponent(codigo)}`, { metodo: "DELETE" }),
    // Elimina la cuenta de un usuario (y sus sesiones, segundo factor y asignaciones).
    eliminarUsuario: (usuarioId) =>
      llamar(`/api/admin/usuarios/${encodeURIComponent(usuarioId)}`, { metodo: "DELETE" }),
    // Catálogo y cobertura de asignaciones de jurado. Todas exigen ADMINISTRADOR;
    // la identidad del actor se deriva de la sesión, nunca de estos argumentos.
    listarAsignaciones: () => llamar("/api/admin/asignaciones", { metodo: "GET" }),
    listarJurados: () => llamar("/api/admin/jurados", { metodo: "GET" }),
    listarNoches: () => llamar("/api/admin/noches", { metodo: "GET" }),
    listarEspecialidades: () => llamar("/api/admin/especialidades", { metodo: "GET" }),
    crearAsignacion: (juradoId, nocheId, especialidadId) =>
      llamar("/api/admin/asignaciones", { cuerpo: { juradoId, nocheId, especialidadId } }),
    revocarAsignacion: (id) => llamar(`/api/admin/asignaciones/${encodeURIComponent(id)}`, { metodo: "DELETE" }),
    registrarSuplentes: (id, suplenteIds) =>
      llamar(`/api/admin/asignaciones/${encodeURIComponent(id)}/suplentes`, { cuerpo: { suplenteIds } }),
    activarSuplente: (id, juradoId) =>
      llamar(`/api/admin/asignaciones/${encodeURIComponent(id)}/activar-suplente`, { cuerpo: { juradoId } }),
    reemplazarAsignacion: (id, juradoId, especialidadId) =>
      llamar(`/api/admin/asignaciones/${encodeURIComponent(id)}`, {
        metodo: "PATCH",
        cuerpo: { juradoId, especialidadId },
      }),
    // Roles propios de la persona con sesión (GET). Sirven para el selector de rol.
    obtenerMisRoles: () => llamar("/api/mi-cuenta/roles", { metodo: "GET" }),
    listarContextosJurado: () => llamar("/api/jurado/contextos", { metodo: "GET", cache: "no-store" }),
    listarNochesEscribano: () => llamar("/api/escribano/noches", { metodo: "GET", cache: "no-store" }),
    consultarCierreNoche: (edicionId, nocheId) =>
      llamar(`/api/escribano/ediciones/${encodeURIComponent(edicionId)}/noches/${encodeURIComponent(nocheId)}/cierre`,
        { metodo: "GET", cache: "no-store" }),
    cerrarNoche: (edicionId, nocheId) =>
      llamar(`/api/escribano/ediciones/${encodeURIComponent(edicionId)}/noches/${encodeURIComponent(nocheId)}/cierre`,
        { cache: "no-store", cuerpo: { confirmar: true } }),
    listarEdicionesEscribano: () => llamar("/api/escribano/ediciones", { metodo: "GET", cache: "no-store" }),
    consultarCierreTotal: (edicionId) =>
      llamar(`/api/escribano/ediciones/${encodeURIComponent(edicionId)}/cierre`, { metodo: "GET", cache: "no-store" }),
    cerrarVotacionTotal: (edicionId) =>
      llamar(`/api/escribano/ediciones/${encodeURIComponent(edicionId)}/cierre`,
        { cache: "no-store", cuerpo: { confirmar: true } }),
    obtenerContextoPenalizaciones: (edicionId) =>
      llamar(`/api/escribano/ediciones/${encodeURIComponent(edicionId)}/penalizaciones/contexto`,
        { metodo: "GET", cache: "no-store" }),
    listarPenalizaciones: (edicionId) =>
      llamar(`/api/escribano/ediciones/${encodeURIComponent(edicionId)}/penalizaciones`,
        { metodo: "GET", cache: "no-store" }),
    registrarPenalizacion: (edicionId, cuerpo) =>
      llamar(`/api/escribano/ediciones/${encodeURIComponent(edicionId)}/penalizaciones`,
        { cache: "no-store", cuerpo: { ...cuerpo, confirmar: true } }),
    anularPenalizacion: (edicionId, penalizacionId, cuerpo) =>
      llamar(
        `/api/escribano/ediciones/${encodeURIComponent(edicionId)}/penalizaciones/${encodeURIComponent(penalizacionId)}/anular`,
        { cache: "no-store", cuerpo: { ...cuerpo, confirmar: true } },
      ),
    obtenerResultadosEdicion: (edicionId, calculoId) => {
      const qs = calculoId ? `?calculoId=${encodeURIComponent(calculoId)}` : "";
      return llamar(`/api/resultados/ediciones/${encodeURIComponent(edicionId)}${qs}`, { metodo: "GET", cache: "no-store" });
    },
    obtenerPuntajesDetallados: (edicionId) =>
      llamar(`/api/resultados/ediciones/${encodeURIComponent(edicionId)}/puntajes`, { metodo: "GET", cache: "no-store" }),
    calcularResultados: (edicionId, opciones = {}) =>
      llamar(`/api/escribano/ediciones/${encodeURIComponent(edicionId)}/resultados/calcular`,
        { cache: "no-store", cuerpo: { ...opciones, confirmar: true } }),
    resolverEmpate: (edicionId, calculoId, empateId, cuerpo) =>
      llamar(
        `/api/escribano/ediciones/${encodeURIComponent(edicionId)}/resultados/${encodeURIComponent(calculoId)}/empates/${encodeURIComponent(empateId)}/resolver`,
        { cache: "no-store", cuerpo: { ...cuerpo, confirmar: true } },
      ),
    publicarResultados: (edicionId, calculoId) =>
      llamar(
        `/api/escribano/ediciones/${encodeURIComponent(edicionId)}/resultados/${encodeURIComponent(calculoId)}/publicar`,
        { cache: "no-store", cuerpo: { confirmar: true } },
      ),
    obtenerPlanillaJurado: (id) =>
      llamar(`/api/jurado/planillas/${encodeURIComponent(id)}`, { metodo: "GET", cache: "no-store" }),
    abrirEdicionPlanillaJurado: (id, dispositivoId) =>
      llamar(`/api/jurado/planillas/${encodeURIComponent(id)}/abrir-edicion`, { cuerpo: { dispositivoId }, cache: "no-store" }),
    congelarBorradorTraspaso: (id, cuerpo) =>
      llamar(`/api/jurado/planillas/${encodeURIComponent(id)}/borrador-traspaso`, {
        cuerpo, cache: "no-store", signal: AbortSignal.timeout(6000),
      }),
    confirmarAcuseTraspaso: (id, cuerpo) =>
      llamar(`/api/jurado/planillas/${encodeURIComponent(id)}/confirmar-traspaso`, {
        cuerpo, cache: "no-store", signal: AbortSignal.timeout(6000),
      }),
    recibirPlanillaJurado: (cuerpo, signal) =>
      llamar("/api/jurado/planillas", { cuerpo, cache: "no-store", signal }),
    // Pide el enlace de recuperación. La respuesta es la misma exista o no el correo.
    pedirRecuperacion: (email, redirectTo) =>
      llamar("/api/auth/request-password-reset", { cuerpo: { email, redirectTo } }),
    // Cambia la contraseña con el token del enlace. Cierra las sesiones abiertas.
    restablecerContrasena: (token, newPassword) =>
      llamar("/api/auth/reset-password", { cuerpo: { token, newPassword } }),
    // Cierra la sesión actual.
    cerrarSesion: () => llamar("/api/auth/sign-out", { cuerpo: {} }),
  };
}
