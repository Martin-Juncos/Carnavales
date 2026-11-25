import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasAdminUsuarios } from "../../../src/modules/usuarios/admin-usuarios.routes.js";
import { crearInvitacion } from "../../../src/modules/usuarios/invitaciones.js";
import { ErrorUsuario, eliminarUsuario } from "../../../src/modules/usuarios/usuarios.js";
import { withIsolatedSchema } from "../../helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const otroAdmin = "u-otro-admin";
const jurado = "u-jurado";
const ahora = new Date("2026-11-15T12:00:00Z");
const edicion = "10000000-0000-0000-0000-000000000027";
const noche = "20000000-0000-0000-0000-000000000001";
const especialidad = "30000000-0000-0000-0000-000000000001";
const asignacion = "40000000-0000-0000-0000-000000000001";

async function preparar(pool) {
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado) VALUES
       ($1, 'Admin', 'admin@example.test', true),
       ($2, 'Otro admin', 'otro@example.test', true),
       ($3, 'Jurado', 'jurado@example.test', true)`,
    [admin, otroAdmin, jurado],
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT $1, id, NULL, true FROM rol WHERE codigo = 'ADMINISTRADOR'`,
    [admin],
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT $1, id, $2, false FROM rol WHERE codigo = 'ADMINISTRADOR'`,
    [otroAdmin, admin],
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT $1, id, $2, false FROM rol WHERE codigo = 'JURADO'`,
    [jurado, admin],
  );
  await pool.query(
    `INSERT INTO sesion (id, usuario_id, vence_en, token, creado_en, actualizado_en)
     VALUES ('s-jurado', $1, $2, 'tok-jurado', $3, $3)`,
    [jurado, new Date(ahora.getTime() + 3600_000), ahora],
  );
}

async function contar(pool, sql, parametros) {
  const { rows: [{ total }] } = await pool.query(sql, parametros);
  return total;
}

async function assertUsuarioExiste(pool, id = jurado) {
  assert.equal(await contar(pool, "SELECT count(*)::int AS total FROM usuario WHERE id = $1", [id]), 1);
}

// Catálogo mínimo para crear una asignación o un registro de auditoría que
// referencien al jurado. La edición la crea el administrador: el jurado no debe
// aparecer como responsable de ella.
async function prepararHistorial(pool, tipoHistorial) {
  await pool.query(
    `INSERT INTO edicion (id, nombre, anio, estado, creada_por, abierta_por, abierta_en)
     VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $2, NULL, NULL)`,
    [edicion, admin],
  );
  await pool.query(
    `INSERT INTO noche (id, edicion_id, orden, nombre, tipo, estado, abierta_en, cerrada_en)
     VALUES ($1, $2, 1, 'Primera noche', 'COMPETENCIA', 'DRAFT', NULL, NULL)`,
    [noche, edicion],
  );
  await pool.query(
    `INSERT INTO especialidad (id, edicion_id, nombre, codigo, orden, activa)
     VALUES ($1, $2, 'Vestuario', 'J1', 1, true)`,
    [especialidad, edicion],
  );
  if (tipoHistorial === "asignacion") {
    await pool.query(
      `INSERT INTO asignacion_jurado
         (id, edicion_id, jurado_id, noche_id, especialidad_id, creada_por, creada_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [asignacion, edicion, jurado, noche, especialidad, admin, ahora],
    );
  }
  if (tipoHistorial === "auditoria") {
    await pool.query(
      `INSERT INTO auditoria (id, ocurrida_en, actor_id, operacion, entidad_tipo, entidad_id)
       VALUES ($1, $2, $3, 'operacion_de_prueba', 'usuario', $3)`,
      ["50000000-0000-0000-0000-000000000001", ahora, jurado],
    );
  }
}

function appUsuarios(pool) {
  const app = express();
  app.use(
    "/api/admin/usuarios",
    crearRutasAdminUsuarios({
      pool,
      obtenerSesion: async (request) => {
        const usuario = request.headers["x-usuario-prueba"];
        return usuario ? { user: { id: usuario } } : null;
      },
    }),
  );
  return app;
}

async function conServidor(pool, run) {
  const app = appUsuarios(pool);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/admin/usuarios`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("eliminar un usuario sin historial borra su cuenta, sesiones y roles", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await eliminarUsuario(pool, { usuarioId: jurado });

    assert.equal(await contar(pool, "SELECT count(*)::int AS total FROM usuario WHERE id = $1", [jurado]), 0);
    assert.equal(await contar(pool, "SELECT count(*)::int AS total FROM sesion WHERE usuario_id = $1", [jurado]), 0);
    assert.equal(await contar(pool, "SELECT count(*)::int AS total FROM usuario_rol WHERE usuario_id = $1", [jurado]), 0);
  });
});

test("el correo de un usuario eliminado queda libre para una nueva invitación", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await eliminarUsuario(pool, { usuarioId: jurado });

    const resultado = await crearInvitacion(pool, {
      correo: "jurado@example.test",
      rolCodigo: "JURADO",
      creadaPor: admin,
      ahora,
      appUrl: "http://127.0.0.1:5173",
      enviar: async () => {},
    });
    assert.equal(resultado.entrega, "enviada");
  });
});

test("no se elimina al primer administrador ni a un usuario inexistente", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await assert.rejects(eliminarUsuario(pool, { usuarioId: admin }), { codigo: "usuario_protegido" });
    await assert.rejects(eliminarUsuario(pool, { usuarioId: "u-no" }), { codigo: "usuario_no_encontrado" });
    assert.equal(await contar(pool, "SELECT count(*)::int AS total FROM usuario WHERE id = $1", [admin]), 1);
  });
});

test("un administrador posterior se puede eliminar", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await eliminarUsuario(pool, { usuarioId: otroAdmin });
    assert.equal(await contar(pool, "SELECT count(*)::int AS total FROM usuario WHERE id = $1", [otroAdmin]), 0);
  });
});

test("un usuario con una asignación no se elimina y se conserva la evidencia", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await prepararHistorial(pool, "asignacion");

    await assert.rejects(
      eliminarUsuario(pool, { usuarioId: jurado }),
      (error) => error instanceof ErrorUsuario && error.codigo === "usuario_con_historial",
    );
    await assertUsuarioExiste(pool);
    assert.equal(
      await contar(pool, "SELECT count(*)::int AS total FROM asignacion_jurado WHERE jurado_id = $1", [jurado]),
      1,
    );
  });
});

test("un usuario con registros de auditoría no se elimina", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await prepararHistorial(pool, "auditoria");

    await assert.rejects(eliminarUsuario(pool, { usuarioId: jurado }), { codigo: "usuario_con_historial" });
    await assertUsuarioExiste(pool);
    assert.equal(
      await contar(pool, "SELECT count(*)::int AS total FROM auditoria WHERE actor_id = $1", [jurado]),
      1,
    );
  });
});

test("la ruta responde 409 controlado al eliminar un usuario con asignación", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await prepararHistorial(pool, "asignacion");
    await conServidor(pool, async (base) => {
      const respuesta = await fetch(`${base}/${jurado}`, {
        method: "DELETE",
        headers: { "x-usuario-prueba": admin },
      });
      const texto = await respuesta.text();
      assert.equal(respuesta.status, 409);
      assert.deepEqual(JSON.parse(texto), {
        error: "usuario_con_historial",
        mensaje: "El usuario tiene historial asociado y no puede eliminarse.",
      });
      assert.doesNotMatch(texto, /23503|asignacion_jurado|DELETE FROM|constraint/i);
    });
    await assertUsuarioExiste(pool);
  });
});

test("la ruta exige administrador y devuelve los códigos esperados", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(pool, async (base) => {
      const borrar = (id, usuario) =>
        fetch(`${base}/${id}`, { method: "DELETE", headers: usuario ? { "x-usuario-prueba": usuario } : {} });
      assert.equal((await borrar(jurado)).status, 401);
      assert.equal((await borrar(jurado, jurado)).status, 403);
      assert.equal((await borrar(admin, admin)).status, 409);
      assert.equal((await borrar("u-no", admin)).status, 404);
      assert.equal((await borrar(jurado, admin)).status, 200);
      assert.equal((await borrar(jurado, admin)).status, 404);
    });
  });
});
