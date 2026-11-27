/*
 * Pruebas de integración de la API local.
 * Levantan un servidor efímero y verifican salud, login, OTP, replay idempotente,
 * sesión, cierre de sesión, cooldown de reenvío y CORS.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createAuthService } from '../src/auth-service.js';
import { createServerLocal } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const ACCESS_CODE = '12345';

function buildServer(overrides = {}) {
  const config = {
    ...loadConfig({}),
    host: '127.0.0.1',
    port: 0,
    resendCooldownMs: 250,
    ...overrides,
  };
  const codes = [];
  const authService = createAuthService({
    config,
    codeGenerator: () => ACCESS_CODE,
    onAccessCode: (event) => codes.push(event),
  });
  const server = createServerLocal({ config, authService });
  return { server, config, codes };
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

async function postJson(baseUrl, path, body, headers = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('API local de autenticación', () => {
  let baseUrl;
  let server;
  let codes;

  before(async () => {
    const built = buildServer();
    server = built.server;
    codes = built.codes;
    baseUrl = await listen(server);
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  it('responde el estado de salud', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: 'ok',
      service: 'carnavales-server-local',
    });
  });

  it('rechaza credenciales inválidas', async () => {
    const response = await postJson(baseUrl, '/api/auth/login', {
      email: 'jurado@carnavalesgoyanos.gob.ar',
      password: 'incorrecta',
    });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.error, 'credenciales_invalidas');
  });

  it('valida el código, permite replay idempotente y gestiona la sesión', async () => {
    const login = await postJson(baseUrl, '/api/auth/login', {
      email: 'JURADO@carnavalesgoyanos.gob.ar',
      password: 'carnaval2027',
    });
    assert.equal(login.status, 200);
    const challenge = await login.json();
    assert.ok(challenge.challengeId);
    assert.equal(challenge.maskedEmail, 'j*****@*****************.***.ar');
    assert.equal(codes.at(-1).code, ACCESS_CODE);

    const wrong = await postJson(baseUrl, '/api/auth/verify-code', {
      challengeId: challenge.challengeId,
      code: '00000',
    });
    assert.equal(wrong.status, 401);
    assert.equal((await wrong.json()).error, 'codigo_invalido');

    const verified = await postJson(baseUrl, '/api/auth/verify-code', {
      challengeId: challenge.challengeId,
      code: ACCESS_CODE,
    });
    assert.equal(verified.status, 200);
    const session = await verified.json();
    assert.ok(session.token);
    assert.deepEqual(session.user, {
      email: 'jurado@carnavalesgoyanos.gob.ar',
      role: 'jurado',
    });

    const replay = await postJson(baseUrl, '/api/auth/verify-code', {
      challengeId: challenge.challengeId,
      code: ACCESS_CODE,
    });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).token, session.token);

    const current = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(current.status, 200);
    assert.equal((await current.json()).user.email, session.user.email);

    const logout = await postJson(
      baseUrl,
      '/api/auth/logout',
      {},
      { Authorization: `Bearer ${session.token}` },
    );
    assert.equal(logout.status, 200);

    const afterLogout = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    assert.equal(afterLogout.status, 401);
  });

  it('rechaza el código después de superar los intentos', async () => {
    const login = await postJson(baseUrl, '/api/auth/login', {
      email: 'jurado@carnavalesgoyanos.gob.ar',
      password: 'carnaval2027',
    });
    const challenge = await login.json();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await postJson(baseUrl, '/api/auth/verify-code', {
        challengeId: challenge.challengeId,
        code: '00000',
      });
      assert.equal(response.status, 401);
    }

    const exhausted = await postJson(baseUrl, '/api/auth/verify-code', {
      challengeId: challenge.challengeId,
      code: '00000',
    });
    assert.equal(exhausted.status, 429);
    assert.equal((await exhausted.json()).error, 'demasiados_intentos');
  });

  it('respeta el cooldown del reenvío y emite un código nuevo', async () => {
    const login = await postJson(baseUrl, '/api/auth/login', {
      email: 'jurado@carnavalesgoyanos.gob.ar',
      password: 'carnaval2027',
    });
    const challenge = await login.json();

    const immediate = await postJson(baseUrl, '/api/auth/resend-code', {
      challengeId: challenge.challengeId,
    });
    assert.equal(immediate.status, 429);

    await new Promise((resolve) => setTimeout(resolve, 300));

    const resend = await postJson(baseUrl, '/api/auth/resend-code', {
      challengeId: challenge.challengeId,
    });
    assert.equal(resend.status, 200);
    assert.equal((await resend.json()).sent, true);
  });

  it('responde el preflight CORS para el origen del cliente', async () => {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(response.status, 204);
    assert.equal(
      response.headers.get('access-control-allow-origin'),
      'http://localhost:5173',
    );
  });
});
