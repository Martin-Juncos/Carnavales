import assert from "node:assert/strict";
import test from "node:test";
import { registrarEnvioOtp } from "../../../src/modules/auth/limite-envio-otp.js";
import { withIsolatedSchema } from "../../helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const inicio = new Date("2026-11-15T12:00:00Z");
const segundos = (n) => new Date(inicio.getTime() + n * 1000);

test("una cuenta espera 30 segundos entre códigos", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const primero = await registrarEnvioOtp(pool, { usuarioId: "u1", ip: "10.0.0.1", ahora: segundos(0) });
    assert.deepEqual(primero, { permitido: true });

    const muyPronto = await registrarEnvioOtp(pool, { usuarioId: "u1", ip: "10.0.0.1", ahora: segundos(29) });
    assert.deepEqual(muyPronto, { permitido: false, motivo: "cuenta" });

    const despues = await registrarEnvioOtp(pool, { usuarioId: "u1", ip: "10.0.0.1", ahora: segundos(30) });
    assert.deepEqual(despues, { permitido: true });
  });
});

test("la espera de una cuenta no afecta a otras cuentas", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await registrarEnvioOtp(pool, { usuarioId: "u1", ip: "10.0.0.1", ahora: segundos(0) });
    const otra = await registrarEnvioOtp(pool, { usuarioId: "u2", ip: "10.0.0.2", ahora: segundos(1) });
    assert.deepEqual(otra, { permitido: true });
  });
});

test("una IP puede pedir 5 códigos en 10 minutos y el sexto se rechaza", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    for (let i = 0; i < 5; i++) {
      const r = await registrarEnvioOtp(pool, { usuarioId: `u${i}`, ip: "10.0.0.9", ahora: segundos(i) });
      assert.deepEqual(r, { permitido: true }, `envío ${i + 1} debe permitirse`);
    }
    const sexto = await registrarEnvioOtp(pool, { usuarioId: "u-extra", ip: "10.0.0.9", ahora: segundos(10) });
    assert.deepEqual(sexto, { permitido: false, motivo: "ip" });
  });
});

test("la ventana de la IP se reinicia a los 10 minutos", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    for (let i = 0; i < 5; i++) {
      await registrarEnvioOtp(pool, { usuarioId: `u${i}`, ip: "10.0.0.9", ahora: segundos(i) });
    }
    const nueva = await registrarEnvioOtp(pool, { usuarioId: "u-nueva", ip: "10.0.0.9", ahora: segundos(600) });
    assert.deepEqual(nueva, { permitido: true });
  });
});

test("un envío rechazado no consume el cupo de la IP", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await registrarEnvioOtp(pool, { usuarioId: "u1", ip: "10.0.0.7", ahora: segundos(0) });
    // Rechazado por la espera de la cuenta u1: no debe contar para la IP.
    const rechazado = await registrarEnvioOtp(pool, { usuarioId: "u1", ip: "10.0.0.7", ahora: segundos(5) });
    assert.deepEqual(rechazado, { permitido: false, motivo: "cuenta" });

    // La IP aún tiene 4 cupos: sumando el primero, 5 envíos en total son válidos.
    for (let i = 2; i <= 5; i++) {
      const r = await registrarEnvioOtp(pool, { usuarioId: `u${i}`, ip: "10.0.0.7", ahora: segundos(i * 10) });
      assert.deepEqual(r, { permitido: true }, `envío ${i} debe permitirse`);
    }
  });
});
