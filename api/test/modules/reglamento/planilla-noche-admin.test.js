import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasAdminPlanilla } from "../../../src/modules/reglamento/admin-planilla.routes.js";
import { guardarPlanillaNoche } from "../../../src/modules/reglamento/planillas-noche.js";
import { nominarSujeto } from "../../../src/modules/reglamento/planilla.js";
import { withIsolatedSchema } from "../../helpers/isolated-schema.js";

// Verifica los endpoints de apoyo al panel de planilla por noche: versiones y candidatas.
// Requiere TEST_DATABASE_URL apuntando a una base descartable.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const jurado = "u-jurado";
const edicion = "10000000-0000-0000-0000-000000000027";
const version = "30000000-0000-0000-0000-000000000001";
const noche = "20000000-0000-0000-0000-000000000001";
const especialidad = "40000000-0000-0000-0000-000000000001";
const alfa = "50000000-0000-0000-0000-000000000001";
const beta = "50000000-0000-0000-0000-000000000002";
const rubro = "70000000-0000-0000-0000-000000000001";
const ids = {
  inexistente: "99999999-0000-4000-8000-000000000009",
};

async function preparar(pool) {
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Admin', 'admin@example.test', true), ($2, 'Jurado', 'jurado@example.test', true)`,
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
  await pool.query(
    `INSERT INTO version_reglamento (id, edicion_id, numero, estado, fuente, creada_por)
     VALUES ($1, $2, 1, 'BORRADOR', 'Borrador de prueba', $3)`,
    [version, edicion, admin],
  );
  await pool.query(
    `INSERT INTO especialidad (id, edicion_id, nombre, codigo, orden)
     VALUES ($1, $2, 'Vestuario', 'J1', 1)`,
    [especialidad, edicion],
  );
  await pool.query(
    `INSERT INTO rubro_version (id, version_id, edicion_id, codigo, nombre, tipo_sujeto,
                                tipo_rubro, nominados_maximos, orden)
     VALUES ($1, $2, $3, 'R1', 'Traje', 'TRAJE', 'ALEATORIO', 5, 1)`,
    [rubro, version, edicion],
  );
  await pool.query(
    `INSERT INTO rubro_especialidad (rubro_version_id, especialidad_id, edicion_id)
     VALUES ($1, $2, $3)`,
    [rubro, especialidad, edicion],
  );
  await pool.query(
    `INSERT INTO noche (id, edicion_id, orden, nombre, tipo)
     VALUES ($1, $2, 1, 'Primera noche', 'COMPETENCIA')`,
    [noche, edicion],
  );
  await pool.query(
    `INSERT INTO comparsa (id, edicion_id, nombre, categoria)
     VALUES ($1, $3, 'Alfa', 'PRIMERA'), ($2, $3, 'Beta', 'PRIMERA')`,
    [alfa, beta, edicion],
  );
  await pool.query(
    `INSERT INTO orden_presentacion (edicion_id, noche_id, comparsa_id, orden_presentacion)
     VALUES ($1, $2, $3, 1), ($1, $2, $4, 2)`,
    [edicion, noche, alfa, beta],
  );
}

// Una fila por comparsa: Alfa primero en el desfile, Beta después.
async function nominar(pool) {
  const filas = {};
  for (const [clave, comparsa, nombre] of [["alfa", alfa, "Primero"], ["beta", beta, "Segundo"]]) {
    const { rows: [sujeto] } = await pool.query(
      `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, nombre)
       VALUES ($1, $2, 'TRAJE', $3) RETURNING id`, [edicion, comparsa, nombre],
    );
    const fila = await nominarSujeto(pool, {
      edicionId: edicion, versionId: version, actorId: admin, rubroId: rubro,
      datos: { sujetoId: sujeto.id, especialidadId: especialidad },
    });
    filas[clave] = fila.id;
  }
  return filas;
}

async function conServidor(pool, run) {
  const app = express();
  let usuario = admin;
  app.use(crearRutasAdminPlanilla({ pool, obtenerSesion: async () => ({ user: { id: usuario } }) }));
  const servidor = app.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try {
    await run(base, (quien) => { usuario = quien; });
  } finally {
    await new Promise((resolve, reject) => servidor.close((error) => (error ? reject(error) : resolve())));
  }
}

test("el listado de versiones es solo para administrador y expone id, número y estado", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(pool, async (base, usar) => {
      const ruta = `${base}/${edicion}/versiones`;
      usar(jurado);
      assert.equal((await fetch(ruta)).status, 403);

      usar(admin);
      const respuesta = await fetch(ruta);
      assert.equal(respuesta.status, 200);
      assert.deepEqual(await respuesta.json(), {
        items: [{ id: version, numero: 1, estado: "BORRADOR" }],
      });

      const inexistente = await fetch(`${base}/${ids.inexistente}/versiones`);
      assert.equal(inexistente.status, 404);
      assert.equal((await inexistente.json()).error, "edicion_inexistente");
    });
  });
});

test("las candidatas listan las filas del desfile en orden aunque la selección ya esté guardada", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const filas = await nominar(pool);
    const url = `/${edicion}/versiones/${version}/noches/${noche}/planilla/${especialidad}/candidatas`;
    await conServidor(pool, async (base, usar) => {
      usar(jurado);
      assert.equal((await fetch(`${base}${url}`)).status, 403);

      usar(admin);
      const sinSeleccion = await fetch(`${base}${url}`);
      assert.equal(sinSeleccion.status, 200);
      assert.deepEqual(await sinSeleccion.json(), {
        items: [
          { id: filas.alfa, rubroNombre: "Traje", comparsaNombre: "Alfa" },
          { id: filas.beta, rubroNombre: "Traje", comparsaNombre: "Beta" },
        ],
      });

      await guardarPlanillaNoche(pool, {
        edicionId: edicion, versionId: version, nocheId: noche, especialidadId: especialidad,
        actorId: admin, filaIds: [filas.beta],
      });
      const conSeleccion = await (await fetch(`${base}${url}`)).json();
      assert.deepEqual(conSeleccion.items.map(({ id }) => id), [filas.alfa, filas.beta]);

      const planilla = await (await fetch(`${base}/${edicion}/versiones/${version}/noches/${noche}/planilla/${especialidad}`)).json();
      assert.deepEqual(planilla, { configurada: true, filaIds: [filas.beta] });
    });
  });
});

test("las candidatas validan noche, versión y especialidad con sus códigos", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(pool, async (base) => {
      const casos = [
        [`/${edicion}/versiones/${version}/noches/${ids.inexistente}/planilla/${especialidad}/candidatas`, "noche_inexistente"],
        [`/${edicion}/versiones/${ids.inexistente}/noches/${noche}/planilla/${especialidad}/candidatas`, "version_inexistente"],
        [`/${edicion}/versiones/${version}/noches/${noche}/planilla/${ids.inexistente}/candidatas`, "especialidad_inexistente"],
      ];
      for (const [ruta, codigo] of casos) {
        const respuesta = await fetch(`${base}${ruta}`);
        assert.equal(respuesta.status, 404, ruta);
        assert.equal((await respuesta.json()).error, codigo);
      }
    });
  });
});
