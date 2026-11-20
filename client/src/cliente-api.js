// Cliente HTTP de la API de autenticación. Usa fetch inyectable para poder probarlo sin red.
// Las cookies de sesión viajan solas porque el cliente y la API comparten origen.

// Lee el cuerpo como JSON; si la respuesta no es JSON (por ejemplo, una página de error), devuelve null.
async function leerJson(respuesta) {
  try {
    return await respuesta.json();
  } catch {
    return null;
  }
}

// Crea un cliente con las operaciones de acceso. Cada método devuelve { ok, status, cuerpo }.
export function crearClienteApi(fetchImpl = globalThis.fetch) {
  // Envía una petición JSON (POST por defecto) y normaliza la respuesta.
  async function llamar(ruta, { metodo = "POST", cuerpo, cache, signal } = {}) {
    const opciones = { method: metodo, credentials: "same-origin", headers: {} };
    if (cache) opciones.cache = cache;
    if (signal) opciones.signal = signal;
    if (cuerpo !== undefined) {
      opciones.headers["content-type"] = "application/json";
      opciones.body = JSON.stringify(cuerpo);
    }
    const respuesta = await fetchImpl(ruta, opciones);
    return { ok: respuesta.ok, status: respuesta.status, cuerpo: await leerJson(respuesta) };
  }

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
    eliminarEdicion: (id) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}`, {
        metodo: "DELETE", cuerpo: { confirmar: true },
      }),
    listarNochesEdicion: (id, signal) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}/noches`, { metodo: "GET", cache: "no-store", signal }),
    crearNocheEdicion: (id, cuerpo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}/noches`, { cuerpo }),
    listarEspecialidadesEdicion: (id, signal) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}/especialidades`, { metodo: "GET", cache: "no-store", signal }),
    crearEspecialidadEdicion: (id, cuerpo) =>
      llamar(`/api/admin/ediciones/${encodeURIComponent(id)}/especialidades`, { cuerpo }),
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
