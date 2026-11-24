import assert from "node:assert/strict";
import { createServer as crearServidorTcp } from "node:net";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/auth.js";
import { bootstrapFirstAdmin } from "../src/modules/auth/bootstrap.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const secret = "un-secreto-de-prueba-de-al-menos-32-caracteres";
const datos = { name: "Admin", email: "admin@example.test", password: "contraseña-de-prueba" };
const nuevaContrasena = "contraseña-nueva-123";

function puertoLibre() {
  return new Promise((resolve, reject) => {
    const tcp = crearServidorTcp();
    tcp.once("error", reject);
    tcp.listen(0, "127.0.0.1", () => {
      const { port } = tcp.address();
      tcp.close(() => resolve(port));
    });
  });
}

function cookiesDe(respuesta) {
  return respuesta.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

async function post(url, ruta, cuerpo, cabeceras = {}) {
  return fetch(`${url}${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url, ...cabeceras },
    body: JSON.stringify(cuerpo),
  });
}

test("recuperar la contraseña: envía el token, cambia la clave y cierra las sesiones abiertas", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const port = await puertoLibre();
    const baseUrl = `http://127.0.0.1:${port}`;
    const appUrl = "http://localhost:5173";
    await bootstrapFirstAdmin({ pool, secret, baseUrl, ...datos });

    const codigos = [];
    const recuperaciones = [];
    const auth = createAuth({
      pool,
      secret,
      baseUrl,
      origenesConfiables: [appUrl],
      sendOTP: async ({ otp }) => codigos.push(otp),
      enviarRecuperacion: async ({ user, token }) => recuperaciones.push({ correo: user.email, token }),
    });
    const server = createApp({ pool, auth }).listen(port, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    try {
      // Sesión abierta antes de la recuperación (contraseña + código).
      const login = await post(baseUrl, "/api/auth/sign-in/email", datos);
      const desafio = cookiesDe(login);
      await post(baseUrl, "/api/auth/two-factor/send-otp", {}, { cookie: desafio });
      const verificado = await post(baseUrl, "/api/auth/two-factor/verify-otp", { code: codigos[0] }, { cookie: desafio });
      const sesionAnterior = cookiesDe(verificado);

      // Pedido de recuperación: responde igual exista o no el correo.
      const pedido = await post(baseUrl, "/api/auth/request-password-reset", { email: datos.email, redirectTo: `${appUrl}/restablecer-contrasena` });
      assert.equal(pedido.status, 200);
      const noExiste = await post(baseUrl, "/api/auth/request-password-reset", { email: "nadie@example.test", redirectTo: `${appUrl}/restablecer-contrasena` });
      assert.equal(noExiste.status, 200);
      assert.equal(recuperaciones.length, 1, "solo el correo existente recibe el token");

      // Cambio de contraseña con el token recibido.
      const cambio = await post(baseUrl, "/api/auth/reset-password", { newPassword: nuevaContrasena, token: recuperaciones[0].token });
      assert.equal(cambio.status, 200);

      // La contraseña vieja ya no sirve; la nueva inicia el paso del código.
      assert.equal((await post(baseUrl, "/api/auth/sign-in/email", datos)).status, 401);
      const nueva = await post(baseUrl, "/api/auth/sign-in/email", { email: datos.email, password: nuevaContrasena });
      assert.equal((await nueva.json()).twoFactorRedirect, true);

      // La sesión abierta antes del cambio ya no identifica a nadie.
      const yo = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie: sesionAnterior } });
      assert.equal(await yo.json(), null);
    } finally {
      await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }
  });
});
