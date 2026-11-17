import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

const base = { DATABASE_URL: "postgres://usuario:clave@localhost:5432/carnavales" };

test("TRUST_PROXY por defecto es false: no se confía en cabeceras reenviadas", () => {
  assert.equal(loadConfig(base).trustProxy, false);
  assert.equal(loadConfig({ ...base, TRUST_PROXY: "false" }).trustProxy, false);
});

test("TRUST_PROXY acepta una cantidad de saltos de proxy", () => {
  assert.equal(loadConfig({ ...base, TRUST_PROXY: "1" }).trustProxy, 1);
  assert.equal(loadConfig({ ...base, TRUST_PROXY: "0" }).trustProxy, 0);
});

test("TRUST_PROXY inválido se rechaza con un mensaje claro", () => {
  assert.throws(() => loadConfig({ ...base, TRUST_PROXY: "-1" }), { message: "TRUST_PROXY must be false or a non-negative integer." });
  assert.throws(() => loadConfig({ ...base, TRUST_PROXY: "todos" }), { message: "TRUST_PROXY must be false or a non-negative integer." });
});

test("la aplicación aplica el valor de trust proxy a Express", () => {
  const pool = { query: async () => ({ rows: [] }) };
  assert.equal(createApp({ pool, auth: null, trustProxy: 1 }).get("trust proxy"), 1);
  assert.equal(createApp({ pool, auth: null }).get("trust proxy"), false);
});
