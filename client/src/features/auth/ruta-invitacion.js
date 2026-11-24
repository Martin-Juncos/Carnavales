// Ruta del enlace de invitación. Coincide con la que arma la API al crear el enlace.
const rutaAceptarInvitacion = "/aceptar-invitacion";

// Indica si la ruta actual es la de aceptar invitación (ignora la barra final).
export function esRutaAceptarInvitacion(pathname) {
  return pathname.replace(/\/$/, "") === rutaAceptarInvitacion;
}

// Lee el token de la query (?token=...). Devuelve null si falta o está vacío.
export function tokenDeBusqueda(search) {
  const token = new URLSearchParams(search).get("token");
  return token ? token : null;
}

// Quita el token de la barra del navegador una vez usado, sin recargar la página.
// Si el token se deja en la URL, queda en el historial y en capturas o copias de la pantalla.
export function limpiarTokenDeLaUrl(historial = globalThis.history, ubicacion = globalThis.location) {
  if (!tokenDeBusqueda(ubicacion.search)) return;
  historial.replaceState(null, "", ubicacion.pathname);
}

// Ruta del enlace de recuperación de contraseña (coincide con APP_URL + /restablecer-contrasena).
const rutaRestablecerContrasena = "/restablecer-contrasena";

export function esRutaRestablecerContrasena(pathname) {
  return pathname.replace(/\/$/, "") === rutaRestablecerContrasena;
}

// Deja la barra en el inicio, sin recargar la página. Se usa al terminar una pantalla de
// invitación o de recuperación, para que el acceso no quede bajo una URL de un solo uso.
export function volverAlInicio(historial = globalThis.history) {
  historial.replaceState(null, "", "/");
}
