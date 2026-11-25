import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasAdminEdiciones } from "../../../src/modules/ediciones/admin-ediciones.routes.js";
import { withIsolatedSchema } from "../../helpers/isolated-schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const jurado = "u-jurado";
const edicion = "10000000-0000-0000-0000-000000000027";
const otraEdicion = "10000000-0000-0000-0000-000000000026";

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
     VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $3),
            ($2, 'Carnaval 2026', 2026, 'CONFIGURING', $3)`,
    [edicion, otraEdicion, admin],
  );
}

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

async function pedir(base, ruta, { metodo = "GET", usuario, cuerpo } = {}) {
  const cabeceras = {};
  if (usuario) cabeceras["x-usuario-prueba"] = usuario;
  if (cuerpo !== undefined) cabeceras["content-type"] = "application/json";
  const respuesta = await fetch(`${base}/api/admin/ediciones${ruta}`, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  return { status: respuesta.status, cuerpo: texto === "" ? null : JSON.parse(texto) };
}

async function contar(pool, tabla) {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${tabla}`);
  return rows[0].n;
}

test("un administrador crea y lista especialidades con su orden", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      const creada = await pedir(base, `/${edicion}/especialidades`, {
        metodo: "POST",
        usuario: admin,
        cuerpo: { nombre: "  Vestuario  ", codigo: " J1 ", orden: 1 },
      });
      assert.equal(creada.status, 201);
      assert.equal(creada.cuerpo.nombre, "Vestuario");
      assert.equal(creada.cuerpo.codigo, "J1");
      assert.equal(creada.cuerpo.activa, true);

      const segunda = await pedir(base, `/${edicion}/especialidades`, {
        metodo: "POST",
        usuario: admin,
        cuerpo: { nombre: "Batería", codigo: "J3", orden: 3 },
      });
      assert.equal(segunda.status, 201);

      const listado = await pedir(base, `/${edicion}/especialidades`, { usuario: admin });
      assert.equal(listado.status, 200);
      assert.deepEqual(
        listado.cuerpo.items.map((especialidad) => especialidad.codigo),
        ["J1", "J3"],
      );
    });

    const { rows: auditoria } = await pool.query("SELECT operacion FROM auditoria ORDER BY operacion");
    assert.deepEqual(auditoria, [{ operacion: "especialidad_creada" }, { operacion: "especialidad_creada" }]);
  });
});

test("los datos inválidos de una especialidad se rechazan sin crear nada", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      const casos = [
        [{ nombre: "", codigo: "J1", orden: 1 }, "nombre_invalido"],
        [{ nombre: "Vestuario", codigo: "  ", orden: 1 }, "codigo_invalido"],
        [{ nombre: "Vestuario", codigo: "J1", orden: 0 }, "orden_invalido"],
        [{ nombre: "Vestuario", codigo: "J1", orden: "uno" }, "orden_invalido"],
      ];

      for (const [cuerpo, codigo] of casos) {
        const respuesta = await pedir(base, `/${edicion}/especialidades`, {
          metodo: "POST",
          usuario: admin,
          cuerpo,
        });
        assert.equal(respuesta.status, 400, JSON.stringify(cuerpo));
        assert.equal(respuesta.cuerpo.error, codigo, JSON.stringify(cuerpo));
      }
    });

    assert.equal(await contar(pool, "especialidad"), 0);
  });
});

test("código y orden son únicos por edición", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `INSERT INTO especialidad (edicion_id, nombre, codigo, orden)
       VALUES ($1, 'Vestuario', 'J1', 1)`,
      [edicion],
    );

    await conServidor(appEdiciones(pool), async (base) => {
      const codigoRepetido = await pedir(base, `/${edicion}/especialidades`, {
        metodo: "POST",
        usuario: admin,
        cuerpo: { nombre: "Otra", codigo: "J1", orden: 2 },
      });
      assert.equal(codigoRepetido.status, 409);
      assert.equal(codigoRepetido.cuerpo.error, "codigo_existente");

      const ordenRepetido = await pedir(base, `/${edicion}/especialidades`, {
        metodo: "POST",
        usuario: admin,
        cuerpo: { nombre: "Otra", codigo: "J2", orden: 1 },
      });
      assert.equal(ordenRepetido.status, 409);
      assert.equal(ordenRepetido.cuerpo.error, "orden_existente");

      const enOtraEdicion = await pedir(base, `/${otraEdicion}/especialidades`, {
        metodo: "POST",
        usuario: admin,
        cuerpo: { nombre: "Vestuario", codigo: "J1", orden: 1 },
      });
      assert.equal(enOtraEdicion.status, 201);
    });
  });
});

test("una especialidad se modifica y puede desactivarse", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const { rows: [especialidad] } = await pool.query(
      `INSERT INTO especialidad (edicion_id, nombre, codigo, orden)
       VALUES ($1, 'Vestuario', 'J1', 1) RETURNING id`,
      [edicion],
    );

    await conServidor(appEdiciones(pool), async (base) => {
      const respuesta = await pedir(base, `/${edicion}/especialidades/${especialidad.id}`, {
        metodo: "PATCH",
        usuario: admin,
        cuerpo: { nombre: "Vestuario y maquillaje", activa: false },
      });
      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.cuerpo.nombre, "Vestuario y maquillaje");
      assert.equal(respuesta.cuerpo.activa, false);
    });

    const { rows } = await pool.query("SELECT nombre, activa FROM especialidad");
    assert.deepEqual(rows, [{ nombre: "Vestuario y maquillaje", activa: false }]);
  });
});

test("con una noche abierta el padrón está congelado: no se crean ni modifican especialidades", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const { rows: [especialidad] } = await pool.query(
      `INSERT INTO especialidad (edicion_id, nombre, codigo, orden)
       VALUES ($1, 'Vestuario', 'J1', 1) RETURNING id`,
      [edicion],
    );
    await pool.query(
      `INSERT INTO noche (edicion_id, orden, nombre, tipo, estado, abierta_en)
       VALUES ($1, 1, 'Primera', 'COMPETENCIA', 'DRAFT', NULL)`,
      [edicion],
    );
    await pool.query(
      "UPDATE noche SET estado = 'OPEN', abierta_en = CURRENT_TIMESTAMP WHERE edicion_id = $1",
      [edicion],
    );

    await conServidor(appEdiciones(pool), async (base) => {
      const creacion = await pedir(base, `/${edicion}/especialidades`, {
        metodo: "POST",
        usuario: admin,
        cuerpo: { nombre: "Batería", codigo: "J3", orden: 3 },
      });
      assert.equal(creacion.status, 409);
      assert.equal(creacion.cuerpo.error, "padron_congelado");

      const modificacion = await pedir(base, `/${edicion}/especialidades/${especialidad.id}`, {
        metodo: "PATCH",
        usuario: admin,
        cuerpo: { nombre: "Cambio" },
      });
      assert.equal(modificacion.status, 409);
      assert.equal(modificacion.cuerpo.error, "padron_congelado");

      const borrado = await pedir(base, `/${edicion}/especialidades/${especialidad.id}`, {
        metodo: "DELETE",
        usuario: admin,
      });
      assert.equal(borrado.status, 409);
      assert.equal(borrado.cuerpo.error, "padron_congelado");
    });

    assert.equal(await contar(pool, "especialidad"), 1);
  });
});

test("una especialidad sin asignaciones se borra, pero con asignaciones no", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const { rows } = await pool.query(
      `INSERT INTO especialidad (edicion_id, nombre, codigo, orden)
       VALUES ($1, 'Libre', 'J1', 1), ($1, 'Con jurado', 'J3', 3)
       RETURNING id, codigo`,
      [edicion],
    );
    const libre = rows.find((especialidad) => especialidad.codigo === "J1").id;
    const conJurado = rows.find((especialidad) => especialidad.codigo === "J3").id;
    const { rows: [noche] } = await pool.query(
      `INSERT INTO noche (edicion_id, orden, nombre, tipo)
       VALUES ($1, 1, 'Primera', 'COMPETENCIA') RETURNING id`,
      [edicion],
    );
    await pool.query(
      `INSERT INTO asignacion_jurado (edicion_id, jurado_id, noche_id, especialidad_id, creada_por)
       VALUES ($1, $2, $3, $4, $5)`,
      [edicion, jurado, noche.id, conJurado, admin],
    );

    await conServidor(appEdiciones(pool), async (base) => {
      const bloqueado = await pedir(base, `/${edicion}/especialidades/${conJurado}`, {
        metodo: "DELETE",
        usuario: admin,
      });
      assert.equal(bloqueado.status, 409);
      assert.equal(bloqueado.cuerpo.error, "especialidad_con_dependencias");

      const borrado = await pedir(base, `/${edicion}/especialidades/${libre}`, {
        metodo: "DELETE",
        usuario: admin,
      });
      assert.equal(borrado.status, 204);
    });

    const { rows: restantes } = await pool.query("SELECT codigo FROM especialidad");
    assert.deepEqual(restantes, [{ codigo: "J3" }]);
  });
});

test("sin administrador no se opera y una especialidad inexistente responde 404", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      const inexistente = await pedir(
        base,
        `/${edicion}/especialidades/99999999-0000-0000-0000-000000000000`,
        { metodo: "PATCH", usuario: admin, cuerpo: { nombre: "Cambio" } },
      );
      assert.equal(inexistente.status, 404);
      assert.equal(inexistente.cuerpo.error, "especialidad_inexistente");

      const sinSesion = await pedir(base, `/${edicion}/especialidades`, {
        metodo: "POST",
        cuerpo: { nombre: "Vestuario", codigo: "J1", orden: 1 },
      });
      assert.equal(sinSesion.status, 401);

      const comoJurado = await pedir(base, `/${edicion}/especialidades`, {
        metodo: "POST",
        usuario: jurado,
        cuerpo: { nombre: "Vestuario", codigo: "J1", orden: 1 },
      });
      assert.equal(comoJurado.status, 403);
    });

    assert.equal(await contar(pool, "especialidad"), 0);
  });
});
