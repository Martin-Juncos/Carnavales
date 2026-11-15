import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { crearRutasAdminUsuarios } from "../src/admin-usuarios.js";
import { crearInvitacion } from "../src/invitaciones.js";
import { eliminarUsuario } from "../src/usuarios.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const otroAdmin = "u-otro-admin";
const jurado = "u-jurado";
const ahora = new Date("2026-11-15T12:00:00Z");

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

test("eliminar un usuario borra su cuenta, sesiones y asignaciones", { skip }, async () => {
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

test("la ruta exige administrador y devuelve los códigos esperados", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
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
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/admin/usuarios`;
    const borrar = (id, usuario) => fetch(`${base}/${id}`, { method: "DELETE", headers: usuario ? { "x-usuario-prueba": usuario } : {} });
    try {
      assert.equal((await borrar(jurado)).status, 401);
      assert.equal((await borrar(jurado, jurado)).status, 403);
      assert.equal((await borrar(admin, admin)).status, 409);
      assert.equal((await borrar("u-no", admin)).status, 404);
      assert.equal((await borrar(jurado, admin)).status, 200);
      assert.equal((await borrar(jurado, admin)).status, 404);
    } finally {
      await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }
  });
});
