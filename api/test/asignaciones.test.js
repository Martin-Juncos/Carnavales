import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasAdminAsignaciones } from "../src/admin-asignaciones.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const juradoUno = "u-jurado-1";
const juradoDos = "u-jurado-2";
const escribano = "u-escribano";
const edicion2027 = "10000000-0000-0000-0000-000000000027";
const edicion2026 = "10000000-0000-0000-0000-000000000026";
const nocheUno = "20000000-0000-0000-0000-000000000001";
const nocheDos = "20000000-0000-0000-0000-000000000002";
const nocheAnterior = "20000000-0000-0000-0000-000000000000";
const especialidadJ1 = "30000000-0000-0000-0000-000000000001";
const especialidadJ3 = "30000000-0000-0000-0000-000000000003";
const especialidadAnterior = "30000000-0000-0000-0000-000000000000";
const asignacionUno = "40000000-0000-0000-0000-000000000001";
const asignacionRevocada = "40000000-0000-0000-0000-000000000002";
const asignacionDos = "40000000-0000-0000-0000-000000000003";
const asignacionAnterior = "40000000-0000-0000-0000-000000000000";
const creadaEn = "2026-11-01T10:00:00Z";

async function preparar(pool) {
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Admin', 'admin@example.test', true),
            ($2, 'Jurado uno', 'jurado1@example.test', true),
            ($3, 'Jurado dos', 'jurado2@example.test', true),
            ($4, 'Escribano', 'escribano@example.test', true)`,
    [admin, juradoUno, juradoDos, escribano],
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT u.id, r.id, $1, false
       FROM (VALUES ($2::text, 'ADMINISTRADOR'), ($3::text, 'JURADO'),
                    ($4::text, 'JURADO'), ($5::text, 'ESCRIBANO')) AS u(id, codigo)
       JOIN rol r ON r.codigo = u.codigo`,
    [admin, admin, juradoUno, juradoDos, escribano],
  );
  await pool.query(
    `INSERT INTO edicion (id, nombre, anio, estado, creada_por)
     VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $3),
            ($2, 'Carnaval 2026', 2026, 'CONFIGURING', $3)`,
    [edicion2027, edicion2026, admin],
  );
  await pool.query(
    `INSERT INTO noche (id, edicion_id, orden, nombre, tipo, estado, abierta_en)
     VALUES ($1, $4, 1, 'Primera noche', 'COMPETENCIA', 'DRAFT', NULL),
            ($2, $4, 2, 'Segunda noche', 'COMPETENCIA', 'OPEN', '2026-11-02T20:00:00Z'),
            ($3, $5, 1, 'Noche anterior', 'COMPETENCIA', 'DRAFT', NULL)`,
    [nocheUno, nocheDos, nocheAnterior, edicion2027, edicion2026],
  );
  await pool.query(
    `INSERT INTO especialidad (id, edicion_id, nombre, codigo, orden)
     VALUES ($1, $4, 'Vestuario', 'J1', 1),
            ($2, $4, 'Batería', 'J3', 3),
            ($3, $5, 'Vestuario', 'J1', 1)`,
    [especialidadJ1, especialidadJ3, especialidadAnterior, edicion2027, edicion2026],
  );
  await pool.query(
    `INSERT INTO asignacion_jurado
       (id, edicion_id, jurado_id, noche_id, especialidad_id, creada_por, creada_en,
        estado, revocada_por, revocada_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVA', NULL, NULL),
            ($8, $2, $9, $4, $5, $6, $7, 'REVOCADA', $6, '2026-11-02T10:00:00Z'),
            ($10, $2, $3, $11, $12, $6, $7, 'ACTIVA', NULL, NULL),
            ($13, $14, $3, $15, $16, $6, $7, 'ACTIVA', NULL, NULL)`,
    [
      asignacionUno,
      edicion2027,
      juradoUno,
      nocheUno,
      especialidadJ1,
      admin,
      creadaEn,
      asignacionRevocada,
      juradoDos,
      asignacionDos,
      nocheDos,
      especialidadJ3,
      asignacionAnterior,
      edicion2026,
      nocheAnterior,
      especialidadAnterior,
    ],
  );
}

function appAsignaciones(pool) {
  const app = express();
  app.use(
    "/api/admin",
    crearRutasAdminAsignaciones({
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

async function pedir(base, ruta, usuario) {
  const cabeceras = usuario ? { "x-usuario-prueba": usuario } : {};
  const respuesta = await fetch(`${base}${ruta}`, { headers: cabeceras });
  const texto = await respuesta.text();
  let cuerpo;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = texto;
  }
  return { status: respuesta.status, cuerpo };
}

test("el listado muestra cada asignación con su jurado, noche y especialidad", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const respuesta = await pedir(base, "/api/admin/asignaciones", admin);
      assert.equal(respuesta.status, 200);
      for (const item of respuesta.cuerpo.items) {
        assert.equal(item.creadaEn, "2026-11-01T10:00:00.000Z");
      }
      assert.deepEqual(
        respuesta.cuerpo.items.map((item) => ({
          id: item.id,
          estado: item.estado,
          jurado: item.jurado,
          noche: item.noche,
          especialidad: item.especialidad,
        })),
        [
          {
            id: asignacionRevocada,
            estado: "REVOCADA",
            jurado: { id: juradoDos, nombre: "Jurado dos", activo: true },
            noche: { id: nocheUno, nombre: "Primera noche", orden: 1, estado: "DRAFT" },
            especialidad: { id: especialidadJ1, nombre: "Vestuario", codigo: "J1", activa: true },
          },
          {
            id: asignacionUno,
            estado: "ACTIVA",
            jurado: { id: juradoUno, nombre: "Jurado uno", activo: true },
            noche: { id: nocheUno, nombre: "Primera noche", orden: 1, estado: "DRAFT" },
            especialidad: { id: especialidadJ1, nombre: "Vestuario", codigo: "J1", activa: true },
          },
          {
            id: asignacionDos,
            estado: "ACTIVA",
            jurado: { id: juradoUno, nombre: "Jurado uno", activo: true },
            noche: { id: nocheDos, nombre: "Segunda noche", orden: 2, estado: "OPEN" },
            especialidad: { id: especialidadJ3, nombre: "Batería", codigo: "J3", activa: true },
          },
          {
            id: asignacionAnterior,
            estado: "ACTIVA",
            jurado: { id: juradoUno, nombre: "Jurado uno", activo: true },
            noche: { id: nocheAnterior, nombre: "Noche anterior", orden: 1, estado: "DRAFT" },
            especialidad: { id: especialidadAnterior, nombre: "Vestuario", codigo: "J1", activa: true },
          },
        ],
      );
    });
  });
});

test("el listado de jurados incluye solo usuarios con ese rol", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const respuesta = await pedir(base, "/api/admin/jurados", admin);
      assert.equal(respuesta.status, 200);
      assert.deepEqual(respuesta.cuerpo.items, [
        { id: juradoDos, nombre: "Jurado dos", correo: "jurado2@example.test" },
        { id: juradoUno, nombre: "Jurado uno", correo: "jurado1@example.test" },
      ]);
    });
  });
});

test("un jurado al que se le retiró el rol aparece como inactivo", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `DELETE FROM usuario_rol
        WHERE usuario_id = $1 AND rol_id = (SELECT id FROM rol WHERE codigo = 'JURADO')`,
      [juradoDos],
    );
    await conServidor(appAsignaciones(pool), async (base) => {
      const respuesta = await pedir(base, "/api/admin/asignaciones", admin);
      assert.equal(respuesta.status, 200);
      const item = respuesta.cuerpo.items.find((asignacion) => asignacion.id === asignacionRevocada);
      assert.deepEqual(item.jurado, { id: juradoDos, nombre: "Jurado dos", activo: false });
    });
  });
});

test("sin sesión o sin rol de administrador no se consultan asignaciones ni jurados", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      for (const ruta of ["/api/admin/asignaciones", "/api/admin/jurados"]) {
        const sinSesion = await pedir(base, ruta);
        assert.equal(sinSesion.status, 401, ruta);
        assert.deepEqual(sinSesion.cuerpo, { error: "no_autenticado" });

        const comoEscribano = await pedir(base, ruta, escribano);
        assert.equal(comoEscribano.status, 403, ruta);
        assert.deepEqual(comoEscribano.cuerpo, { error: "sin_permiso" });
      }
    });
  });
});
