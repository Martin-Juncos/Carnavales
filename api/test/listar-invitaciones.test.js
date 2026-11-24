import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { crearRutasAdminInvitaciones } from "../src/modules/usuarios/admin-invitaciones.routes.js";
import { listarInvitaciones } from "../src/modules/usuarios/invitaciones.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const jurado = "u-jurado";
const ahora = new Date("2026-11-15T12:00:00Z");
const horas = (n) => new Date(ahora.getTime() + n * 3600_000);

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

async function agregarInvitacion(pool, { id, correo, rol = "JURADO", estado = "pendiente", venceEn = horas(72), creadaEn = ahora, aceptadaEn = null, revocadaEn = null }) {
  await pool.query(
    `INSERT INTO invitacion (id, correo_invitado, rol_inicial_id, hash_token, estado, vence_en, creada_por, creada_en, aceptada_en, revocada_en)
     VALUES ($1, $2, (SELECT id FROM rol WHERE codigo = $3), $4, $5, $6, $7, $8, $9, $10)`,
    [id, correo, rol, `hash-${id}`, estado, venceEn, admin, creadaEn, aceptadaEn, revocadaEn],
  );
}

test("el listado muestra estado efectivo, rol y fechas, sin el hash del token", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await agregarInvitacion(pool, { id: "i-1", correo: "nueva@example.test" });

    const resultado = await listarInvitaciones(pool, { ahora });
    assert.equal(resultado.total, 1);
    assert.deepEqual(resultado.items[0], {
      id: "i-1",
      correo: "nueva@example.test",
      rol: "JURADO",
      estado: "pendiente",
      creadaEn: ahora.toISOString(),
      venceEn: horas(72).toISOString(),
      aceptadaEn: null,
      revocadaEn: null,
    });
    assert.equal(Object.keys(resultado.items[0]).includes("hash_token"), false);
  });
});

test("una pendiente vencida aparece como vencida y se filtra por ese estado", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await agregarInvitacion(pool, { id: "i-vencida", correo: "vieja@example.test", venceEn: horas(-1) });
    await agregarInvitacion(pool, { id: "i-vigente", correo: "vigente@example.test" });

    const todas = await listarInvitaciones(pool, { ahora });
    assert.equal(todas.items.find((i) => i.id === "i-vencida").estado, "vencida");

    const vencidas = await listarInvitaciones(pool, { estado: "vencida", ahora });
    assert.deepEqual(vencidas.items.map((i) => i.id), ["i-vencida"]);

    const pendientes = await listarInvitaciones(pool, { estado: "pendiente", ahora });
    assert.deepEqual(pendientes.items.map((i) => i.id), ["i-vigente"]);
  });
});

test("filtra por estado aceptada y revocada con sus fechas de resolución", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await agregarInvitacion(pool, { id: "i-ok", correo: "ok@example.test", estado: "aceptada", aceptadaEn: horas(1) });
    await agregarInvitacion(pool, { id: "i-no", correo: "no@example.test", estado: "revocada", revocadaEn: horas(2) });

    const aceptadas = await listarInvitaciones(pool, { estado: "aceptada", ahora });
    assert.deepEqual(aceptadas.items.map((i) => i.id), ["i-ok"]);
    assert.equal(aceptadas.items[0].aceptadaEn, horas(1).toISOString());
    assert.equal(aceptadas.items[0].revocadaEn, null);

    const revocadas = await listarInvitaciones(pool, { estado: "revocada", ahora });
    assert.deepEqual(revocadas.items.map((i) => i.id), ["i-no"]);
  });
});

test("filtra por correo parcial y trata % y _ como texto", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await agregarInvitacion(pool, { id: "i-a", correo: "ana@example.test" });
    await agregarInvitacion(pool, { id: "i-b", correo: "bruno_jurado@example.test" });
    await agregarInvitacion(pool, { id: "i-c", correo: "carla@example.test" });

    const porParte = await listarInvitaciones(pool, { correo: "ANA@", ahora });
    assert.deepEqual(porParte.items.map((i) => i.id), ["i-a"]);

    const porGuion = await listarInvitaciones(pool, { correo: "bruno_", ahora });
    assert.deepEqual(porGuion.items.map((i) => i.id), ["i-b"]);

    const comodin = await listarInvitaciones(pool, { correo: "%", ahora });
    assert.deepEqual(comodin.items, []);
  });
});

test("pagina y devuelve el total filtrado", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    for (let i = 0; i < 12; i++) {
      await agregarInvitacion(pool, {
        id: `i-${i}`,
        correo: `persona${i}@example.test`,
        estado: i % 2 === 0 ? "pendiente" : "revocada",
        revocadaEn: i % 2 === 0 ? null : horas(i),
        creadaEn: horas(i),
      });
    }

    const pagina = await listarInvitaciones(pool, { estado: "revocada", pagina: 2, limite: 3, ahora });
    assert.equal(pagina.total, 6);
    assert.equal(pagina.pagina, 2);
    assert.equal(pagina.limite, 3);
    assert.equal(pagina.items.length, 3);
  });
});

test("rechaza estados desconocidos y paginación inválida", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await assert.rejects(listarInvitaciones(pool, { estado: "borrada", ahora }), { codigo: "parametros_invalidos" });
    await assert.rejects(listarInvitaciones(pool, { limite: 101, ahora }), { codigo: "parametros_invalidos" });
    await assert.rejects(listarInvitaciones(pool, { pagina: 0, ahora }), { codigo: "parametros_invalidos" });
  });
});

test("la ruta exige administrador y valida los parámetros", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const app = express();
    app.use(
      "/api/admin/invitaciones",
      crearRutasAdminInvitaciones({
        pool,
        appUrl: "http://127.0.0.1:5173",
        enviar: async () => {},
        obtenerSesion: async (request) => {
          const usuario = request.headers["x-usuario-prueba"];
          return usuario ? { user: { id: usuario } } : null;
        },
      }),
    );
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/api/admin/invitaciones`;
    const como = (usuario) => ({ headers: { "x-usuario-prueba": usuario } });
    try {
      assert.equal((await fetch(url)).status, 401);
      assert.equal((await fetch(url, como(jurado))).status, 403);
      const ok = await fetch(url, como(admin));
      assert.equal(ok.status, 200);
      assert.deepEqual(await ok.json(), { items: [], pagina: 1, limite: 20, total: 0 });
      assert.equal((await fetch(`${url}?estado=borrada`, como(admin))).status, 400);
      assert.equal((await fetch(`${url}?limite=0`, como(admin))).status, 400);
    } finally {
      await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }
  });
});
