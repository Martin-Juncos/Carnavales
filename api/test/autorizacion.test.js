import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { requerirAdministrador } from "../src/http/autorizacion.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

async function crearUsuario(pool, id, correo) {
  await pool.query(
    "INSERT INTO usuario (id, nombre, correo, correo_verificado) VALUES ($1, $2, $3, true)",
    [id, id, correo],
  );
}

async function asignar(pool, usuarioId, codigoRol) {
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT $1, id, NULL, false FROM rol WHERE codigo = $2`,
    [usuarioId, codigoRol],
  );
}

// App de prueba con una sola ruta protegida. obtenerSesion simula lo que hará Better Auth.
function appProtegida(pool, obtenerSesion) {
  const app = express();
  app.get(
    "/protegida",
    requerirAdministrador({ pool, obtenerSesion }),
    (request, response) => response.json({ id: request.usuario.id }),
  );
  return app;
}

async function conServidor(app, run) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("sin sesión, la ruta responde 401", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const app = appProtegida(pool, async () => null);
    await conServidor(app, async (url) => {
      const respuesta = await fetch(`${url}/protegida`);
      assert.equal(respuesta.status, 401);
    });
  });
});

test("una sesión sin rol de administrador responde 403", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await crearUsuario(pool, "u-jurado", "jurado@example.test");
    await asignar(pool, "u-jurado", "JURADO");
    const app = appProtegida(pool, async () => ({ user: { id: "u-jurado" } }));
    await conServidor(app, async (url) => {
      const respuesta = await fetch(`${url}/protegida`);
      assert.equal(respuesta.status, 403);
    });
  });
});

test("un administrador accede y recibe su identidad", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await crearUsuario(pool, "u-admin", "admin@example.test");
    await asignar(pool, "u-admin", "ADMINISTRADOR");
    const app = appProtegida(pool, async () => ({ user: { id: "u-admin" } }));
    await conServidor(app, async (url) => {
      const respuesta = await fetch(`${url}/protegida`);
      assert.equal(respuesta.status, 200);
      assert.deepEqual(await respuesta.json(), { id: "u-admin" });
    });
  });
});

test("el rol se consulta en cada petición: quitarlo rige de inmediato", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await crearUsuario(pool, "u-admin", "admin@example.test");
    await asignar(pool, "u-admin", "ADMINISTRADOR");
    const app = appProtegida(pool, async () => ({ user: { id: "u-admin" } }));
    await conServidor(app, async (url) => {
      assert.equal((await fetch(`${url}/protegida`)).status, 200);
      await pool.query("DELETE FROM usuario_rol WHERE usuario_id = 'u-admin'");
      assert.equal((await fetch(`${url}/protegida`)).status, 403);
    });
  });
});
