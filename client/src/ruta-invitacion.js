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
