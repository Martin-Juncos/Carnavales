import assert from "node:assert/strict";
import test from "node:test";
import { esRutaAceptarInvitacion, limpiarTokenDeLaUrl, tokenDeBusqueda } from "../src/ruta-invitacion.js";

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

test("limpia el token de la barra del navegador sin recargar la página", () => {
  const llamadas = [];
  const historial = { replaceState: (...args) => llamadas.push(args) };
  const ubicacion = { pathname: "/aceptar-invitacion", search: "?token=secreto" };

  limpiarTokenDeLaUrl(historial, ubicacion);

  assert.deepEqual(llamadas, [[null, "", "/aceptar-invitacion"]]);
});

test("no toca el historial si no hay token en la URL", () => {
  const llamadas = [];
  limpiarTokenDeLaUrl({ replaceState: (...args) => llamadas.push(args) }, { pathname: "/aceptar-invitacion", search: "" });
  assert.deepEqual(llamadas, []);
});
