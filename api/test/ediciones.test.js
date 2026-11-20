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

async function pedir(base, { metodo = "GET", usuario, cuerpo, ruta = "" } = {}) {
  const cabeceras = {};
  if (usuario) cabeceras["x-usuario-prueba"] = usuario;
  if (cuerpo !== undefined) cabeceras["content-type"] = "application/json";
  const respuesta = await fetch(`${base}/api/admin/ediciones${ruta}`, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, cuerpo: await respuesta.json().catch(() => null) };
}

test("solo Administración elimina una edición vacía y su borrador inicial sin tocar otras ediciones", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      const crear = (anio) => pedir(base, { metodo: "POST", usuario: admin, cuerpo: { nombre: "Carnaval", anio } });
      const { cuerpo: a } = await crear(2026);
      const { cuerpo: b } = await crear(2027);
      const borrar = (usuario) => pedir(base, { metodo: "DELETE", usuario, ruta: `/${a.id}` });
      assert.equal((await borrar()).status, 401);
      assert.equal((await borrar(jurado)).status, 403);
      assert.deepEqual(await borrar(admin), { status: 204, cuerpo: null });
      assert.equal((await borrar(admin)).status, 404);
      assert.deepEqual((await pedir(base, { usuario: admin })).cuerpo.items, [b]);
      assert.equal(await contar(pool, "version_reglamento"), 1);
      const { rows } = await pool.query(
        "SELECT actor_id, entidad_id FROM auditoria WHERE operacion = 'edicion_eliminada'",
      );
      assert.deepEqual(rows, [{ actor_id: admin, entidad_id: a.id }]);
    });
  });
});

test("los bloqueos de borrado y un fallo de auditoría conservan la edición y su versión", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      const crear = async (anio) => (await pedir(base, { metodo: "POST", usuario: admin, cuerpo: { nombre: "Carnaval", anio } })).cuerpo.id;
      const borrar = (id) => pedir(base, { metodo: "DELETE", usuario: admin, ruta: `/${id}` });
      const conNoche = await crear(2026);
      const publicada = await crear(2027);
      const vacia = await crear(2028);
      assert.equal((await pedir(base, { metodo: "POST", usuario: admin, ruta: `/${conNoche}/noches`,
        cuerpo: { nombre: "Primera", orden: 1, tipo: "COMPETENCIA" } })).status, 201);
      await pool.query("UPDATE version_reglamento SET estado = 'PUBLICADA', publicada_por = $2, publicada_en = now() WHERE edicion_id = $1",
        [publicada, admin]);
      const conDependencia = await borrar(conNoche);
      assert.equal(conDependencia.status, 409);
      assert.equal(conDependencia.cuerpo.error, "edicion_con_dependencias");
      const noBorrable = await borrar(publicada);
      assert.equal(noBorrable.status, 409);
      assert.equal(noBorrable.cuerpo.error, "edicion_no_borrable");
      await pool.query("ALTER TABLE auditoria ADD CHECK (operacion <> 'edicion_eliminada')");
      assert.equal((await borrar(vacia)).status, 500);
      assert.equal(await contar(pool, "edicion"), 3);
      assert.equal(await contar(pool, "version_reglamento"), 3);
      assert.equal(await contar(pool, "noche"), 1);
    });
  });
});

test("el historial de una noche eliminada sigue asociado a su edición", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      const post = (ruta, cuerpo) => pedir(base, { metodo: "POST", usuario: admin, ruta, cuerpo });
      const borrar = (ruta) => pedir(base, { metodo: "DELETE", usuario: admin, ruta });
      const { cuerpo: edicion } = await post("", { nombre: "Con historial", anio: 2027 });
      const { cuerpo: otra } = await post("", { nombre: "Sin historial", anio: 2028 });
      const { cuerpo: noche } = await post(`/${edicion.id}/noches`, { nombre: "Primera", orden: 1, tipo: "COMPETENCIA" });
      assert.equal((await borrar(`/${edicion.id}/noches/${noche.id}`)).status, 204);
      const respuesta = await borrar(`/${edicion.id}`);
      assert.equal(respuesta.status, 409);
      assert.equal(respuesta.cuerpo.error, "edicion_con_dependencias");
      assert.equal((await borrar(`/${otra.id}`)).status, 204);
      assert.deepEqual((await pedir(base, { usuario: admin })).cuerpo.items, [edicion]);
    });
  });
});

test("un alta de noche que espera a un borrado exitoso recibe 404 sin crear una noche", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      const { cuerpo: edicion } = await pedir(base, { metodo: "POST", usuario: admin, cuerpo: { nombre: "Carrera", anio: 2027 } });
      await pool.query(`CREATE FUNCTION pausar_borrado() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN PERFORM pg_advisory_xact_lock(8743, current_schema()::regnamespace::oid::int); RETURN NEW; END; $$;
        CREATE TRIGGER pausa BEFORE INSERT ON auditoria FOR EACH ROW
        WHEN (NEW.operacion = 'edicion_eliminada') EXECUTE FUNCTION pausar_borrado()`);
      const bloqueo = await pool.connect();
      const esperarBloqueo = async (pid, patron) => {
        for (let i = 0; i < 150; i += 1) {
          const { rows: [fila] } = await pool.query(
            "SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid)) AND query LIKE $2", [pid, patron],
          );
          if (fila) return fila.pid;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        throw new Error(`No se observó el bloqueo: ${patron}`);
      };
      let borrado;
      let alta;
      try {
        await bloqueo.query("BEGIN");
        await bloqueo.query("SELECT pg_advisory_xact_lock(8743, current_schema()::regnamespace::oid::int)");
        borrado = pedir(base, { metodo: "DELETE", usuario: admin, ruta: `/${edicion.id}` });
        const pid = await esperarBloqueo(bloqueo.processID, "INSERT INTO auditoria%");
        alta = pedir(base, { metodo: "POST", usuario: admin, ruta: `/${edicion.id}/noches`,
          cuerpo: { nombre: "Primera", orden: 1, tipo: "COMPETENCIA" } });
        await esperarBloqueo(pid, "SELECT 1 FROM edicion%FOR KEY SHARE");
        await bloqueo.query("COMMIT");
        assert.equal((await borrado).status, 204);
        const respuesta = await alta;
        assert.equal(respuesta.status, 404);
        assert.equal(respuesta.cuerpo.error, "edicion_inexistente");
        assert.equal(await contar(pool, "noche"), 0);
      } finally {
        await bloqueo.query("ROLLBACK");
        bloqueo.release();
        await Promise.all([borrado, alta]);
      }
    });
  });
});

async function contar(pool, tabla) {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${tabla}`);
  return rows[0].n;
}

test("el borrado de edición revalida la auditoría tras un borrado concurrente de noche", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appEdiciones(pool), async (base) => {
      const post = (ruta, cuerpo) => pedir(base, { metodo: "POST", usuario: admin, ruta, cuerpo });
      const borrar = (ruta) => pedir(base, { metodo: "DELETE", usuario: admin, ruta });
      const { cuerpo: edicion } = await post("", { nombre: "Historial concurrente", anio: 2027 });
      const { cuerpo: noche } = await post(`/${edicion.id}/noches`, { nombre: "Primera", orden: 1, tipo: "COMPETENCIA" });
      await pool.query(`CREATE FUNCTION pausar_noche() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN PERFORM pg_advisory_xact_lock(8744, current_schema()::regnamespace::oid::int); RETURN NEW; END; $$;
        CREATE TRIGGER pausa BEFORE INSERT ON auditoria FOR EACH ROW
        WHEN (NEW.operacion = 'noche_eliminada') EXECUTE FUNCTION pausar_noche()`);
      const bloqueo = await pool.connect();
      async function esperar(pid, patron) {
        for (let i = 0; i < 150; i += 1) {
          const { rows: [fila] } = await pool.query(
            "SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid)) AND query LIKE $2", [pid, patron],
          );
          if (fila) return fila.pid;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        throw new Error(`No se observó el bloqueo: ${patron}`);
      }
      let borradoNoche;
      let borradoEdicion;
      try {
        await bloqueo.query("BEGIN");
        await bloqueo.query("SELECT pg_advisory_xact_lock(8744, current_schema()::regnamespace::oid::int)");
        borradoNoche = borrar(`/${edicion.id}/noches/${noche.id}`);
        const pid = await esperar(bloqueo.processID, "INSERT INTO auditoria%");
        borradoEdicion = borrar(`/${edicion.id}`);
        await esperar(pid, "DELETE FROM edicion%");
        await bloqueo.query("COMMIT");
        assert.equal((await borradoNoche).status, 204);
        const respuesta = await borradoEdicion;
        assert.equal(respuesta.status, 409);
        assert.equal(respuesta.cuerpo.error, "edicion_con_dependencias");
        assert.deepEqual((await pedir(base, { usuario: admin })).cuerpo.items, [edicion]);
        assert.equal(await contar(pool, "version_reglamento"), 1);
        assert.equal((await pool.query(
          "SELECT 1 FROM auditoria WHERE edicion_id = $1 AND operacion = 'noche_eliminada'", [edicion.id],
        )).rowCount, 1);
      } finally {
        await bloqueo.query("ROLLBACK");
        bloqueo.release();
        await Promise.all([borradoNoche, borradoEdicion]);
      }
    });
  });
});

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
