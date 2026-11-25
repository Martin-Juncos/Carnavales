import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { createApp } from "../../../src/app.js";
import { createAuth } from "../../../src/modules/auth/auth.js";
import { bootstrapFirstAdmin } from "../../../src/modules/auth/bootstrap.js";
import { withIsolatedSchema } from "../../helpers/isolated-schema.js";

// Prueba de punta a punta: contraseña, código OTP y sesión, por HTTP.
// Necesita TEST_DATABASE_URL, igual que las demás pruebas de base de datos.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const secret = "c".repeat(48);
const datos = {
  name: "Admin inicial",
  email: "admin@example.test",
  password: "contraseña-de-prueba",
};

// Extrae las cookies de una respuesta como texto "nombre=valor; ..." para reenviarlas.
function cookiesDe(response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

// Reserva un puerto libre para usarlo como URL base de Better Auth y como puerto del servidor.
async function puertoLibre() {
  const reserva = net.createServer();
  await new Promise((resolve) => reserva.listen(0, "127.0.0.1", resolve));
  const { port } = reserva.address();
  await new Promise((resolve) => reserva.close(resolve));
  return port;
}

async function conServidor(app, port, run) {
  const server = app.listen(port, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("inicio de sesión: contraseña, código OTP y sesión autenticada", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const port = await puertoLibre();
    const baseUrl = `http://127.0.0.1:${port}`;
    await bootstrapFirstAdmin({ pool, secret, baseUrl, ...datos });

    const codigos = [];
    const auth = createAuth({
      pool,
      secret,
      baseUrl,
      sendOTP: async ({ otp }) => {
        codigos.push(otp);
      },
    });
    const app = createApp({ pool, auth });

    await conServidor(app, port, async (url) => {
      // 1. Contraseña correcta: no hay sesión todavía, solo un desafío de segundo factor.
      const login = await fetch(`${url}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: url },
        body: JSON.stringify({ email: datos.email, password: datos.password }),
      });
      assert.equal(login.status, 200);
      assert.equal((await login.json()).twoFactorRedirect, true);
      const desafio = cookiesDe(login);
      assert.ok(desafio, "el desafío de segundo factor debe llegar en una cookie");

      // 2. Se envía el código por el canal configurado.
      const envio = await fetch(`${url}/api/auth/two-factor/send-otp`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: url, cookie: desafio },
        body: JSON.stringify({}),
      });
      assert.equal(envio.status, 200);
      assert.equal(codigos.length, 1);
      assert.match(codigos[0], /^\d{6}$/);

      // 3. Código correcto: se crea la sesión autenticada.
      const verificacion = await fetch(`${url}/api/auth/two-factor/verify-otp`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: url, cookie: desafio },
        body: JSON.stringify({ code: codigos[0] }),
      });
      assert.equal(verificacion.status, 200);
      const sesion = cookiesDe(verificacion);
      assert.ok(sesion, "la sesión autenticada debe llegar en una cookie");

      // 4. La sesión identifica al administrador.
      const yo = await fetch(`${url}/api/auth/get-session`, {
        headers: { cookie: sesion },
      });
      const cuerpo = await yo.json();
      assert.equal(cuerpo.user.email, datos.email);
    });
  });
});

test("una contraseña incorrecta no inicia sesión ni pide código", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const port = await puertoLibre();
    const baseUrl = `http://127.0.0.1:${port}`;
    await bootstrapFirstAdmin({ pool, secret, baseUrl, ...datos });
    const auth = createAuth({ pool, secret, baseUrl, sendOTP: async () => {} });
    const app = createApp({ pool, auth });

    await conServidor(app, port, async (url) => {
      const login = await fetch(`${url}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: url },
        body: JSON.stringify({ email: datos.email, password: "contraseña-equivocada" }),
      });
      assert.equal(login.status, 401);
      assert.equal(cookiesDe(login), "");
    });
  });
});

async function iniciarDesafio(url, email, password) {
  const login = await fetch(`${url}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200);
  return cookiesDe(login);
}

async function pedirCodigo(url, cookie) {
  return fetch(`${url}/api/auth/two-factor/send-otp`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: url, cookie },
    body: JSON.stringify({}),
  });
}

test("un segundo código dentro de 30 segundos responde 429", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const port = await puertoLibre();
    const baseUrl = `http://127.0.0.1:${port}`;
    await bootstrapFirstAdmin({ pool, secret, baseUrl, ...datos });
    const auth = createAuth({ pool, secret, baseUrl, sendOTP: async () => {} });
    const app = createApp({ pool, auth });

    await conServidor(app, port, async (url) => {
      const desafio = await iniciarDesafio(url, datos.email, datos.password);
      assert.equal((await pedirCodigo(url, desafio)).status, 200);

      const repetido = await pedirCodigo(url, desafio);
      assert.equal(repetido.status, 429);
    });
  });
});

test("si la entrega del código falla, la respuesta es error y no hay sesión", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const port = await puertoLibre();
    const baseUrl = `http://127.0.0.1:${port}`;
    await bootstrapFirstAdmin({ pool, secret, baseUrl, ...datos });
    const auth = createAuth({
      pool,
      secret,
      baseUrl,
      sendOTP: async () => {
        throw new Error("SMTP caído");
      },
    });
    const app = createApp({ pool, auth });

    await conServidor(app, port, async (url) => {
      const desafio = await iniciarDesafio(url, datos.email, datos.password);
      const envio = await pedirCodigo(url, desafio);
      assert.equal(envio.status, 503);
      const cuerpo = await envio.text();
      assert.doesNotMatch(cuerpo, /SMTP caído/, "el detalle técnico no debe llegar al cliente");
    });
  });
});
