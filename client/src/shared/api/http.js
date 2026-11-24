// Helper HTTP común de los clientes de la API. Cada llamada devuelve { ok, status, cuerpo }.
// Las cookies de sesión viajan solas porque el cliente y la API comparten origen.

// Lee el cuerpo como JSON; si la respuesta no es JSON (por ejemplo, una página de error), devuelve null.
export async function leerJson(respuesta) {
  try {
    return await respuesta.json();
  } catch {
    return null;
  }
}

// Crea la función que envía una petición JSON. `metodoPorDefecto` y `cachePorDefecto` son los
// valores de cada cliente; cada llamada puede sobrescribirlos.
export function crearLlamador(fetchImpl, { metodoPorDefecto = "POST", cachePorDefecto } = {}) {
  return async function llamar(ruta, { metodo = metodoPorDefecto, cuerpo, cache = cachePorDefecto, signal } = {}) {
    const opciones = { method: metodo, credentials: "same-origin", headers: {} };
    if (cache) opciones.cache = cache;
    if (signal) opciones.signal = signal;
    if (cuerpo !== undefined) {
      opciones.headers["content-type"] = "application/json";
      opciones.body = JSON.stringify(cuerpo);
    }
    const respuesta = await fetchImpl(ruta, opciones);
    return { ok: respuesta.ok, status: respuesta.status, cuerpo: await leerJson(respuesta) };
  };
}
