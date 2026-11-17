import assert from "node:assert/strict";
import test from "node:test";
import { segundosRestantes } from "../src/espera-otp.js";

test("cuenta hacia atrás desde 30 segundos tras un envío", () => {
  const envio = Date.parse("2026-11-15T12:00:00Z");
  assert.equal(segundosRestantes(envio, envio), 30);
  assert.equal(segundosRestantes(envio, envio + 12_000), 18);
});

test("llega a cero y no sigue bajando", () => {
  const envio = Date.parse("2026-11-15T12:00:00Z");
  assert.equal(segundosRestantes(envio, envio + 30_000), 0);
  assert.equal(segundosRestantes(envio, envio + 90_000), 0);
});

test("sin envío previo no hay espera", () => {
  assert.equal(segundosRestantes(null, Date.now()), 0);
});
