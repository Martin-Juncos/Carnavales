import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from 'node:assert/strict';
import test from 'node:test';
const src=fileURLToPath(new URL("../../src/", import.meta.url));
function archivos(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
    ? archivos(resolve(dir,e.name)) : /\.(js|jsx)$/.test(e.name) && !e.name.includes(".test.") ? [resolve(dir,e.name)] : []);
}
for (const area of ["shared", "components"]) {
  test(area + " no importa funcionalidades de negocio", () => {
    const errores=archivos(resolve(src,area)).flatMap(file => [...readFileSync(file,"utf8")
      .matchAll(/(?:from\s*|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)]
      .filter(m => resolve(dirname(file),m[1]).startsWith(resolve(src,"features")))
      .map(m => file + " -> " + m[1]));
    assert.deepEqual(errores, []);
  });
}
