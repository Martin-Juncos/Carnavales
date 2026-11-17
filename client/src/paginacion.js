// Cantidad de páginas para un total de elementos. Siempre hay al menos una página, aunque esté vacía.
export function paginasTotales(total, limite) {
  return Math.max(1, Math.ceil(total / limite));
}
