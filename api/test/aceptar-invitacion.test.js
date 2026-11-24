import assert from "node:assert/strict";
import test from "node:test";
import { aceptarInvitacion, crearInvitacion } from "../src/modules/usuarios/invitaciones.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const secret = "e".repeat(48);
const baseUrl = "http://127.0.0.1:3000";
const ahora = new Date("2026-11-15T12:00:00Z");
const ahoraMasTarde = new Date(ahora.getTime() + 1000);
const mensajeGenerico = "El enlace no es válido o venció. Solicita una nueva invitación al administrador.";

async function preparar(pool) {
  await pool.query(
    "INSERT INTO usuario (id, nombre, correo, correo_verificado) VALUES ($1, 'Admin', 'admin@example.test', true)",
    [admin],
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT $1, id, NULL, true FROM rol WHERE codigo = 'ADMINISTRADOR'`,
    [admin],
  );
}

// Crea una invitación y devuelve el token que habría llegado por correo.
async function invitar(pool, { correo = "persona@example.test", rolCodigo = "JURADO", fecha = ahora } = {}) {
  const enlaces = [];
  const { id } = await crearInvitacion(pool, {
    correo,
    rolCodigo,
    creadaPor: admin,
    ahora: fecha,
    appUrl: "http://127.0.0.1:5173",
    enviar: async ({ enlace }) => {
      enlaces.push(enlace);
    },
  });
  const token = new URL(enlaces[0]).searchParams.get("token");
  return { id, token };
}

function aceptar(pool, token, datos = {}, fecha = ahoraMasTarde) {
  return aceptarInvitacion(pool, {
    token,
    nombre: "Persona Invitada",
    contrasena: "contraseña-de-prueba",
    ahora: fecha,
    secret,
    baseUrl,
    ...datos,
  });
}

async function contar(pool, sql) {
  return (await pool.query(sql)).rows[0].n;
}

test("aceptar crea la cuenta verificada, con segundo factor y el rol inicial", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const { id, token } = await invitar(pool);

    const usuarioId = await aceptar(pool, token);

    const { rows: [usuario] } = await pool.query(
      "SELECT correo, correo_verificado, doble_factor_habilitado FROM usuario WHERE id = $1",
      [usuarioId],
    );
    assert.equal(usuario.correo, "persona@example.test");
    assert.equal(usuario.correo_verificado, true);
    assert.equal(usuario.doble_factor_habilitado, true);

    const { rows: [asignacion] } = await pool.query(
      `SELECT r.codigo, ur.asignado_por, ur.es_inicial
         FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id WHERE ur.usuario_id = $1`,
      [usuarioId],
    );
    assert.deepEqual(asignacion, { codigo: "JURADO", asignado_por: admin, es_inicial: false });

    const { rows: [invitacion] } = await pool.query(
      "SELECT estado, aceptada_en FROM invitacion WHERE id = $1",
      [id],
    );
    assert.equal(invitacion.estado, "aceptada");
    assert.ok(invitacion.aceptada_en);
  });
});

test("el token no se puede usar dos veces", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const { token } = await invitar(pool);
    await aceptar(pool, token);

    await assert.rejects(aceptar(pool, token), { codigo: "invitacion_invalida", message: mensajeGenerico });
    assert.equal(await contar(pool, "SELECT count(*)::int AS n FROM usuario"), 2);
  });
});

test("un token inexistente no crea cuenta", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await assert.rejects(aceptar(pool, "token-inventado"), { codigo: "invitacion_invalida" });
    assert.equal(await contar(pool, "SELECT count(*)::int AS n FROM usuario"), 1);
  });
});

test("un token revocado o vencido no crea cuenta", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const revocada = await invitar(pool, { correo: "a@example.test" });
    await pool.query("UPDATE invitacion SET estado = 'revocada', revocada_en = $2 WHERE id = $1", [revocada.id, ahora]);
    await assert.rejects(aceptar(pool, revocada.token), { codigo: "invitacion_invalida" });

    const vencida = await invitar(pool, { correo: "b@example.test" });
    const despues = new Date(ahora.getTime() + 73 * 60 * 60 * 1000);
    await assert.rejects(aceptar(pool, vencida.token, {}, despues), { codigo: "invitacion_invalida" });

    assert.equal(await contar(pool, "SELECT count(*)::int AS n FROM usuario"), 1);
  });
});

test("una contraseña inválida no consume el token", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const { token } = await invitar(pool);

    await assert.rejects(aceptar(pool, token, { contrasena: "corta" }));
    assert.equal(await contar(pool, "SELECT count(*)::int AS n FROM usuario"), 1);

    await aceptar(pool, token);
    assert.equal(await contar(pool, "SELECT count(*)::int AS n FROM usuario"), 2);
  });
});

test("dos aceptaciones simultáneas dejan una sola cuenta", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const { token } = await invitar(pool);

    const resultados = await Promise.allSettled([aceptar(pool, token), aceptar(pool, token)]);

    assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await contar(pool, "SELECT count(*)::int AS n FROM usuario WHERE correo = 'persona@example.test'"), 1);
  });
});

test("la ruta de aceptación responde el mensaje genérico ante cualquier token inválido", { skip }, async () => {
  const express = (await import("express")).default;
  const { crearRutaAceptarInvitacion } = await import("../src/modules/usuarios/invitaciones-publicas.routes.js");
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const app = express();
    app.use("/api/invitaciones", crearRutaAceptarInvitacion({ pool, secret, baseUrl }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    try {
      const respuesta = await fetch(`http://127.0.0.1:${server.address().port}/api/invitaciones/aceptar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: "inventado", nombre: "X", contrasena: "contraseña-de-prueba" }),
      });
      assert.equal(respuesta.status, 400);
      const cuerpo = await respuesta.json();
      assert.equal(cuerpo.mensaje, mensajeGenerico);
      assert.equal(cuerpo.error, "invitacion_invalida");
    } finally {
      await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }
  });
});
