import assert from "node:assert/strict";
import test from "node:test";
import { crearClienteApi } from "../../src/shared/api/cliente-api.js";

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

test("eliminar una edición envía la confirmación JSON explícita", async () => {
  let llamada;
  const api = crearClienteApi(async (ruta, opciones) => {
    llamada = { ruta, opciones };
    return respuesta(200, {});
  });

  await api.eliminarEdicion("edicion-1");

  assert.equal(llamada.ruta, "/api/admin/ediciones/edicion-1");
  assert.equal(llamada.opciones.method, "DELETE");
  assert.equal(llamada.opciones.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(llamada.opciones.body), { confirmar: true });
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

test("consultar una invitación usa GET y codifica el token", async () => {
  const llamadas = [];
  const api = crearClienteApi(async (ruta, opciones) => {
    llamadas.push({ ruta, opciones });
    return respuesta(200, { correo: "ana@example.test", nombre: null });
  });

  const resultado = await api.consultarInvitacion("tok/1 +");

  assert.equal(llamadas[0].ruta, "/api/invitaciones?token=tok%2F1%20%2B");
  assert.equal(llamadas[0].opciones.method, "GET");
  assert.equal(llamadas[0].opciones.cache, "no-store");
  assert.equal(resultado.ok, true);
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

test("asignar y retirar roles y eliminar usuarios usan sus rutas administrativas", async () => {
  const llamadas = [];
  const api = crearClienteApi(async (ruta, opciones) => {
    llamadas.push({ ruta, opciones });
    return respuesta(200, { usuarioId: "u-1" });
  });

  await api.asignarRol("u-1", "ESCRIBANO");
  await api.retirarRol("u-1", "ESCRIBANO");
  await api.eliminarUsuario("u-1");

  assert.equal(llamadas[0].ruta, "/api/admin/usuarios/u-1/roles/ESCRIBANO");
  assert.equal(llamadas[0].opciones.method, "POST");
  assert.equal(llamadas[1].ruta, "/api/admin/usuarios/u-1/roles/ESCRIBANO");
  assert.equal(llamadas[1].opciones.method, "DELETE");
  assert.equal(llamadas[2].ruta, "/api/admin/usuarios/u-1");
  assert.equal(llamadas[2].opciones.method, "DELETE");
});

test("obtener mis roles usa la ruta propia por GET", async () => {
  const llamadas = [];
  const api = crearClienteApi(async (ruta, opciones) => {
    llamadas.push({ ruta, opciones });
    return respuesta(200, { roles: ["JURADO"] });
  });

  const resultado = await api.obtenerMisRoles();

  assert.equal(llamadas[0].ruta, "/api/mi-cuenta/roles");
  assert.equal(llamadas[0].opciones.method, "GET");
  assert.deepEqual(resultado.cuerpo, { roles: ["JURADO"] });
});

test("validar el enlace de recuperación usa GET y codifica el token", async () => {
  const llamadas = [];
  const api = crearClienteApi(async (ruta, opciones) => {
    llamadas.push({ ruta, opciones });
    return respuesta(200, { valido: true });
  });

  const resultado = await api.validarRecuperacion("tok/9 +");

  assert.equal(llamadas[0].ruta, "/api/recuperacion/validar?token=tok%2F9%20%2B");
  assert.equal(llamadas[0].opciones.method, "GET");
  assert.equal(llamadas[0].opciones.cache, "no-store");
  assert.deepEqual(resultado, { ok: true, status: 200, cuerpo: { valido: true } });
});

test("pedir recuperación envía el correo y la URL de retorno; restablecer envía token y nueva contraseña", async () => {
  const llamadas = [];
  const api = crearClienteApi(async (ruta, opciones) => {
    llamadas.push({ ruta, opciones });
    return respuesta(200, { status: true });
  });

  await api.pedirRecuperacion("ana@example.test", "http://localhost:5173/restablecer-contrasena");
  await api.restablecerContrasena("tok-9", "contraseña-nueva-123");

  assert.equal(llamadas[0].ruta, "/api/auth/request-password-reset");
  assert.deepEqual(JSON.parse(llamadas[0].opciones.body), {
    email: "ana@example.test",
    redirectTo: "http://localhost:5173/restablecer-contrasena",
  });
  assert.equal(llamadas[1].ruta, "/api/auth/reset-password");
  assert.deepEqual(JSON.parse(llamadas[1].opciones.body), { token: "tok-9", newPassword: "contraseña-nueva-123" });
});

test("emitir acta envía el operationId del cliente y la confirmación explícita", async () => {
  const llamadas = [];
  const api = crearClienteApi(async (ruta, opciones) => {
    llamadas.push({ ruta, opciones });
    return respuesta(201, { id: "acta-1" });
  });

  const resultado = await api.emitirActa("e1", "calc1", "op-1");

  assert.equal(llamadas[0].ruta, "/api/escribano/ediciones/e1/resultados/calc1/actas");
  assert.equal(llamadas[0].opciones.method, "POST");
  assert.equal(llamadas[0].opciones.cache, "no-store");
  assert.deepEqual(JSON.parse(llamadas[0].opciones.body), { operationId: "op-1", confirmar: true });
  assert.deepEqual(resultado, { ok: true, status: 201, cuerpo: { id: "acta-1" } });
});

test("listar, descargar y verificar actas usan las rutas públicas de resultados", async () => {
  const llamadas = [];
  const api = crearClienteApi(async (ruta, opciones) => {
    llamadas.push({ ruta, opciones });
    if (ruta.endsWith("/descargar")) {
      return new Response(new Blob([new Uint8Array([1, 2, 3])]), {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="acta-e1-v1.pdf"',
        },
      });
    }
    return respuesta(200, { items: [] });
  });

  await api.listarActas("e1");
  await api.descargarActa("e1", "acta-1", "pdf");
  await api.verificarActa("e1", "acta-1", "csv");

  assert.equal(llamadas[0].ruta, "/api/resultados/ediciones/e1/actas");
  assert.equal(llamadas[0].opciones.method, "GET");
  assert.equal(llamadas[1].ruta, "/api/resultados/ediciones/e1/actas/acta-1/pdf/descargar");
  assert.equal(llamadas[1].opciones.method, "GET");
  assert.equal(llamadas[1].opciones.credentials, "same-origin");
  assert.equal(llamadas[2].ruta, "/api/resultados/ediciones/e1/actas/acta-1/csv/verificar");
});

test("la descarga de acta devuelve el blob y el nombre del archivo sin encabezados sensibles", async () => {
  const api = crearClienteApi(async () => new Response(new Blob([new Uint8Array([1, 2, 3])]), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="acta-e1-v1.pdf"' },
  }));

  const resultado = await api.descargarActa("e1", "acta-1", "PDF");
  const cuerpo = resultado.cuerpo;

  assert.equal(resultado.ok, true);
  assert.ok(cuerpo.blob instanceof Blob);
  assert.equal(cuerpo.blob.size, 3);
  assert.equal(cuerpo.nombreArchivo, "acta-e1-v1.pdf");
  assert.deepEqual(Object.keys(cuerpo).sort(), ["blob", "nombreArchivo"]);
});
