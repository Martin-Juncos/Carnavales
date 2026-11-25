import assert from "node:assert/strict";
import test from "node:test";
import { crearEnviadorInvitacion, crearEnviadorOtp, crearEnviadorRecuperacion, loadEmailConfig } from "../../src/infra/email.js";

// Transporte falso: registra los correos en vez de enviarlos.
function transporteFalso() {
  const enviados = [];
  return { enviados, sendMail: async (mensaje) => enviados.push(mensaje) };
}

const remitente = "carnavales@example.test";

test("el código OTP por Gmail va al correo de la cuenta con el código y sin registrarlo en consola", async () => {
  const transporte = transporteFalso();
  const logs = [];
  const enviar = crearEnviadorOtp({ provider: "gmail", nodeEnv: "production", transporte, remitente, logger: { log: (m) => logs.push(m) } });

  await enviar({ user: { email: "ana@example.test" }, otp: "123456" });

  assert.equal(transporte.enviados.length, 1);
  assert.equal(transporte.enviados[0].from, remitente);
  assert.equal(transporte.enviados[0].to, "ana@example.test");
  assert.match(transporte.enviados[0].text, /123456/);
  assert.deepEqual(logs, [], "el código no debe quedar en los registros");
});

test("la invitación por Gmail incluye el enlace", async () => {
  const transporte = transporteFalso();
  const enviar = crearEnviadorInvitacion({ provider: "gmail", nodeEnv: "production", transporte, remitente });

  await enviar({ correo: "jurado@example.test", enlace: "http://localhost:5173/aceptar-invitacion?token=abc" });

  assert.equal(transporte.enviados[0].to, "jurado@example.test");
  assert.match(transporte.enviados[0].text, /aceptar-invitacion\?token=abc/);
});

test("Gmail exige usuario y contraseña de aplicación", () => {
  assert.throws(() => loadEmailConfig({ EMAIL_PROVIDER: "gmail" }), {
    message: "GMAIL_USER and GMAIL_APP_PASSWORD are required when EMAIL_PROVIDER=gmail.",
  });
  assert.throws(() => loadEmailConfig({ EMAIL_PROVIDER: "gmail", GMAIL_USER: "a@gmail.com" }), {
    message: "GMAIL_USER and GMAIL_APP_PASSWORD are required when EMAIL_PROVIDER=gmail.",
  });
  assert.deepEqual(
    loadEmailConfig({ EMAIL_PROVIDER: "gmail", GMAIL_USER: "a@gmail.com", GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop" }),
    { provider: "gmail", remitente: "a@gmail.com", usuario: "a@gmail.com", contrasenaAplicacion: "abcd efgh ijkl mnop" },
  );
});

test("sin proveedor configurado el envío falla explícitamente", async () => {
  const enviar = crearEnviadorOtp({ provider: undefined, nodeEnv: "production" });
  await assert.rejects(enviar({ user: { email: "a@example.test" }, otp: "123456" }), {
    message: "La entrega de correos no está configurada.",
  });
});

test("el enlace de recuperación por Gmail va al correo con el enlace y el vencimiento", async () => {
  const transporte = transporteFalso();
  const enviar = crearEnviadorRecuperacion({ provider: "gmail", nodeEnv: "production", transporte, remitente });

  await enviar({ correo: "ana@example.test", enlace: "http://localhost:5173/restablecer-contrasena?token=xyz" });

  assert.equal(transporte.enviados[0].to, "ana@example.test");
  assert.match(transporte.enviados[0].text, /restablecer-contrasena\?token=xyz/);
  assert.match(transporte.enviados[0].text, /60 minutos/);
});

test("en consola el enlace de recuperación aparece en la terminal, solo en desarrollo", async () => {
  const logs = [];
  const enviar = crearEnviadorRecuperacion({ provider: "console", nodeEnv: "development", logger: { log: (m) => logs.push(m) } });
  await enviar({ correo: "ana@example.test", enlace: "http://localhost:5173/restablecer-contrasena?token=xyz" });
  assert.match(logs[0], /Enlace de recuperación para ana@example\.test: .*token=xyz/);
  assert.throws(() => crearEnviadorRecuperacion({ provider: "console", nodeEnv: "production" }), {
    message: "EMAIL_PROVIDER=console no está permitido en producción.",
  });
});
