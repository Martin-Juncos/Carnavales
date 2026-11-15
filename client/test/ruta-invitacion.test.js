import assert from "node:assert/strict";
import test from "node:test";
import { esRutaAceptarInvitacion, tokenDeBusqueda } from "../src/ruta-invitacion.js";

test("reconoce la ruta del enlace de invitación", () => {
  assert.equal(esRutaAceptarInvitacion("/aceptar-invitacion"), true);
  assert.equal(esRutaAceptarInvitacion("/aceptar-invitacion/"), true);
  assert.equal(esRutaAceptarInvitacion("/"), false);
  assert.equal(esRutaAceptarInvitacion("/aceptar-invitacion-otra"), false);
});

test("lee el token de la query y devuelve null si falta", () => {
  assert.equal(tokenDeBusqueda("?token=abc_DEF-123"), "abc_DEF-123");
  assert.equal(tokenDeBusqueda("?token="), null);
  assert.equal(tokenDeBusqueda(""), null);
});
