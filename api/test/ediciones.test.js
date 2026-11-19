import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasAdminEdiciones } from "../src/admin-ediciones.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const jurado = "u-jurado";

async function preparar(pool) {
  await pool.query(
    "INSERT INTO usuario (id, nombre, correo, correo_verificado) VALUES ($1, 'Admin', 'admin@example.test', true), ($2, 'Jurado', 'jurado@example.test', true)",
    [admin, jurado],
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT $1, id, NULL, true FROM rol WHERE codigo = 'ADMINISTRADOR'`,
    [admin],
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT $1, id, NULL, false FROM rol WHERE codigo = 'JURADO'`,
    [jurado],
  );
}

// Sesión simulada: la cabecera x-usuario-prueba indica quién llama; sin ella no hay sesión.
function appEdiciones(pool) {
  const app = express();
  app.use(
    "/api/admin/ediciones",
    crearRutasAdminEdiciones({
      pool,
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

async function pedir(base, { metodo = "GET", usuario, cuerpo } = {}) {
  const cabeceras = {};
  if (usuario) cabeceras["x-usuario-prueba"] = usuario;
  if (cuerpo !== undefined) cabeceras["content-type"] = "application/json";
  const respuesta = await fetch(`${base}/api/admin/ediciones`, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: await respuesta.json() };
}

async function contar(pool, tabla) {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${tabla}`);
  return rows[0].n;
}

test("un administrador crea una edición en CONFIGURING con su primera versión en BORRADOR", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      const respuesta = await pedir(base, {
        metodo: "POST",
        usuario: admin,
        cuerpo: { nombre: "  Carnaval 2027  ", anio: 2027 },
      });

      assert.equal(respuesta.status, 201);
      assert.equal(respuesta.cuerpo.nombre, "Carnaval 2027");
      assert.equal(respuesta.cuerpo.anio, 2027);
      assert.equal(respuesta.cuerpo.estado, "CONFIGURING");
      assert.deepEqual(respuesta.cuerpo.version, { numero: 1, estado: "BORRADOR" });
    });

    // Persistencia: una edición y una versión, creadas por el administrador.
    const { rows } = await pool.query(
      `SELECT e.estado, e.creada_por, v.numero, v.estado AS version_estado, v.creada_por AS version_creada_por
         FROM edicion e JOIN version_reglamento v ON v.edicion_id = e.id`,
    );
    assert.deepEqual(rows, [
      {
        estado: "CONFIGURING",
        creada_por: admin,
        numero: 1,
        version_estado: "BORRADOR",
        version_creada_por: admin,
      },
    ]);
  });
});

test("un año repetido responde conflicto y no deja una edición ni una versión a medias", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      const primera = await pedir(base, { metodo: "POST", usuario: admin, cuerpo: { nombre: "Original", anio: 2027 } });
      assert.equal(primera.status, 201);

      const repetida = await pedir(base, { metodo: "POST", usuario: admin, cuerpo: { nombre: "Repetida", anio: "2027" } });
      assert.equal(repetida.status, 409);
      assert.equal(repetida.cuerpo.error, "anio_existente");
    });

    assert.equal(await contar(pool, "edicion"), 1, "solo debe quedar la edición original");
    assert.equal(await contar(pool, "version_reglamento"), 1, "solo debe quedar la versión original");
  });
});

test("un año que no es entero positivo se rechaza sin crear nada", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      for (const anio of [0, -1, 2027.5, "abc", "", "2027a", 99999999999, null]) {
        const respuesta = await pedir(base, { metodo: "POST", usuario: admin, cuerpo: { nombre: "Edición", anio } });
        assert.equal(respuesta.status, 400, `año ${JSON.stringify(anio)}`);
        assert.equal(respuesta.cuerpo.error, "anio_invalido", `año ${JSON.stringify(anio)}`);
      }
    });

    assert.equal(await contar(pool, "edicion"), 0);
    assert.equal(await contar(pool, "version_reglamento"), 0);
  });
});

test("el nombre de la edición es obligatorio", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      for (const nombre of ["", "   ", undefined]) {
        const respuesta = await pedir(base, { metodo: "POST", usuario: admin, cuerpo: { nombre, anio: 2027 } });
        assert.equal(respuesta.status, 400);
        assert.equal(respuesta.cuerpo.error, "nombre_invalido");
      }
    });

    assert.equal(await contar(pool, "edicion"), 0);
  });
});

test("el listado muestra cada edición con su estado y su versión vigente, de la más reciente a la más antigua", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      await pedir(base, { metodo: "POST", usuario: admin, cuerpo: { nombre: "Carnaval 2026", anio: 2026 } });
      await pedir(base, { metodo: "POST", usuario: admin, cuerpo: { nombre: "Carnaval 2027", anio: 2027 } });

      const respuesta = await pedir(base, { usuario: admin });
      assert.equal(respuesta.status, 200);
      assert.deepEqual(
        respuesta.cuerpo.items.map((item) => ({
          anio: item.anio,
          nombre: item.nombre,
          estado: item.estado,
          version: item.version,
        })),
        [
          { anio: 2027, nombre: "Carnaval 2027", estado: "CONFIGURING", version: { numero: 1, estado: "BORRADOR" } },
          { anio: 2026, nombre: "Carnaval 2026", estado: "CONFIGURING", version: { numero: 1, estado: "BORRADOR" } },
        ],
      );
    });
  });
});

test("sin rol de administrador no se crean ni se listan ediciones", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      const sinSesion = await pedir(base, { metodo: "POST", cuerpo: { nombre: "Anónima", anio: 2027 } });
      assert.equal(sinSesion.status, 401);

      const comoJurado = await pedir(base, { metodo: "POST", usuario: jurado, cuerpo: { nombre: "De jurado", anio: 2027 } });
      assert.equal(comoJurado.status, 403);

      const listadoJurado = await pedir(base, { usuario: jurado });
      assert.equal(listadoJurado.status, 403);
    });

    assert.equal(await contar(pool, "edicion"), 0);
    assert.equal(await contar(pool, "version_reglamento"), 0);
  });
});
