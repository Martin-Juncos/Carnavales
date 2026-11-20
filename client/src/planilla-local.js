export const notas = [1, 2, 3, 4, 5];

function puntajeValido(valor) {
  return valor === 0 || notas.includes(valor);
}

export function planillaCompleta(filas, requeridas, puntajes) {
  return filas.length > 0 && [...requeridas].every((id) => puntajeValido(puntajes[id]));
}

export const borradorVacio = { estado: "borrador", puntajes: {} };

function borradorVerificable(actual, versionId) {
  return Boolean(versionId) && actual.estado === "borrador"
    && (actual.versionId === versionId || actual === borradorVacio);
}

export function sePuedeVincularBorrador(borrador, requeridas) {
  return borrador.estado === "borrador" && !borrador.versionId
    && Object.entries(borrador.puntajes).every(([id, valor]) => requeridas.has(id) && puntajeValido(valor));
}

export function vincularBorrador(actual, versionId, requeridas, revisado) {
  if (!actual || !versionId || !sePuedeVincularBorrador(actual, requeridas)) return actual;
  const entradas = Object.entries(actual.puntajes);
  if (entradas.length !== Object.keys(revisado).length || entradas.some(([id, valor]) => revisado[id] !== valor)) {
    return actual;
  }
  return { ...actual, versionId };
}

export function puntuar(actual = borradorVacio, versionId, requeridas, id, valor) {
  if (!borradorVerificable(actual, versionId) || !requeridas.has(id) || !puntajeValido(valor)) return actual;
  return { estado: "borrador", versionId, puntajes: { ...actual.puntajes, [id]: valor } };
}

export function confirmar(actual = borradorVacio, versionId, filas, requeridas, revisados) {
  if (!borradorVerificable(actual, versionId) || !planillaCompleta(filas, requeridas, actual.puntajes)) return actual;
  if ([...requeridas].some((id) => actual.puntajes[id] !== revisados[id])) return actual;
  const puntajes = Object.fromEntries([...requeridas].map((id) => [id, actual.puntajes[id]]));
  return { estado: "pendiente", versionId, puntajes, operationId: crypto.randomUUID() };
}

export function guardarRespuestaRecepcion(actual, operationId, respuesta) {
  if (actual?.estado !== "pendiente" || actual.operationId !== operationId) return actual;
  return respuesta ? { estado: "recibida", versionId: actual.versionId, operationId,
    recibidaEn: respuesta.recibidaEn } : { ...actual, conflicto: true };
}

function abrirBase() {
  return new Promise((resolve, reject) => {
    const solicitud = indexedDB.open("carnavales-planillas", 1);
    solicitud.onupgradeneeded = () => solicitud.result.createObjectStore("planillas");
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

// La lectura y la escritura comparten una transacción: una pestaña atrasada
// no puede sobrescribir la confirmación de otra. La UI espera el commit.
export async function guardarPlanillaLocal(clave, actualizar) {
  const base = await abrirBase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = base.transaction("planillas", "readwrite", { durability: "strict" });
      const almacen = tx.objectStore("planillas");
      const lectura = almacen.get(clave);
      let siguiente;
      let fallo;
      tx.oncomplete = () => resolve(siguiente);
      tx.onabort = () => reject(fallo ?? tx.error ?? new Error("Transacción cancelada"));
      lectura.onsuccess = () => {
        try {
          siguiente = actualizar(lectura.result);
          if (siguiente !== lectura.result) almacen.put(siguiente, clave);
        } catch (error) {
          fallo = error;
          tx.abort();
        }
      };
    });
  } finally {
    base.close();
  }
}
