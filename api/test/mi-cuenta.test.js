import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { crearRutasMiCuenta } from "../src/modules/auth/mi-cuenta.routes.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

async function preparar(pool) {
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado) VALUES
       ('u-doble', 'Doble', 'doble@example.test', true),
       ('u-sin', 'Sin roles', 'sin@example.test', true)`,
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT 'u-doble', id, NULL, false FROM rol WHERE codigo IN ('JURADO', 'ESCRIBANO')`,
  );
}

test("devuelve solo los roles del usuario con sesión, ordenados", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const app = express();
    app.use(
      "/api/mi-cuenta",
      crearRutasMiCuenta({
        pool,
        obtenerSesion: async (request) => {
          const usuario = request.headers["x-usuario-prueba"];
          return usuario ? { user: { id: usuario } } : null;
        },
      }),
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/mi-cuenta/roles`;
    try {
      assert.equal((await fetch(base)).status, 401);
      const doble = await fetch(base, { headers: { "x-usuario-prueba": "u-doble" } });
      assert.equal(doble.status, 200);
      assert.deepEqual(await doble.json(), { roles: ["ESCRIBANO", "JURADO"] });
      const sin = await fetch(base, { headers: { "x-usuario-prueba": "u-sin" } });
      assert.deepEqual(await sin.json(), { roles: [] });
    } finally {
      await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }
  });
});
