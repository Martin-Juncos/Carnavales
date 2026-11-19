import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasAdminReglamento } from "../src/admin-reglamento.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const jurado = "u-jurado";
const edicion = "10000000-0000-0000-0000-000000000027";
const version = "30000000-0000-0000-0000-000000000001";
const anterior = "30000000-0000-0000-0000-000000000002";
const especialidad = "40000000-0000-0000-0000-000000000001";
const otraEspecialidad = "40000000-0000-0000-0000-000000000003";
const comparsa = "50000000-0000-0000-0000-000000000001";
const sujeto = "60000000-0000-0000-0000-000000000001";
const rubro = "70000000-0000-0000-0000-000000000001";

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
     VALUES ($1, $2, 2, 'BORRADOR', 'Anterior', $3)`,
    [anterior, edicion, admin],
  );
  await pool.query(
    `UPDATE version_reglamento SET estado = 'PUBLICADA', publicada_por = $2, publicada_en = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [anterior, admin],
  );
  await pool.query(
    `INSERT INTO version_reglamento (id, edicion_id, numero, estado, fuente, creada_por)
     VALUES ($1, $2, 1, 'BORRADOR', 'Nueva', $3)`,
    [version, edicion, admin],
  );
  await pool.query(
    `INSERT INTO especialidad (id, edicion_id, nombre, codigo, orden)
     VALUES ($1, $3, 'Vestuario', 'J1', 1), ($2, $3, 'Batería', 'J3', 3)`,
    [especialidad, otraEspecialidad, edicion],
  );
  await pool.query(
    `INSERT INTO comparsa (id, edicion_id, nombre, categoria)
     VALUES ($1, $2, 'Alfa', 'PRIMERA')`,
    [comparsa, edicion],
  );
}

function appPublicacion(pool) {
  const app = express();
  app.use(
    "/api/admin/ediciones",
    crearRutasAdminReglamento({
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

async function pedir(base, ruta, { metodo = "GET", usuario = admin, cuerpo } = {}) {
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

const prefijo = `/${edicion}/versiones/${version}`;

async function configurarRubro(pool) {
  await pool.query(
    `INSERT INTO rubro_version (id, version_id, edicion_id, codigo, nombre, tipo_sujeto, orden)
     VALUES ($1, $2, $3, 'R1', 'Carro', 'CARRO', 1)`,
    [rubro, version, edicion],
  );
  await pool.query(
    `INSERT INTO rubro_especialidad (rubro_version_id, especialidad_id, edicion_id)
     VALUES ($1, $2, $3)`,
    [rubro, especialidad, edicion],
  );
}

test("el checklist identifica escala faltante y especialidades vacías; no publica", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await configurarRubro(pool);
    await conServidor(appPublicacion(pool), async (base) => {
      const checklist = await pedir(base, `${prefijo}/checklist-publicacion`);
      assert.equal(checklist.status, 200);
      assert.ok(checklist.cuerpo.bloqueantes.some((item) => item.codigo === "escala_inexistente"));
      assert.ok(checklist.cuerpo.advertencias.some((item) => item.codigo === "especialidad_sin_rubros"));

      const publicada = await pedir(base, `${prefijo}/publicar`, { metodo: "POST" });
      assert.equal(publicada.status, 409);
      assert.equal(publicada.cuerpo.error, "publicacion_con_bloqueantes");
    });
    const { rows } = await pool.query("SELECT estado FROM version_reglamento WHERE id = $1", [version]);
    assert.equal(rows[0].estado, "BORRADOR");
  });
});

test("publicar supersede la versión anterior y audita atómicamente", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      "INSERT INTO escala_puntaje_version (version_id, edicion_id, minimo, maximo) VALUES ($1, $2, 1, 5)",
      [version, edicion],
    );
    await configurarRubro(pool);
    await conServidor(appPublicacion(pool), async (base) => {
      const publicada = await pedir(base, `${prefijo}/publicar`, { metodo: "POST" });
      assert.equal(publicada.status, 200);
      assert.equal(publicada.cuerpo.estado, "PUBLICADA");
      assert.equal(publicada.cuerpo.resumen.rubros, 1);
      assert.equal(publicada.cuerpo.resumen.comparsas, 1);

      const repetida = await pedir(base, `${prefijo}/publicar`, { metodo: "POST" });
      assert.equal(repetida.status, 409);
      assert.equal(repetida.cuerpo.error, "version_no_borrador");
    });

    const { rows: estados } = await pool.query("SELECT id, estado FROM version_reglamento ORDER BY numero");
    assert.deepEqual(estados, [
      { id: version, estado: "PUBLICADA" },
      { id: anterior, estado: "SUPERSEDIDA" },
    ]);
    const { rows: auditoria } = await pool.query("SELECT operacion, entidad_id FROM auditoria");
    assert.deepEqual(auditoria, [{ operacion: "version_reglamento_publicada", entidad_id: version }]);
  });
});

test("publicaciones concurrentes del mismo borrador solo permiten una transición", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      "INSERT INTO escala_puntaje_version (version_id, edicion_id, minimo, maximo) VALUES ($1, $2, 1, 5)",
      [version, edicion],
    );
    await configurarRubro(pool);
    await conServidor(appPublicacion(pool), async (base) => {
      const respuestas = await Promise.all([
        pedir(base, `${prefijo}/publicar`, { metodo: "POST" }),
        pedir(base, `${prefijo}/publicar`, { metodo: "POST" }),
      ]);
      assert.deepEqual(respuestas.map((respuesta) => respuesta.status).sort(), [200, 409]);
    });

    const { rows: publicadas } = await pool.query(
      "SELECT count(*)::int AS n FROM version_reglamento WHERE edicion_id = $1 AND estado = 'PUBLICADA'",
      [edicion],
    );
    assert.equal(publicadas[0].n, 1);
    const { rows: auditoria } = await pool.query(
      "SELECT count(*)::int AS n FROM auditoria WHERE operacion = 'version_reglamento_publicada'",
    );
    assert.equal(auditoria[0].n, 1);
  });
});

test("la vista previa agrupa por especialidad y comparsa y nunca incluye puntajes", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await configurarRubro(pool);
    await pool.query(
      `INSERT INTO sujeto_evaluable (id, edicion_id, comparsa_id, tipo_sujeto, nombre)
       VALUES ($1, $2, $3, 'CARRO', 'Carro alegórico')`,
      [sujeto, edicion, comparsa],
    );
    await pool.query(
      `INSERT INTO objetivo_rubro (edicion_id, rubro_version_id, sujeto_id, especialidad_id, origen, orden)
       VALUES ($1, $2, $3, $4, 'GENERADA', 1)`,
      [edicion, rubro, sujeto, especialidad],
    );

    await conServidor(appPublicacion(pool), async (base) => {
      const previa = await pedir(base, `${prefijo}/vista-previa`);
      assert.equal(previa.status, 200);
      assert.equal(previa.cuerpo.grupos.length, 1);
      assert.equal(previa.cuerpo.grupos[0].especialidad.codigo, "J1");
      assert.equal(previa.cuerpo.grupos[0].comparsa.nombre, "Alfa");
      assert.equal(previa.cuerpo.grupos[0].filas[0].rubro, "Carro");
      assert.equal(JSON.stringify(previa.cuerpo).includes("puntaje"), false);
      assert.equal(JSON.stringify(previa.cuerpo).includes("nota"), false);
    });
  });
});

test("no administrador no puede consultar ni publicar la versión", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appPublicacion(pool), async (base) => {
      const sinSesion = await pedir(base, `${prefijo}/checklist-publicacion`, { usuario: null });
      assert.equal(sinSesion.status, 401);
      const comoJurado = await pedir(base, `${prefijo}/publicar`, { metodo: "POST", usuario: jurado });
      assert.equal(comoJurado.status, 403);
    });
  });
});
