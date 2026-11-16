import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapFirstAdmin, existePrimerAdministrador } from "../src/bootstrap.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Necesita TEST_DATABASE_URL, igual que las pruebas de migraciones.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const secret = "b".repeat(48);
const baseUrl = "http://127.0.0.1:3000";
const datos = {
  name: "Admin inicial",
  email: "Admin@Example.test",
  password: "contraseña-de-prueba",
};

async function contar(pool, sql) {
  const { rows } = await pool.query(sql);
  return rows[0].n;
}

test("el bootstrap crea el primer administrador con sus marcas y rol", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const id = await bootstrapFirstAdmin({ pool, secret, baseUrl, ...datos });

    const { rows: [usuario] } = await pool.query(
      "SELECT correo, correo_verificado, doble_factor_habilitado FROM usuario WHERE id = $1",
      [id],
    );
    assert.equal(usuario.correo, "admin@example.test", "el correo se normaliza a minúsculas");
    assert.equal(usuario.correo_verificado, true);
    assert.equal(usuario.doble_factor_habilitado, true);

    const { rows: [asignacion] } = await pool.query(
      `SELECT r.codigo, ur.es_inicial, ur.asignado_por
         FROM usuario_rol ur JOIN rol r ON r.id = ur.rol_id
        WHERE ur.usuario_id = $1`,
      [id],
    );
    assert.deepEqual(asignacion, { codigo: "ADMINISTRADOR", es_inicial: true, asignado_por: null });
  });
});

test("el bootstrap guarda la contraseña como hash administrado por Better Auth", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await bootstrapFirstAdmin({ pool, secret, baseUrl, ...datos });

    const { rows } = await pool.query("SELECT hash_contrasena FROM cuenta");
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].hash_contrasena, datos.password);
    assert.doesNotMatch(rows[0].hash_contrasena, /contraseña-de-prueba/);
  });
});

test("una segunda ejecución se rechaza y no crea usuarios", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await bootstrapFirstAdmin({ pool, secret, baseUrl, ...datos });

    await assert.rejects(
      bootstrapFirstAdmin({ pool, secret, baseUrl, ...datos, email: "otro@example.test" }),
      { message: "Ya existe un primer administrador." },
    );
    assert.equal(await contar(pool, "SELECT count(*)::int AS n FROM usuario"), 1);
  });
});

test("dos bootstraps simultáneos dejan exactamente un administrador", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const resultados = await Promise.allSettled([
      bootstrapFirstAdmin({ pool, secret, baseUrl, ...datos, email: "a@example.test" }),
      bootstrapFirstAdmin({ pool, secret, baseUrl, ...datos, email: "b@example.test" }),
    ]);

    assert.equal(resultados.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await contar(pool, "SELECT count(*)::int AS n FROM usuario_rol WHERE es_inicial"), 1);
    assert.equal(
      await contar(pool, "SELECT count(*)::int AS n FROM usuario"),
      1,
      "el usuario del bootstrap perdedor no debe quedar creado",
    );
  });
});

test("existePrimerAdministrador es falso antes del bootstrap y verdadero después", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    assert.equal(await existePrimerAdministrador(pool), false);
    await bootstrapFirstAdmin({ pool, secret, baseUrl, ...datos });
    assert.equal(await existePrimerAdministrador(pool), true);
  });
});

test("una contraseña demasiado corta no crea ningún usuario", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await assert.rejects(
      bootstrapFirstAdmin({ pool, secret, baseUrl, ...datos, password: "corta" }),
    );
    assert.equal(await contar(pool, "SELECT count(*)::int AS n FROM usuario"), 0);
  });
});
