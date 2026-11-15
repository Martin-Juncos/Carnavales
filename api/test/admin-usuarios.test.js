import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { crearRutasAdminUsuarios } from "../src/admin-usuarios.js";
import { listarUsuarios } from "../src/usuarios.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const ahora = new Date("2026-11-15T12:00:00Z");

async function preparar(pool) {
  await pool.query(
    "INSERT INTO usuario (id, nombre, correo, correo_verificado, creado_en) VALUES ($1, 'Administradora', 'admin@example.test', true, $2)",
    [admin, new Date("2026-01-01T00:00:00Z")],
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT $1, id, NULL, true FROM rol WHERE codigo = 'ADMINISTRADOR'`,
    [admin],
  );
}

async function agregarUsuario(pool, { id, nombre, correo, rol, creadoEn }) {
  await pool.query(
    "INSERT INTO usuario (id, nombre, correo, correo_verificado, creado_en) VALUES ($1, $2, $3, true, $4)",
    [id, nombre, correo, creadoEn ?? ahora],
  );
  if (rol) {
    await pool.query(
      `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
       SELECT $1, id, $2, false FROM rol WHERE codigo = $3`,
      [id, admin, rol],
    );
  }
}

async function abrirSesion(pool, { usuarioId, venceEn }) {
  await pool.query(
    `INSERT INTO sesion (id, usuario_id, vence_en, token, creado_en, actualizado_en)
     VALUES ($1, $2, $3, $4, $5, $5)`,
    [`s-${usuarioId}-${venceEn.getTime()}`, usuarioId, venceEn, `tok-${usuarioId}-${venceEn.getTime()}`, ahora],
  );
}

test("el listado incluye roles, alta y sesión activa, sin datos sensibles", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await agregarUsuario(pool, { id: "u-jurado", nombre: "Jurado Uno", correo: "jurado@example.test", rol: "JURADO" });
    await abrirSesion(pool, { usuarioId: "u-jurado", venceEn: new Date(ahora.getTime() + 3600_000) });

    const resultado = await listarUsuarios(pool, { ahora });
    const jurado = resultado.items.find((u) => u.id === "u-jurado");

    assert.deepEqual(jurado, {
      id: "u-jurado",
      nombre: "Jurado Uno",
      correo: "jurado@example.test",
      roles: ["JURADO"],
      creadoEn: ahora.toISOString(),
      sesionActiva: true,
    });
    for (const usuario of resultado.items) {
      assert.deepEqual(Object.keys(usuario).sort(), ["correo", "creadoEn", "id", "nombre", "roles", "sesionActiva"]);
    }
  });
});

test("una sesión vencida no cuenta como activa", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await agregarUsuario(pool, { id: "u-vencido", nombre: "Vencido", correo: "vencido@example.test" });
    await abrirSesion(pool, { usuarioId: "u-vencido", venceEn: new Date(ahora.getTime() - 1000) });

    const resultado = await listarUsuarios(pool, { ahora });
    assert.equal(resultado.items.find((u) => u.id === "u-vencido").sesionActiva, false);
  });
});

test("la paginación devuelve páginas y el total", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    for (let i = 0; i < 24; i++) {
      await agregarUsuario(pool, {
        id: `u-${i}`,
        nombre: `Persona ${i}`,
        correo: `persona${i}@example.test`,
        creadoEn: new Date(ahora.getTime() + i * 1000),
      });
    }

    const pagina = await listarUsuarios(pool, { pagina: 3, limite: 10, ahora });
    assert.equal(pagina.total, 25);
    assert.equal(pagina.pagina, 3);
    assert.equal(pagina.limite, 10);
    assert.equal(pagina.items.length, 5);
  });
});

test("buscar filtra por correo o nombre y trata % y _ como texto", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await agregarUsuario(pool, { id: "u-a", nombre: "Ana Pérez", correo: "ana@example.test" });
    await agregarUsuario(pool, { id: "u-b", nombre: "Bruno", correo: "bruno.jurado@example.test" });
    await agregarUsuario(pool, { id: "u-c", nombre: "100% real", correo: "real@example.test" });

    const porNombre = await listarUsuarios(pool, { buscar: "pérez", ahora });
    assert.deepEqual(porNombre.items.map((u) => u.id), ["u-a"]);

    const porCorreo = await listarUsuarios(pool, { buscar: "jurado@", ahora });
    assert.deepEqual(porCorreo.items.map((u) => u.id), ["u-b"]);

    const porPorcentaje = await listarUsuarios(pool, { buscar: "100%", ahora });
    assert.deepEqual(porPorcentaje.items.map((u) => u.id), ["u-c"]);

    // Un % solo debe coincidir con el texto que lo contiene, no con todos los usuarios.
    const comodin = await listarUsuarios(pool, { buscar: "%", ahora });
    assert.deepEqual(comodin.items.map((u) => u.id), ["u-c"], "el % debe buscarse como texto literal");
  });
});

test("la ruta valida la paginación y exige administrador", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const app = express();
    app.use(
      "/api/admin/usuarios",
      crearRutasAdminUsuarios({
        pool,
        obtenerSesion: async (request) =>
          request.headers["x-usuario-prueba"] === admin ? { user: { id: admin } } : null,
      }),
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/admin/usuarios`;
    try {
      assert.equal((await fetch(url)).status, 401);
      assert.equal((await fetch(url, { headers: { "x-usuario-prueba": admin } })).status, 200);
      assert.equal((await fetch(`${url}?limite=101`, { headers: { "x-usuario-prueba": admin } })).status, 400);
      assert.equal((await fetch(`${url}?pagina=0`, { headers: { "x-usuario-prueba": admin } })).status, 400);
    } finally {
      await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }
  });
});
