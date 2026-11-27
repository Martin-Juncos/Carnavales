export function ordenarFilasPorParticipante(filas) {
  const grupos = new Map();

  for (const fila of filas) {
    const idParticipante = fila.sujeto.id;
    if (!grupos.has(idParticipante)) grupos.set(idParticipante, []);
    grupos.get(idParticipante).push(fila);
  }

  return [...grupos.values()].flat();
}
