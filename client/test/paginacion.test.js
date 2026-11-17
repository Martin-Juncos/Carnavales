import assert from "node:assert/strict";
import test from "node:test";
import { paginasTotales } from "../src/paginacion.js";

test("calcula las páginas necesarias y nunca devuelve menos de 1", () => {
  assert.equal(paginasTotales(0, 20), 1);
  assert.equal(paginasTotales(20, 20), 1);
  assert.equal(paginasTotales(21, 20), 2);
  assert.equal(paginasTotales(25, 10), 3);
});
