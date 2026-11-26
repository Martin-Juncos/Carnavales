import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasAdminReglamento } from "../../../src/modules/reglamento/admin-reglamento.routes.js";
import { withIsolatedSchema } from "../../helpers/isolated-schema.js";

// Pruebas de categorías del reglamento: se crean por nombre dentro de la versión en borrador,
// los rubros se asignan a una categoría y el borrado completo de la edición las incluye.
// Requieren TEST_DATABASE_URL (base descartable); sin ella se omiten.

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const edicion = "10000000-0000-0000-0000-000000000027";
const versionBorrador = "30000000-0000-0000-0000-000000000001";
const categoriaAjena = "50000000-0000-0000-0000-000000000099";

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
    `INSERT INTO version_reglamento (id, edicion_id, numero, estado, fuente, creada_por)
     VALUES ($1, $2, 1, 'BORRADOR', 'Borrador de prueba', $3)`,
    [versionBorrador, edicion, admin],
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

const rutaCategorias = `/${edicion}/versiones/${versionBorrador}/categorias`;
const rutaRubros = `/${edicion}/versiones/${versionBorrador}/rubros`;

test("una categoría se crea por nombre y agrupa los rubros de la versión", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      const categoria = await pedir(base, rutaCategorias, { metodo: "POST", cuerpo: { nombre: "Reina", orden: 1 } });
      assert.equal(categoria.status, 201);
      assert.equal(categoria.cuerpo.nombre, "Reina");

      const rubro = await pedir(base, rutaRubros, {
        metodo: "POST",
        cuerpo: {
          codigo: "REINA_COMPARSAS", nombre: "Reina de Comparsas", tipoSujeto: "PERSONA",
          tipoRubro: "NOMINATIVO", orden: 1, categoriaId: categoria.cuerpo.id,
        },
      });
      assert.equal(rubro.status, 201);
      assert.equal(rubro.cuerpo.categoriaId, categoria.cuerpo.id);

      // Cambiar otro campo del rubro conserva su categoría.
      const modificado = await pedir(base, `${rutaRubros}/${rubro.cuerpo.id}`, {
        metodo: "PATCH", cuerpo: { tipoSujeto: "COMPARSA" },
      });
      assert.equal(modificado.status, 200);
      assert.equal(modificado.cuerpo.categoriaId, categoria.cuerpo.id);

      const listado = await pedir(base, rutaCategorias);
      assert.deepEqual(listado.cuerpo.items.map((c) => c.nombre), ["Reina"]);
    });
  });
});

test("no hay dos categorías con el mismo nombre ni el mismo orden en una versión", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      await pedir(base, rutaCategorias, { metodo: "POST", cuerpo: { nombre: "Reina", orden: 1 } });

      const mismoNombre = await pedir(base, rutaCategorias, { metodo: "POST", cuerpo: { nombre: "Reina", orden: 2 } });
      assert.equal(mismoNombre.status, 409);
      assert.equal(mismoNombre.cuerpo.error, "nombre_existente");

      const mismoOrden = await pedir(base, rutaCategorias, { metodo: "POST", cuerpo: { nombre: "Porta", orden: 1 } });
      assert.equal(mismoOrden.status, 409);
      assert.equal(mismoOrden.cuerpo.error, "orden_existente");
    });
  });
});

test("una categoría con rubros no se borra hasta quitarles la categoría", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      const categoria = await pedir(base, rutaCategorias, { metodo: "POST", cuerpo: { nombre: "Reina", orden: 1 } });
      const rubro = await pedir(base, rutaRubros, {
        metodo: "POST",
        cuerpo: {
          codigo: "REINA", nombre: "Reina del Carnaval", tipoSujeto: "PERSONA", tipoRubro: "NOMINATIVO",
          orden: 1, categoriaId: categoria.cuerpo.id,
        },
      });
      assert.equal(rubro.status, 201);

      const bloqueado = await pedir(base, `${rutaCategorias}/${categoria.cuerpo.id}`, { metodo: "DELETE" });
      assert.equal(bloqueado.status, 409);
      assert.equal(bloqueado.cuerpo.error, "categoria_con_rubros");

      const quitada = await pedir(base, `${rutaRubros}/${rubro.cuerpo.id}`, {
        metodo: "PATCH", cuerpo: { categoriaId: null },
      });
      assert.equal(quitada.cuerpo.categoriaId, null);

      const borrada = await pedir(base, `${rutaCategorias}/${categoria.cuerpo.id}`, { metodo: "DELETE" });
      assert.equal(borrada.status, 204);
    });
  });
});

test("un rubro no puede apuntar a una categoría inexistente", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      const respuesta = await pedir(base, rutaRubros, {
        metodo: "POST",
        cuerpo: {
          codigo: "R1", nombre: "Impacto", tipoSujeto: "CARRO", tipoRubro: "NOMINATIVO",
          orden: 1, categoriaId: categoriaAjena,
        },
      });
      assert.equal(respuesta.status, 404);
      assert.equal(respuesta.cuerpo.error, "referencia_inexistente");
    });
  });
});

test("eliminar la edición borra también sus categorías", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appReglamento(pool), async (base) => {
      const categoria = await pedir(base, rutaCategorias, { metodo: "POST", cuerpo: { nombre: "Reina", orden: 1 } });
      await pedir(base, rutaRubros, {
        metodo: "POST",
        cuerpo: {
          codigo: "REINA", nombre: "Reina del Carnaval", tipoSujeto: "PERSONA", tipoRubro: "NOMINATIVO",
          orden: 1, categoriaId: categoria.cuerpo.id,
        },
      });
    });

    await pool.query("SELECT eliminar_edicion_completa($1::uuid, $2::text)", [edicion, admin]);

    const { rows: [{ categorias, ediciones }] } = await pool.query(
      `SELECT (SELECT count(*)::int FROM categoria_rubro WHERE edicion_id = $1) AS categorias,
              (SELECT count(*)::int FROM edicion WHERE id = $1) AS ediciones`,
      [edicion],
    );
    assert.equal(categorias, 0);
    assert.equal(ediciones, 0);
  });
});
