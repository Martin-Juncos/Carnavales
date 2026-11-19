import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasAdminPlanilla } from "../src/admin-planilla.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Verifica las filas de planilla: generación, nominaciones con topes, exclusiones y congelación.
// Requiere TEST_DATABASE_URL apuntando a una base descartable.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const jurado = "u-jurado";
const edicion = "10000000-0000-0000-0000-000000000027";
const version = "30000000-0000-0000-0000-000000000001";
const j1 = "40000000-0000-0000-0000-000000000001";
const j3 = "40000000-0000-0000-0000-000000000003";

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
     VALUES ($1, $3, 'Vestuario', 'J1', 1), ($2, $3, 'Batería', 'J3', 3)`,
    [j1, j3, edicion],
  );
  await pool.query(
    `INSERT INTO noche (edicion_id, orden, nombre, tipo) VALUES ($1, 1, 'Primera', 'COMPETENCIA')`,
    [edicion],
  );
}

// Dos comparsas: C1 con un carro y dos carrozas; C2 con una carroza.
async function padron(pool) {
  const { rows: [c1] } = await pool.query(
    `INSERT INTO comparsa (edicion_id, nombre, categoria) VALUES ($1, 'Alfa', 'PRIMERA') RETURNING id`,
    [edicion],
  );
  const { rows: [c2] } = await pool.query(
    `INSERT INTO comparsa (edicion_id, nombre, categoria) VALUES ($1, 'Beta', 'PRIMERA') RETURNING id`,
    [edicion],
  );
  const { rows: [carro] } = await pool.query(
    `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, nombre)
     VALUES ($1, $2, 'CARRO', 'Carro alegórico') RETURNING id`,
    [edicion, c1.id],
  );
  const { rows: [reinaA] } = await pool.query(
    `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, nombre)
     VALUES ($1, $2, 'CARROZA_REINA', 'Reina A') RETURNING id`,
    [edicion, c1.id],
  );
  const { rows: [reinaB] } = await pool.query(
    `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, nombre)
     VALUES ($1, $2, 'CARROZA_REINA', 'Reina B') RETURNING id`,
    [edicion, c1.id],
  );
  const { rows: [reinaC] } = await pool.query(
    `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, nombre)
     VALUES ($1, $2, 'CARROZA_REINA', 'Reina C') RETURNING id`,
    [edicion, c2.id],
  );
  return { carro: carro.id, reinaA: reinaA.id, reinaB: reinaB.id, reinaC: reinaC.id };
}

// Rubros: CARRO nominativo en J1 y J3; REINA aleatorio con tope de 1 en la edición;
// REINA_COMPARSA aleatorio con tope de 5 en la edición y 1 por comparsa.
async function rubros(pool) {
  const { rows: [carro] } = await pool.query(
    `INSERT INTO rubro_version (version_id, edicion_id, codigo, nombre, tipo_sujeto, tipo_rubro, orden)
     VALUES ($1, $2, 'CARRO', 'Impacto visual', 'CARRO', 'NOMINATIVO', 1) RETURNING id`,
    [version, edicion],
  );
  const { rows: [reina] } = await pool.query(
    `INSERT INTO rubro_version (version_id, edicion_id, codigo, nombre, tipo_sujeto, tipo_rubro, nominados_maximos, orden)
     VALUES ($1, $2, 'REINA', 'Mejor reina', 'CARROZA_REINA', 'ALEATORIO', 1, 2) RETURNING id`,
    [version, edicion],
  );
  const { rows: [reinaComparsa] } = await pool.query(
    `INSERT INTO rubro_version (version_id, edicion_id, codigo, nombre, tipo_sujeto, tipo_rubro, nominados_maximos, nominados_maximos_por_comparsa, orden)
     VALUES ($1, $2, 'REINA2', 'Reina por comparsa', 'CARROZA_REINA', 'ALEATORIO', 5, 1, 3) RETURNING id`,
    [version, edicion],
  );
  for (const rubro of [carro.id, reina.id, reinaComparsa.id]) {
    await pool.query(
      `INSERT INTO rubro_especialidad (rubro_version_id, especialidad_id, edicion_id)
       VALUES ($1, $2, $3), ($1, $4, $3)`,
      [rubro, j1, edicion, j3],
    );
  }
  return { carro: carro.id, reina: reina.id, reinaComparsa: reinaComparsa.id };
}

function appPlanilla(pool) {
  const app = express();
  app.use(
    "/api/admin/ediciones",
    crearRutasAdminPlanilla({
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

const base0 = `/${edicion}/versiones/${version}`;

test("generar filas crea cada combinación de nominativo, sin duplicar ni tocar las excluidas", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const sujetos = await padron(pool);
    const r = await rubros(pool);
    await conServidor(appPlanilla(pool), async (base) => {
      const primera = await pedir(base, `${base0}/planilla/generar`, { metodo: "POST" });
      assert.equal(primera.status, 200);
      assert.equal(primera.cuerpo.insertadas, 2, "carro en J1 y en J3");

      const excluida = await pool.query(
        "SELECT id FROM objetivo_rubro WHERE rubro_version_id = $1 AND especialidad_id = $2",
        [r.carro, j1],
      );
      await pedir(base, `${base0}/planilla/${excluida.rows[0].id}`, {
        metodo: "PATCH",
        cuerpo: { excluida: true },
      });

      const segunda = await pedir(base, `${base0}/planilla/generar`, { metodo: "POST" });
      assert.equal(segunda.cuerpo.insertadas, 0, "la regeneración no vuelve a crear ni duplica");

      const listado = await pedir(base, `${base0}/planilla`);
      assert.equal(listado.cuerpo.items.length, 2);
      assert.ok(listado.cuerpo.items.every((fila) => fila.origen === "GENERADA"));
      assert.ok(listado.cuerpo.items.some((fila) => fila.sujetoId === sujetos.carro && fila.excluida));
    });
  });
});

test("el mismo sujeto nominado en dos especialidades cuenta una vez para el tope", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const sujetos = await padron(pool);
    const r = await rubros(pool);
    await conServidor(appPlanilla(pool), async (base) => {
      const enJ1 = await pedir(base, `${base0}/rubros/${r.reina}/nominaciones`, {
        metodo: "POST",
        cuerpo: { sujetoId: sujetos.reinaA, especialidadId: j1 },
      });
      assert.equal(enJ1.status, 201);
      assert.equal(enJ1.cuerpo.origen, "MANUAL");

      const enJ3 = await pedir(base, `${base0}/rubros/${r.reina}/nominaciones`, {
        metodo: "POST",
        cuerpo: { sujetoId: sujetos.reinaA, especialidadId: j3 },
      });
      assert.equal(enJ3.status, 201, "el mismo sujeto puede estar en dos especialidades dentro del tope");

      const otra = await pedir(base, `${base0}/rubros/${r.reina}/nominaciones`, {
        metodo: "POST",
        cuerpo: { sujetoId: sujetos.reinaB, especialidadId: j1 },
      });
      assert.equal(otra.status, 409);
      assert.equal(otra.cuerpo.error, "nominados_excedidos");
    });
  });
});

test("el tope por comparsa se aplica a nominaciones manuales de esa comparsa", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const sujetos = await padron(pool);
    const r = await rubros(pool);
    await conServidor(appPlanilla(pool), async (base) => {
      const primera = await pedir(base, `${base0}/rubros/${r.reinaComparsa}/nominaciones`, {
        metodo: "POST",
        cuerpo: { sujetoId: sujetos.reinaA, especialidadId: j1 },
      });
      assert.equal(primera.status, 201);

      const segundaMismaComparsa = await pedir(base, `${base0}/rubros/${r.reinaComparsa}/nominaciones`, {
        metodo: "POST",
        cuerpo: { sujetoId: sujetos.reinaB, especialidadId: j1 },
      });
      assert.equal(segundaMismaComparsa.status, 409);
      assert.equal(segundaMismaComparsa.cuerpo.error, "nominados_comparsa_excedidos");

      const otraComparsa = await pedir(base, `${base0}/rubros/${r.reinaComparsa}/nominaciones`, {
        metodo: "POST",
        cuerpo: { sujetoId: sujetos.reinaC, especialidadId: j1 },
      });
      assert.equal(otraComparsa.status, 201);
    });
  });
});

test("excluir una nominación libera su lugar en el tope", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const sujetos = await padron(pool);
    const r = await rubros(pool);
    await conServidor(appPlanilla(pool), async (base) => {
      const nominada = await pedir(base, `${base0}/rubros/${r.reina}/nominaciones`, {
        metodo: "POST",
        cuerpo: { sujetoId: sujetos.reinaA, especialidadId: j1 },
      });
      await pedir(base, `${base0}/planilla/${nominada.cuerpo.id}`, {
        metodo: "PATCH",
        cuerpo: { excluida: true },
      });

      const reemplazo = await pedir(base, `${base0}/rubros/${r.reina}/nominaciones`, {
        metodo: "POST",
        cuerpo: { sujetoId: sujetos.reinaB, especialidadId: j1 },
      });
      assert.equal(reemplazo.status, 201);
    });
  });
});

test("una nominación solo se hace en rubros aleatorios y con un sujeto del tipo del rubro", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const sujetos = await padron(pool);
    const r = await rubros(pool);
    await conServidor(appPlanilla(pool), async (base) => {
      const noAleatorio = await pedir(base, `${base0}/rubros/${r.carro}/nominaciones`, {
        metodo: "POST",
        cuerpo: { sujetoId: sujetos.carro, especialidadId: j1 },
      });
      assert.equal(noAleatorio.status, 409);
      assert.equal(noAleatorio.cuerpo.error, "rubro_no_aleatorio");

      const tipoIncorrecto = await pedir(base, `${base0}/rubros/${r.reina}/nominaciones`, {
        metodo: "POST",
        cuerpo: { sujetoId: sujetos.carro, especialidadId: j1 },
      });
      assert.equal(tipoIncorrecto.status, 409);
      assert.equal(tipoIncorrecto.cuerpo.error, "sujeto_no_corresponde");
    });
  });
});

test("las filas generadas no se borran; solo las nominaciones manuales", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await padron(pool);
    await rubros(pool);
    await conServidor(appPlanilla(pool), async (base) => {
      await pedir(base, `${base0}/planilla/generar`, { metodo: "POST" });
      const { rows: [generada] } = await pool.query("SELECT id FROM objetivo_rubro LIMIT 1");

      const borrarGenerada = await pedir(base, `${base0}/planilla/${generada.id}`, { metodo: "DELETE" });
      assert.equal(borrarGenerada.status, 409);
      assert.equal(borrarGenerada.cuerpo.error, "solo_manual_se_borra");
    });
  });
});

test("al regenerar, las filas nuevas continúan el orden y no repiten posiciones", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await padron(pool);
    await rubros(pool);
    await conServidor(appPlanilla(pool), async (base) => {
      await pedir(base, `${base0}/planilla/generar`, { metodo: "POST" });
      await pool.query(
        `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, nombre)
         SELECT $1, id, 'CARRO', 'Carro nuevo' FROM comparsa WHERE nombre = 'Beta'`,
        [edicion],
      );
      const segunda = await pedir(base, `${base0}/planilla/generar`, { metodo: "POST" });
      assert.equal(segunda.cuerpo.insertadas, 2);

      const listado = await pedir(base, `${base0}/planilla`);
      const ordenesJ1 = listado.cuerpo.items
        .filter((fila) => fila.especialidadCodigo === "J1" && fila.rubroCodigo === "CARRO")
        .map((fila) => fila.orden);
      assert.deepEqual(ordenesJ1, [1, 2], "el nuevo carro ocupa la posición siguiente");
    });
  });
});

test("con la versión publicada solo se nominan manuales; las filas generadas no cambian", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const sujetos = await padron(pool);
    const r = await rubros(pool);
    await conServidor(appPlanilla(pool), async (base) => {
      await pedir(base, `${base0}/planilla/generar`, { metodo: "POST" });
      const nominada = await pedir(base, `${base0}/rubros/${r.reina}/nominaciones`, {
        metodo: "POST",
        cuerpo: { sujetoId: sujetos.reinaA, especialidadId: j1 },
      });
      const { rows: [generada] } = await pool.query("SELECT id FROM objetivo_rubro WHERE origen = 'GENERADA' LIMIT 1");

      await pool.query(
        `UPDATE version_reglamento SET estado = 'PUBLICADA', publicada_por = $2, publicada_en = CURRENT_TIMESTAMP WHERE id = $1`,
        [version, admin],
      );

      const generar = await pedir(base, `${base0}/planilla/generar`, { metodo: "POST" });
      assert.equal(generar.status, 409);
      assert.equal(generar.cuerpo.error, "version_no_borrador");

      const excluirGenerada = await pedir(base, `${base0}/planilla/${generada.id}`, {
        metodo: "PATCH",
        cuerpo: { excluida: true },
      });
      assert.equal(excluirGenerada.status, 409);
      assert.equal(excluirGenerada.cuerpo.error, "version_no_borrador");

      const excluirNominada = await pedir(base, `${base0}/planilla/${nominada.cuerpo.id}`, {
        metodo: "PATCH",
        cuerpo: { excluida: true },
      });
      assert.equal(excluirNominada.status, 200, "la nominación manual sí se puede cambiar (H11)");
    });
  });
});

test("un identificador mal formado responde 404 y no un error interno", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appPlanilla(pool), async (base) => {
      const version = await pedir(base, `/${edicion}/versiones/no-es-uuid/planilla`);
      assert.equal(version.status, 404);
      assert.equal(version.cuerpo.error, "version_inexistente");

      const fila = await pedir(base, `${base0}/planilla/abc`, { metodo: "PATCH", cuerpo: { excluida: true } });
      assert.equal(fila.status, 404);
      assert.equal(fila.cuerpo.error, "fila_inexistente");
    });
  });
});

test("con una noche abierta el padrón de planilla queda congelado", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const sujetos = await padron(pool);
    const r = await rubros(pool);
    await pool.query("UPDATE noche SET estado = 'OPEN', abierta_en = CURRENT_TIMESTAMP WHERE edicion_id = $1", [edicion]);
    await conServidor(appPlanilla(pool), async (base) => {
      const nominacion = await pedir(base, `${base0}/rubros/${r.reina}/nominaciones`, {
        metodo: "POST",
        cuerpo: { sujetoId: sujetos.reinaA, especialidadId: j1 },
      });
      assert.equal(nominacion.status, 409);
      assert.equal(nominacion.cuerpo.error, "padron_congelado");
    });
  });
});
