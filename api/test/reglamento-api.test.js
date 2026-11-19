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
const otraEdicion = "10000000-0000-0000-0000-000000000026";
const versionBorrador = "30000000-0000-0000-0000-000000000001";
const versionPublicada = "30000000-0000-0000-0000-000000000002";
const especialidadUno = "40000000-0000-0000-0000-000000000001";
const especialidadDos = "40000000-0000-0000-0000-000000000003";
const especialidadAjena = "40000000-0000-0000-0000-000000000002";

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
     VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $3), ($2, 'Carnaval 2026', 2026, 'CONFIGURING', $3)`,
    [edicion, otraEdicion, admin],
  );
  await pool.query(
    `INSERT INTO version_reglamento (id, edicion_id, numero, estado, fuente, creada_por)
     VALUES ($1, $2, 1, 'BORRADOR', 'Borrador de prueba', $3)`,
    [versionBorrador, edicion, admin],
  );
  await pool.query(
    `INSERT INTO version_reglamento (id, edicion_id, numero, estado, fuente, creada_por)
     VALUES ($1, $2, 1, 'BORRADOR', 'Publicada de prueba', $3)`,
    [versionPublicada, otraEdicion, admin],
  );
  await pool.query(
    `UPDATE version_reglamento SET estado = 'PUBLICADA', publicada_por = $2, publicada_en = CURRENT_TIMESTAMP WHERE id = $1`,
    [versionPublicada, admin],
  );
  await pool.query(
    `INSERT INTO especialidad (id, edicion_id, nombre, codigo, orden)
     VALUES ($1, $4, 'Vestuario', 'J1', 1), ($2, $4, 'Batería', 'J3', 3), ($3, $5, 'Ajena', 'J9', 1)`,
    [especialidadUno, especialidadDos, especialidadAjena, edicion, otraEdicion],
  );
}

function appReglamento(pool) {
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

const rutaRubros = `/${edicion}/versiones/${versionBorrador}/rubros`;
const rutaRequisitos = `/${edicion}/versiones/${versionBorrador}/requisitos`;
const rutaPremios = `/${edicion}/versiones/${versionBorrador}/premios`;
const rutaEscala = `/${edicion}/versiones/${versionBorrador}/escala`;

async function crearRubro(base, extra = {}) {
  const respuesta = await pedir(base, rutaRubros, {
    metodo: "POST",
    cuerpo: { codigo: "R1", nombre: "Impacto visual", tipoSujeto: "CARRO", tipoRubro: "NOMINATIVO", orden: 1, ...extra },
  });
  assert.equal(respuesta.status, 201);
  return respuesta.cuerpo;
}

test("un rubro se crea, se lista y se modifica conservando el resto de sus datos", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      const creado = await crearRubro(base);
      assert.equal(creado.tipoRubro, "NOMINATIVO");
      assert.equal(creado.sumaAComparsa, true);
      assert.equal(creado.permiteNoPresentado, true);
      assert.deepEqual(creado.especialidadIds, []);

      const modificado = await pedir(base, `${rutaRubros}/${creado.id}`, {
        metodo: "PATCH",
        cuerpo: { nombre: "Impacto visual del carro" },
      });
      assert.equal(modificado.status, 200);
      assert.equal(modificado.cuerpo.nombre, "Impacto visual del carro");
      assert.equal(modificado.cuerpo.tipoSujeto, "CARRO");
      assert.equal(modificado.cuerpo.orden, 1);

      const listado = await pedir(base, rutaRubros);
      assert.equal(listado.status, 200);
      assert.equal(listado.cuerpo.items.length, 1);
    });
    const { rows } = await pool.query("SELECT operacion FROM auditoria ORDER BY operacion");
    assert.deepEqual(rows, [{ operacion: "rubro_actualizado" }, { operacion: "rubro_creado" }]);
  });
});

test("un rubro aleatorio exige su máximo de nominados y los datos inválidos se rechazan", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      const sinMaximo = await pedir(base, rutaRubros, {
        metodo: "POST",
        cuerpo: { codigo: "A1", nombre: "Mejor reina", tipoSujeto: "CARROZA_REINA", tipoRubro: "ALEATORIO", orden: 2 },
      });
      assert.equal(sinMaximo.status, 400);
      assert.equal(sinMaximo.cuerpo.error, "nominados_requeridos");

      const tipoInventado = await pedir(base, rutaRubros, {
        metodo: "POST",
        cuerpo: { codigo: "X1", nombre: "X", tipoSujeto: "OTRO", orden: 2 },
      });
      assert.equal(tipoInventado.cuerpo.error, "tipo_sujeto_invalido");

      const tipoRubro = await pedir(base, rutaRubros, {
        metodo: "POST",
        cuerpo: { codigo: "X2", nombre: "X", tipoSujeto: "CARRO", tipoRubro: "OTRO", orden: 2 },
      });
      assert.equal(tipoRubro.cuerpo.error, "tipo_rubro_invalido");

      const ok = await pedir(base, rutaRubros, {
        metodo: "POST",
        cuerpo: { codigo: "A1", nombre: "Mejor reina", tipoSujeto: "CARROZA_REINA", tipoRubro: "ALEATORIO", nominadosMaximos: 3, orden: 2 },
      });
      assert.equal(ok.status, 201);
      assert.equal(ok.cuerpo.nominadosMaximos, 3);
    });
  });
});

test("cambiar un rubro a aleatorio exige su máximo, y el rubro no cambia si se rechaza", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      const rubro = await crearRubro(base);

      const sinMaximo = await pedir(base, `${rutaRubros}/${rubro.id}`, {
        metodo: "PATCH",
        cuerpo: { tipoRubro: "ALEATORIO" },
      });
      assert.equal(sinMaximo.status, 400);
      assert.equal(sinMaximo.cuerpo.error, "nominados_requeridos");

      const sinCambio = await pedir(base, rutaRubros);
      assert.equal(sinCambio.cuerpo.items[0].tipoRubro, "NOMINATIVO");

      const conMaximo = await pedir(base, `${rutaRubros}/${rubro.id}`, {
        metodo: "PATCH",
        cuerpo: { tipoRubro: "ALEATORIO", nominadosMaximos: 4 },
      });
      assert.equal(conMaximo.status, 200);
      assert.equal(conMaximo.cuerpo.tipoRubro, "ALEATORIO");
      assert.equal(conMaximo.cuerpo.nominadosMaximos, 4);
      assert.equal(conMaximo.cuerpo.tipoSujeto, "CARRO");
    });
  });
});

test("el orden de los rubros es único por versión y se puede reordenar", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      const primero = await crearRubro(base, { codigo: "R1", orden: 1 });
      const segundo = await pedir(base, rutaRubros, {
        metodo: "POST",
        cuerpo: { codigo: "R2", nombre: "Vestuario", tipoSujeto: "TRAJE", orden: 2 },
      });

      const ordenRepetido = await pedir(base, rutaRubros, {
        metodo: "POST",
        cuerpo: { codigo: "R3", nombre: "Otro", tipoSujeto: "CARRO", orden: 1 },
      });
      assert.equal(ordenRepetido.status, 409);
      assert.equal(ordenRepetido.cuerpo.error, "orden_existente");

      const patchRepetido = await pedir(base, `${rutaRubros}/${segundo.cuerpo.id}`, {
        metodo: "PATCH",
        cuerpo: { orden: 1 },
      });
      assert.equal(patchRepetido.status, 409);
      assert.equal(patchRepetido.cuerpo.error, "orden_existente");

      const intercambio = await pedir(base, `${rutaRubros}/orden`, {
        metodo: "PUT",
        cuerpo: {
          items: [
            { rubroId: primero.id, orden: 2 },
            { rubroId: segundo.cuerpo.id, orden: 1 },
          ],
        },
      });
      assert.equal(intercambio.status, 200);
      assert.deepEqual(
        intercambio.cuerpo.items.map((rubro) => rubro.codigo),
        ["R2", "R1"],
      );
    });
  });
});

test("reordenar rechaza rubros ajenos, posiciones repetidas y versiones publicadas", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      const rubro = await crearRubro(base, { codigo: "R1", orden: 1 });
      const ruta = `${rutaRubros}/orden`;

      const ajeno = await pedir(base, ruta, {
        metodo: "PUT",
        cuerpo: { items: [{ rubroId: "40000000-0000-0000-0000-00000000ffff", orden: 1 }] },
      });
      assert.equal(ajeno.status, 404);
      assert.equal(ajeno.cuerpo.error, "rubro_inexistente");

      const repetidas = await pedir(base, ruta, {
        metodo: "PUT",
        cuerpo: {
          items: [
            { rubroId: rubro.id, orden: 1 },
            { rubroId: rubro.id, orden: 2 },
          ],
        },
      });
      assert.equal(repetidas.cuerpo.error, "rubros_duplicados");

      const posicionRepetida = await pedir(base, ruta, {
        metodo: "PUT",
        cuerpo: {
          items: [
            { rubroId: rubro.id, orden: 3 },
            { rubroId: "40000000-0000-0000-0000-00000000ffff", orden: 3 },
          ],
        },
      });
      assert.equal(posicionRepetida.cuerpo.error, "orden_existente");

      const rubrosIgual = await pedir(base, rutaRubros);
      assert.equal(rubrosIgual.cuerpo.items[0].orden, 1);
    });
  });
});

test("el código de un rubro no se repite dentro de la versión", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      await crearRubro(base);
      const repetido = await pedir(base, rutaRubros, {
        metodo: "POST",
        cuerpo: { codigo: "R1", nombre: "Otro", tipoSujeto: "CARRO", orden: 2 },
      });
      assert.equal(repetido.status, 409);
      assert.equal(repetido.cuerpo.error, "codigo_existente");
    });
  });
});

test("las especialidades de un rubro son de la misma edición y se reemplazan completas", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      const rubro = await crearRubro(base);
      const ruta = `${rutaRubros}/${rubro.id}/especialidades`;

      const primera = await pedir(base, ruta, {
        metodo: "PUT",
        cuerpo: { especialidadIds: [especialidadUno, especialidadDos] },
      });
      assert.equal(primera.status, 200);
      assert.equal(primera.cuerpo.especialidadIds.length, 2);

      const reemplazo = await pedir(base, ruta, {
        metodo: "PUT",
        cuerpo: { especialidadIds: [especialidadUno] },
      });
      assert.deepEqual(reemplazo.cuerpo.especialidadIds, [especialidadUno]);

      const ajena = await pedir(base, ruta, {
        metodo: "PUT",
        cuerpo: { especialidadIds: [especialidadAjena] },
      });
      assert.equal(ajena.status, 404);
      assert.equal(ajena.cuerpo.error, "referencia_inexistente");

      const duplicada = await pedir(base, ruta, {
        metodo: "PUT",
        cuerpo: { especialidadIds: [especialidadUno, especialidadUno] },
      });
      assert.equal(duplicada.cuerpo.error, "especialidades_duplicadas");
    });
  });
});

test("un rubro con especialidades asignadas no se borra", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      const rubro = await crearRubro(base);
      await pedir(base, `${rutaRubros}/${rubro.id}/especialidades`, {
        metodo: "PUT",
        cuerpo: { especialidadIds: [especialidadUno] },
      });

      const borrado = await pedir(base, `${rutaRubros}/${rubro.id}`, { metodo: "DELETE" });
      assert.equal(borrado.status, 409);
      assert.equal(borrado.cuerpo.error, "con_dependencias");
    });
  });
});

test("la escala es una por versión y su máximo no es menor que su mínimo", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      const vacia = await pedir(base, rutaEscala);
      assert.equal(vacia.cuerpo, null);

      const invalida = await pedir(base, rutaEscala, { metodo: "PUT", cuerpo: { minimo: 5, maximo: 1 } });
      assert.equal(invalida.status, 400);
      assert.equal(invalida.cuerpo.error, "escala_invalida");

      const guardada = await pedir(base, rutaEscala, { metodo: "PUT", cuerpo: { minimo: 1, maximo: 5 } });
      assert.equal(guardada.status, 200);

      const reemplazada = await pedir(base, rutaEscala, { metodo: "PUT", cuerpo: { minimo: 1, maximo: 5 } });
      assert.equal(reemplazada.status, 200);

      const leida = await pedir(base, rutaEscala);
      assert.deepEqual(leida.cuerpo, { minimo: 1, maximo: 5 });
    });
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM escala_puntaje_version");
    assert.equal(rows[0].n, 1);
  });
});

test("los requisitos no puntúan salvo que el administrador lo indique", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      const creado = await pedir(base, rutaRequisitos, {
        metodo: "POST",
        cuerpo: { codigo: "REINA", nombre: "Reina de Comparsa", cantidadMinima: 1, orden: 1 },
      });
      assert.equal(creado.status, 201);
      assert.equal(creado.cuerpo.puedePuntuar, false);

      const puntua = await pedir(base, `${rutaRequisitos}/${creado.cuerpo.id}`, {
        metodo: "PATCH",
        cuerpo: { puedePuntuar: true },
      });
      assert.equal(puntua.cuerpo.puedePuntuar, true);
      assert.equal(puntua.cuerpo.cantidadMinima, 1);

      const invalido = await pedir(base, rutaRequisitos, {
        metodo: "POST",
        cuerpo: { codigo: "C2", nombre: "Cinco grupos", cantidadMinima: 0, orden: 2 },
      });
      assert.equal(invalido.cuerpo.error, "cantidad_minima_invalida");
    });
  });
});

test("los premios validan su modalidad y no repiten nombre en la versión", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      const modalidad = await pedir(base, rutaPremios, {
        metodo: "POST",
        cuerpo: { nombre: "Mejor carro", modalidad: "MIXTA", orden: 1 },
      });
      assert.equal(modalidad.cuerpo.error, "modalidad_invalida");

      const creado = await pedir(base, rutaPremios, {
        metodo: "POST",
        cuerpo: { nombre: "Mejor carro", modalidad: "INDIVIDUAL", orden: 1 },
      });
      assert.equal(creado.status, 201);

      const repetido = await pedir(base, rutaPremios, {
        metodo: "POST",
        cuerpo: { nombre: "Mejor carro", modalidad: "GRUPAL", orden: 2 },
      });
      assert.equal(repetido.status, 409);
      assert.equal(repetido.cuerpo.error, "nombre_existente");
    });
  });
});

test("con la versión publicada no se escribe, pero sí se consulta", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      const rutaPublicada = `/${otraEdicion}/versiones/${versionPublicada}`;
      const rubro = await pedir(base, `${rutaPublicada}/rubros`, {
        metodo: "POST",
        cuerpo: { codigo: "R1", nombre: "Tarde", tipoSujeto: "CARRO", orden: 1 },
      });
      assert.equal(rubro.status, 409);
      assert.equal(rubro.cuerpo.error, "version_no_borrador");

      const escala = await pedir(base, `${rutaPublicada}/escala`, {
        metodo: "PUT",
        cuerpo: { minimo: 1, maximo: 5 },
      });
      assert.equal(escala.cuerpo.error, "version_no_borrador");

      const listado = await pedir(base, `${rutaPublicada}/rubros`);
      assert.equal(listado.status, 200);

      const rubroPublicable = await crearRubro(base, { codigo: "P1", orden: 1 });
      await pool.query(
        `UPDATE version_reglamento SET estado = 'PUBLICADA', publicada_por = $2, publicada_en = CURRENT_TIMESTAMP WHERE id = $1`,
        [versionBorrador, admin],
      );
      const reordenada = await pedir(base, `${rutaRubros}/orden`, {
        metodo: "PUT",
        cuerpo: { items: [{ rubroId: rubroPublicable.id, orden: 2 }] },
      });
      assert.equal(reordenada.status, 409);
      assert.equal(reordenada.cuerpo.error, "version_no_borrador");
    });
  });
});

test("una versión ajena responde 404 y sin administrador no se opera", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      const ajena = await pedir(base, `/${otraEdicion}/versiones/${versionBorrador}/rubros`);
      assert.equal(ajena.status, 404);
      assert.equal(ajena.cuerpo.error, "version_inexistente");

      const sinSesion = await pedir(base, rutaRubros, {
        metodo: "POST",
        usuario: null,
        cuerpo: { codigo: "R1", nombre: "X", tipoSujeto: "CARRO", orden: 1 },
      });
      assert.equal(sinSesion.status, 401);

      const comoJurado = await pedir(base, rutaRubros, {
        metodo: "POST",
        usuario: jurado,
        cuerpo: { codigo: "R1", nombre: "X", tipoSujeto: "CARRO", orden: 1 },
      });
      assert.equal(comoJurado.status, 403);
    });
  });
});
