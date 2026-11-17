import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { crearRutasAdminUsuarios } from "../src/admin-usuarios.js";
import { asignarRol, retirarRol } from "../src/roles.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const otroAdmin = "u-otro-admin";
const jurado = "u-jurado";

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
}

async function rolesDe(pool, usuarioId) {
  const { rows } = await pool.query(
    `SELECT r.codigo FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
      WHERE ur.usuario_id = $1 ORDER BY r.codigo`,
    [usuarioId],
  );
  return rows.map((fila) => fila.codigo);
}

test("asignar un rol lo agrega y registra quién lo asignó", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await asignarRol(pool, { usuarioId: jurado, rolCodigo: "ESCRIBANO", asignadoPor: admin });

    assert.deepEqual(await rolesDe(pool, jurado), ["ESCRIBANO", "JURADO"]);
    const { rows } = await pool.query(
      `SELECT ur.asignado_por, ur.es_inicial FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
        WHERE ur.usuario_id = $1 AND r.codigo = 'ESCRIBANO'`,
      [jurado],
    );
    assert.deepEqual(rows, [{ asignado_por: admin, es_inicial: false }]);
  });
});

test("asignar un rol ya asignado, uno inexistente o a un usuario inexistente falla con código propio", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await assert.rejects(asignarRol(pool, { usuarioId: jurado, rolCodigo: "JURADO", asignadoPor: admin }), { codigo: "rol_ya_asignado" });
    await assert.rejects(asignarRol(pool, { usuarioId: jurado, rolCodigo: "INVENTADO", asignadoPor: admin }), { codigo: "rol_invalido" });
    await assert.rejects(asignarRol(pool, { usuarioId: "u-no", rolCodigo: "JURADO", asignadoPor: admin }), { codigo: "usuario_no_encontrado" });
  });
});

test("retirar un rol lo quita; retirar uno no asignado falla", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await retirarRol(pool, { usuarioId: jurado, rolCodigo: "JURADO" });
    assert.deepEqual(await rolesDe(pool, jurado), []);
    await assert.rejects(retirarRol(pool, { usuarioId: jurado, rolCodigo: "JURADO" }), { codigo: "no_asignado" });
  });
});

test("el rol ADMINISTRADOR inicial no se puede retirar; el de un administrador posterior sí", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await assert.rejects(retirarRol(pool, { usuarioId: admin, rolCodigo: "ADMINISTRADOR" }), { codigo: "rol_protegido" });
    assert.deepEqual(await rolesDe(pool, admin), ["ADMINISTRADOR"]);

    await retirarRol(pool, { usuarioId: otroAdmin, rolCodigo: "ADMINISTRADOR" });
    assert.deepEqual(await rolesDe(pool, otroAdmin), []);
  });
});

test("las rutas de roles exigen administrador y devuelven los códigos esperados", { skip }, async () => {
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
    const como = (usuario, metodo = "POST") => ({ method: metodo, headers: { "x-usuario-prueba": usuario } });
    try {
      assert.equal((await fetch(`${base}/${jurado}/roles/ESCRIBANO`, { method: "POST" })).status, 401);
      assert.equal((await fetch(`${base}/${jurado}/roles/ESCRIBANO`, como(jurado))).status, 403);

      const alta = await fetch(`${base}/${jurado}/roles/ESCRIBANO`, como(admin));
      assert.equal(alta.status, 201);
      assert.deepEqual(await alta.json(), { usuarioId: jurado, rol: "ESCRIBANO" });
      assert.equal((await fetch(`${base}/${jurado}/roles/ESCRIBANO`, como(admin))).status, 409);
      assert.equal((await fetch(`${base}/${jurado}/roles/INVENTADO`, como(admin))).status, 400);
      assert.equal((await fetch(`${base}/u-no/roles/JURADO`, como(admin))).status, 404);

      assert.equal((await fetch(`${base}/${admin}/roles/ADMINISTRADOR`, como(admin, "DELETE"))).status, 409);
      assert.equal((await fetch(`${base}/${jurado}/roles/ESCRIBANO`, como(admin, "DELETE"))).status, 200);
      assert.equal((await fetch(`${base}/${jurado}/roles/ESCRIBANO`, como(admin, "DELETE"))).status, 404);
      assert.deepEqual(await rolesDe(pool, jurado), ["JURADO"]);
    } finally {
      await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }
  });
});
