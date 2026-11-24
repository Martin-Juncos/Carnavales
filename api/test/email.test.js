import assert from "node:assert/strict";
import test from "node:test";
import { crearEnviadorOtp } from "../src/infra/email.js";

const usuario = { email: "persona@example.test" };

test("con EMAIL_PROVIDER=console en desarrollo, el código se muestra en la consola", async () => {
  const lineas = [];
  const logger = { log: (linea) => lineas.push(linea) };
  const enviar = crearEnviadorOtp({ provider: "console", nodeEnv: "development", logger });

  await enviar({ user: usuario, otp: "123456" });

  assert.equal(lineas.length, 1);
  assert.match(lineas[0], /persona@example\.test/);
  assert.match(lineas[0], /123456/);
});

test("el modo console no se permite en producción", () => {
  assert.throws(
    () => crearEnviadorOtp({ provider: "console", nodeEnv: "production", logger: { log() {} } }),
    { message: "EMAIL_PROVIDER=console no está permitido en producción." },
  );
});

test("sin proveedor configurado, el envío falla sin mostrar el código", async () => {
  const lineas = [];
  const enviar = crearEnviadorOtp({
    provider: undefined,
    nodeEnv: "development",
    logger: { log: (linea) => lineas.push(linea) },
  });

  await assert.rejects(enviar({ user: usuario, otp: "654321" }), {
    message: "La entrega de correos no está configurada.",
  });
  assert.equal(lineas.length, 0);
});
