import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/modules/auth/auth.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

// Inicio de sesión con un correo inexistente: no hace falta una cuenta para ver si el origen se acepta.
async function iniciarSesionDesde(url, origen) {
  const respuesta = await fetch(`${url}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: origen },
    body: JSON.stringify({ email: "nadie@example.test", password: "contraseña-de-prueba" }),
  });
  return respuesta.status;
}

async function conServidor(app, run) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

test("el origen del cliente (APP_URL) se acepta; un origen ajeno sigue rechazado", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const secret = "un-secreto-de-prueba-de-al-menos-32-caracteres";
    const auth = createAuth({
      pool,
      secret,
      baseUrl: "http://127.0.0.1:3000",
      origenesConfiables: ["http://localhost:5173"],
    });
    await conServidor(createApp({ pool, auth }), async (url) => {
      // Origen confiable: Better Auth lo procesa y responde por credenciales (401), no por origen (403).
      assert.equal(await iniciarSesionDesde(url, "http://localhost:5173"), 401);
      // Origen ajeno: rechazado por origen.
      assert.equal(await iniciarSesionDesde(url, "https://sitio-ajeno.example.test"), 403);
    });
  });
});
