import assert from "node:assert/strict";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { migrate } from "../../src/cli/migrate.js";
import { withIsolatedSchema } from "../helpers/isolated-schema.js";

// Verifica las restricciones persistentes de la migración 0014 (catálogo de
// evaluación, jerarquía de rubros y filas de planilla) mediante la interfaz
// pública de PostgreSQL. Requiere TEST_DATABASE_URL apuntando a una base
// descartable; nunca se usa DATABASE_URL ni una base de producción.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const retiroEnmienda = "0024-retirar-enmienda-reglamento.sql";
const migrationsDirectory = fileURLToPath(new URL("../../migrations/", import.meta.url));

async function antesDelRetiro(run) {
  const directory = await mkdtemp(join(tmpdir(), "carnavales-migraciones-"));
  try {
    const files = (await readdir(migrationsDirectory))
      .filter((file) => /^\d{4}-.+\.sql$/.test(file) && file < retiroEnmienda);
    for (const file of files) {
      await copyFile(join(migrationsDirectory, file), join(directory, file));
    }
    await withIsolatedSchema(databaseUrl, run, { migrationsDirectory: directory });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function estadoRetiro(pool) {
  const { rows: [estado] } = await pool.query(
    `SELECT to_regclass('enmienda_reglamento') IS NOT NULL AS tabla,
            EXISTS (SELECT FROM migracion WHERE nombre_archivo = $1) AS aplicada`,
    [retiroEnmienda],
  );
  return estado;
}

const admin = "u-admin-0008";
const edicion = "10000000-0000-4000-8000-000000000001";
const edicionDos = "10000000-0000-4000-8000-000000000002";
const version = "20000000-0000-4000-8000-000000000001";
const noche = "30000000-0000-4000-8000-000000000001";
const especialidad = "40000000-0000-4000-8000-000000000001";
const comparsa = "50000000-0000-4000-8000-000000000001";
const participante = "60000000-0000-4000-8000-000000000001";
const sujeto = "70000000-0000-4000-8000-000000000001";
const asignacion = "80000000-0000-4000-8000-000000000001";

async function esperarCodigo(consulta, codigo, contexto) {
  await assert.rejects(
    consulta,
    (error) => error.code === codigo,
    `${contexto} (se esperaba SQLSTATE ${codigo})`,
  );
}

const check = (consulta, contexto) => esperarCodigo(consulta, "23514", contexto);
const unica = (consulta, contexto) => esperarCodigo(consulta, "23505", contexto);
const fk = (consulta, contexto) => esperarCodigo(consulta, "23503", contexto);
// DELETE/UPDATE de un padre con ON DELETE RESTRICT produce restrict_violation (23001),
// distinto del foreign_key_violation (23503) de un valor de FK inexistente.
const restrict = (consulta, contexto) => esperarCodigo(consulta, "23001", contexto);

async function preparar(pool) {
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Admin', 'admin8@example.test', true),
            ('u-jurado-0008', 'Jurado', 'jurado8@example.test', true)`,
    [admin],
  );
  await pool.query(
    `INSERT INTO edicion (id, nombre, anio, estado, creada_por)
     VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $2)`,
    [edicion, admin],
  );
  await pool.query(
    `INSERT INTO version_reglamento
       (id, edicion_id, numero, estado, fuente, creada_por)
     VALUES ($1, $2, 1, 'BORRADOR', 'reglamento aportado', $3)`,
    [version, edicion, admin],
  );
  await pool.query(
    `INSERT INTO noche (id, edicion_id, orden, nombre, tipo, estado)
     VALUES ($1, $2, 1, 'Primera noche', 'COMPETENCIA', 'DRAFT')`,
    [noche, edicion],
  );
  await pool.query(
    `INSERT INTO especialidad (id, edicion_id, nombre, codigo, orden)
     VALUES ($1, $2, 'Vestuario', 'J1', 1)`,
    [especialidad, edicion],
  );
  await pool.query(
    `INSERT INTO comparsa (id, edicion_id, nombre, categoria)
     VALUES ($1, $2, 'Comparsa Uno', 'PRIMERA')`,
    [comparsa, edicion],
  );
  await pool.query(
    `INSERT INTO participante (id, edicion_id, nombre_completo)
     VALUES ($1, $2, 'Persona Uno')`,
    [participante, edicion],
  );
  await pool.query(
    `INSERT INTO sujeto_evaluable
       (id, edicion_id, comparsa_id, tipo_sujeto, participante_id)
     VALUES ($1, $2, $3, 'PERSONA', $4)`,
    [sujeto, edicion, comparsa, participante],
  );
}

// Crea un rubro hoja por defecto; con padreId lo convierte en hijo.
async function crearRubro(pool, { id, codigo, padreId = null, evaluable = true, tipoRubro = 'ALEATORIO' }) {
  await pool.query(
    `INSERT INTO rubro_version
       (id, edicion_id, version_id, padre_id, codigo, nombre, tipo_sujeto,
        tipo_rubro, nominados_maximos, evaluable, orden)
     VALUES ($1, $2, $3, $4, $5, $6, 'PERSONA', $7, 3, $8, (SELECT count(*) + 1 FROM rubro_version WHERE version_id = $3))`,
    [id, edicion, version, padreId, codigo, `Rubro ${codigo}`, tipoRubro, evaluable],
  );
  await pool.query(
    `INSERT INTO rubro_especialidad (rubro_version_id, especialidad_id, edicion_id)
     VALUES ($1, $2, $3)`,
    [id, especialidad, edicion],
  );
  return id;
}

async function crearFila(pool, {
  id,
  rubroId,
  sujetoId = sujeto,
  especialidadId = especialidad,
  edicionId = edicion,
}) {
  return pool.query(
    `INSERT INTO fila_planilla
       (id, edicion_id, rubro_version_id, sujeto_id, especialidad_id, origen, orden)
     VALUES ($1, $2, $3, $4, $5, 'GENERADA', 1)
     RETURNING id`,
    [id, edicionId, rubroId, sujetoId, especialidadId],
  );
}

test("la migración 0014 se aplica y deja el catálogo con su estructura mínima", { skip }, async () => {
  await antesDelRetiro(async (pool) => {
    const { rows: migradas } = await pool.query(
      "SELECT nombre_archivo FROM migracion WHERE nombre_archivo = '0014-catalogo-jurado.sql'",
    );
    assert.equal(migradas.length, 1, "0008 debe quedar registrada como aplicada");

    const { rows: tablas } = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = ANY($1::text[])
        ORDER BY table_name`,
      [[
        "comparsa", "participante", "sujeto_evaluable", "orden_presentacion", "pasada",
        "rubro_version", "escala_puntaje_version", "rubro_especialidad", "premio_version",
        "requisito_version", "enmienda_reglamento", "fila_planilla",
        "instantanea_planillas_esperadas", "instantanea_planilla_esperada_detalle",
      ]],
    );
    assert.deepEqual(
      tablas.map((fila) => fila.table_name),
      [
        "comparsa", "enmienda_reglamento", "escala_puntaje_version", "fila_planilla",
        "instantanea_planilla_esperada_detalle", "instantanea_planillas_esperadas",
        "orden_presentacion", "participante", "pasada", "premio_version",
        "requisito_version", "rubro_especialidad", "rubro_version", "sujeto_evaluable",
      ],
    );

    // Las tablas ya creadas en 0006/0007 no se recrean: solo existe una definición.
    for (const nombre of ["edicion", "version_reglamento", "noche", "especialidad", "asignacion_jurado", "auditoria"]) {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = $1`,
        [nombre],
      );
      assert.ok(rows[0].n > 0, `${nombre} debe seguir existiendo`);
    }

    // La jerarquía vive en rubro_version; la condición evaluable no se duplica en la fila.
    const { rows: jerarquia } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'rubro_version' AND column_name IN ('padre_id', 'evaluable', 'permite_no_presentado')
        ORDER BY column_name`,
    );
    assert.deepEqual(jerarquia.map((f) => f.column_name), ["evaluable", "padre_id", "permite_no_presentado"]);
    const { rows: filaEvaluable } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'fila_planilla' AND column_name = 'evaluable'`,
    );
    assert.equal(filaEvaluable.length, 0, "la fila hereda evaluable del rubro, no la redefine");

    // No se crea el rol FISCAL ni se altera el catálogo de roles (decisión D10).
    const { rows: roles } = await pool.query("SELECT codigo FROM rol ORDER BY codigo");
    assert.deepEqual(roles.map((r) => r.codigo), ["ADMINISTRADOR", "COMISARIO", "ESCRIBANO", "JURADO"]);
  });
});

test("aplicar de nuevo las migraciones no vuelve a ejecutar 0008", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const segunda = await migrate(
      pool,
      fileURLToPath(new URL("../../migrations/", import.meta.url)),
    );
    assert.deepEqual(segunda, [], "una segunda ejecución no debe aplicar nada");
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM migracion WHERE nombre_archivo = '0014-catalogo-jurado.sql'",
    );
    assert.equal(rows[0].n, 1);
  });
});

test("fila_planilla es única por rubro, sujeto y especialidad y no mezcla ediciones", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const rubro = "90000000-0000-4000-8000-000000000001";
    await crearRubro(pool, { id: rubro, codigo: "R1" });
    const fila = "a0000000-0000-4000-8000-000000000001";
    await crearFila(pool, { id: fila, rubroId: rubro });

    const duplicada = "a0000000-0000-4000-8000-000000000002";
    await unica(
      crearFila(pool, { id: duplicada, rubroId: rubro }),
      "misma combinación rubro/sujeto/especialidad",
    );

    // La FK compuesta a la edición impide apuntar la fila a otra edición.
    await fk(
      pool.query(
        `UPDATE fila_planilla SET edicion_id = $1 WHERE id = $2`,
        [edicionDos, fila],
      ),
      "cambiar la edición de una fila",
    );
    const otroRubro = "90000000-0000-4000-8000-000000000008";
    await crearRubro(pool, { id: otroRubro, codigo: "OTRA" });
    await fk(
      crearFila(pool, {
        id: "a0000000-0000-4000-8000-000000000003",
        rubroId: otroRubro,
        edicionId: edicionDos,
      }),
      "insertar una fila con edición distinta a la de su versión",
    );
  });
});

test("un rubro con hijos no admite fila directa, y un rubro con filas no puede ser padre", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const padre = "90000000-0000-4000-8000-000000000002";
    const hijo = "90000000-0000-4000-8000-000000000003";
    const hojaConFila = "90000000-0000-4000-8000-000000000004";
    await crearRubro(pool, { id: padre, codigo: "PADRE" });
    await crearRubro(pool, { id: hijo, codigo: "HIJO", padreId: padre });
    await crearRubro(pool, { id: hojaConFila, codigo: "HOJA" });

    await check(
      crearFila(pool, { id: "b0000000-0000-4000-8000-000000000001", rubroId: padre }),
      "fila directa sobre rubro con subítems",
    );

    // Los hijos sí pueden tener filas.
    await crearFila(pool, { id: "b0000000-0000-4000-8000-000000000002", rubroId: hijo });

    await crearFila(pool, { id: "b0000000-0000-4000-8000-000000000003", rubroId: hojaConFila });
    await check(
      pool.query(
        `INSERT INTO rubro_version
           (id, edicion_id, version_id, padre_id, codigo, nombre, tipo_sujeto,
            tipo_rubro, nominados_maximos, evaluable, orden)
         VALUES ($1, $2, $3, $4, 'HIJO_TARDIO', 'Rubro hijo tardío', 'PERSONA',
                 'ALEATORIO', 3, true, 2)`,
        ["90000000-0000-4000-8000-000000000005", edicion, version, hojaConFila],
      ),
      "dar un hijo a un rubro que ya tiene filas",
    );
    await check(
      pool.query(`UPDATE rubro_version SET padre_id = id WHERE id = $1`, [padre]),
      "rubro padre de sí mismo",
    );

    const cicloA = "90000000-0000-4000-8000-000000000010";
    const cicloB = "90000000-0000-4000-8000-000000000011";
    await crearRubro(pool, { id: cicloA, codigo: "CICLO_A" });
    await crearRubro(pool, { id: cicloB, codigo: "CICLO_B", padreId: cicloA });
    await check(
      pool.query(`UPDATE rubro_version SET padre_id = $1 WHERE id = $2`, [cicloB, cicloA]),
      "ciclo en la jerarquía de rubros",
    );
  });
});

test("la escala queda fija en 1..5 y no admite 0 como nota ordinaria", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const rubro = "90000000-0000-4000-8000-000000000005";
    await crearRubro(pool, { id: rubro, codigo: "ESC" });

    await pool.query(
      `INSERT INTO escala_puntaje_version (version_id, edicion_id, minimo, maximo)
       VALUES ($1, $2, 1, 5)`,
      [version, edicion],
    );
    await check(
      pool.query(
        `UPDATE escala_puntaje_version SET minimo = 0 WHERE version_id = $1`,
        [version],
      ),
      "mínimo 0 (No se presentó no es nota)",
    );
    await check(
      pool.query(
        `UPDATE escala_puntaje_version SET maximo = 10 WHERE version_id = $1`,
        [version],
      ),
      "máximo 10 (escala 1–10 del borrador)",
    );

    // El flag separado vive en el rubro, no en la escala.
    const { rows } = await pool.query(
      `SELECT permite_no_presentado FROM rubro_version WHERE id = $1`,
      [rubro],
    );
    assert.equal(typeof rows[0].permite_no_presentado, "boolean");
    const { rows: columnas } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'escala_puntaje_version' AND column_name IN ('valor', 'no_presentado', 'cero')`,
    );
    assert.equal(columnas.length, 0, "la escala no modela 'No se presentó' como valor");
  });
});

test("evaluable=false del rubro define la fila gris sin columna propia en la fila", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const rubroGris = "90000000-0000-4000-8000-000000000006";
    await crearRubro(pool, { id: rubroGris, codigo: "GRIS", evaluable: false });
    await crearFila(pool, { id: "c0000000-0000-4000-8000-000000000001", rubroId: rubroGris });

    const { rows } = await pool.query(
      `SELECT f.id, r.evaluable
         FROM fila_planilla f JOIN rubro_version r ON r.id = f.rubro_version_id
        WHERE f.id = $1`,
      ["c0000000-0000-4000-8000-000000000001"],
    );
    assert.deepEqual(rows, [{ id: "c0000000-0000-4000-8000-000000000001", evaluable: false }]);
  });
});

test("el orden de presentación y las pasadas son únicos por noche y comparsa", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const op = "d0000000-0000-4000-8000-000000000001";
    const otraOp = "d0000000-0000-4000-8000-000000000002";
    await pool.query(
      `INSERT INTO orden_presentacion
         (id, edicion_id, noche_id, comparsa_id, orden_presentacion)
       VALUES ($1, $2, $3, $4, 1)`,
      [op, edicion, noche, comparsa],
    );
    await unica(
      pool.query(
        `INSERT INTO orden_presentacion
           (id, edicion_id, noche_id, comparsa_id, orden_presentacion)
         VALUES ($1, $2, $3, $4, 2)`,
        [otraOp, edicion, noche, comparsa],
      ),
      "dos órdenes para la misma comparsa y noche",
    );
    await pool.query(
      `INSERT INTO comparsa (id, edicion_id, nombre, categoria)
       VALUES ($1, $2, 'Comparsa Dos', 'PRIMERA')`,
      ["50000000-0000-4000-8000-000000000002", edicion],
    );
    await unica(
      pool.query(
        `INSERT INTO orden_presentacion
           (id, edicion_id, noche_id, comparsa_id, orden_presentacion)
         VALUES ($1, $2, $3, $4, 1)`,
        ["d0000000-0000-4000-8000-000000000003", edicion, noche,
          "50000000-0000-4000-8000-000000000002"],
      ),
      "posición duplicada en la noche",
    );

    await pool.query(
      `INSERT INTO pasada (id, edicion_id, orden_presentacion_id, comparsa_id, sujeto_id, orden)
       VALUES ($1, $2, $3, $4, $5, 1)`,
      ["e0000000-0000-4000-8000-000000000001", edicion, op, comparsa, sujeto],
    );
    await unica(
      pool.query(
        `INSERT INTO pasada (id, edicion_id, orden_presentacion_id, comparsa_id, sujeto_id, orden)
         VALUES ($1, $2, $3, $4, $5, 1)`,
        ["e0000000-0000-4000-8000-000000000002", edicion, op, comparsa, sujeto],
      ),
      "dos pasadas con el mismo orden",
    );
  });
});

test("las FK impiden borrar catálogo usado por planillas", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const rubro = "90000000-0000-4000-8000-000000000007";
    await crearRubro(pool, { id: rubro, codigo: "EVID" });
    await crearFila(pool, { id: "f0000000-0000-4000-8000-000000000001", rubroId: rubro });

    await restrict(pool.query(`DELETE FROM rubro_version WHERE id = $1`, [rubro]), "borrar rubro con filas");
    await restrict(
      pool.query(`DELETE FROM sujeto_evaluable WHERE id = $1`, [sujeto]),
      "borrar sujeto con filas",
    );
    await restrict(
      pool.query(`DELETE FROM especialidad WHERE id = $1`, [especialidad]),
      "borrar especialidad con filas",
    );
    await restrict(
      pool.query(`DELETE FROM version_reglamento WHERE id = $1`, [version]),
      "borrar versión con filas",
    );
    await restrict(pool.query(`DELETE FROM edicion WHERE id = $1`, [edicion]), "borrar edición con catálogo");
  });
});

test("la instantánea de planillas esperadas queda congelada y ligada a asignación y versión", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `INSERT INTO asignacion_jurado
         (id, edicion_id, jurado_id, noche_id, especialidad_id, creada_por)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [asignacion, edicion, "u-jurado-0008", noche, especialidad, admin],
    );

    const { rows: [instantanea] } = await pool.query(
      `INSERT INTO instantanea_planillas_esperadas
          (id, edicion_id, noche_id, version_id, congelada_en)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ["a1000000-0000-4000-8000-000000000001", edicion, noche, version, "2026-11-19T20:00:00Z"],
    );
    await unica(
      pool.query(
        `INSERT INTO instantanea_planillas_esperadas
            (id, edicion_id, noche_id, version_id, congelada_en)
         VALUES ($1, $2, $3, $4, $5)`,
        ["a1000000-0000-4000-8000-000000000002", edicion, noche, version, "2026-11-19T20:00:00Z"],
      ),
      "dos instantáneas para la misma noche",
    );
    await pool.query(
      `INSERT INTO instantanea_planilla_esperada_detalle
         (id, instantanea_id, edicion_id, noche_id, asignacion_id)
       VALUES ($1, $2, $3, $4, $5)`,
      ["a2000000-0000-4000-8000-000000000001", instantanea.id, edicion, noche, asignacion],
    );
    await unica(
      pool.query(
        `INSERT INTO instantanea_planilla_esperada_detalle
           (id, instantanea_id, edicion_id, noche_id, asignacion_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ["a2000000-0000-4000-8000-000000000002", instantanea.id, edicion, noche, asignacion],
      ),
      "duplicar una asignación en la instantánea",
    );

    // La FK compuesta impide congelar una asignación que pertenece a otra noche.
    const otraNoche = "30000000-0000-4000-8000-000000000002";
    const otraAsignacion = "80000000-0000-4000-8000-000000000002";
    await pool.query(
      `INSERT INTO noche (id, edicion_id, orden, nombre, tipo, estado)
       VALUES ($1, $2, 2, 'Segunda noche', 'COMPETENCIA', 'DRAFT')`,
      [otraNoche, edicion],
    );
    await pool.query(
      `INSERT INTO asignacion_jurado
          (id, edicion_id, jurado_id, noche_id, especialidad_id, creada_por)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [otraAsignacion, edicion, "u-jurado-0008", otraNoche, especialidad, admin],
    );
    await fk(
      pool.query(
        `INSERT INTO instantanea_planilla_esperada_detalle
            (id, instantanea_id, edicion_id, noche_id, asignacion_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ["a2000000-0000-4000-8000-000000000003", instantanea.id, edicion, noche, otraAsignacion],
      ),
      "asignación de otra noche en la instantánea",
    );

    await check(
      pool.query(`DELETE FROM instantanea_planillas_esperadas WHERE id = $1`, [instantanea.id]),
      "borrar la instantánea congelada",
    );
    await check(
      pool.query(`UPDATE instantanea_planillas_esperadas SET version_id = $1 WHERE id = $2`, [version, instantanea.id]),
      "modificar la instantánea congelada",
    );
    await check(
      pool.query("TRUNCATE instantanea_planilla_esperada_detalle"),
      "truncar el detalle de la instantánea",
    );
    await check(
      pool.query("TRUNCATE instantanea_planillas_esperadas CASCADE"),
      "truncar la instantánea con CASCADE",
    );
  });
});

test("las enmiendas al reglamento son registro inmutable y no alteran la versión", { skip }, async () => {
  await antesDelRetiro(async (pool) => {
    await preparar(pool);
    const { rows: [enmienda] } = await pool.query(
      `INSERT INTO enmienda_reglamento
         (id, edicion_id, version_id, contenido, motivo, responsable_id)
       VALUES ($1, $2, $3, 'texto', 'motivo', $4)
       RETURNING id`,
      ["b1000000-0000-4000-8000-000000000001", edicion, version, admin],
    );
    await check(
      pool.query(`UPDATE enmienda_reglamento SET contenido = 'otro' WHERE id = $1`, [enmienda.id]),
      "editar una enmienda",
    );
    await check(
      pool.query(`DELETE FROM enmienda_reglamento WHERE id = $1`, [enmienda.id]),
      "borrar una enmienda",
    );
    await check(pool.query("TRUNCATE enmienda_reglamento"), "truncar enmiendas");
    const { rows } = await pool.query("SELECT estado FROM version_reglamento WHERE id = $1", [version]);
    assert.deepEqual(rows, [{ estado: "BORRADOR" }], "la enmienda no cambia la versión");

    await assert.rejects(migrate(pool), (error) =>
      error.cause?.code === "23514" && error.cause.message === "ENMIENDA_REGLAMENTO_CON_HISTORIAL");
    assert.deepEqual(await estadoRetiro(pool), { tabla: true, aplicada: false });
    const conservadas = await pool.query("SELECT id, contenido, motivo FROM enmienda_reglamento");
    assert.deepEqual(conservadas.rows, [{ id: enmienda.id, contenido: "texto", motivo: "motivo" }]);
  });
});

test("la migración retira la tabla de enmiendas vacía", { skip }, async () => {
  await antesDelRetiro(async (pool) => {
    assert.deepEqual(await estadoRetiro(pool), { tabla: true, aplicada: false });
    assert.ok((await migrate(pool)).includes(retiroEnmienda));
    assert.deepEqual(await estadoRetiro(pool), { tabla: false, aplicada: true });
  });
});

test("la migración conserva la tabla de enmiendas si una vista depende de ella", { skip }, async () => {
  await antesDelRetiro(async (pool) => {
    await pool.query("CREATE VIEW vista_enmiendas AS SELECT id FROM enmienda_reglamento");
    await assert.rejects(migrate(pool), (error) => error.cause?.code === "2BP01");
    assert.deepEqual(await estadoRetiro(pool), { tabla: true, aplicada: false });
    assert.equal((await pool.query("SELECT id FROM vista_enmiendas")).rowCount, 0);
  });
});

test("la migración no elimina una secuencia adicional asociada a la tabla", { skip }, async () => {
  await antesDelRetiro(async (pool) => {
    await pool.query(`
      CREATE SEQUENCE secuencia_evidencia OWNED BY enmienda_reglamento.id;
      SELECT setval('secuencia_evidencia', 17)
    `);
    await assert.rejects(migrate(pool), (error) =>
      error.cause?.code === "2BP01" && error.cause.message === "ENMIENDA_REGLAMENTO_CON_DEPENDENCIAS");
    assert.deepEqual(await estadoRetiro(pool), { tabla: true, aplicada: false });
    const { rows } = await pool.query("SELECT last_value::text, is_called FROM secuencia_evidencia");
    assert.deepEqual(rows, [{ last_value: "17", is_called: true }]);
  });
});
