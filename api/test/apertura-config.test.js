import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/infra/config.js";

const base = { DATABASE_URL: "postgres://app:clave@127.0.0.1:5432/carnavales" };

test("sin DATABASE_URL_APERTURA la configuración no define cuenta de apertura", () => {
  assert.equal(loadConfig(base).aperturaDatabaseUrl, undefined);
});

test("DATABASE_URL_APERTURA se lee como segunda URL de PostgreSQL", () => {
  const apertura = "postgres://apertura:clave@127.0.0.1:5432/carnavales";
  assert.equal(loadConfig({ ...base, DATABASE_URL_APERTURA: apertura }).aperturaDatabaseUrl, apertura);
});

test("DATABASE_URL_APERTURA vacía equivale a no configurarla", () => {
  assert.equal(loadConfig({ ...base, DATABASE_URL_APERTURA: "   " }).aperturaDatabaseUrl, undefined);
});

test("DATABASE_URL_APERTURA inválida se rechaza con el nombre de la variable", () => {
  assert.throws(
    () => loadConfig({ ...base, DATABASE_URL_APERTURA: "http://no-es-postgres" }),
    /DATABASE_URL_APERTURA must be a valid PostgreSQL connection URL\./,
  );
});
