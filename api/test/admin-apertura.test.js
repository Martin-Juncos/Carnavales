import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { verificarCuentaDeApertura } from "../src/apertura-edicion.js";
import { crearRutasAdminApertura } from "../src/admin-apertura.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Verifica la ruta de apertura de edición y la comprobación de la cuenta. Requiere TEST_DATABASE_URL.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const jurado = "u-jurado";
const edicion = "10000000-0000-0000-0000-000000000027";
const clave = "bbbbbbbb-0000-4000-8000-000000000001";

async function preparar(pool) {
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Admin', 'admin@example.test', true),
            ($2, 'Jurado', 'jurado@example.test', true)`,
    [admin, jurado],
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT u.id, r.id, $1, false
       FROM (VALUES ($2::text, 'ADMINISTRADOR'), ($3::text, 'JURADO')) AS u(id, codigo)
       JOIN rol r ON r.codigo = u.codigo`,
    [admin, admin, jurado],
  );
  await pool.query(
    `INSERT INTO edicion (id, nombre, anio, estado, creada_por)
     VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $2)`,
    [edicion, admin],
  );
}

function appApertura(pool, aperturaPool) {
  const app = express();
  app.use(
    "/api/admin/ediciones",
    crearRutasAdminApertura({
      pool,
      aperturaPool,
      obtenerSesion: async (request) => {
        const usuarioId = request.headers["x-usuario-prueba"];
        return usuarioId ? { user: { id: usuarioId } } : null;
      },
    }),
  );
  return app;
}

async function conServidor(app, run) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function abrir(base, { usuario = admin, cuerpo = { claveOperacion: clave }, id = edicion } = {}) {
  const cabeceras = { "content-type": "application/json" };
  if (usuario) cabeceras["x-usuario-prueba"] = usuario;
  const respuesta = await fetch(`${base}/api/admin/ediciones/${id}/apertura`, {
    method: "POST",
    headers: cabeceras,
    body: JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: await respuesta.json() };
}

test("un administrador abre la edición y repetir la clave responde el mismo resultado", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appApertura(pool, pool), async (base) => {
      const primera = await abrir(base);
      assert.equal(primera.status, 200);
      assert.equal(primera.cuerpo.estado, "OPEN");
      assert.equal(primera.cuerpo.repetida, false);

      const reintento = await abrir(base);
      assert.equal(reintento.status, 200);
      assert.equal(reintento.cuerpo.repetida, true);
      assert.equal(reintento.cuerpo.abiertaEn, primera.cuerpo.abiertaEn);
    });
  });
});

test("sin cuenta de apertura configurada la ruta responde 503 y no toca la edición", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appApertura(pool, undefined), async (base) => {
      const respuesta = await abrir(base);
      assert.equal(respuesta.status, 503);
      assert.equal(respuesta.cuerpo.error, "apertura_no_configurada");
    });
    const { rows } = await pool.query("SELECT estado FROM edicion WHERE id = $1", [edicion]);
    assert.equal(rows[0].estado, "CONFIGURING");
  });
});

test("los errores de apertura se traducen a estados HTTP", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appApertura(pool, pool), async (base) => {
      const sinSesion = await abrir(base, { usuario: null });
      assert.equal(sinSesion.status, 401);

      const comoJurado = await abrir(base, { usuario: jurado });
      assert.equal(comoJurado.status, 403);

      const claveInvalida = await abrir(base, { cuerpo: { claveOperacion: "no-es-uuid" } });
      assert.equal(claveInvalida.status, 400);
      assert.equal(claveInvalida.cuerpo.error, "clave_operacion_invalida");

      const inexistente = await abrir(base, { id: "99999999-0000-0000-0000-000000000000" });
      assert.equal(inexistente.status, 404);
      assert.equal(inexistente.cuerpo.error, "edicion_inexistente");

      await abrir(base);
      const otraClave = await abrir(base, { cuerpo: { claveOperacion: "bbbbbbbb-0000-4000-8000-000000000002" } });
      assert.equal(otraClave.status, 409);
      assert.equal(otraClave.cuerpo.error, "edicion_ya_abierta");
    });
  });
});

test("la comprobación de arranque rechaza una cuenta superusuario", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await assert.rejects(verificarCuentaDeApertura(pool), /DATABASE_URL_APERTURA/);
  });
});
