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

test("aceptar invitación envía token, nombre y contraseña al endpoint público", async () => {
  const llamadas = [];
  const api = crearClienteApi(async (ruta, opciones) => {
    llamadas.push({ ruta, opciones });
    return respuesta(201, { estado: "cuenta_creada" });
  });

  const resultado = await api.aceptarInvitacion("tok-1", "Ana Pérez", "contraseña-larga");

  assert.equal(llamadas[0].ruta, "/api/invitaciones/aceptar");
  assert.deepEqual(JSON.parse(llamadas[0].opciones.body), {
    token: "tok-1",
    nombre: "Ana Pérez",
    contrasena: "contraseña-larga",
  });
  assert.deepEqual(resultado, { ok: true, status: 201, cuerpo: { estado: "cuenta_creada" } });
});

test("listar usuarios arma la query con pagina, limite y búsqueda opcional", async () => {
  const llamadas = [];
  const api = crearClienteApi(async (ruta, opciones) => {
    llamadas.push({ ruta, opciones });
    return respuesta(200, { items: [], pagina: 2, limite: 20, total: 0 });
  });

  await api.listarUsuarios({ pagina: 2, limite: 20, buscar: "ana" });
  await api.listarUsuarios({ pagina: 1, limite: 20, buscar: "  " });

  assert.equal(llamadas[0].ruta, "/api/admin/usuarios?pagina=2&limite=20&buscar=ana");
  assert.equal(llamadas[0].opciones.method, "GET");
  assert.equal(llamadas[1].ruta, "/api/admin/usuarios?pagina=1&limite=20");
});

test("listar invitaciones omite los filtros vacíos y usa la ruta administrativa", async () => {
  const llamadas = [];
  const api = crearClienteApi(async (ruta, opciones) => {
    llamadas.push({ ruta, opciones });
    return respuesta(200, { items: [], pagina: 1, limite: 20, total: 0 });
  });

  await api.listarInvitaciones({ pagina: 1, limite: 20, estado: "pendiente", correo: "" });
  await api.listarInvitaciones({ pagina: 2, limite: 20, estado: "", correo: "ana@" });

  assert.equal(llamadas[0].ruta, "/api/admin/invitaciones?pagina=1&limite=20&estado=pendiente");
  assert.equal(llamadas[0].opciones.method, "GET");
  assert.equal(llamadas[1].ruta, "/api/admin/invitaciones?pagina=2&limite=20&correo=ana%40");
});

test("crear, reenviar y revocar invitaciones usan sus rutas y envían los datos", async () => {
  const llamadas = [];
  const api = crearClienteApi(async (ruta, opciones) => {
    llamadas.push({ ruta, opciones });
    return respuesta(201, { id: "inv-1", entrega: "enviada" });
  });

  await api.crearInvitacion("nuevo@example.test", "JURADO");
  await api.reenviarInvitacion("inv-1");
  await api.revocarInvitacion("inv-1");

  assert.equal(llamadas[0].ruta, "/api/admin/invitaciones");
  assert.deepEqual(JSON.parse(llamadas[0].opciones.body), { correo: "nuevo@example.test", rol: "JURADO" });
  assert.equal(llamadas[1].ruta, "/api/admin/invitaciones/inv-1/reenviar");
  assert.equal(llamadas[2].ruta, "/api/admin/invitaciones/inv-1/revocar");
});
