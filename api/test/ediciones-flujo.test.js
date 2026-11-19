import assert from "node:assert/strict";
import { createServer as crearServidorTcp } from "node:net";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/auth.js";
import { bootstrapFirstAdmin } from "../src/bootstrap.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
// Recorre la aplicación completa: createApp, autenticación real con segundo factor y PostgreSQL.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const secret = "un-secreto-de-prueba-de-al-menos-32-caracteres";
const datos = { name: "Admin", email: "admin@example.test", password: "contraseña-de-prueba" };

// Reserva un puerto libre: la URL base de la autenticación debe ser la del servidor real.
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

// Inicia sesión como lo hace la interfaz: contraseña, código OTP y cookie de sesión.
async function iniciarSesion(url, json, codigos) {
  const login = await fetch(`${url}/api/auth/sign-in/email`, {
    method: "POST", headers: json, body: JSON.stringify({ email: datos.email, password: datos.password }),
  });
  const desafio = cookiesDe(login);
  await fetch(`${url}/api/auth/two-factor/send-otp`, { method: "POST", headers: { ...json, cookie: desafio }, body: "{}" });
  const verificacion = await fetch(`${url}/api/auth/two-factor/verify-otp`, {
    method: "POST", headers: { ...json, cookie: desafio }, body: JSON.stringify({ code: codigos.at(-1) }),
  });
  return cookiesDe(verificacion);
}

test("un administrador con sesión real crea una edición, recibe conflicto por año repetido y la ve listada", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const port = await puertoLibre();
    const baseUrl = `http://127.0.0.1:${port}`;
    await bootstrapFirstAdmin({ pool, secret, baseUrl, ...datos });
    const codigos = [];
    const auth = createAuth({ pool, secret, baseUrl, sendOTP: async ({ otp }) => codigos.push(otp) });
    const server = createApp({ pool, auth }).listen(port, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const json = { "content-type": "application/json", origin: baseUrl };
    try {
      // Sin sesión, el listado no responde.
      const anonimo = await fetch(`${baseUrl}/api/admin/ediciones`);
      assert.equal(anonimo.status, 401);

      const sesion = await iniciarSesion(baseUrl, json, codigos);
      const alta = await fetch(`${baseUrl}/api/admin/ediciones`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sesion },
        body: JSON.stringify({ nombre: "Carnaval 2027", anio: 2027 }),
      });
      assert.equal(alta.status, 201);
      const creada = await alta.json();
      assert.equal(creada.estado, "CONFIGURING");
      assert.deepEqual(creada.version, { numero: 1, estado: "BORRADOR" });

      const repetida = await fetch(`${baseUrl}/api/admin/ediciones`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: sesion },
        body: JSON.stringify({ nombre: "Otra", anio: 2027 }),
      });
      assert.equal(repetida.status, 409);
      const conflicto = await repetida.json();
      assert.equal(conflicto.error, "anio_existente");
      assert.equal(conflicto.mensaje, "Ya existe una edición para ese año.");

      const listado = await fetch(`${baseUrl}/api/admin/ediciones`, { headers: { cookie: sesion } });
      assert.equal(listado.status, 200);
      const { items } = await listado.json();
      assert.equal(items.length, 1);
      assert.equal(items[0].nombre, "Carnaval 2027");
    } finally {
      await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }

    // Persistencia: una edición y una versión, creadas por el administrador de la sesión.
    const { rows: [admin] } = await pool.query("SELECT id FROM usuario WHERE correo = $1", [datos.email]);
    const { rows } = await pool.query(
      `SELECT e.creada_por, e.estado, v.numero, v.estado AS version_estado
         FROM edicion e JOIN version_reglamento v ON v.edicion_id = e.id`,
    );
    assert.deepEqual(rows, [
      { creada_por: admin.id, estado: "CONFIGURING", numero: 1, version_estado: "BORRADOR" },
    ]);
  });
});
