import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasAdminEdiciones } from "../src/modules/ediciones/admin-ediciones.routes.js";
import { eliminarEdicion } from "../src/modules/ediciones/ediciones.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Riesgos de la eliminación completa: una edición retirada y una apertura concurrente.
// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";

async function preparar(pool) {
  await pool.query(
    "INSERT INTO usuario (id, nombre, correo, correo_verificado) VALUES ($1, 'Admin', 'admin@example.test', true)",
    [admin],
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT $1, id, NULL, true FROM rol WHERE codigo = 'ADMINISTRADOR'`,
    [admin],
  );
}

function appEdiciones(pool) {
  const app = express();
  app.use("/api/admin/ediciones", crearRutasAdminEdiciones({
    pool,
    eliminacionPool: pool,
    obtenerSesion: async () => ({ user: { id: admin } }),
  }));
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

async function pedir(base, { metodo = "GET", cuerpo, ruta = "" } = {}) {
  const respuesta = await fetch(`${base}/api/admin/ediciones${ruta}`, {
    method: metodo,
    headers: cuerpo === undefined ? {} : { "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: respuesta.status === 204 ? null : await respuesta.json() };
}

async function contar(pool, tabla) {
  const { rows: [{ total }] } = await pool.query(`SELECT count(*)::int AS total FROM ${tabla}`);
  return total;
}

// Espera hasta que una sentencia de eliminación quede bloqueada por un candado, con tope de tiempo.
async function esperarEliminacionBloqueada(pool, limiteMs = 10000) {
  const inicio = Date.now();
  while (Date.now() - inicio < limiteMs) {
    const { rows: [{ total }] } = await pool.query(`
      SELECT count(*)::int AS total FROM pg_stat_activity
       WHERE wait_event_type = 'Lock' AND query LIKE '%eliminar_edicion_completa%'`);
    if (total > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("La eliminación no quedó bloqueada a tiempo.");
}

test("una edición retirada se elimina por completo y no deja su reglamento", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      const { cuerpo: creada } = await pedir(base, {
        metodo: "POST", cuerpo: { nombre: "Retirada", anio: 2027 },
      });
      const retiro = await pedir(base, {
        metodo: "POST", ruta: `/${creada.id}/retiro`, cuerpo: { confirmar: true },
      });
      assert.equal(retiro.status, 200);

      assert.deepEqual(await pedir(base, {
        metodo: "DELETE", ruta: `/${creada.id}`, cuerpo: { confirmar: true },
      }), { status: 204, cuerpo: null });
      assert.equal(await contar(pool, "edicion"), 0);
      assert.equal(await contar(pool, "version_reglamento"), 0);
    });
  });
});

test("una apertura concurrente de noche hace fallar la eliminación sin dejar la edición a medio borrar", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    let edicionId;
    let nocheId;
    await conServidor(appEdiciones(pool), async (base) => {
      edicionId = (await pedir(base, {
        metodo: "POST", cuerpo: { nombre: "Concurrente", anio: 2027 },
      })).cuerpo.id;
      nocheId = (await pedir(base, {
        metodo: "POST", ruta: `/${edicionId}/noches`,
        cuerpo: { nombre: "Primera", orden: 1, tipo: "COMPETENCIA" },
      })).cuerpo.id;
    });
    await pool.query(
      "UPDATE edicion SET estado = 'OPEN', abierta_en = now(), abierta_por = $2 WHERE id = $1",
      [edicionId, admin],
    );

    // La apertura toma el candado de la noche y todavía no confirma.
    const apertura = await pool.connect();
    try {
      await apertura.query("BEGIN");
      await apertura.query("UPDATE noche SET estado = 'OPEN', abierta_en = now() WHERE id = $1", [nocheId]);

      const eliminacion = eliminarEdicion(pool, { edicionId, actorId: admin }).then(
        () => null,
        (error) => error,
      );
      await esperarEliminacionBloqueada(pool);
      await apertura.query("COMMIT");

      const error = await eliminacion;
      assert.equal(error?.codigo, "edicion_en_votacion");
    } finally {
      apertura.release();
    }

    assert.equal(await contar(pool, "edicion"), 1);
    assert.equal(await contar(pool, "noche"), 1);
    assert.equal(
      (await pool.query("SELECT estado FROM noche WHERE id = $1", [nocheId])).rows[0].estado,
      "OPEN",
    );
  });
});
