// Escapa los comodines de LIKE para que % y _ se busquen como texto literal.
// Las consultas deben usar ESCAPE '\\'.
export function escaparLike(texto) {
  // Antepone una barra invertida a cada \, % y _ del texto.
  return texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
}
