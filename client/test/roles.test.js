import assert from "node:assert/strict";
import test from "node:test";
import { etiquetaDeRol, rolesDisponibles } from "../src/shared/roles.js";

test("ofrece solo los roles que la persona todavía no tiene", () => {
  const disponibles = rolesDisponibles(["JURADO"]).map((rol) => rol.codigo);
  assert.deepEqual(disponibles, ["ADMINISTRADOR", "ESCRIBANO", "COMISARIO"]);
  assert.equal(rolesDisponibles([]).length, 4);
});

test("la etiqueta de un rol desconocido es su código", () => {
  assert.equal(etiquetaDeRol("JURADO"), "Jurado");
  assert.equal(etiquetaDeRol("OTRO"), "OTRO");
});
