import assert from "node:assert/strict";
import test from "node:test";
import { withIsolatedSchema } from "../helpers/isolated-schema.js";

// Verifica las reglas persistentes de la migración 0008 (padrón del evento)
// mediante la interfaz pública de PostgreSQL. Requiere TEST_DATABASE_URL.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const edicion = "11111111-1111-1111-1111-111111111111";
const otraEdicion = "11111111-1111-1111-1111-111111111112";
const nocheUno = "22222222-2222-2222-2222-222222222221";
const nocheDos = "22222222-2222-2222-2222-222222222222";
const comparsaUno = "33333333-3333-3333-3333-333333333331";
const comparsaDos = "33333333-3333-3333-3333-333333333332";
const comparsaAjena = "33333333-3333-3333-3333-333333333333";
const participanteUno = "44444444-4444-4444-4444-444444444441";
const participanteDos = "44444444-4444-4444-4444-444444444442";
const sujetoPersona = "55555555-5555-5555-5555-555555555551";
const sujetoCarro = "55555555-5555-5555-5555-555555555552";
const ordenUno = "66666666-6666-6666-6666-666666666661";
const ordenDos = "66666666-6666-6666-6666-666666666662";

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
    `INSERT INTO noche (id, edicion_id, orden, nombre, tipo, estado)
     VALUES ($1, $3, 1, 'Primera', 'COMPETENCIA', 'DRAFT'),
            ($2, $3, 2, 'Segunda', 'COMPETENCIA', 'DRAFT')`,
    [nocheUno, nocheDos, edicion],
  );
  await pool.query(
    `INSERT INTO comparsa (id, edicion_id, nombre, categoria)
     VALUES ($1, $4, 'Comparsa uno', 'PRIMERA'),
            ($2, $4, 'Comparsa dos', 'AGRUPACION'),
            ($3, $5, 'Ajena', 'PRIMERA')`,
    [comparsaUno, comparsaDos, comparsaAjena, edicion, otraEdicion],
  );
  await pool.query(
    `INSERT INTO participante (id, edicion_id, nombre_completo)
     VALUES ($1, $3, 'Ana Pérez'), ($2, $3, 'Beto Gómez')`,
    [participanteUno, participanteDos, edicion],
  );
}

async function esperarCheckViolation(consulta, mensaje) {
  await assert.rejects(consulta, (error) => error.code === "23514" && error.message.includes(mensaje), mensaje);
}

async function esperarUniqueViolation(consulta) {
  await assert.rejects(consulta, (error) => error.code === "23505");
}

async function esperarForeignKeyViolation(consulta) {
  // 23503: violación de clave foránea al insertar. 23001: RESTRICT al borrar o actualizar.
  await assert.rejects(consulta, (error) => error.code === "23503" || error.code === "23001");
}

test("un PERSONA exige participante y un CARRO exige nombre", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);

    await esperarCheckViolation(
      pool.query(
        `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto)
         VALUES ($1, $2, 'PERSONA')`,
        [edicion, comparsaUno],
      ),
      "sujeto_evaluable_check",
    );
    await esperarCheckViolation(
      pool.query(
        `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, participante_id)
         VALUES ($1, $2, 'CARRO', $3)`,
        [edicion, comparsaUno, participanteUno],
      ),
      "sujeto_evaluable_check",
    );
    await esperarCheckViolation(
      pool.query(
        `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto)
         VALUES ($1, $2, 'CARRO')`,
        [edicion, comparsaUno],
      ),
      "sujeto_evaluable_check",
    );

    await pool.query(
      `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, participante_id)
       VALUES ($1, $2, 'PERSONA', $3)`,
      [edicion, comparsaUno, participanteUno],
    );
    await pool.query(
      `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, nombre)
       VALUES ($1, $2, 'CARRO', 'Carro alegórico')`,
      [edicion, comparsaUno],
    );

    const { rows } = await pool.query("SELECT count(*)::int AS n FROM sujeto_evaluable");
    assert.equal(rows[0].n, 2);
  });
});

test("una identidad no se duplica en la misma comparsa, pero sí en otra", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);

    await pool.query(
      `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, participante_id)
       VALUES ($1, $2, 'PERSONA', $3)`,
      [edicion, comparsaUno, participanteUno],
    );
    await esperarUniqueViolation(
      pool.query(
        `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, participante_id)
         VALUES ($1, $2, 'PERSONA', $3)`,
        [edicion, comparsaUno, participanteUno],
      ),
    );

    await pool.query(
      `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, participante_id)
       VALUES ($1, $2, 'PERSONA', $3)`,
      [edicion, comparsaDos, participanteUno],
    );
  });
});

test("una comparsa inactiva no admite padrón y una comparsa con padrón no se desactiva", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const { rows: [inactiva] } = await pool.query(
      `INSERT INTO comparsa (edicion_id, nombre, categoria, activa)
       VALUES ($1, 'Inactiva', 'PRIMERA', false) RETURNING id`,
      [edicion],
    );

    await esperarCheckViolation(
      pool.query(
        `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, nombre)
         VALUES ($1, $2, 'CARRO', 'Carro')`,
        [edicion, inactiva.id],
      ),
      "COMPARSA_INACTIVA",
    );
    await esperarCheckViolation(
      pool.query(
        `INSERT INTO orden_presentacion (edicion_id, noche_id, comparsa_id, orden_presentacion)
         VALUES ($1, $2, $3, 1)`,
        [edicion, nocheUno, inactiva.id],
      ),
      "COMPARSA_INACTIVA",
    );

    await pool.query(
      `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, nombre)
       VALUES ($1, $2, 'CARRO', 'Carro')`,
      [edicion, comparsaUno],
    );
    await esperarCheckViolation(
      pool.query("UPDATE comparsa SET activa = false WHERE id = $1", [comparsaUno]),
      "COMPARSA_CON_PADRON",
    );

    const { rows } = await pool.query("SELECT activa FROM comparsa WHERE id = $1", [comparsaUno]);
    assert.deepEqual(rows, [{ activa: true }]);
  });
});

test("el orden de presentación solo se modifica con la noche en DRAFT", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `INSERT INTO orden_presentacion (id, edicion_id, noche_id, comparsa_id, orden_presentacion)
       VALUES ($1, $2, $3, $4, 1)`,
      [ordenUno, edicion, nocheUno, comparsaUno],
    );

    await pool.query(
      `UPDATE noche SET estado = 'OPEN', abierta_en = CURRENT_TIMESTAMP WHERE id = $1`,
      [nocheUno],
    );

    await esperarCheckViolation(
      pool.query("UPDATE orden_presentacion SET orden_presentacion = 2 WHERE id = $1", [ordenUno]),
      "ORDEN_CONGELADO",
    );
    await esperarCheckViolation(
      pool.query("DELETE FROM orden_presentacion WHERE id = $1", [ordenUno]),
      "ORDEN_CONGELADO",
    );
  });
});

test("el padrón se congela al abrir la primera noche", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `UPDATE noche SET estado = 'OPEN', abierta_en = CURRENT_TIMESTAMP WHERE id = $1`,
      [nocheUno],
    );

    await esperarCheckViolation(
      pool.query(
        `INSERT INTO comparsa (edicion_id, nombre, categoria)
         VALUES ($1, 'Nueva', 'PRIMERA')`,
        [edicion],
      ),
      "PADRON_CONGELADO",
    );
    await esperarCheckViolation(
      pool.query(
        `INSERT INTO participante (edicion_id, nombre_completo)
         VALUES ($1, 'Nueva persona')`,
        [edicion],
      ),
      "PADRON_CONGELADO",
    );
    await esperarCheckViolation(
      pool.query(
        `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, nombre)
         VALUES ($1, $2, 'CARRO', 'Carro')`,
        [edicion, comparsaUno],
      ),
      "PADRON_CONGELADO",
    );
  });
});

test("las pasadas se congelan con su noche, no con el padrón general", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `INSERT INTO sujeto_evaluable (id, edicion_id, comparsa_id, tipo_sujeto, participante_id)
       VALUES ($1, $2, $3, 'PERSONA', $4)`,
      [sujetoPersona, edicion, comparsaUno, participanteUno],
    );
    await pool.query(
      `INSERT INTO orden_presentacion (id, edicion_id, noche_id, comparsa_id, orden_presentacion)
       VALUES ($1, $2, $3, $4, 1), ($5, $2, $6, $4, 1)`,
      [ordenUno, edicion, nocheUno, comparsaUno, ordenDos, nocheDos],
    );

    // Se abre la primera noche: el padrón general queda congelado, pero la segunda
    // noche sigue en DRAFT y sus pasadas todavía se preparan.
    await pool.query(
      `UPDATE noche SET estado = 'OPEN', abierta_en = CURRENT_TIMESTAMP WHERE id = $1`,
      [nocheUno],
    );

    await pool.query(
      `INSERT INTO pasada (edicion_id, orden_presentacion_id, comparsa_id, sujeto_id, orden)
       VALUES ($1, $2, $3, $4, 1)`,
      [edicion, ordenDos, comparsaUno, sujetoPersona],
    );
    await esperarCheckViolation(
      pool.query(
        `INSERT INTO pasada (edicion_id, orden_presentacion_id, comparsa_id, sujeto_id, orden)
         VALUES ($1, $2, $3, $4, 1)`,
        [edicion, ordenUno, comparsaUno, sujetoPersona],
      ),
      "PASADA_NOCHE_NO_EDITABLE",
    );

    // La misma persona puede tener otra pasada en la misma noche, con otro orden.
    await pool.query(
      `INSERT INTO pasada (edicion_id, orden_presentacion_id, comparsa_id, sujeto_id, orden)
       VALUES ($1, $2, $3, $4, 2)`,
      [edicion, ordenDos, comparsaUno, sujetoPersona],
    );
    await esperarUniqueViolation(
      pool.query(
        `INSERT INTO pasada (edicion_id, orden_presentacion_id, comparsa_id, sujeto_id, orden)
         VALUES ($1, $2, $3, $4, 2)`,
        [edicion, ordenDos, comparsaUno, sujetoPersona],
      ),
    );

    const { rows } = await pool.query("SELECT orden FROM pasada ORDER BY orden");
    assert.deepEqual(rows, [{ orden: 1 }, { orden: 2 }]);
  });
});

test("las claves compuestas impiden cruzar ediciones y comparsas", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);

    await esperarForeignKeyViolation(
      pool.query(
        `INSERT INTO orden_presentacion (edicion_id, noche_id, comparsa_id, orden_presentacion)
         VALUES ($1, $2, $3, 1)`,
        [edicion, nocheUno, comparsaAjena],
      ),
    );

    const { rows: [sujeto] } = await pool.query(
      `INSERT INTO sujeto_evaluable (id, edicion_id, comparsa_id, tipo_sujeto, nombre)
       VALUES ($1, $2, $3, 'CARRO', 'Carro') RETURNING id`,
      [sujetoCarro, edicion, comparsaUno],
    );
    await pool.query(
      `INSERT INTO orden_presentacion (id, edicion_id, noche_id, comparsa_id, orden_presentacion)
       VALUES ($1, $2, $3, $4, 1)`,
      [ordenUno, edicion, nocheUno, comparsaDos],
    );
    await esperarForeignKeyViolation(
      pool.query(
        `INSERT INTO pasada (edicion_id, orden_presentacion_id, comparsa_id, sujeto_id, orden)
         VALUES ($1, $2, $3, $4, 1)`,
        [edicion, ordenUno, comparsaDos, sujeto.id],
      ),
    );
  });
});

test("una comparsa sin historial se borra; con padrón cargado, no", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const { rows: [vacia] } = await pool.query(
      `INSERT INTO comparsa (edicion_id, nombre, categoria)
       VALUES ($1, 'Vacía', 'PRIMERA') RETURNING id`,
      [edicion],
    );

    await pool.query(
      `INSERT INTO sujeto_evaluable (edicion_id, comparsa_id, tipo_sujeto, nombre)
       VALUES ($1, $2, 'CARRO', 'Carro')`,
      [edicion, comparsaUno],
    );
    await esperarForeignKeyViolation(
      pool.query("DELETE FROM comparsa WHERE id = $1", [comparsaUno]),
    );

    await pool.query("DELETE FROM comparsa WHERE id = $1", [vacia.id]);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM comparsa WHERE id = $1", [vacia.id]);
    assert.equal(rows[0].n, 0);
  });
});

test("el orden por noche se reordena dentro de una transacción con la restricción diferida", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `INSERT INTO orden_presentacion (edicion_id, noche_id, comparsa_id, orden_presentacion)
       VALUES ($1, $2, $3, 1), ($1, $2, $4, 2)`,
      [edicion, nocheUno, comparsaUno, comparsaDos],
    );

    await esperarUniqueViolation(
      pool.query(
        "UPDATE orden_presentacion SET orden_presentacion = 2 WHERE comparsa_id = $1",
        [comparsaUno],
      ),
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET CONSTRAINTS orden_presentacion_noche_posicion_uk DEFERRED");
      await client.query(
        "UPDATE orden_presentacion SET orden_presentacion = 2 WHERE comparsa_id = $1",
        [comparsaUno],
      );
      await client.query(
        "UPDATE orden_presentacion SET orden_presentacion = 1 WHERE comparsa_id = $1",
        [comparsaDos],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    const { rows } = await pool.query(
      "SELECT comparsa_id, orden_presentacion FROM orden_presentacion ORDER BY orden_presentacion",
    );
    assert.deepEqual(rows, [
      { comparsa_id: comparsaDos, orden_presentacion: 1 },
      { comparsa_id: comparsaUno, orden_presentacion: 2 },
    ]);
  });
});
