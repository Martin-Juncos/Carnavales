// Cliente HTTP de la API de autenticación. Usa fetch inyectable para poder probarlo sin red.
// Las cookies de sesión viajan solas porque el cliente y la API comparten origen.

// Lee el cuerpo como JSON; si la respuesta no es JSON (por ejemplo, una página de error), devuelve null.
async function leerJson(respuesta) {
  try {
    return await respuesta.json();
  } catch {
    return null;
  }
}

// Crea un cliente con las operaciones de acceso. Cada método devuelve { ok, status, cuerpo }.
export function crearClienteApi(fetchImpl = globalThis.fetch) {
  // Envía una petición JSON (POST por defecto) y normaliza la respuesta.
  async function llamar(ruta, { metodo = "POST", cuerpo } = {}) {
    const opciones = { method: metodo, credentials: "same-origin", headers: {} };
    if (cuerpo !== undefined) {
      opciones.headers["content-type"] = "application/json";
      opciones.body = JSON.stringify(cuerpo);
    }
    const respuesta = await fetchImpl(ruta, opciones);
    return { ok: respuesta.ok, status: respuesta.status, cuerpo: await leerJson(respuesta) };
  }

  return {
    // Paso 1: correo y contraseña. Si la contraseña es correcta, la API pide el segundo factor.
    iniciarSesion: (email, password) => llamar("/api/auth/sign-in/email", { cuerpo: { email, password } }),
    // Envía (o reenvía) el código OTP al correo de la cuenta.
    pedirCodigo: () => llamar("/api/auth/two-factor/send-otp", { cuerpo: {} }),
    // Paso 2: verifica el código. Si es correcto, la API deja la cookie de sesión.
    verificarCodigo: (code) => llamar("/api/auth/two-factor/verify-otp", { cuerpo: { code } }),
    // Datos de la sesión actual (GET). Sin sesión, la API responde sin usuario.
    obtenerSesion: () => llamar("/api/auth/get-session", { metodo: "GET" }),
    // Cierra la sesión actual.
    cerrarSesion: () => llamar("/api/auth/sign-out", { cuerpo: {} }),
  };
}
