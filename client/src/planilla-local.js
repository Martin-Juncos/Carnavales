export const notas = [1, 2, 3, 4, 5];

function puntajeValido(valor) {
  return valor === 0 || notas.includes(valor);
}

export function planillaCompleta(filas, requeridas, puntajes) {
  return filas.length > 0 && [...requeridas].every((id) => puntajeValido(puntajes[id]));
}

export const borradorVacio = { estado: "borrador", puntajes: {} };

export function puntuar(actual = borradorVacio, requeridas, id, valor) {
  if (actual.estado !== "borrador" || !requeridas.has(id) || !puntajeValido(valor)) return actual;
  return { estado: "borrador", puntajes: { ...actual.puntajes, [id]: valor } };
}

export function confirmar(actual = borradorVacio, filas, requeridas, revisados) {
  if (actual.estado !== "borrador" || !planillaCompleta(filas, requeridas, actual.puntajes)) return actual;
  if ([...requeridas].some((id) => actual.puntajes[id] !== revisados[id])) return actual;
  const puntajes = Object.fromEntries([...requeridas].map((id) => [id, actual.puntajes[id]]));
  return { estado: "pendiente", puntajes, operationId: crypto.randomUUID() };
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
