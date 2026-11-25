import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Regla de dependencias de la API: shared/, infra/ y http/ son transversales y nunca importan
// módulos de negocio. Así el grafo no vuelve a acoplarse en los hubs (por ejemplo, manejo-errores).
const srcDir = fileURLToPath(new URL("../../src/", import.meta.url));
const modulosDir = path.join(srcDir, "modules") + path.sep;

function archivosJs(dir) {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivosJs(ruta);
    return nombre.endsWith(".js") ? [ruta] : [];
  });
}

// Devuelve los módulos de negocio que importa un archivo (relativos a src/).
function modulosImportados(archivo) {
  const texto = readFileSync(archivo, "utf8");
  const especificadores = [...texto.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']*)["']/g)]
    .map((coincidencia) => coincidencia[1]);
  return especificadores
    .map((especificador) => path.resolve(path.dirname(archivo), especificador))
    .filter((destino) => destino.startsWith(modulosDir))
    .map((destino) => path.relative(srcDir, destino));
}

for (const carpeta of ["shared", "infra", "http"]) {
  test(`${carpeta}/ no importa módulos de negocio`, () => {
    const incumplimientos = archivosJs(path.join(srcDir, carpeta)).flatMap((archivo) =>
      modulosImportados(archivo).map((destino) => `${path.relative(srcDir, archivo)} -> ${destino}`));
    assert.deepEqual(incumplimientos, []);
  });
}

// El motor puro se mantiene independiente de servicios y efectos externos.
test("el motor de resultados no importa infraestructura ni servicios", () => {
  const motor=readFileSync(path.join(srcDir,"modules/resultados/resultados.engine.js"),"utf8");
  assert.deepEqual([...motor.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']/g)], []);
});
