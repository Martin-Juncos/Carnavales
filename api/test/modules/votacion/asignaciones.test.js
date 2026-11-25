import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasAdminAsignaciones } from "../../../src/modules/votacion/admin-asignaciones.routes.js";
import { withIsolatedSchema } from "../../helpers/isolated-schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const juradoUno = "u-jurado-1";
const juradoDos = "u-jurado-2";
const escribano = "u-escribano";
const edicion2027 = "10000000-0000-0000-0000-000000000027";
const edicion2026 = "10000000-0000-0000-0000-000000000026";
const edicionAbierta = "10000000-0000-0000-0000-000000000028";
const nocheUno = "20000000-0000-0000-0000-000000000001";
const nocheDos = "20000000-0000-0000-0000-000000000002";
const nocheAnterior = "20000000-0000-0000-0000-000000000000";
const nocheEdicionAbierta = "20000000-0000-0000-0000-000000000003";
const nocheCerrada = "20000000-0000-0000-0000-000000000004";
const nocheInexistente = "20000000-0000-0000-0000-000000000099";
const especialidadJ1 = "30000000-0000-0000-0000-000000000001";
const especialidadJ3 = "30000000-0000-0000-0000-000000000003";
const especialidadInactiva = "30000000-0000-0000-0000-000000000004";
const especialidadAnterior = "30000000-0000-0000-0000-000000000000";
const especialidadEdicionAbierta = "30000000-0000-0000-0000-000000000005";
const especialidadInexistente = "30000000-0000-0000-0000-000000000099";
const juradoInexistente = "u-inexistente";
const asignacionUno = "40000000-0000-0000-0000-000000000001";
const asignacionRevocada = "40000000-0000-0000-0000-000000000002";
const asignacionDos = "40000000-0000-0000-0000-000000000003";
const asignacionAnterior = "40000000-0000-0000-0000-000000000000";
const creadaEn = "2026-11-01T10:00:00Z";

// La migración 0006 solo permite insertar una edición OPEN si la cuenta de la
// base pertenece a carnavales_servicio_apertura. La cuenta de pruebas suele ser
// la de la API (sin ese rol), así que el fixture se adapta y la prueba que
// necesita una edición OPEN se omite cuando no hay privilegios.
async function puedeAbrirEdicion(pool) {
  const { rows } = await pool.query(
    `SELECT 1 FROM pg_roles r
      WHERE r.rolname = 'carnavales_servicio_apertura'
        AND pg_has_role(current_user, r.rolname, 'MEMBER')`,
  );
  return rows.length > 0;
}

async function preparar(pool) {
  const abrirEdicion = await puedeAbrirEdicion(pool);
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Admin', 'admin@example.test', true),
            ($2, 'Jurado uno', 'jurado1@example.test', true),
            ($3, 'Jurado dos', 'jurado2@example.test', true),
            ($4, 'Escribano', 'escribano@example.test', true)`,
    [admin, juradoUno, juradoDos, escribano],
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT u.id, r.id, $1, false
       FROM (VALUES ($2::text, 'ADMINISTRADOR'), ($3::text, 'JURADO'),
                    ($4::text, 'JURADO'), ($5::text, 'ESCRIBANO')) AS u(id, codigo)
       JOIN rol r ON r.codigo = u.codigo`,
    [admin, admin, juradoUno, juradoDos, escribano],
  );
  await pool.query(
    `INSERT INTO edicion (id, nombre, anio, estado, creada_por, abierta_por, abierta_en)
     VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $4, NULL, NULL),
            ($2, 'Carnaval 2026', 2026, 'CONFIGURING', $4, NULL, NULL),
            ($3, 'Carnaval 2028', 2028, $5, $4, $6, $7)`,
    [
      edicion2027,
      edicion2026,
      edicionAbierta,
      admin,
      abrirEdicion ? "OPEN" : "CONFIGURING",
      abrirEdicion ? admin : null,
      abrirEdicion ? "2026-11-10T10:00:00Z" : null,
    ],
  );
  // El cierre aún no tiene servicio: sembrar estados históricos en este esquema aislado.
  await pool.query("ALTER TABLE noche DISABLE TRIGGER noche_validar_cambio_trg");
  await pool.query(
    `INSERT INTO noche (id, edicion_id, orden, nombre, tipo, estado, abierta_en, cerrada_en)
     VALUES ($1, $5, 1, 'Primera noche', 'COMPETENCIA', 'DRAFT', NULL, NULL),
            ($2, $5, 2, 'Segunda noche', 'COMPETENCIA', 'OPEN', '2026-11-02T20:00:00Z', NULL),
            ($3, $6, 1, 'Noche anterior', 'COMPETENCIA', 'DRAFT', NULL, NULL),
            ($4, $7, 1, 'Noche de edición abierta', 'COMPETENCIA', 'DRAFT', NULL, NULL),
            ($8, $7, 2, 'Noche cerrada', 'COMPETENCIA', 'CLOSED', '2026-11-10T20:00:00Z', '2026-11-10T23:00:00Z')`,
    [
      nocheUno,
      nocheDos,
      nocheAnterior,
      nocheEdicionAbierta,
      edicion2027,
      edicion2026,
      edicionAbierta,
      nocheCerrada,
    ],
  );
  await pool.query("ALTER TABLE noche ENABLE TRIGGER noche_validar_cambio_trg");
  await pool.query(
    `INSERT INTO especialidad (id, edicion_id, nombre, codigo, orden, activa)
     VALUES ($1, $6, 'Vestuario', 'J1', 1, true),
            ($2, $6, 'Batería', 'J3', 3, true),
            ($3, $7, 'Vestuario', 'J1', 1, true),
            ($4, $6, 'Inactiva', 'J4', 4, false),
            ($5, $8, 'Vestuario', 'J1', 1, true)`,
    [
      especialidadJ1,
      especialidadJ3,
      especialidadAnterior,
      especialidadInactiva,
      especialidadEdicionAbierta,
      edicion2027,
      edicion2026,
      edicionAbierta,
    ],
  );
  await pool.query(
    `INSERT INTO asignacion_jurado
       (id, edicion_id, jurado_id, noche_id, especialidad_id, creada_por, creada_en,
        estado, revocada_por, revocada_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVA', NULL, NULL),
            ($8, $2, $9, $4, $5, $6, $7, 'REVOCADA', $6, '2026-11-02T10:00:00Z'),
            ($10, $2, $3, $11, $12, $6, $7, 'ACTIVA', NULL, NULL),
            ($13, $14, $3, $15, $16, $6, $7, 'ACTIVA', NULL, NULL)`,
    [
      asignacionUno,
      edicion2027,
      juradoUno,
      nocheUno,
      especialidadJ1,
      admin,
      creadaEn,
      asignacionRevocada,
      juradoDos,
      asignacionDos,
      nocheDos,
      especialidadJ3,
      asignacionAnterior,
      edicion2026,
      nocheAnterior,
      especialidadAnterior,
    ],
  );
}

function appAsignaciones(pool) {
  const app = express();
  app.use(
    "/api/admin",
    crearRutasAdminAsignaciones({
      pool,
      obtenerSesion: async (request) => {
        const usuarioId = request.headers["x-usuario-prueba"];
        return usuarioId ? { user: { id: usuarioId } } : null;
      },
    }),
  );
  return app;
}

async function conServidor(app, run) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function pedir(base, ruta, usuario) {
  const cabeceras = usuario ? { "x-usuario-prueba": usuario } : {};
  const respuesta = await fetch(`${base}${ruta}`, { headers: cabeceras });
  const texto = await respuesta.text();
  let cuerpo;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = texto;
  }
  return { status: respuesta.status, cuerpo };
}

async function post(base, ruta, cuerpo, usuario) {
  const cabeceras = { "content-type": "application/json" };
  if (usuario) cabeceras["x-usuario-prueba"] = usuario;
  const respuesta = await fetch(`${base}${ruta}`, {
    method: "POST",
    headers: cabeceras,
    body: JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  let datos;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = texto;
  }
  return { status: respuesta.status, cuerpo: datos };
}

async function postTexto(base, ruta, texto, usuario) {
  const cabeceras = { "content-type": "application/json" };
  if (usuario) cabeceras["x-usuario-prueba"] = usuario;
  const respuesta = await fetch(`${base}${ruta}`, { method: "POST", headers: cabeceras, body: texto });
  return { status: respuesta.status, cuerpo: JSON.parse(await respuesta.text()) };
}

async function del(base, ruta, usuario) {
  const cabeceras = usuario ? { "x-usuario-prueba": usuario } : {};
  const respuesta = await fetch(`${base}${ruta}`, { method: "DELETE", headers: cabeceras });
  const texto = await respuesta.text();
  return { status: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null };
}

async function patch(base, ruta, cuerpo, usuario) {
  const cabeceras = { "content-type": "application/json" };
  if (usuario) cabeceras["x-usuario-prueba"] = usuario;
  const respuesta = await fetch(`${base}${ruta}`, {
    method: "PATCH",
    headers: cabeceras,
    body: JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  let datos;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = texto;
  }
  return { status: respuesta.status, cuerpo: datos };
}

async function patchTexto(base, ruta, texto, usuario) {
  const cabeceras = { "content-type": "application/json" };
  if (usuario) cabeceras["x-usuario-prueba"] = usuario;
  const respuesta = await fetch(`${base}${ruta}`, { method: "PATCH", headers: cabeceras, body: texto });
  return { status: respuesta.status, cuerpo: JSON.parse(await respuesta.text()) };
}

const asignacionInexistente = "40000000-0000-0000-0000-000000000099";
const asignacionNoCreada = "40000000-0000-0000-0000-000000000098";

test("el listado muestra cada asignación con su jurado, noche y especialidad", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const respuesta = await pedir(base, "/api/admin/asignaciones", admin);
      assert.equal(respuesta.status, 200);
      for (const item of respuesta.cuerpo.items) {
        assert.equal(item.creadaEn, "2026-11-01T10:00:00.000Z");
      }
      assert.deepEqual(
        respuesta.cuerpo.items.map((item) => ({
          id: item.id,
          estado: item.estado,
          jurado: item.jurado,
          noche: item.noche,
          especialidad: item.especialidad,
        })),
        [
          {
            id: asignacionRevocada,
            estado: "REVOCADA",
            jurado: { id: juradoDos, nombre: "Jurado dos", activo: true },
            noche: { id: nocheUno, nombre: "Primera noche", orden: 1, estado: "DRAFT" },
            especialidad: { id: especialidadJ1, nombre: "Vestuario", codigo: "J1", activa: true },
          },
          {
            id: asignacionUno,
            estado: "ACTIVA",
            jurado: { id: juradoUno, nombre: "Jurado uno", activo: true },
            noche: { id: nocheUno, nombre: "Primera noche", orden: 1, estado: "DRAFT" },
            especialidad: { id: especialidadJ1, nombre: "Vestuario", codigo: "J1", activa: true },
          },
          {
            id: asignacionDos,
            estado: "ACTIVA",
            jurado: { id: juradoUno, nombre: "Jurado uno", activo: true },
            noche: { id: nocheDos, nombre: "Segunda noche", orden: 2, estado: "OPEN" },
            especialidad: { id: especialidadJ3, nombre: "Batería", codigo: "J3", activa: true },
          },
          {
            id: asignacionAnterior,
            estado: "ACTIVA",
            jurado: { id: juradoUno, nombre: "Jurado uno", activo: true },
            noche: { id: nocheAnterior, nombre: "Noche anterior", orden: 1, estado: "DRAFT" },
            especialidad: { id: especialidadAnterior, nombre: "Vestuario", codigo: "J1", activa: true },
          },
        ],
      );
    });
  });
});

test("el listado de jurados incluye solo usuarios con ese rol", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const respuesta = await pedir(base, "/api/admin/jurados", admin);
      assert.equal(respuesta.status, 200);
      assert.deepEqual(respuesta.cuerpo.items, [
        { id: juradoDos, nombre: "Jurado dos", correo: "jurado2@example.test" },
        { id: juradoUno, nombre: "Jurado uno", correo: "jurado1@example.test" },
      ]);
    });
  });
});

test("un jurado al que se le retiró el rol aparece como inactivo", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `DELETE FROM usuario_rol
        WHERE usuario_id = $1 AND rol_id = (SELECT id FROM rol WHERE codigo = 'JURADO')`,
      [juradoDos],
    );
    await conServidor(appAsignaciones(pool), async (base) => {
      const respuesta = await pedir(base, "/api/admin/asignaciones", admin);
      assert.equal(respuesta.status, 200);
      const item = respuesta.cuerpo.items.find((asignacion) => asignacion.id === asignacionRevocada);
      assert.deepEqual(item.jurado, { id: juradoDos, nombre: "Jurado dos", activo: false });
    });
  });
});

test("sin sesión o sin rol de administrador no se consultan asignaciones ni jurados", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      for (const ruta of ["/api/admin/asignaciones", "/api/admin/jurados"]) {
        const sinSesion = await pedir(base, ruta);
        assert.equal(sinSesion.status, 401, ruta);
        assert.deepEqual(sinSesion.cuerpo, { error: "no_autenticado" });

        const comoEscribano = await pedir(base, ruta, escribano);
        assert.equal(comoEscribano.status, 403, ruta);
        assert.deepEqual(comoEscribano.cuerpo, { error: "sin_permiso" });
      }
    });
  });
});

test("crea una asignación en noche DRAFT de edición OPEN, persiste y registra auditoría", { skip }, async (t) => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    if (!(await puedeAbrirEdicion(pool))) {
      t.skip("la cuenta de pruebas no pertenece a carnavales_servicio_apertura");
      return;
    }
    await preparar(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const respuesta = await post(
        base,
        "/api/admin/asignaciones",
        { juradoId: juradoUno, nocheId: nocheEdicionAbierta, especialidadId: especialidadEdicionAbierta },
        admin,
      );
      assert.equal(respuesta.status, 201, JSON.stringify(respuesta.cuerpo));
      assert.equal(respuesta.cuerpo.estado, "ACTIVA");
      assert.match(respuesta.cuerpo.id, /^[0-9a-f-]{36}$/);
      assert.equal(respuesta.cuerpo.creadaEn.length, 24);
      assert.deepEqual(respuesta.cuerpo.jurado, { id: juradoUno, nombre: "Jurado uno", activo: true });
      assert.deepEqual(respuesta.cuerpo.noche, {
        id: nocheEdicionAbierta,
        nombre: "Noche de edición abierta",
        orden: 1,
        estado: "DRAFT",
      });

      const { rows: persistida } = await pool.query(
        `SELECT edicion_id, jurado_id, noche_id, especialidad_id, creada_por
           FROM asignacion_jurado WHERE id = $1`,
        [respuesta.cuerpo.id],
      );
      assert.deepEqual(persistida, [
        {
          edicion_id: edicionAbierta,
          jurado_id: juradoUno,
          noche_id: nocheEdicionAbierta,
          especialidad_id: especialidadEdicionAbierta,
          creada_por: admin,
        },
      ]);

      const listado = await pedir(base, "/api/admin/asignaciones", admin);
      assert.equal(listado.status, 200);
      assert.ok(listado.cuerpo.items.some((item) => item.id === respuesta.cuerpo.id));

      const { rows: auditoria } = await pool.query(
        "SELECT actor_id, operacion, entidad_tipo, entidad_id FROM auditoria",
      );
      assert.deepEqual(auditoria, [
        {
          actor_id: admin,
          operacion: "asignacion_creada",
          entidad_tipo: "asignacion_jurado",
          entidad_id: respuesta.cuerpo.id,
        },
      ]);
    });
  });
});

async function contarFilas(pool) {
  const { rows: [asignaciones] } = await pool.query("SELECT count(*)::int AS total FROM asignacion_jurado");
  const { rows: [auditoria] } = await pool.query("SELECT count(*)::int AS total FROM auditoria");
  return { asignaciones: asignaciones.total, auditoria: auditoria.total };
}

test("rechaza altas inválidas sin dejar filas parciales ni auditoría", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const antes = await contarFilas(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const casos = [
        {
          nombre: "noche abierta",
          cuerpo: { juradoId: juradoUno, nocheId: nocheDos, especialidadId: especialidadJ3 },
          status: 409,
          error: "noche_abierta",
        },
        {
          nombre: "noche cerrada",
          cuerpo: {
            juradoId: juradoUno,
            nocheId: nocheCerrada,
            especialidadId: especialidadEdicionAbierta,
          },
          status: 409,
          error: "noche_abierta",
        },
        {
          nombre: "jurado sin rol JURADO",
          cuerpo: { juradoId: escribano, nocheId: nocheUno, especialidadId: especialidadJ3 },
          status: 400,
          error: "jurado_invalido",
        },
        {
          nombre: "jurado inexistente",
          cuerpo: { juradoId: juradoInexistente, nocheId: nocheUno, especialidadId: especialidadJ3 },
          status: 400,
          error: "jurado_invalido",
        },
        {
          nombre: "noche inexistente",
          cuerpo: { juradoId: juradoUno, nocheId: nocheInexistente, especialidadId: especialidadJ3 },
          status: 400,
          error: "noche_inexistente",
        },
        {
          nombre: "especialidad inexistente",
          cuerpo: { juradoId: juradoUno, nocheId: nocheUno, especialidadId: especialidadInexistente },
          status: 400,
          error: "especialidad_invalida",
        },
        {
          nombre: "especialidad de otra edición",
          cuerpo: { juradoId: juradoUno, nocheId: nocheUno, especialidadId: especialidadEdicionAbierta },
          status: 400,
          error: "especialidad_invalida",
        },
        {
          nombre: "especialidad inactiva",
          cuerpo: { juradoId: juradoUno, nocheId: nocheUno, especialidadId: especialidadInactiva },
          status: 400,
          error: "especialidad_invalida",
        },
        {
          nombre: "duplicado activo",
          cuerpo: { juradoId: juradoUno, nocheId: nocheUno, especialidadId: especialidadJ1 },
          status: 409,
          error: "asignacion_duplicada",
        },
        {
          nombre: "campo vacío",
          cuerpo: { juradoId: "", nocheId: nocheUno, especialidadId: especialidadJ3 },
          status: 400,
          error: "campos_invalidos",
        },
        {
          nombre: "identificador mal formado",
          cuerpo: { juradoId: juradoUno, nocheId: "no-uuid", especialidadId: especialidadJ3 },
          status: 400,
          error: "campos_invalidos",
        },
      ];
      for (const caso of casos) {
        const respuesta = await post(base, "/api/admin/asignaciones", caso.cuerpo, admin);
        assert.equal(respuesta.status, caso.status, caso.nombre);
        assert.equal(respuesta.cuerpo.error, caso.error, caso.nombre);
        assert.ok(respuesta.cuerpo.mensaje, caso.nombre);
      }
    });
    assert.deepEqual(await contarFilas(pool), antes);
  });
});

test("sin sesión o sin rol de administrador no se crean asignaciones", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const antes = await contarFilas(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const cuerpo = { juradoId: juradoUno, nocheId: nocheEdicionAbierta, especialidadId: especialidadEdicionAbierta };
      const sinSesion = await post(base, "/api/admin/asignaciones", cuerpo);
      assert.equal(sinSesion.status, 401);
      assert.deepEqual(sinSesion.cuerpo, { error: "no_autenticado" });

      const comoEscribano = await post(base, "/api/admin/asignaciones", cuerpo, escribano);
      assert.equal(comoEscribano.status, 403);
      assert.deepEqual(comoEscribano.cuerpo, { error: "sin_permiso" });
    });
    assert.deepEqual(await contarFilas(pool), antes);
  });
});

test("el actor de la auditoría sale de la sesión, no del cuerpo", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const respuesta = await post(
        base,
        "/api/admin/asignaciones",
        {
          juradoId: juradoUno,
          nocheId: nocheEdicionAbierta,
          especialidadId: especialidadEdicionAbierta,
          creadaPor: escribano,
          actorId: escribano,
          usuarioId: escribano,
        },
        admin,
      );
      assert.equal(respuesta.status, 201, JSON.stringify(respuesta.cuerpo));
      const { rows: [asignacion] } = await pool.query(
        "SELECT creada_por FROM asignacion_jurado WHERE id = $1",
        [respuesta.cuerpo.id],
      );
      assert.equal(asignacion.creada_por, admin);
      const { rows: [auditoria] } = await pool.query(
        "SELECT actor_id FROM auditoria WHERE entidad_id = $1",
        [respuesta.cuerpo.id],
      );
      assert.equal(auditoria.actor_id, admin);
    });
  });
});

test("un cuerpo con JSON inválido responde campos_invalidos", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const antes = await contarFilas(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const respuesta = await postTexto(base, "/api/admin/asignaciones", "{", admin);
      assert.equal(respuesta.status, 400);
      assert.deepEqual(respuesta.cuerpo, {
        error: "campos_invalidos",
        mensaje: "El cuerpo debe ser un JSON válido.",
      });
    });
    assert.deepEqual(await contarFilas(pool), antes);
  });
});

test("dos altas simultáneas del mismo jurado dejan una sola asignación", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const antes = await contarFilas(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const cuerpo = {
        juradoId: juradoUno,
        nocheId: nocheEdicionAbierta,
        especialidadId: especialidadEdicionAbierta,
      };
      const respuestas = await Promise.all([
        post(base, "/api/admin/asignaciones", cuerpo, admin),
        post(base, "/api/admin/asignaciones", cuerpo, admin),
      ]);
      assert.deepEqual(
        respuestas.map((respuesta) => respuesta.status).sort(),
        [201, 409],
      );
      const { rows } = await pool.query(
        `SELECT id FROM asignacion_jurado
          WHERE jurado_id = $1 AND noche_id = $2 AND especialidad_id = $3`,
        [juradoUno, nocheEdicionAbierta, especialidadEdicionAbierta],
      );
      assert.equal(rows.length, 1);
      const aceptada = respuestas.find((respuesta) => respuesta.status === 201);
      assert.equal(rows[0].id, aceptada.cuerpo.id);
    });
    const despues = await contarFilas(pool);
    assert.equal(despues.asignaciones, antes.asignaciones + 1);
    assert.equal(despues.auditoria, antes.auditoria + 1);
  });
});

test("revoca una asignación sin borrarla físicamente y registra auditoría", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const respuesta = await del(base, `/api/admin/asignaciones/${asignacionUno}`, admin);
      assert.equal(respuesta.status, 200, JSON.stringify(respuesta.cuerpo));
      assert.equal(respuesta.cuerpo.id, asignacionUno);
      assert.equal(respuesta.cuerpo.estado, "REVOCADA");
      assert.ok(respuesta.cuerpo.revocadaEn);

      const { rows } = await pool.query(
        `SELECT estado, revocada_por, revocada_en, jurado_id, noche_id, especialidad_id
           FROM asignacion_jurado WHERE id = $1`,
        [asignacionUno],
      );
      assert.equal(rows.length, 1, "la fila original debe conservarse");
      assert.equal(rows[0].estado, "REVOCADA");
      assert.equal(rows[0].revocada_por, admin);
      assert.ok(rows[0].revocada_en instanceof Date);
      assert.equal(rows[0].jurado_id, juradoUno);
      assert.equal(rows[0].noche_id, nocheUno);
      assert.equal(rows[0].especialidad_id, especialidadJ1);

      const { rows: auditoria } = await pool.query(
        "SELECT actor_id, operacion, entidad_tipo, entidad_id FROM auditoria",
      );
      assert.deepEqual(auditoria, [
        {
          actor_id: admin,
          operacion: "asignacion_revocada",
          entidad_tipo: "asignacion_jurado",
          entidad_id: asignacionUno,
        },
      ]);

      const listado = await pedir(base, "/api/admin/asignaciones", admin);
      const item = listado.cuerpo.items.find((asignacion) => asignacion.id === asignacionUno);
      assert.equal(item.estado, "REVOCADA");
      assert.equal(item.revocadaEn, respuesta.cuerpo.revocadaEn);
    });
  });
});

test("rechaza revocar dos veces, un id inexistente y un id mal formado", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const antes = await contarFilas(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const casos = [
        { ruta: `/api/admin/asignaciones/${asignacionRevocada}`, status: 409, error: "asignacion_no_activa" },
        { ruta: `/api/admin/asignaciones/${asignacionInexistente}`, status: 404, error: "asignacion_no_encontrada" },
        { ruta: "/api/admin/asignaciones/no-uuid", status: 400, error: "campos_invalidos" },
      ];
      for (const caso of casos) {
        const respuesta = await del(base, caso.ruta, admin);
        assert.equal(respuesta.status, caso.status, caso.ruta);
        assert.equal(respuesta.cuerpo.error, caso.error, caso.ruta);
      }
    });
    assert.deepEqual(await contarFilas(pool), antes);
  });
});

test("reemplaza jurado y especialidad de forma atómica", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const antes = await contarFilas(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const respuesta = await patch(
        base,
        `/api/admin/asignaciones/${asignacionUno}`,
        { juradoId: juradoDos, especialidadId: especialidadJ3 },
        admin,
      );
      assert.equal(respuesta.status, 200, JSON.stringify(respuesta.cuerpo));
      assert.notEqual(respuesta.cuerpo.id, asignacionUno);
      assert.equal(respuesta.cuerpo.estado, "ACTIVA");
      assert.deepEqual(respuesta.cuerpo.jurado, { id: juradoDos, nombre: "Jurado dos", activo: true });
      assert.equal(respuesta.cuerpo.especialidad.id, especialidadJ3);
      assert.equal(respuesta.cuerpo.noche.id, nocheUno);

      const { rows: original } = await pool.query(
        `SELECT estado, revocada_por, jurado_id, especialidad_id
           FROM asignacion_jurado WHERE id = $1`,
        [asignacionUno],
      );
      assert.deepEqual(original, [
        {
          estado: "REVOCADA",
          revocada_por: admin,
          jurado_id: juradoUno,
          especialidad_id: especialidadJ1,
        },
      ]);

      const { rows: nueva } = await pool.query(
        `SELECT edicion_id, jurado_id, noche_id, especialidad_id, creada_por
           FROM asignacion_jurado WHERE id = $1`,
        [respuesta.cuerpo.id],
      );
      assert.deepEqual(nueva, [
        {
          edicion_id: edicion2027,
          jurado_id: juradoDos,
          noche_id: nocheUno,
          especialidad_id: especialidadJ3,
          creada_por: admin,
        },
      ]);

      const { rows: auditoria } = await pool.query(
        "SELECT actor_id, operacion, entidad_id FROM auditoria ORDER BY operacion DESC",
      );
      assert.deepEqual(auditoria, [
        { actor_id: admin, operacion: "asignacion_reemplazada", entidad_id: asignacionUno },
        { actor_id: admin, operacion: "asignacion_creada", entidad_id: respuesta.cuerpo.id },
      ]);
    });
    const despues = await contarFilas(pool);
    assert.equal(despues.asignaciones, antes.asignaciones + 1);
    assert.equal(despues.auditoria, antes.auditoria + 2);
  });
});

test("el reemplazo admite cambiar un solo campo y rechaza no cambiar ninguno", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const antes = await contarFilas(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      // Sin cambios se evalúa sobre la asignación todavía activa.
      const igual = await patch(
        base,
        `/api/admin/asignaciones/${asignacionUno}`,
        { juradoId: juradoUno, especialidadId: especialidadJ1 },
        admin,
      );
      assert.equal(igual.status, 400);
      assert.equal(igual.cuerpo.error, "campos_invalidos");

      const parcial = await patch(
        base,
        `/api/admin/asignaciones/${asignacionUno}`,
        { juradoId: juradoDos },
        admin,
      );
      assert.equal(parcial.status, 200, JSON.stringify(parcial.cuerpo));
      assert.equal(parcial.cuerpo.jurado.id, juradoDos);
      assert.equal(parcial.cuerpo.especialidad.id, especialidadJ1);

      const { rows } = await pool.query(
        "SELECT estado FROM asignacion_jurado WHERE id = $1",
        [asignacionUno],
      );
      assert.equal(rows[0].estado, "REVOCADA", "el reemplazo parcial revocó la original");
    });
    const despues = await contarFilas(pool);
    assert.equal(despues.asignaciones, antes.asignaciones + 1);
    assert.equal(despues.auditoria, antes.auditoria + 2);
  });
});

test("rechaza reemplazos inválidos sin dejar filas parciales ni auditoría", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    // Combinación activa que hará colisionar uno de los reemplazos.
    await pool.query(
      `INSERT INTO asignacion_jurado (id, edicion_id, jurado_id, noche_id, especialidad_id, creada_por)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [asignacionInexistente, edicion2027, juradoDos, nocheUno, especialidadJ3, admin],
    );
    const antes = await contarFilas(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const casos = [
        {
          nombre: "jurado sin rol",
          cuerpo: { juradoId: escribano },
          ruta: `/api/admin/asignaciones/${asignacionUno}`,
          status: 400,
          error: "jurado_invalido",
        },
        {
          nombre: "jurado inexistente",
          cuerpo: { juradoId: juradoInexistente },
          ruta: `/api/admin/asignaciones/${asignacionUno}`,
          status: 400,
          error: "jurado_invalido",
        },
        {
          nombre: "especialidad inactiva",
          cuerpo: { especialidadId: especialidadInactiva },
          ruta: `/api/admin/asignaciones/${asignacionUno}`,
          status: 400,
          error: "especialidad_invalida",
        },
        {
          nombre: "especialidad de otra edición",
          cuerpo: { especialidadId: especialidadEdicionAbierta },
          ruta: `/api/admin/asignaciones/${asignacionUno}`,
          status: 400,
          error: "especialidad_invalida",
        },
        {
          nombre: "especialidad inexistente",
          cuerpo: { especialidadId: especialidadInexistente },
          ruta: `/api/admin/asignaciones/${asignacionUno}`,
          status: 400,
          error: "especialidad_invalida",
        },
        {
          nombre: "duplicado activo",
          cuerpo: { juradoId: juradoDos, especialidadId: especialidadJ3 },
          ruta: `/api/admin/asignaciones/${asignacionUno}`,
          status: 409,
          error: "asignacion_duplicada",
        },
        {
          nombre: "asignación ya revocada",
          cuerpo: { juradoId: juradoDos },
          ruta: `/api/admin/asignaciones/${asignacionRevocada}`,
          status: 409,
          error: "asignacion_no_activa",
        },
        {
          nombre: "asignación inexistente",
          cuerpo: { juradoId: juradoDos },
          ruta: `/api/admin/asignaciones/${asignacionNoCreada}`,
          status: 404,
          error: "asignacion_no_encontrada",
        },
        {
          nombre: "id mal formado",
          cuerpo: { juradoId: juradoDos },
          ruta: "/api/admin/asignaciones/no-uuid",
          status: 400,
          error: "campos_invalidos",
        },
        {
          nombre: "cuerpo vacío",
          cuerpo: {},
          ruta: `/api/admin/asignaciones/${asignacionUno}`,
          status: 400,
          error: "campos_invalidos",
        },
      ];
      for (const caso of casos) {
        const respuesta = await patch(base, caso.ruta, caso.cuerpo, admin);
        assert.equal(respuesta.status, caso.status, caso.nombre);
        assert.equal(respuesta.cuerpo.error, caso.error, caso.nombre);
      }
    });
    assert.deepEqual(await contarFilas(pool), antes);
  });
});

test("sin sesión o sin rol de administrador no se revoca ni se reemplaza", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const antes = await contarFilas(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const ruta = `/api/admin/asignaciones/${asignacionUno}`;
      for (const respuesta of [
        await del(base, ruta),
        await patch(base, ruta, { juradoId: juradoDos }),
      ]) {
        assert.equal(respuesta.status, 401);
        assert.deepEqual(respuesta.cuerpo, { error: "no_autenticado" });
      }
      for (const respuesta of [
        await del(base, ruta, escribano),
        await patch(base, ruta, { juradoId: juradoDos }, escribano),
      ]) {
        assert.equal(respuesta.status, 403);
        assert.deepEqual(respuesta.cuerpo, { error: "sin_permiso" });
      }
    });
    assert.deepEqual(await contarFilas(pool), antes);
  });
});

test("el actor de revocación y reemplazo sale de la sesión, no del cuerpo", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const reemplazo = await patch(
        base,
        `/api/admin/asignaciones/${asignacionUno}`,
        { juradoId: juradoDos, actorId: escribano, revocadaPor: escribano },
        admin,
      );
      assert.equal(reemplazo.status, 200, JSON.stringify(reemplazo.cuerpo));
      const revocacion = await del(
        base,
        `/api/admin/asignaciones/${reemplazo.cuerpo.id}?actorId=${escribano}`,
        admin,
      );
      assert.equal(revocacion.status, 200, JSON.stringify(revocacion.cuerpo));

      const { rows } = await pool.query(
        "SELECT DISTINCT actor_id FROM auditoria WHERE actor_id <> $1",
        [admin],
      );
      assert.deepEqual(rows, [], "toda la auditoría debe usar al administrador de la sesión");
    });
  });
});

test("un cuerpo con JSON inválido no se puede reemplazar", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const antes = await contarFilas(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const respuesta = await patchTexto(
        base,
        `/api/admin/asignaciones/${asignacionUno}`,
        "{",
        admin,
      );
      assert.equal(respuesta.status, 400);
      assert.deepEqual(respuesta.cuerpo, {
        error: "campos_invalidos",
        mensaje: "El cuerpo debe ser un JSON válido.",
      });
    });
    assert.deepEqual(await contarFilas(pool), antes);
  });
});

test("operaciones simultáneas sobre la misma asignación dejan una sola operación", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const antes = await contarFilas(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const revocaciones = await Promise.all([
        del(base, `/api/admin/asignaciones/${asignacionUno}`, admin),
        del(base, `/api/admin/asignaciones/${asignacionUno}`, admin),
      ]);
      assert.deepEqual(
        revocaciones.map((respuesta) => respuesta.status).sort(),
        [200, 409],
      );
      const reemplazos = await Promise.all([
        patch(base, `/api/admin/asignaciones/${asignacionAnterior}`, { juradoId: juradoDos }, admin),
        patch(base, `/api/admin/asignaciones/${asignacionAnterior}`, { juradoId: juradoDos }, admin),
      ]);
      assert.deepEqual(
        reemplazos.map((respuesta) => respuesta.status).sort(),
        [200, 409],
      );
    });
    const despues = await contarFilas(pool);
    assert.equal(despues.asignaciones, antes.asignaciones + 1, "solo el reemplazo crea una fila");
    assert.equal(despues.auditoria, antes.auditoria + 3, "una revocación y dos eventos de reemplazo");
  });
});

test("el catálogo de noches y especialidades está disponible para el panel", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      const noches = await pedir(base, "/api/admin/noches", admin);
      assert.equal(noches.status, 200, JSON.stringify(noches.cuerpo));
      assert.deepEqual(noches.cuerpo.items.map((noche) => ({
        id: noche.id,
        nombre: noche.nombre,
        orden: noche.orden,
        estado: noche.estado,
        edicion: noche.edicion,
      })), [
        { id: nocheEdicionAbierta, nombre: "Noche de edición abierta", orden: 1, estado: "DRAFT", edicion: { id: edicionAbierta, nombre: "Carnaval 2028", anio: 2028 } },
        { id: nocheCerrada, nombre: "Noche cerrada", orden: 2, estado: "CLOSED", edicion: { id: edicionAbierta, nombre: "Carnaval 2028", anio: 2028 } },
        { id: nocheUno, nombre: "Primera noche", orden: 1, estado: "DRAFT", edicion: { id: edicion2027, nombre: "Carnaval 2027", anio: 2027 } },
        { id: nocheDos, nombre: "Segunda noche", orden: 2, estado: "OPEN", edicion: { id: edicion2027, nombre: "Carnaval 2027", anio: 2027 } },
        { id: nocheAnterior, nombre: "Noche anterior", orden: 1, estado: "DRAFT", edicion: { id: edicion2026, nombre: "Carnaval 2026", anio: 2026 } },
      ]);

      const especialidades = await pedir(base, "/api/admin/especialidades", admin);
      assert.equal(especialidades.status, 200, JSON.stringify(especialidades.cuerpo));
      assert.deepEqual(especialidades.cuerpo.items.map((especialidad) => ({
        id: especialidad.id,
        nombre: especialidad.nombre,
        codigo: especialidad.codigo,
        activa: especialidad.activa,
        edicion: especialidad.edicion,
      })), [
        { id: especialidadEdicionAbierta, nombre: "Vestuario", codigo: "J1", activa: true, edicion: { id: edicionAbierta, nombre: "Carnaval 2028", anio: 2028 } },
        { id: especialidadJ1, nombre: "Vestuario", codigo: "J1", activa: true, edicion: { id: edicion2027, nombre: "Carnaval 2027", anio: 2027 } },
        { id: especialidadJ3, nombre: "Batería", codigo: "J3", activa: true, edicion: { id: edicion2027, nombre: "Carnaval 2027", anio: 2027 } },
        { id: especialidadInactiva, nombre: "Inactiva", codigo: "J4", activa: false, edicion: { id: edicion2027, nombre: "Carnaval 2027", anio: 2027 } },
        { id: especialidadAnterior, nombre: "Vestuario", codigo: "J1", activa: true, edicion: { id: edicion2026, nombre: "Carnaval 2026", anio: 2026 } },
      ]);
    });
  });
});

test("el catálogo de noches y especialidades exige administrador", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appAsignaciones(pool), async (base) => {
      for (const ruta of ["/api/admin/noches", "/api/admin/especialidades"]) {
        const sinSesion = await pedir(base, ruta);
        assert.equal(sinSesion.status, 401, ruta);
        assert.deepEqual(sinSesion.cuerpo, { error: "no_autenticado" });
        const comoEscribano = await pedir(base, ruta, escribano);
        assert.equal(comoEscribano.status, 403, ruta);
        assert.deepEqual(comoEscribano.cuerpo, { error: "sin_permiso" });
      }
    });
  });
});
