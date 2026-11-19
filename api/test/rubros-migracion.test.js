import assert from "node:assert/strict";
import test from "node:test";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

// Verifica las reglas persistentes de la migración 0010 (rubros, escala, requisitos y premios).
// Requiere TEST_DATABASE_URL apuntando a una base descartable.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const edicion = "10000000-0000-0000-0000-000000000027";
const otraEdicion = "10000000-0000-0000-0000-000000000026";
const versionBorrador = "30000000-0000-0000-0000-000000000001";
const versionPublicada = "30000000-0000-0000-0000-000000000002";
const especialidadUno = "40000000-0000-0000-0000-000000000001";
const especialidadAjena = "40000000-0000-0000-0000-000000000002";

async function preparar(pool) {
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Admin', 'admin@example.test', true)`,
    [admin],
  );
  await pool.query(
    `INSERT INTO edicion (id, nombre, anio, estado, creada_por)
     VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $3),
            ($2, 'Carnaval 2026', 2026, 'CONFIGURING', $3)`,
    [edicion, otraEdicion, admin],
  );
  await pool.query(
    `INSERT INTO version_reglamento (id, edicion_id, numero, estado, fuente, creada_por)
     VALUES ($1, $2, 1, 'BORRADOR', 'Borrador de prueba', $3)`,
    [versionBorrador, edicion, admin],
  );
  await pool.query(
    `INSERT INTO version_reglamento (id, edicion_id, numero, estado, fuente, creada_por)
     VALUES ($1, $2, 2, 'BORRADOR', 'Publicada de prueba', $3)`,
    [versionPublicada, otraEdicion, admin],
  );
  await pool.query(
    `UPDATE version_reglamento
        SET estado = 'PUBLICADA', publicada_por = $2, publicada_en = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [versionPublicada, admin],
  );
  await pool.query(
    `INSERT INTO especialidad (id, edicion_id, nombre, codigo, orden)
     VALUES ($1, $3, 'Vestuario', 'J1', 1), ($2, $4, 'Ajena', 'J9', 1)`,
    [especialidadUno, especialidadAjena, edicion, otraEdicion],
  );
}

async function esperarError(consulta, mensaje) {
  await assert.rejects(consulta, (error) => error.message.includes(mensaje) || error.constraint?.includes(mensaje), mensaje);
}

test("un rubro aleatorio exige su máximo de nominados y el tipo de sujeto es del catálogo", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);

    await esperarError(
      pool.query(
        `INSERT INTO rubro_version (version_id, edicion_id, codigo, nombre, tipo_sujeto, tipo_rubro, orden)
         VALUES ($1, $2, 'R1', 'Aleatorio sin máximo', 'CARRO', 'ALEATORIO', 1)`,
        [versionBorrador, edicion],
      ),
      "rubro_version_check",
    );
    await esperarError(
      pool.query(
        `INSERT INTO rubro_version (version_id, edicion_id, codigo, nombre, tipo_sujeto, orden)
         VALUES ($1, $2, 'R2', 'Tipo inventado', 'OTRO', 1)`,
        [versionBorrador, edicion],
      ),
      "rubro_version_tipo_sujeto_check",
    );

    await pool.query(
      `INSERT INTO rubro_version (version_id, edicion_id, codigo, nombre, tipo_sujeto, tipo_rubro, nominados_maximos, orden)
       VALUES ($1, $2, 'R3', 'Mejor carro', 'CARRO', 'ALEATORIO', 3, 1)`,
      [versionBorrador, edicion],
    );
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM rubro_version");
    assert.equal(rows[0].n, 1);
  });
});

test("la escala es una por versión y su máximo no es menor que su mínimo", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);

    await esperarError(
      pool.query(
        "INSERT INTO escala_puntaje_version (version_id, edicion_id, minimo, maximo) VALUES ($1, $2, 5, 1)",
        [versionBorrador, edicion],
      ),
      "escala_puntaje_version_check",
    );

    await pool.query(
      "INSERT INTO escala_puntaje_version (version_id, edicion_id, minimo, maximo) VALUES ($1, $2, 1, 5)",
      [versionBorrador, edicion],
    );
    await esperarError(
      pool.query(
        "INSERT INTO escala_puntaje_version (version_id, edicion_id, minimo, maximo) VALUES ($1, $2, 1, 10)",
        [versionBorrador, edicion],
      ),
      "escala_puntaje_version_pkey",
    );
  });
});

test("un rubro solo se asigna a especialidades de su misma edición", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const { rows: [rubro] } = await pool.query(
      `INSERT INTO rubro_version (version_id, edicion_id, codigo, nombre, tipo_sujeto, orden)
       VALUES ($1, $2, 'R4', 'Impacto visual', 'CARRO', 1) RETURNING id`,
      [versionBorrador, edicion],
    );

    await pool.query(
      "INSERT INTO rubro_especialidad (rubro_version_id, especialidad_id, edicion_id) VALUES ($1, $2, $3)",
      [rubro.id, especialidadUno, edicion],
    );
    await esperarError(
      pool.query(
        "INSERT INTO rubro_especialidad (rubro_version_id, especialidad_id, edicion_id) VALUES ($1, $2, $3)",
        [rubro.id, especialidadAjena, edicion],
      ),
      "rubro_especialidad",
    );
  });
});

test("con la versión publicada no se escribe rubros, escala, especialidades, premios ni requisitos", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);

    await esperarError(
      pool.query(
        `INSERT INTO rubro_version (version_id, edicion_id, codigo, nombre, tipo_sujeto, orden)
         VALUES ($1, $2, 'R5', 'Tarde', 'CARRO', 1)`,
        [versionPublicada, otraEdicion],
      ),
      "VERSION_NO_BORRADOR",
    );
    await esperarError(
      pool.query(
        "INSERT INTO escala_puntaje_version (version_id, edicion_id, minimo, maximo) VALUES ($1, $2, 1, 5)",
        [versionPublicada, otraEdicion],
      ),
      "VERSION_NO_BORRADOR",
    );
    await esperarError(
      pool.query(
        `INSERT INTO premio_version (version_id, edicion_id, nombre, modalidad, orden)
         VALUES ($1, $2, 'Premio', 'INDIVIDUAL', 1)`,
        [versionPublicada, otraEdicion],
      ),
      "VERSION_NO_BORRADOR",
    );
    await esperarError(
      pool.query(
        `INSERT INTO requisito_version (version_id, edicion_id, codigo, nombre, cantidad_minima, orden)
         VALUES ($1, $2, 'REINA', 'Reina de Comparsa', 1, 1)`,
        [versionPublicada, otraEdicion],
      ),
      "VERSION_NO_BORRADOR",
    );
  });
});

test("un borrador admite contenido y el requisito no puntúa por defecto", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `INSERT INTO requisito_version (version_id, edicion_id, codigo, nombre, cantidad_minima, orden)
       VALUES ($1, $2, 'REINA', 'Reina de Comparsa', 1, 1)`,
      [versionBorrador, edicion],
    );
    const { rows } = await pool.query("SELECT puede_puntuar FROM requisito_version");
    assert.deepEqual(rows, [{ puede_puntuar: false }]);

    await pool.query(
      `UPDATE requisito_version SET puede_puntuar = true WHERE codigo = 'REINA'`,
    );
    const { rows: [actualizado] } = await pool.query("SELECT puede_puntuar FROM requisito_version");
    assert.equal(actualizado.puede_puntuar, true);
  });
});

test("un premio se nombra una sola vez por versión", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `INSERT INTO premio_version (version_id, edicion_id, nombre, modalidad, orden)
       VALUES ($1, $2, 'Mejor carro', 'INDIVIDUAL', 1)`,
      [versionBorrador, edicion],
    );
    await esperarError(
      pool.query(
        `INSERT INTO premio_version (version_id, edicion_id, nombre, modalidad, orden)
         VALUES ($1, $2, 'Mejor carro', 'GRUPAL', 2)`,
        [versionBorrador, edicion],
      ),
      "premio_version_version_id_nombre_key",
    );
  });
});
