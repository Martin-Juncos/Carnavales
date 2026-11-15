// Rol con el que la persona decide entrar. Vive en sessionStorage: se pierde al cerrar la sesión
// o la pestaña, y nunca se guarda en la base. La API autoriza siempre con los roles reales.
const claveRolActivo = "rolActivo";

// Decide el rol activo a partir de los roles reales y de la elección guardada.
// Devuelve null si hay que elegir (varios roles y ninguna elección válida) o si no hay roles.
export function elegirRolInicial({ roles, guardado }) {
  if (roles.length === 0) return null;
  if (guardado && roles.includes(guardado)) return guardado;
  if (roles.length === 1) return roles[0];
  return null;
}

// Solo tiene sentido cambiar de rol si hay más de uno asignado.
export function puedeCambiarRol(roles) {
  return roles.length > 1;
}

// Lectura y escritura del rol guardado. Si el almacenamiento no está disponible, se trabaja sin guardar.
export function leerRolGuardado(almacenamiento = globalThis.sessionStorage) {
  try {
    return almacenamiento.getItem(claveRolActivo);
  } catch {
    return null;
  }
}

export function guardarRol(rol, almacenamiento = globalThis.sessionStorage) {
  try {
    almacenamiento.setItem(claveRolActivo, rol);
  } catch {
    // Sin almacenamiento, la elección dura solo mientras la pantalla esté abierta.
  }
}

export function borrarRolGuardado(almacenamiento = globalThis.sessionStorage) {
  try {
    almacenamiento.removeItem(claveRolActivo);
  } catch {
    // Nada que borrar si el almacenamiento no está disponible.
  }
}
