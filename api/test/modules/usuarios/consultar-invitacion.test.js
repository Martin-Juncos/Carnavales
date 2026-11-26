import assert from "node:assert/strict";
import test from "node:test";
import { consultarInvitacion, crearInvitacion } from "../../../src/modules/usuarios/invitaciones.js";
import { withIsolatedSchema } from "../../helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const ahora = new Date("2026-11-15T12:00:00Z");

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

async function invitar(pool, { correo = "persona@example.test", fecha = ahora } = {}) {
  const enlaces = [];
  const { id } = await crearInvitacion(pool, {
    correo,
    rolCodigo: "JURADO",
    creadaPor: admin,
    ahora: fecha,
    appUrl: "http://127.0.0.1:5173",
    enviar: async ({ enlace }) => {
      enlaces.push(enlace);
    },
  });
  return { id, token: new URL(enlaces[0]).searchParams.get("token") };
}

test("consultar devuelve correo y vencimiento sin consumir el token", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const { token } = await invitar(pool);

    const consulta = await consultarInvitacion(pool, { token, ahora: new Date(ahora.getTime() + 1000) });

    assert.equal(consulta.correo, "persona@example.test");
    assert.equal(consulta.nombre, null);
    assert.equal(new Date(consulta.venceEn).getTime(), ahora.getTime() + 72 * 60 * 60 * 1000);

    // El token sigue disponible para la aceptación posterior.
    const segunda = await consultarInvitacion(pool, { token, ahora: new Date(ahora.getTime() + 2000) });
    assert.equal(segunda.correo, "persona@example.test");
  });
});

test("consultar rechaza tokens vencidos, revocados o inexistentes con el mensaje genérico", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const vigente = await invitar(pool, { correo: "a@example.test" });
    const revocada = await invitar(pool, { correo: "b@example.test" });
    await pool.query("UPDATE invitacion SET estado = 'revocada', revocada_en = $2 WHERE id = $1", [revocada.id, ahora]);

    await assert.rejects(
      consultarInvitacion(pool, { token: vigente.token, ahora: new Date(ahora.getTime() + 73 * 60 * 60 * 1000) }),
      { codigo: "invitacion_invalida" },
    );
    await assert.rejects(
      consultarInvitacion(pool, { token: revocada.token, ahora }),
      { codigo: "invitacion_invalida" },
    );
    await assert.rejects(
      consultarInvitacion(pool, { token: "inexistente", ahora }),
      { codigo: "invitacion_invalida" },
    );
  });
});
