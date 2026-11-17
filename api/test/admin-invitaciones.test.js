import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import express from "express";
import { crearRutasAdminInvitaciones } from "../src/admin-invitaciones.js";
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

// Sesión simulada según el usuario que llama.
function sesionDe(usuarioId) {
  return async (request) => {
    const cabecera = request.headers["x-usuario-prueba"];
    return cabecera === usuarioId ? { user: { id: usuarioId } } : null;
  };
}

function appDeInvitaciones(pool, { enviar, enviados = [] }) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/admin/invitaciones",
    crearRutasAdminInvitaciones({
      pool,
      obtenerSesion: async (request) => sesionDe(request.headers["x-usuario-prueba"] ?? "")(request),
      appUrl: "http://127.0.0.1:5173",
      enviar:
        enviar ??
        (async (datos) => {
          enviados.push(datos);
        }),
    }),
  );
  return app;
}

async function conServidor(app, run) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function crear(url, usuario, correo) {
  const headers = { "content-type": "application/json" };
  if (usuario) headers["x-usuario-prueba"] = usuario;
  return fetch(`${url}/api/admin/invitaciones`, {
    method: "POST",
    headers,
    body: JSON.stringify({ correo, rol: "JURADO" }),
  });
}

test("solo un administrador puede crear invitaciones", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appDeInvitaciones(pool, {}), async (url) => {
      assert.equal((await crear(url, "", "nueva@example.test")).status, 401);
      assert.equal((await crear(url, jurado, "nueva@example.test")).status, 403);
      assert.equal((await crear(url, admin, "nueva@example.test")).status, 201);
    });
  });
});

test("la respuesta nunca muestra el token ni su hash", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const enviados = [];
    await conServidor(appDeInvitaciones(pool, { enviados }), async (url) => {
      const respuesta = await crear(url, admin, "nueva@example.test");
      const cuerpo = await respuesta.text();
      const token = new URL(enviados[0].enlace).searchParams.get("token");
      const hash = createHash("sha256").update(token).digest("hex");

      assert.ok(!cuerpo.includes(token), "la respuesta no debe contener el token");
      assert.ok(!cuerpo.includes(hash), "la respuesta no debe contener el hash");
      assert.equal(JSON.parse(cuerpo).entrega, "enviada");
    });
  });
});

test("un segundo alta para el mismo correo responde 409", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appDeInvitaciones(pool, {}), async (url) => {
      await crear(url, admin, "nueva@example.test");
      const repetida = await crear(url, admin, "nueva@example.test");
      assert.equal(repetida.status, 409);
    });
  });
});

test("si la entrega falla responde 502 con la invitación pendiente", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const app = appDeInvitaciones(pool, {
      enviar: async () => {
        throw new Error("SMTP caído");
      },
    });
    await conServidor(app, async (url) => {
      const respuesta = await crear(url, admin, "nueva@example.test");
      assert.equal(respuesta.status, 502);
      const cuerpo = await respuesta.json();
      assert.equal(cuerpo.error, "entrega_fallida");
      assert.ok(cuerpo.id, "el id permite reenviar sin crear otra invitación");
      const { rows: [fila] } = await pool.query("SELECT estado FROM invitacion WHERE id = $1", [cuerpo.id]);
      assert.equal(fila.estado, "pendiente");
    });
  });
});

test("reenviar y revocar responden según el estado de la invitación", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appDeInvitaciones(pool, {}), async (url) => {
      const { id } = await (await crear(url, admin, "nueva@example.test")).json();

      const reenvio = await fetch(`${url}/api/admin/invitaciones/${id}/reenviar`, {
        method: "POST",
        headers: { "x-usuario-prueba": admin },
      });
      assert.equal(reenvio.status, 201);
      const nueva = await reenvio.json();

      const revocacion = await fetch(`${url}/api/admin/invitaciones/${nueva.id}/revocar`, {
        method: "POST",
        headers: { "x-usuario-prueba": admin },
      });
      assert.equal(revocacion.status, 200);

      const repetida = await fetch(`${url}/api/admin/invitaciones/${nueva.id}/revocar`, {
        method: "POST",
        headers: { "x-usuario-prueba": admin },
      });
      assert.equal(repetida.status, 409);
    });
  });
});
