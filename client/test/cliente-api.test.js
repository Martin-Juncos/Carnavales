import assert from "node:assert/strict";
import test from "node:test";
import { crearClienteApi } from "../src/cliente-api.js";

// Respuesta simulada de fetch con cuerpo JSON.
function respuesta(status, cuerpo) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
}

test("envía JSON con cookies del mismo origen y devuelve estado y cuerpo", async () => {
  const llamadas = [];
  const api = crearClienteApi(async (ruta, opciones) => {
    llamadas.push({ ruta, opciones });
    return respuesta(200, { twoFactorRedirect: true });
  });

  const resultado = await api.iniciarSesion("ana@example.test", "contraseña-larga");

  assert.equal(llamadas[0].ruta, "/api/auth/sign-in/email");
  assert.equal(llamadas[0].opciones.method, "POST");
  assert.equal(llamadas[0].opciones.credentials, "same-origin");
  assert.deepEqual(JSON.parse(llamadas[0].opciones.body), { email: "ana@example.test", password: "contraseña-larga" });
  assert.deepEqual(resultado, { ok: true, status: 200, cuerpo: { twoFactorRedirect: true } });
});

test("un error del servidor devuelve ok false con su mensaje", async () => {
  const api = crearClienteApi(async () => respuesta(429, { message: "Esperá 30 segundos antes de pedir otro código." }));
  const resultado = await api.pedirCodigo();
  assert.equal(resultado.ok, false);
  assert.equal(resultado.status, 429);
  assert.equal(resultado.cuerpo.message, "Esperá 30 segundos antes de pedir otro código.");
});

test("una respuesta sin JSON no rompe el cliente", async () => {
  const api = crearClienteApi(async () => new Response("<html>", { status: 500 }));
  const resultado = await api.cerrarSesion();
  assert.deepEqual(resultado, { ok: false, status: 500, cuerpo: null });
});

test("verificar envía el código y consultar la sesión usa GET", async () => {
  const llamadas = [];
  const api = crearClienteApi(async (ruta, opciones) => {
    llamadas.push({ ruta, opciones });
    return respuesta(200, { user: { email: "ana@example.test" } });
  });

  await api.verificarCodigo("123456");
  await api.obtenerSesion();

  assert.equal(llamadas[0].ruta, "/api/auth/two-factor/verify-otp");
  assert.deepEqual(JSON.parse(llamadas[0].opciones.body), { code: "123456" });
  assert.equal(llamadas[1].ruta, "/api/auth/get-session");
  assert.equal(llamadas[1].opciones.method, "GET");
});
