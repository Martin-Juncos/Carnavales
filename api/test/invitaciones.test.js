import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  crearInvitacion,
  reenviarInvitacion,
  revocarInvitacion,
} from "../src/modules/usuarios/invitaciones.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const hashDe = (token) => createHash("sha256").update(token).digest("hex");

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

// Entrega de prueba: guarda los enlaces enviados.
function enviadorDePrueba(enviados = []) {
  return async ({ correo, enlace }) => {
    enviados.push({ correo, enlace });
  };
}

function tokenDe(enlace) {
  return new URL(enlace).searchParams.get("token");
}

const ahora = new Date("2026-11-15T12:00:00Z");

test("crear guarda solo el hash del token, con 72 horas de vigencia", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const enviados = [];
    const resultado = await crearInvitacion(pool, {
      correo: "Nueva.Persona@Example.test",
      rolCodigo: "JURADO",
      creadaPor: admin,
      ahora,
      appUrl: "http://127.0.0.1:5173",
      enviar: enviadorDePrueba(enviados),
    });

    assert.equal(resultado.entrega, "enviada");
    const token = tokenDe(enviados[0].enlace);
    assert.ok(token && token.length >= 40, "el enlace debe llevar un token");

    const { rows: [fila] } = await pool.query(
      "SELECT correo_invitado, estado, hash_token, vence_en, creada_en FROM invitacion WHERE id = $1",
      [resultado.id],
    );
    assert.equal(fila.correo_invitado, "nueva.persona@example.test");
    assert.equal(fila.estado, "pendiente");
    assert.equal(fila.hash_token, hashDe(token));
    assert.notEqual(fila.hash_token, token, "el token nunca se guarda");
    assert.equal(fila.vence_en.getTime() - fila.creada_en.getTime(), 72 * 60 * 60 * 1000);
  });
});

test("crear rechaza un correo que ya tiene cuenta", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await assert.rejects(
      crearInvitacion(pool, {
        correo: "ADMIN@example.test",
        rolCodigo: "JURADO",
        creadaPor: admin,
        ahora,
        appUrl: "http://127.0.0.1:5173",
        enviar: enviadorDePrueba(),
      }),
      { codigo: "cuenta_existente" },
    );
  });
});

test("solo puede haber una invitación pendiente por correo", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const datos = {
      correo: "persona@example.test",
      rolCodigo: "JURADO",
      creadaPor: admin,
      ahora,
      appUrl: "http://127.0.0.1:5173",
      enviar: enviadorDePrueba(),
    };
    await crearInvitacion(pool, datos);
    await assert.rejects(crearInvitacion(pool, datos), { codigo: "pendiente_existente" });
  });
});

test("una pendiente vencida se marca vencida y permite una nueva", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const primera = await crearInvitacion(pool, {
      correo: "persona@example.test",
      rolCodigo: "JURADO",
      creadaPor: admin,
      ahora,
      appUrl: "http://127.0.0.1:5173",
      enviar: enviadorDePrueba(),
    });
    const despues = new Date(ahora.getTime() + 73 * 60 * 60 * 1000);
    const segunda = await crearInvitacion(pool, {
      correo: "persona@example.test",
      rolCodigo: "JURADO",
      creadaPor: admin,
      ahora: despues,
      appUrl: "http://127.0.0.1:5173",
      enviar: enviadorDePrueba(),
    });

    const { rows } = await pool.query(
      "SELECT id, estado FROM invitacion WHERE correo_invitado = 'persona@example.test' ORDER BY creada_en",
    );
    assert.deepEqual(rows.map((r) => r.estado), ["vencida", "pendiente"]);
    assert.equal(rows[0].id, primera.id);
    assert.equal(rows[1].id, segunda.id);
  });
});

test("reenviar revoca la pendiente, emite otra y el token anterior deja de valer", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const enviados = [];
    const original = await crearInvitacion(pool, {
      correo: "persona@example.test",
      rolCodigo: "JURADO",
      creadaPor: admin,
      ahora,
      appUrl: "http://127.0.0.1:5173",
      enviar: enviadorDePrueba(enviados),
    });
    const tokenAnterior = tokenDe(enviados[0].enlace);

    const nueva = await reenviarInvitacion(pool, {
      id: original.id,
      creadaPor: admin,
      ahora,
      appUrl: "http://127.0.0.1:5173",
      enviar: enviadorDePrueba(enviados),
    });

    const { rows } = await pool.query("SELECT id, estado FROM invitacion WHERE correo_invitado = 'persona@example.test' ORDER BY creada_en, id");
    const estados = Object.fromEntries(rows.map((r) => [r.id, r.estado]));
    assert.equal(estados[original.id], "revocada");
    assert.equal(estados[nueva.id], "pendiente");

    const { rows: [viejo] } = await pool.query(
      "SELECT id FROM invitacion WHERE hash_token = $1",
      [hashDe(tokenAnterior)],
    );
    assert.equal(viejo.id, original.id, "el token anterior sigue apuntando a la invitación revocada");
    assert.notEqual(tokenDe(enviados[1].enlace), tokenAnterior);
  });
});

test("reenviar una vencida emite una nueva sin tocar invitaciones aceptadas", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const original = await crearInvitacion(pool, {
      correo: "persona@example.test",
      rolCodigo: "JURADO",
      creadaPor: admin,
      ahora,
      appUrl: "http://127.0.0.1:5173",
      enviar: enviadorDePrueba(),
    });
    await pool.query("UPDATE invitacion SET estado = 'vencida' WHERE id = $1", [original.id]);

    const nueva = await reenviarInvitacion(pool, {
      id: original.id,
      creadaPor: admin,
      ahora,
      appUrl: "http://127.0.0.1:5173",
      enviar: enviadorDePrueba(),
    });
    const { rows: [fila] } = await pool.query("SELECT estado FROM invitacion WHERE id = $1", [nueva.id]);
    assert.equal(fila.estado, "pendiente");
  });
});

test("no se reenvía una invitación aceptada", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const original = await crearInvitacion(pool, {
      correo: "persona@example.test",
      rolCodigo: "JURADO",
      creadaPor: admin,
      ahora,
      appUrl: "http://127.0.0.1:5173",
      enviar: enviadorDePrueba(),
    });
    await pool.query(
      "UPDATE invitacion SET estado = 'aceptada', aceptada_en = $2 WHERE id = $1",
      [original.id, ahora],
    );
    await assert.rejects(
      reenviarInvitacion(pool, {
        id: original.id,
        creadaPor: admin,
        ahora,
        appUrl: "http://127.0.0.1:5173",
        enviar: enviadorDePrueba(),
      }),
      { codigo: "no_reenviable" },
    );
  });
});

test("revocar deja la fila con su fecha de revocación", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const original = await crearInvitacion(pool, {
      correo: "persona@example.test",
      rolCodigo: "JURADO",
      creadaPor: admin,
      ahora,
      appUrl: "http://127.0.0.1:5173",
      enviar: enviadorDePrueba(),
    });
    await revocarInvitacion(pool, { id: original.id, ahora });

    const { rows: [fila] } = await pool.query(
      "SELECT estado, revocada_en FROM invitacion WHERE id = $1",
      [original.id],
    );
    assert.equal(fila.estado, "revocada");
    assert.ok(fila.revocada_en);
  });
});

test("no se revoca una invitación aceptada", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const original = await crearInvitacion(pool, {
      correo: "persona@example.test",
      rolCodigo: "JURADO",
      creadaPor: admin,
      ahora,
      appUrl: "http://127.0.0.1:5173",
      enviar: enviadorDePrueba(),
    });
    await pool.query(
      "UPDATE invitacion SET estado = 'aceptada', aceptada_en = $2 WHERE id = $1",
      [original.id, ahora],
    );
    await assert.rejects(revocarInvitacion(pool, { id: original.id, ahora }), { codigo: "no_revocable" });
  });
});

test("si la entrega falla, la invitación queda pendiente y se informa", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const resultado = await crearInvitacion(pool, {
      correo: "persona@example.test",
      rolCodigo: "JURADO",
      creadaPor: admin,
      ahora,
      appUrl: "http://127.0.0.1:5173",
      enviar: async () => {
        throw new Error("SMTP caído");
      },
    });
    assert.equal(resultado.entrega, "fallida");
    const { rows: [fila] } = await pool.query("SELECT estado FROM invitacion WHERE id = $1", [resultado.id]);
    assert.equal(fila.estado, "pendiente");
  });
});
