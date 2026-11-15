import assert from "node:assert/strict";
import test from "node:test";
import { elegirRolInicial, puedeCambiarRol } from "../src/rol-activo.js";

test("con un solo rol, ese rol se usa directamente", () => {
  assert.equal(elegirRolInicial({ roles: ["JURADO"], guardado: null }), "JURADO");
});

test("con varios roles sin elección guardada, hay que elegir (devuelve null)", () => {
  assert.equal(elegirRolInicial({ roles: ["ESCRIBANO", "JURADO"], guardado: null }), null);
});

test("con varios roles se respeta la elección guardada si sigue asignada", () => {
  assert.equal(elegirRolInicial({ roles: ["ESCRIBANO", "JURADO"], guardado: "JURADO" }), "JURADO");
});

test("una elección guardada que ya no está asignada se descarta", () => {
  assert.equal(elegirRolInicial({ roles: ["ESCRIBANO"], guardado: "JURADO" }), "ESCRIBANO");
  assert.equal(elegirRolInicial({ roles: ["ESCRIBANO", "JURADO"], guardado: "ADMINISTRADOR" }), null);
});

test("sin roles no hay rol activo", () => {
  assert.equal(elegirRolInicial({ roles: [], guardado: null }), null);
});

test("solo se puede cambiar de rol si tiene más de uno", () => {
  assert.equal(puedeCambiarRol(["JURADO"]), false);
  assert.equal(puedeCambiarRol(["JURADO", "ESCRIBANO"]), true);
});
