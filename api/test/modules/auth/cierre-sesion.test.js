import assert from "node:assert/strict";
import { createServer as crearServidorTcp } from "node:net";
import test from "node:test";
import { createApp } from "../../../src/app.js";
import { createAuth } from "../../../src/modules/auth/auth.js";
import { bootstrapFirstAdmin } from "../../../src/modules/auth/bootstrap.js";
import { withIsolatedSchema } from "../../helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const secret = "un-secreto-de-prueba-de-al-menos-32-caracteres";
const datos = { name: "Admin", email: "admin@example.test", password: "contraseña-de-prueba" };

// Reserva un puerto libre antes de crear la autenticación: su URL base debe ser la del servidor real.
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

// Une las cookies de respuesta en la cabecera Cookie de la siguiente petición.
function cookiesDe(respuesta) {
  return respuesta.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

test("cerrar sesión invalida la sesión en el servidor y en la base", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const port = await puertoLibre();
    const baseUrl = `http://127.0.0.1:${port}`;
    await bootstrapFirstAdmin({ pool, secret, baseUrl, ...datos });
    const codigos = [];
    const auth = createAuth({ pool, secret, baseUrl, sendOTP: async ({ otp }) => codigos.push(otp) });
    const server = createApp({ pool, auth }).listen(port, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const url = baseUrl;
    const json = { "content-type": "application/json", origin: url };
    try {
      // Contraseña, código y sesión autenticada.
      const login = await fetch(`${url}/api/auth/sign-in/email`, {
        method: "POST", headers: json, body: JSON.stringify({ email: datos.email, password: datos.password }),
      });
      const desafio = cookiesDe(login);
      await fetch(`${url}/api/auth/two-factor/send-otp`, { method: "POST", headers: { ...json, cookie: desafio }, body: "{}" });
      const verificacion = await fetch(`${url}/api/auth/two-factor/verify-otp`, {
        method: "POST", headers: { ...json, cookie: desafio }, body: JSON.stringify({ code: codigos[0] }),
      });
      const sesion = cookiesDe(verificacion);
      assert.equal((await (await fetch(`${url}/api/auth/get-session`, { headers: { cookie: sesion } })).json()).user.email, datos.email);

      // Cierre: la cookie anterior ya no identifica a nadie.
      const salida = await fetch(`${url}/api/auth/sign-out`, { method: "POST", headers: { ...json, cookie: sesion }, body: "{}" });
      assert.equal(salida.status, 200);
      const despues = await (await fetch(`${url}/api/auth/get-session`, { headers: { cookie: sesion } })).json();
      assert.equal(despues, null);

      const { rows: [{ total }] } = await pool.query(
        "SELECT count(*)::int AS total FROM sesion s JOIN usuario u ON u.id = s.usuario_id WHERE u.correo = $1",
        [datos.email],
      );
      assert.equal(total, 0, "la sesión debe borrarse de la base");
    } finally {
      await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }
  });
});
