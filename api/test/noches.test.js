import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasAdminEdiciones } from "../src/modules/ediciones/admin-ediciones.routes.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const jurado = "u-jurado";
const edicion = "10000000-0000-0000-0000-000000000027";
const otraEdicion = "10000000-0000-0000-0000-000000000026";
const nocheAbierta = "20000000-0000-0000-0000-000000000001";
const especialidad = "30000000-0000-0000-0000-000000000001";

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

test("un administrador crea una noche en DRAFT con sus valores por defecto", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      const respuesta = await pedir(base, `/${edicion}/noches`, {
        metodo: "POST",
        usuario: admin,
        cuerpo: { orden: 1, nombre: "  Primera noche  ", fecha: "2027-02-06", tipo: "COMPETENCIA" },
      });

      assert.equal(respuesta.status, 201);
      assert.equal(respuesta.cuerpo.nombre, "Primera noche");
      assert.equal(respuesta.cuerpo.orden, 1);
      assert.equal(respuesta.cuerpo.fecha, "2027-02-06");
      assert.equal(respuesta.cuerpo.tipo, "COMPETENCIA");
      assert.equal(respuesta.cuerpo.cuentaParaPuntaje, true);
      assert.equal(respuesta.cuerpo.estado, "DRAFT");
      assert.equal(respuesta.cuerpo.abiertaEn, null);
    });

    const { rows } = await pool.query(
      "SELECT id, orden, nombre, fecha::text AS fecha, tipo, cuenta_para_puntaje, estado FROM noche",
    );
    assert.deepEqual(
      rows.map(({ id, ...resto }) => resto),
      [
        {
          orden: 1,
          nombre: "Primera noche",
          fecha: "2027-02-06",
          tipo: "COMPETENCIA",
          cuenta_para_puntaje: true,
          estado: "DRAFT",
        },
      ],
    );

    const { rows: auditoria } = await pool.query(
      "SELECT actor_id, operacion, entidad_tipo, entidad_id FROM auditoria",
    );
    assert.equal(auditoria.length, 1);
    assert.deepEqual(auditoria[0], {
      actor_id: admin,
      operacion: "noche_creada",
      entidad_tipo: "noche",
      entidad_id: rows[0].id,
    });
  });
});

test("los datos inválidos de una noche se rechazan sin crear nada", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      const casos = [
        [{ orden: 0, nombre: "Noche", tipo: "COMPETENCIA" }, "orden_invalido"],
        [{ orden: "1.5", nombre: "Noche", tipo: "COMPETENCIA" }, "orden_invalido"],
        [{ orden: 1, nombre: "   ", tipo: "COMPETENCIA" }, "nombre_invalido"],
        [{ orden: 1, nombre: "Noche", tipo: "OTRA" }, "tipo_invalido"],
        [{ orden: 1, nombre: "Noche", tipo: "COMPETENCIA", fecha: "2027-02-30" }, "fecha_invalida"],
        [{ orden: 1, nombre: "Noche", tipo: "COMPETENCIA", fecha: "06/02/2027" }, "fecha_invalida"],
        [{ orden: 1, nombre: "Noche", tipo: "COMPETENCIA", cuentaParaPuntaje: "sí" }, "cuenta_para_puntaje_invalido"],
      ];

      for (const [cuerpo, codigo] of casos) {
        const respuesta = await pedir(base, `/${edicion}/noches`, { metodo: "POST", usuario: admin, cuerpo });
        assert.equal(respuesta.status, 400, JSON.stringify(cuerpo));
        assert.equal(respuesta.cuerpo.error, codigo, JSON.stringify(cuerpo));
      }
    });

    assert.equal(await contar(pool, "noche"), 0);
  });
});

test("el orden de las noches es único por edición, pero se repite entre ediciones", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      const primera = await pedir(base, `/${edicion}/noches`, {
        metodo: "POST",
        usuario: admin,
        cuerpo: { orden: 1, nombre: "Primera", tipo: "COMPETENCIA" },
      });
      assert.equal(primera.status, 201);

      const repetida = await pedir(base, `/${edicion}/noches`, {
        metodo: "POST",
        usuario: admin,
        cuerpo: { orden: 1, nombre: "Otra", tipo: "COMPETENCIA" },
      });
      assert.equal(repetida.status, 409);
      assert.equal(repetida.cuerpo.error, "orden_existente");

      const otra = await pedir(base, `/${otraEdicion}/noches`, {
        metodo: "POST",
        usuario: admin,
        cuerpo: { orden: 1, nombre: "Primera 2026", tipo: "COMPETENCIA" },
      });
      assert.equal(otra.status, 201);
    });
  });
});

test("el listado devuelve solo las noches de la edición, ordenadas", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `INSERT INTO noche (edicion_id, orden, nombre, tipo)
       VALUES ($1, 2, 'Segunda', 'COMPETENCIA'), ($1, 1, 'Primera', 'PREMIACION'), ($2, 1, 'Ajena', 'COMPETENCIA')`,
      [edicion, otraEdicion],
    );
    await conServidor(appEdiciones(pool), async (base) => {
      const respuesta = await pedir(base, `/${edicion}/noches`, { usuario: admin });
      assert.equal(respuesta.status, 200);
      assert.deepEqual(
        respuesta.cuerpo.items.map((noche) => [noche.orden, noche.nombre]),
        [
          [1, "Primera"],
          [2, "Segunda"],
        ],
      );
    });
  });
});

test("una noche en DRAFT se modifica y deja auditoría", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const { rows: [noche] } = await pool.query(
      `INSERT INTO noche (edicion_id, orden, nombre, tipo)
       VALUES ($1, 1, 'Primera', 'COMPETENCIA') RETURNING id`,
      [edicion],
    );

    await conServidor(appEdiciones(pool), async (base) => {
      const respuesta = await pedir(base, `/${edicion}/noches/${noche.id}`, {
        metodo: "PATCH",
        usuario: admin,
        cuerpo: { nombre: "Primera noche", orden: 3, cuentaParaPuntaje: false },
      });
      assert.equal(respuesta.status, 200);
      assert.equal(respuesta.cuerpo.nombre, "Primera noche");
      assert.equal(respuesta.cuerpo.orden, 3);
      assert.equal(respuesta.cuerpo.cuentaParaPuntaje, false);
    });

    const { rows } = await pool.query("SELECT nombre, orden, cuenta_para_puntaje FROM noche");
    assert.deepEqual(rows, [{ nombre: "Primera noche", orden: 3, cuenta_para_puntaje: false }]);

    const { rows: auditoria } = await pool.query("SELECT operacion FROM auditoria");
    assert.deepEqual(auditoria, [{ operacion: "noche_actualizada" }]);
  });
});

test("una noche que ya no está en DRAFT no se modifica ni se borra", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `INSERT INTO noche (id, edicion_id, orden, nombre, tipo, estado, abierta_en)
       VALUES ($1, $2, 1, 'Abierta', 'COMPETENCIA', 'DRAFT', NULL)`,
      [nocheAbierta, edicion],
    );
    await pool.query(
      "UPDATE noche SET estado = 'OPEN', abierta_en = CURRENT_TIMESTAMP WHERE id = $1",
      [nocheAbierta],
    );

    await conServidor(appEdiciones(pool), async (base) => {
      const modificacion = await pedir(base, `/${edicion}/noches/${nocheAbierta}`, {
        metodo: "PATCH",
        usuario: admin,
        cuerpo: { nombre: "Cambio" },
      });
      assert.equal(modificacion.status, 409);
      assert.equal(modificacion.cuerpo.error, "noche_no_editable");

      const borrado = await pedir(base, `/${edicion}/noches/${nocheAbierta}`, {
        metodo: "DELETE",
        usuario: admin,
      });
      assert.equal(borrado.status, 409);
      assert.equal(borrado.cuerpo.error, "noche_no_editable");
    });

    assert.equal(await contar(pool, "noche"), 1);
  });
});

test("una noche en DRAFT sin asignaciones se borra, pero con asignaciones no", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `INSERT INTO especialidad (id, edicion_id, nombre, codigo, orden)
       VALUES ($1, $2, 'Vestuario', 'J1', 1)`,
      [especialidad, edicion],
    );
    const { rows } = await pool.query(
      `INSERT INTO noche (edicion_id, orden, nombre, tipo)
       VALUES ($1, 1, 'Libre', 'COMPETENCIA'), ($1, 2, 'Con jurado', 'COMPETENCIA')
       RETURNING id, nombre`,
      [edicion],
    );
    const libre = rows.find((noche) => noche.nombre === "Libre").id;
    const conJurado = rows.find((noche) => noche.nombre === "Con jurado").id;

    await pool.query(
      `INSERT INTO asignacion_jurado (edicion_id, jurado_id, noche_id, especialidad_id, creada_por)
       VALUES ($1, $2, $3, $4, $5)`,
      [edicion, jurado, conJurado, especialidad, admin],
    );

    await conServidor(appEdiciones(pool), async (base) => {
      const bloqueado = await pedir(base, `/${edicion}/noches/${conJurado}`, {
        metodo: "DELETE",
        usuario: admin,
      });
      assert.equal(bloqueado.status, 409);
      assert.equal(bloqueado.cuerpo.error, "noche_con_dependencias");

      const borrado = await pedir(base, `/${edicion}/noches/${libre}`, {
        metodo: "DELETE",
        usuario: admin,
      });
      assert.equal(borrado.status, 204);
    });

    const { rows: restantes } = await pool.query("SELECT nombre FROM noche");
    assert.deepEqual(restantes, [{ nombre: "Con jurado" }]);
  });
});

test("una edición inexistente responde 404 y sin administrador no se opera", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      const inexistente = await pedir(base, "/99999999-0000-0000-0000-000000000000/noches", { usuario: admin });
      assert.equal(inexistente.status, 404);
      assert.equal(inexistente.cuerpo.error, "edicion_inexistente");

      const sinSesion = await pedir(base, `/${edicion}/noches`, {
        metodo: "POST",
        cuerpo: { orden: 1, nombre: "Noche", tipo: "COMPETENCIA" },
      });
      assert.equal(sinSesion.status, 401);

      const comoJurado = await pedir(base, `/${edicion}/noches`, {
        metodo: "POST",
        usuario: jurado,
        cuerpo: { orden: 1, nombre: "Noche", tipo: "COMPETENCIA" },
      });
      assert.equal(comoJurado.status, 403);
    });

    assert.equal(await contar(pool, "noche"), 0);
  });
});
