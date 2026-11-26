import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasAdminPadron } from "../../../src/modules/padron/admin-padron.routes.js";
import { withIsolatedSchema } from "../../helpers/isolated-schema.js";

// Integrantes de un sujeto GRUPO y representación de los sujetos (migración 0034).
// Requieren TEST_DATABASE_URL (base descartable); sin ella se omiten.

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const edicion = "10000000-0000-0000-0000-000000000027";
const comparsa = "70000000-0000-0000-0000-000000000001";
const participanteAna = "60000000-0000-0000-0000-000000000001";
const participanteLuz = "60000000-0000-0000-0000-000000000002";

async function preparar(pool) {
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Admin', 'admin@example.test', true)`,
    [admin],
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT $1, r.id, $1, false FROM rol r WHERE r.codigo = 'ADMINISTRADOR'`,
    [admin],
  );
  await pool.query(
    `INSERT INTO edicion (id, nombre, anio, estado, creada_por)
     VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $2)`,
    [edicion, admin],
  );
  await pool.query(
    `INSERT INTO comparsa (id, edicion_id, nombre, categoria, activa)
     VALUES ($1, $2, 'Poramba', 'PRIMERA', true)`,
    [comparsa, edicion],
  );
  await pool.query(
    `INSERT INTO participante (id, edicion_id, nombre_completo, es_menor, activo)
     VALUES ($1, $3, 'Ana Gómez', false, true), ($2, $3, 'Luz Silva', false, true)`,
    [participanteAna, participanteLuz, edicion],
  );
}

function appPadron(pool) {
  const app = express();
  app.use(
    "/api/admin/ediciones",
    crearRutasAdminPadron({
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

async function pedir(base, ruta, { metodo = "GET", cuerpo } = {}) {
  const cabeceras = { "x-usuario-prueba": admin };
  if (cuerpo !== undefined) cabeceras["content-type"] = "application/json";
  const respuesta = await fetch(`${base}/api/admin/ediciones${ruta}`, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  return { status: respuesta.status, cuerpo: texto === "" ? null : JSON.parse(texto) };
}

const rutaSujetos = `/${edicion}/comparsas/${comparsa}/sujetos`;

async function crearSujeto(base, tipoSujeto, nombre, extra = {}) {
  const respuesta = await pedir(base, rutaSujetos, { metodo: "POST", cuerpo: { tipoSujeto, nombre, ...extra } });
  assert.equal(respuesta.status, 201);
  return respuesta.cuerpo;
}

test("un grupo admite integrantes: se agregan, se listan y se quitan", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appPadron(pool), async (base) => {
      const grupo = await crearSujeto(base, "GRUPO", "Gladiadores");
      const rutaIntegrantes = `/${edicion}/sujetos/${grupo.id}/integrantes`;

      const agregado = await pedir(base, rutaIntegrantes, { metodo: "POST", cuerpo: { participanteId: participanteAna } });
      assert.equal(agregado.status, 201);

      const listado = await pedir(base, rutaIntegrantes);
      assert.deepEqual(listado.cuerpo.items, [{ participanteId: participanteAna, nombreCompleto: "Ana Gómez" }]);

      const quitado = await pedir(base, `${rutaIntegrantes}/${participanteAna}`, { metodo: "DELETE" });
      assert.equal(quitado.status, 204);
      assert.deepEqual((await pedir(base, rutaIntegrantes)).cuerpo.items, []);
    });
  });
});

test("solo un sujeto GRUPO admite integrantes", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appPadron(pool), async (base) => {
      const carro = await crearSujeto(base, "CARRO", "Carro 1: Templo");
      const respuesta = await pedir(base, `/${edicion}/sujetos/${carro.id}/integrantes`, {
        metodo: "POST", cuerpo: { participanteId: participanteAna },
      });
      assert.equal(respuesta.status, 409);
      assert.equal(respuesta.cuerpo.error, "sujeto_no_grupo");
    });
  });
});

test("un integrante no se repite en el mismo grupo", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appPadron(pool), async (base) => {
      const grupo = await crearSujeto(base, "GRUPO", "Gladiadores");
      const rutaIntegrantes = `/${edicion}/sujetos/${grupo.id}/integrantes`;
      await pedir(base, rutaIntegrantes, { metodo: "POST", cuerpo: { participanteId: participanteAna } });

      const repetido = await pedir(base, rutaIntegrantes, { metodo: "POST", cuerpo: { participanteId: participanteAna } });
      assert.equal(repetido.status, 409);
      assert.equal(repetido.cuerpo.error, "integrante_ya_en_grupo");
    });
  });
});

test("la representación se guarda, se limpia y tiene un máximo", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appPadron(pool), async (base) => {
      const carro = await crearSujeto(base, "CARRO", "Carro 1: Templo", { representacion: "  Templo egipcio  " });
      assert.equal(carro.representacion, "Templo egipcio");

      const limpiada = await pedir(base, `/${edicion}/sujetos/${carro.id}`, { metodo: "PATCH", cuerpo: { representacion: "" } });
      assert.equal(limpiada.cuerpo.representacion, null);

      const demasiado = await pedir(base, `/${edicion}/sujetos/${carro.id}`, {
        metodo: "PATCH", cuerpo: { representacion: "x".repeat(1001) },
      });
      assert.equal(demasiado.status, 400);
      assert.equal(demasiado.cuerpo.error, "representacion_invalida");
    });
  });
});

test("eliminar la edición borra también los integrantes de sus grupos", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appPadron(pool), async (base) => {
      const grupo = await crearSujeto(base, "GRUPO", "Gladiadores");
      await pedir(base, `/${edicion}/sujetos/${grupo.id}/integrantes`, {
        metodo: "POST", cuerpo: { participanteId: participanteLuz },
      });
    });

    await pool.query("SELECT eliminar_edicion_completa($1::uuid, $2::text)", [edicion, admin]);

    const { rows: [{ integrantes }] } = await pool.query(
      "SELECT count(*)::int AS integrantes FROM integrante_grupo WHERE edicion_id = $1",
      [edicion],
    );
    assert.equal(integrantes, 0);
  });
});
