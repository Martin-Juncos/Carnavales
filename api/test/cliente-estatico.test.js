import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";

// Pool falso: estas pruebas no tocan la base; /health solo necesita SELECT 1.
const pool = { query: async () => ({ rows: [] }) };

function clienteDePrueba() {
  const dir = mkdtempSync(join(tmpdir(), "cliente-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>cliente</title>");
  writeFileSync(join(dir, "assets", "app.js"), "console.log('ok');");
  return dir;
}

async function conServidor(app, run) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
}

test("sirve el cliente compilado y su fallback de aplicación, sin tapar /api", async () => {
  const clienteDir = clienteDePrueba();
  try {
    const app = createApp({ pool, auth: null, clienteDir });
    await conServidor(app, async (base) => {
      const raiz = await fetch(`${base}/`);
      assert.equal(raiz.status, 200);
      assert.match(await raiz.text(), /cliente/);

      const ruta = await fetch(`${base}/aceptar-invitacion?token=x`);
      assert.equal(ruta.status, 200);
      assert.match(await ruta.text(), /cliente/);

      const archivo = await fetch(`${base}/assets/app.js`);
      assert.equal(archivo.status, 200);
      assert.match(await archivo.text(), /console\.log/);

      const salud = await fetch(`${base}/health`);
      assert.equal(salud.status, 200);

      const api = await fetch(`${base}/api/inexistente`);
      assert.equal(api.status, 404);
      assert.doesNotMatch(await api.text(), /cliente/);
    });
  } finally {
    rmSync(clienteDir, { recursive: true, force: true });
  }
});

test("sin clienteDir la API responde como antes", async () => {
  const app = createApp({ pool, auth: null });
  await conServidor(app, async (base) => {
    assert.equal((await fetch(`${base}/`)).status, 404);
    assert.equal((await fetch(`${base}/health`)).status, 200);
  });
});
