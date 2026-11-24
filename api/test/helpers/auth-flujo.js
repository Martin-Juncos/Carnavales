import { createServer as crearServidorTcp } from "node:net";

// Utilidades compartidas por las pruebas de flujo real con Better Auth.

// Reserva un puerto libre: la URL base de la autenticación debe ser la del servidor real.
export function puertoLibre() {
  return new Promise((resolve, reject) => {
    const tcp = crearServidorTcp();
    tcp.once("error", reject);
    tcp.listen(0, "127.0.0.1", () => {
      const { port } = tcp.address();
      tcp.close(() => resolve(port));
    });
  });
}

// Une las cookies de respuesta en la cabecera Cookie de la siguiente petición.
export function cookiesDe(respuesta) {
  return respuesta.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

// Inicia sesión como lo hace la interfaz: contraseña, código OTP y cookie de sesión.
// `codigos` es el arreglo donde el callback sendOTP deja el código generado.
export async function iniciarSesion(baseUrl, headers, codigos, { email, password }) {
  const login = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: "POST", headers, body: JSON.stringify({ email, password }),
  });
  const desafio = cookiesDe(login);
  await fetch(`${baseUrl}/api/auth/two-factor/send-otp`, {
    method: "POST", headers: { ...headers, cookie: desafio }, body: "{}",
  });
  const verificacion = await fetch(`${baseUrl}/api/auth/two-factor/verify-otp`, {
    method: "POST", headers: { ...headers, cookie: desafio },
    body: JSON.stringify({ code: codigos.at(-1) }),
  });
  return cookiesDe(verificacion);
}
