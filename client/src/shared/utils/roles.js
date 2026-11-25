// Catálogo de roles que ofrece el formulario. Debe coincidir con el seed de la migración 0003.
export const roles = [
  { codigo: "ADMINISTRADOR", etiqueta: "Administrador" },
  { codigo: "JURADO", etiqueta: "Jurado" },
  { codigo: "ESCRIBANO", etiqueta: "Escribano" },
  { codigo: "COMISARIO", etiqueta: "Comisario" },
];

// Etiqueta legible de un código de rol; si no se conoce, muestra el código tal cual.
export function etiquetaDeRol(codigo) {
  return roles.find((rol) => rol.codigo === codigo)?.etiqueta ?? codigo;
}

// Roles que la persona todavía no tiene y se pueden asignar. `asignados` son los códigos actuales.
export function rolesDisponibles(asignados) {
  return roles.filter((rol) => !asignados.includes(rol.codigo));
}
