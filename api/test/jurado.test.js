import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { createApp } from "../src/app.js";
import { crearRutasAdminAsignaciones } from "../src/admin-asignaciones.js";
import { crearRutasJurado } from "../src/jurado.js";
import { abrirNoche } from "../src/apertura-noche.js";
import { guardarPlanillaNoche } from "../src/planillas-noche.js";
import { revocarAsignacion, reemplazarAsignacion } from "../src/asignaciones.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin-j";
const juradoUno = "u-jurado-j1";
const juradoDos = "u-jurado-j2";
const escribano = "u-escribano-j";
const edicion = "10000000-0000-4000-8000-000000000001";
const version = "20000000-0000-4000-8000-000000000001";
const nocheUno = "30000000-0000-4000-8000-000000000001";
const nocheDos = "30000000-0000-4000-8000-000000000002";
const especialidadJ1 = "40000000-0000-4000-8000-000000000001";
const especialidadJ3 = "40000000-0000-4000-8000-000000000003";
const comparsa = "50000000-0000-4000-8000-000000000001";
const participante = "60000000-0000-4000-8000-000000000001";
const participanteDos = "60000000-0000-4000-8000-000000000002";
const sujeto = "70000000-0000-4000-8000-000000000001";
const sujetoDos = "70000000-0000-4000-8000-000000000002";
const rubro = "90000000-0000-4000-8000-000000000001";
const rubroDos = "90000000-0000-4000-8000-000000000002";
const asignacionActiva = "80000000-0000-4000-8000-000000000001";
const asignacionRevocada = "80000000-0000-4000-8000-000000000002";
const asignacionAjena = "80000000-0000-4000-8000-000000000003";
const creadaEn = "2026-11-19T10:00:00Z";

async function preparar(pool) {
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Admin', 'admin-j@example.test', true),
            ($2, 'Jurado uno', 'j1@example.test', true),
            ($3, 'Jurado dos', 'j2@example.test', true),
            ($4, 'Escribano', 'e@example.test', true)`,
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
     VALUES ($1, $2, 1, 'Primera noche', 'COMPETENCIA', 'DRAFT'),
            ($3, $2, 2, 'Segunda noche', 'COMPETENCIA', 'DRAFT')`,
    [nocheUno, edicion, nocheDos],
  );
  await pool.query(
    `INSERT INTO especialidad (id, edicion_id, nombre, codigo, orden)
     VALUES ($1, $2, 'Vestuario', 'J1', 1), ($3, $2, 'Batería', 'J3', 3)`,
    [especialidadJ1, edicion, especialidadJ3],
  );
  await pool.query(
    `INSERT INTO asignacion_jurado
       (id, edicion_id, jurado_id, noche_id, especialidad_id, creada_por, creada_en,
        estado, revocada_por, revocada_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVA', NULL, NULL),
            ($8, $2, $3, $9, $5, $6, $7, 'REVOCADA', $6, $7),
            ($10, $2, $11, $4, $5, $6, $7, 'ACTIVA', NULL, NULL)`,
    [asignacionActiva, edicion, juradoUno, nocheUno, especialidadJ1, admin, creadaEn,
      asignacionRevocada, nocheDos, asignacionAjena, juradoDos],
  );
  await pool.query(
    `INSERT INTO comparsa (id, edicion_id, nombre, categoria)
     VALUES ($1, $2, 'Comparsa Uno', 'PRIMERA')`,
    [comparsa, edicion],
  );
  await pool.query(
    `INSERT INTO participante (id, edicion_id, nombre_completo)
     VALUES ($1, $2, 'Persona Uno'), ($3, $2, 'Persona Dos')`,
    [participante, edicion, participanteDos],
  );
  await pool.query(
    `INSERT INTO sujeto_evaluable (id, edicion_id, comparsa_id, tipo_sujeto, participante_id)
     VALUES ($1, $2, $3, 'PERSONA', $4), ($5, $2, $3, 'PERSONA', $6)`,
    [sujeto, edicion, comparsa, participante, sujetoDos, participanteDos],
  );
  await pool.query(
    `INSERT INTO rubro_version
       (id, edicion_id, version_id, codigo, nombre, tipo_sujeto, tipo_rubro,
        nominados_maximos, evaluable, orden)
     VALUES ($1, $2, $3, 'R1', 'Rubro uno', 'PERSONA', 'ALEATORIO', 3, true, 1)`,
    [rubro, edicion, version],
  );
  await pool.query(
    `INSERT INTO rubro_especialidad (rubro_version_id, especialidad_id, edicion_id)
     VALUES ($1, $2, $3), ($1, $4, $3)`,
    [rubro, especialidadJ1, edicion, especialidadJ3],
  );
  await pool.query(
    `INSERT INTO rubro_version
       (id, edicion_id, version_id, codigo, nombre, tipo_sujeto, tipo_rubro,
        nominados_maximos, evaluable, orden)
     VALUES ($1, $2, $3, 'R2', 'Rubro dos', 'PERSONA', 'ALEATORIO', 3, true, 2)`,
    [rubroDos, edicion, version],
  );
  await pool.query(
    `INSERT INTO rubro_especialidad (rubro_version_id, especialidad_id, edicion_id)
     VALUES ($1, $2, $3)`,
    [rubroDos, especialidadJ1, edicion],
  );
  await pool.query(
    `INSERT INTO escala_puntaje_version (version_id, edicion_id, minimo, maximo)
     VALUES ($1, $2, 1, 5)`,
    [version, edicion],
  );
  await pool.query(
    `INSERT INTO fila_planilla
       (id, edicion_id, rubro_version_id, sujeto_id, especialidad_id, origen, orden, excluida)
     VALUES ('a0000000-0000-4000-8000-000000000001', $1, $2, $3, $4, 'GENERADA', 1, false),
            ('a0000000-0000-4000-8000-000000000002', $1, $2, $5, $4, 'GENERADA', 2, true),
            ('a0000000-0000-4000-8000-000000000003', $1, $6, $3, $4, 'GENERADA', 3, false)`,
    [edicion, rubro, sujeto, especialidadJ1, sujetoDos, rubroDos],
  );
}

async function conServidor(pool, run) {
  const app = express();
  const obtenerSesion = async (request) => {
    const id = request.headers["x-usuario-prueba"];
    return id ? { user: { id } } : null;
  };
  app.use("/api/admin", crearRutasAdminAsignaciones({ pool, obtenerSesion }));
  app.use(
    "/api/jurado",
    crearRutasJurado({
      pool,
      obtenerSesion,
    }),
  );
  app.use(createApp({
    pool,
    auth: { api: { getSession: async ({ headers }) => {
      const id = headers.get("x-usuario-prueba");
      return id ? { user: { id } } : null;
    } } },
  }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/jurado`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test("solo el titular tiene acceso a la planilla al registrar dos suplentes en borrador", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const juradoTres = "u-jurado-j3";
    await pool.query(
      "INSERT INTO usuario (id, nombre, correo) VALUES ($1, 'Jurado tres', 'j3@example.test')", [juradoTres],
    );
    await pool.query(
      `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
       SELECT $1, id, $2, false FROM rol WHERE codigo = 'JURADO'`, [juradoTres, admin],
    );
    await conServidor(pool, async (base) => {
      const url = new URL(`/api/admin/asignaciones/${asignacionActiva}/suplentes`, base);
      const registrar = (actor, suplenteIds) => fetch(url, {
        method: "POST",
        headers: { "x-usuario-prueba": actor, "content-type": "application/json" },
        body: JSON.stringify({ suplenteIds }),
      });
      assert.equal((await registrar(juradoUno, [juradoDos, juradoTres])).status, 403);
      assert.equal((await registrar(admin, [juradoDos, juradoDos])).status, 400);
      const registrada = await registrar(admin, [juradoDos, juradoTres]);
      assert.equal(registrada.status, 201);
      assert.deepEqual(await registrada.json(), { asignacionId: asignacionActiva, suplenteIds: [juradoDos, juradoTres] });
      assert.equal((await registrar(admin, [juradoDos, juradoTres])).status, 409);
      const { rows: auditoria } = await pool.query(
        "SELECT actor_id FROM auditoria WHERE operacion = 'suplentes_jurado_registrados' AND entidad_id = $1",
        [asignacionActiva],
      );
      assert.deepEqual(auditoria, [{ actor_id: admin }]);
      const planilla = `/planillas/${asignacionActiva}`;
      assert.equal((await pedir(base, planilla, juradoUno)).status, 200);
      assert.equal((await pedir(base, planilla, juradoDos)).status, 404);
      assert.equal((await pedir(base, planilla, juradoTres)).status, 404);
      assert.equal((await enviar(base, juradoTres, envio)).status, 404);
      assert.deepEqual((await (await pedir(base, "/contextos", juradoTres)).json()).items, []);
      await abrirParaRecepcion(pool);
      const posterior = await registrar(admin, [juradoDos, juradoTres]);
      assert.equal(posterior.status, 409);
      assert.equal((await posterior.json()).error, "noche_abierta");
      await assert.rejects(pool.query(
        `UPDATE suplentes_asignacion_jurado SET primer_suplente_id = $2 WHERE asignacion_id = $1`,
        [asignacionActiva, juradoUno],
      ), { code: "23514" });
    });
  });
});

function pedir(base, ruta, usuario) {
  return fetch(`${base}${ruta}`, { headers: usuario ? { "x-usuario-prueba": usuario } : {} });
}

test("roster rejection is atomic and opening adds no substitute obligation", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const suplente = "u-roster-only";
    await pool.query("INSERT INTO usuario (id, nombre, correo) VALUES ($1, 'Suplente', 'suplente@example.test')", [suplente]);
    await pool.query(`INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
      SELECT $1, id, $2, false FROM rol WHERE codigo = 'JURADO'`, [suplente, admin]);
    await conServidor(pool, async (base) => {
      const post = (id, actor, suplenteIds) => fetch(new URL(`/api/admin/asignaciones/${id}/suplentes`, base), {
        method: "POST", headers: { "content-type": "application/json", ...(actor && { "x-usuario-prueba": actor }) },
        body: JSON.stringify({ suplenteIds }),
      });
      const registro = [juradoDos, suplente];
      const snapshot = async () => JSON.stringify((await pool.query(`SELECT
        (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM asignacion_jurado a) AS asignaciones,
        (SELECT jsonb_agg(to_jsonb(r) ORDER BY asignacion_id) FROM suplentes_asignacion_jurado r) AS suplencias,
        (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM auditoria l) AS logs`)).rows);
      const check = async (id, actor, ids, status, body) => {
        const r = await post(id, actor, ids);
        assert.equal(r.status, status);
        assert.deepEqual(await r.json(), body);
      };
      await check(asignacionActiva, null, registro, 401, { error: "no_autenticado" });
      const reject = async (id, actor, ids, status, error, mensaje) => {
        const before = await snapshot();
        await check(id, actor, ids, status, { error, ...(mensaje && { mensaje }) });
        assert.equal(await snapshot(), before);
      };
      await reject(asignacionActiva, escribano, registro, 403, "sin_permiso");
      await reject(asignacionActiva, admin, [], 400, "campos_invalidos", "Se requieren dos suplentes.");
      await reject(asignacionActiva, admin, [suplente, 0], 400, "campos_invalidos", "El suplente debe ser un jurado válido.");
      await reject(asignacionActiva, admin, [suplente, juradoUno], 400, "campos_invalidos", "El titular no puede ser su propio suplente.");
      await reject(asignacionActiva, admin, [suplente, escribano], 400, "jurado_invalido", "El jurado no existe o no tiene el rol JURADO.");
      await reject(asignacionRevocada, admin, registro, 409, "asignacion_no_activa", "La asignación ya está revocada.");
      await check(asignacionActiva, admin, registro, 201, { asignacionId: asignacionActiva, suplenteIds: registro });
      await reject(asignacionActiva, admin, [...registro].reverse(), 409, "suplentes_ya_registrados", "Ya se registraron los suplentes.");
      assert.deepEqual((await pool.query(`SELECT actor_id, entidad_id FROM auditoria
        WHERE operacion = 'suplentes_jurado_registrados'`)).rows, [{ actor_id: admin, entidad_id: asignacionActiva }]);
      await abrirParaRecepcion(pool);
      await reject(asignacionAjena, admin, [suplente, juradoUno], 409, "noche_abierta", "Solo se registran suplentes antes de abrir la noche.");
      assert.deepEqual((await pool.query(`SELECT asignacion_id FROM instantanea_planilla_esperada_detalle ORDER BY asignacion_id`))
        .rows.map((r) => r.asignacion_id), [asignacionActiva, asignacionAjena]);
      assert.equal((await pedir(base, `/planillas/${asignacionActiva}`, suplente)).status, 404);
      assert.equal((await pedir(base, `/planillas/${asignacionAjena}`, juradoDos)).status, 200);
      const modificar = (id, sufijo, method, cuerpo, actor = admin) =>
        fetch(new URL(`/api/${actor === admin ? "admin/asignaciones" : "jurado/planillas"}/${id}${sufijo}`, base), {
          method,
          headers: { "content-type": "application/json", "x-usuario-prueba": actor },
          ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
        });
      assert.equal((await modificar(asignacionActiva, "", "DELETE")).status, 409);
      assert.equal((await modificar(asignacionActiva, "", "PATCH", { juradoId: suplente })).status, 409);
      await assert.rejects(pool.query(
        "DELETE FROM suplentes_asignacion_jurado WHERE asignacion_id = $1", [asignacionActiva],
      ), { code: "23514" });
      const relevo = await modificar(asignacionActiva, "/activar-suplente", "POST", { juradoId: suplente });
      assert.equal(relevo.status, 200);
      const { id: sucesora } = await relevo.json();
      assert.notEqual(sucesora, asignacionActiva);
      const listar = () => fetch(new URL("/api/admin/asignaciones", base), {
        headers: { "x-usuario-prueba": admin },
      });
      const lista = await listar();
      assert.equal(lista.status, 200);
      assert.deepEqual((await lista.json()).items.find(({ id }) => id === sucesora).suplencia,
        { suplenteIds: registro, abiertaParaEditar: false });
      assert.equal((await pedir(base, `/planillas/${asignacionActiva}`, juradoUno)).status, 404);
      const previa = await (await pedir(base, `/planillas/${sucesora}`, suplente)).json();
      assert.equal(previa.requiereDispositivo, true);
      assert.equal(previa.recepcionHabilitada, false);
      assert.equal((await enviar(base, suplente, { ...envio, asignacionId: sucesora })).status, 409);
      const dispositivoId = "c0000000-0000-4000-8000-000000000001";
      const abrir = (actor, token) => modificar(sucesora, "/abrir-edicion", "POST", { dispositivoId: token }, actor);
      assert.equal((await abrir(juradoUno, dispositivoId)).status, 404);
      assert.equal((await abrir(suplente, dispositivoId)).status, 200);
      const estado = await (await listar()).json();
      assert.equal(estado.items.find(({ id }) => id === sucesora).suplencia.abiertaParaEditar, true);
      assert.equal(JSON.stringify(estado).includes(dispositivoId), false);
      assert.equal((await abrir(suplente, dispositivoId)).status, 200);
      assert.equal((await abrir(suplente, "c0000000-0000-4000-8000-000000000002")).status, 409);
      assert.equal((await modificar(sucesora, "/activar-suplente", "POST", { juradoId: juradoDos })).status, 409);
      assert.equal((await enviar(base, suplente, { ...envio, asignacionId: sucesora, dispositivoId })).status, 201);
    });
  });
});

const primeraFila = "a0000000-0000-4000-8000-000000000001";
const ultimaFila = "a0000000-0000-4000-8000-000000000003";
const operacion = "b0000000-0000-4000-8000-000000000001";
const puntajes = [
  { filaId: primeraFila, valor: 5, noPresentado: false },
  { filaId: ultimaFila, valor: 0, noPresentado: true },
];
const envio = { operationId: operacion, asignacionId: asignacionActiva, versionId: version, puntajes };

function enviar(base, usuario, cuerpo) {
  return fetch(`${base}/planillas`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(usuario ? { "x-usuario-prueba": usuario } : {}) },
    body: JSON.stringify(cuerpo),
  });
}

async function abrirParaRecepcion(pool, soloInformativa = false) {
  if (soloInformativa) await pool.query("UPDATE rubro_version SET evaluable = false WHERE id = $1", [rubro]);
  await pool.query(
    `INSERT INTO orden_presentacion (edicion_id, noche_id, comparsa_id, orden_presentacion)
     VALUES ($1, $2, $3, 1), ($1, $4, $3, 1)`, [edicion, nocheUno, comparsa, nocheDos],
  );
  await pool.query(
    `UPDATE version_reglamento SET estado = 'PUBLICADA', publicada_por = $1, publicada_en = $2 WHERE id = $3`,
    [admin, creadaEn, version],
  );
  await guardarPlanillaNoche(pool, {
    edicionId: edicion, versionId: version, nocheId: nocheUno, especialidadId: especialidadJ1,
    actorId: admin, filaIds: soloInformativa ? [primeraFila] : [primeraFila, ultimaFila],
  });
  await guardarPlanillaNoche(pool, {
    edicionId: edicion, versionId: version, nocheId: nocheUno, especialidadId: especialidadJ3,
    actorId: admin, filaIds: [],
  });
  await pool.query(
    "UPDATE edicion SET estado = 'OPEN', abierta_por = $2, abierta_en = CURRENT_TIMESTAMP WHERE id = $1",
    [edicion, admin],
  );
  await abrirNoche(pool, { edicionId: edicion, nocheId: nocheUno, actorId: admin, claveOperacion: operacion });
}

const suplentesDePrueba = ["u-suplencia-b", "u-suplencia-c"];
const dispositivoDePrueba = "c0000000-0000-4000-8000-000000000001";

async function conSuplencia(run) {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(`INSERT INTO usuario (id, nombre, correo)
      SELECT id, id, id || '@example.test' FROM unnest($1::text[]) AS jurado(id)`, [suplentesDePrueba]);
    await pool.query(`INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
      SELECT jurado.id, r.id, $2, false FROM rol r
      CROSS JOIN unnest($1::text[]) AS jurado(id) WHERE r.codigo = 'JURADO'`, [suplentesDePrueba, admin]);
    await conServidor(pool, async (base) => {
      const post = (ruta, actor, cuerpo) => fetch(new URL(ruta, base), {
        method: "POST",
        headers: { "content-type": "application/json", "x-usuario-prueba": actor },
        body: JSON.stringify(cuerpo),
      });
      const activar = (id, juradoId) =>
        post(`/api/admin/asignaciones/${id}/activar-suplente`, admin, { juradoId });
      const reclamar = (id, actor) =>
        post(`/api/jurado/planillas/${id}/abrir-edicion`, actor, { dispositivoId: dispositivoDePrueba });
      const congeladas = async () => (await pool.query(
        "SELECT asignacion_id FROM instantanea_planilla_esperada_detalle ORDER BY asignacion_id",
      )).rows;
      assert.equal((await post(`/api/admin/asignaciones/${asignacionActiva}/suplentes`, admin, {
        suplenteIds: suplentesDePrueba,
      })).status, 201);
      await run({ pool, base, activar, reclamar, congeladas, post });
    });
  });
}

test("a draft substitution followed by an open-night substitution fulfills one frozen ballot", { skip }, async () => {
  await conSuplencia(async ({ pool, base, activar, reclamar, congeladas }) => {
    const primera = await activar(asignacionActiva, suplentesDePrueba[0]);
    assert.equal(primera.status, 200);
    const { id: congelada } = await primera.json();
    await abrirParaRecepcion(pool);
    const instantanea = await congeladas();
    assert.ok(instantanea.some(({ asignacion_id }) => asignacion_id === congelada));
    const segunda = await activar(congelada, suplentesDePrueba[1]);
    assert.equal(segunda.status, 200);
    const { id: activa } = await segunda.json();
    assert.equal((await reclamar(activa, suplentesDePrueba[1])).status, 200);
    assert.equal((await enviar(base, suplentesDePrueba[1], {
      ...envio, asignacionId: activa, dispositivoId: dispositivoDePrueba,
    })).status, 201);
    assert.deepEqual(await congeladas(), instantanea);
    const { rows } = await pool.query(
      `SELECT e.asignacion_id
         FROM planilla_recibida p
         JOIN suplentes_asignacion_jurado s ON s.asignacion_activa_id = p.asignacion_id
         JOIN instantanea_planilla_esperada_detalle e ON e.id = s.detalle_esperado_id
        WHERE p.asignacion_id = $1`, [activa],
    );
    assert.deepEqual(rows, [{ asignacion_id: congelada }]);
  });
});

test("freezing a partial draft is durable, private and rejects a competing official receipt", { skip }, async () => {
  await conSuplencia(async ({ pool, base, post, reclamar }) => {
    await abrirParaRecepcion(pool);
    assert.equal((await reclamar(asignacionActiva, juradoUno)).status, 200);
    const ruta = `/api/jurado/planillas/${asignacionActiva}/borrador-traspaso`;
    const borrador = {
      operationId: operacion, versionId: version, dispositivoId: dispositivoDePrueba,
      puntajes: [{ ...puntajes[0], autorId: juradoDos }],
    };
    assert.equal((await post(ruta, juradoDos, borrador)).status, 404);
    assert.equal((await post(ruta, juradoUno, { ...borrador, dispositivoId: operacion })).status, 409);
    assert.equal((await post(ruta, juradoUno, {
      ...borrador, puntajes: [{ ...puntajes[0], filaId: operacion }],
    })).status, 422);
    const primera = await post(ruta, juradoUno, borrador);
    assert.equal(primera.status, 201);
    const acuse = await primera.json();
    assert.match(acuse.confirmacionId, /^[a-f0-9-]{36}$/);
    assert.deepEqual(Object.keys(acuse).sort(), ["asignacionId", "confirmacionId", "estado", "operationId"]);
    const reenvio = await post(ruta, juradoUno, borrador);
    assert.equal(reenvio.status, 200);
    assert.deepEqual(await reenvio.json(), acuse);
    assert.equal((await post(ruta, juradoUno, { ...borrador, puntajes: [] })).status, 409);
    assert.equal((await reclamar(asignacionActiva, juradoUno)).status, 409);
    const envioOficial = await enviar(base, juradoUno, { ...envio, dispositivoId: dispositivoDePrueba });
    assert.equal(envioOficial.status, 409);
    assert.equal((await envioOficial.json()).error, "borrador_traspaso_congelado");
    const { rows } = await pool.query("SELECT autor_id, puntajes FROM borrador_traspaso_jurado");
    assert.deepEqual(rows, [{ autor_id: juradoUno, puntajes: [puntajes[0]] }]);
    await assert.rejects(pool.query("UPDATE borrador_traspaso_jurado SET puntajes = '[]'"), { code: "23514" });
    await assert.rejects(pool.query(
      `INSERT INTO planilla_recibida (operation_id, asignacion_id, version_id, hash_contenido)
       VALUES ($1, $2, $3, $4)`, [operacion, asignacionActiva, version, "a".repeat(64)],
    ), { code: "23514", message: "BORRADOR_TRASPASO_CONGELADO" });
    assert.equal((await pool.query("SELECT 1 FROM planilla_recibida")).rowCount, 0);
    assert.equal((await pool.query("SELECT 1 FROM auditoria WHERE operacion = 'borrador_traspaso_congelado'")).rowCount, 1);
  });
});

test("night closure readiness only accepts official receipts for each frozen obligation", { skip }, async () => {
  await conSuplencia(async ({ pool, base, reclamar, activar }) => {
    const estado = (actor, method = "GET") => fetch(new URL(`/api/escribano/ediciones/${edicion}/noches/${nocheUno}/cierre`, base), {
      method,
      headers: { ...(actor && { "x-usuario-prueba": actor }), ...(method === "POST" && { "content-type": "application/json" }) },
      ...(method === "POST" && { body: JSON.stringify({ confirmar: true }) }),
    });
    const verificar = async (motivo, puedeCerrar = false) => {
      const respuesta = await estado(escribano);
      assert.equal(respuesta.status, 200);
      assert.deepEqual(await respuesta.json(), { nocheId: nocheUno, puedeCerrar, motivo });
    };
    assert.equal((await estado(null)).status, 401);
    const lista = (actor) => fetch(new URL("/api/escribano/noches", base), {
      headers: actor ? { "x-usuario-prueba": actor } : {},
    });
    assert.equal((await lista(null)).status, 401);
    assert.equal((await lista(admin)).status, 403);
    const noches = await lista(escribano);
    assert.equal(noches.status, 200);
    assert.equal(noches.headers.get("cache-control"), "no-store");
    assert.deepEqual((await noches.json()).items[0],
      { id: nocheUno, nombre: "Primera noche", estado: "DRAFT", edicion: { id: edicion, nombre: "Carnaval 2027" } });
    assert.equal((await estado(admin)).status, 403);
    assert.equal((await estado(juradoUno)).status, 403);
    assert.equal((await estado(admin, "POST")).status, 403);
    const sinConfirmar = await fetch(new URL(`/api/escribano/ediciones/${edicion}/noches/${nocheUno}/cierre`, base), {
      method: "POST", headers: { "x-usuario-prueba": escribano },
    });
    assert.equal(sinConfirmar.status, 400);
    assert.deepEqual(await sinConfirmar.json(), { error: "confirmacion_cierre_requerida" });
    await verificar("noche_no_abierta");
    await abrirParaRecepcion(pool);
    await verificar("planillas_pendientes");
    const pendiente = await estado(escribano, "POST");
    assert.equal(pendiente.status, 409);
    assert.equal((await pendiente.json()).error, "planillas_pendientes");
    await assert.rejects(reemplazarAsignacion(pool, { id: asignacionAjena, juradoId: suplentesDePrueba[1], actorId: admin }),
      { codigo: "reemplazo_requiere_suplencia" });
    const relevo = await activar(asignacionActiva, suplentesDePrueba[0]);
    assert.equal(relevo.status, 200);
    const { id } = await relevo.json();
    assert.equal((await reclamar(id, suplentesDePrueba[0])).status, 200);
    await verificar("planillas_pendientes");
    assert.equal((await enviar(base, suplentesDePrueba[0], {
      ...envio, asignacionId: id, dispositivoId: dispositivoDePrueba,
    })).status, 201);
    await verificar("planillas_pendientes");
    assert.equal((await enviar(base, juradoDos, {
      ...envio, asignacionId: asignacionAjena, operationId: dispositivoDePrueba,
    })).status, 201);
    await verificar(null, true);
    const rutaCierre = new URL(`/api/escribano/ediciones/${edicion}/noches/${nocheUno}/cierre`, base);
    for (const [body, tipo] of [
      ["{}", "application/json"], ['{"confirmar":false}', "application/json"],
      ['{"confirmar":"true"}', "application/json"], ['{"confirmar":1}', "application/json"],
      ['[{"confirmar":true}]', "application/json"], ['{"confirmar":true}', "text/plain"],
    ]) {
      const invalida = await fetch(rutaCierre, {
        method: "POST", headers: { "x-usuario-prueba": escribano, "content-type": tipo }, body,
      });
      assert.equal(invalida.status, 400);
      assert.deepEqual(await invalida.json(), { error: "confirmacion_cierre_requerida" });
    }
    const malformada = await fetch(rutaCierre, {
      method: "POST", headers: { "x-usuario-prueba": escribano, "content-type": "application/json" },
      body: '{"confirmar":true',
    });
    assert.equal(malformada.status, 400);
    assert.equal((await malformada.json()).error, "campos_invalidos");
    assert.equal((await pool.query("SELECT estado FROM noche WHERE id = $1", [nocheUno])).rows[0].estado, "OPEN");
    assert.equal((await pool.query("SELECT 1 FROM auditoria WHERE operacion = 'noche_cerrada'")).rowCount, 0);
    await pool.query(`CREATE FUNCTION simular_fallo_auditoria_cierre() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'FALLO_AUDITORIA_DE_PRUEBA'; END; $$;
      CREATE TRIGGER simular_fallo_auditoria_cierre_trg BEFORE INSERT ON auditoria
      FOR EACH ROW WHEN (NEW.operacion = 'noche_cerrada') EXECUTE FUNCTION simular_fallo_auditoria_cierre()`);
    assert.equal((await estado(escribano, "POST")).status, 500);
    assert.deepEqual((await pool.query("SELECT estado, cerrada_en, cerrada_por FROM noche WHERE id = $1", [nocheUno])).rows,
      [{ estado: "OPEN", cerrada_en: null, cerrada_por: null }]);
    assert.equal((await pool.query("SELECT 1 FROM auditoria WHERE operacion = 'noche_cerrada'")).rowCount, 0);
    await pool.query("DROP TRIGGER simular_fallo_auditoria_cierre_trg ON auditoria");
    await assert.rejects(pool.query(
      "UPDATE noche SET estado = 'CLOSED', cerrada_en = CURRENT_TIMESTAMP, cerrada_por = $2 WHERE id = $1",
      [nocheUno, admin],
    ), { code: "23514", message: "CIERRE_REQUIERE_ESCRIBANO" });
    const cierres = await Promise.all([estado(escribano, "POST"), estado(escribano, "POST")]);
    assert.deepEqual(cierres.map(({ status }) => status), [200, 200]);
    const [primero, repetido] = await Promise.all(cierres.map((respuesta) => respuesta.json()));
    assert.deepEqual(primero, repetido);
    assert.equal(primero.nocheId, nocheUno);
    assert.equal(primero.estado, "CLOSED");
    assert.ok(Number.isFinite(Date.parse(primero.cerradaEn)));
    assert.deepEqual((await pool.query("SELECT estado, cerrada_por FROM noche WHERE id = $1", [nocheUno])).rows,
      [{ estado: "CLOSED", cerrada_por: escribano }]);
    assert.deepEqual((await pool.query("SELECT actor_id FROM auditoria WHERE operacion = 'noche_cerrada'")).rows,
      [{ actor_id: escribano }]);
    await verificar("noche_cerrada");

    const pruebasHistoricas = async () => {
      const { rows } = await pool.query(`SELECT
        (SELECT jsonb_agg(p ORDER BY p.id) FROM planilla_recibida p) AS planillas,
        (SELECT jsonb_agg(p ORDER BY p.planilla_id, p.fila_id) FROM puntaje_recibido p) AS puntajes,
        (SELECT jsonb_agg(n ORDER BY n.id) FROM noche n) AS noches,
        (SELECT jsonb_agg(a ORDER BY a.id) FROM auditoria a WHERE operacion <> 'edicion_retirada') AS auditoria`);
      return rows[0];
    };
    const antes = await pruebasHistoricas();
    assert.ok(antes.planillas?.length && antes.puntajes?.length);
    const retiro = await fetch(new URL(`/api/admin/ediciones/${edicion}/retiro`, base), {
      method: "POST", headers: { "x-usuario-prueba": admin, "content-type": "application/json" },
      body: JSON.stringify({ confirmar: true }),
    });
    assert.equal(retiro.status, 200);
    assert.deepEqual(await (await estado(escribano)).json(), {
      nocheId: nocheUno, puedeCerrar: false, motivo: "noche_cerrada", cerradaEn: primero.cerradaEn,
    });
    assert.equal((await estado(admin)).status, 403);
    const intento = await estado(escribano, "POST");
    assert.equal(intento.status, 409);
    assert.equal((await intento.json()).error, "edicion_retirada");
    assert.deepEqual(await (await pedir(base, "/contextos", juradoUno)).json(), { items: [] });
    const envioHistorico = { ...envio, asignacionId: asignacionAjena, operationId: dispositivoDePrueba };
    const repeticionHistorica = await enviar(base, juradoDos, envioHistorico);
    assert.equal(repeticionHistorica.status, 200);
    assert.equal((await repeticionHistorica.json()).estado, "RECIBIDA");
    const nuevo = await enviar(base, juradoDos, { ...envioHistorico, operationId: envio.operationId });
    assert.equal(nuevo.status, 409);
    assert.equal((await nuevo.json()).error, "edicion_retirada");
    assert.deepEqual(await pruebasHistoricas(), antes);
  });
});

async function verificationHash(pool, exclude = []) {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256");
  const { rows } = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename",
  );
  for (const { tablename } of rows) {
    if (exclude.includes(tablename)) continue;
    const table = `"${tablename.replaceAll('"', '""')}"`;
    const data = await pool.query(`SELECT row_to_json(t)::text AS value FROM ${table} t ORDER BY row_to_json(t)::text`);
    hash.update(JSON.stringify([tablename, data.rows]));
  }
  return hash.digest("hex");
}

function verificationApi(base, path, actor, body = { confirmar: true }, method = "POST") {
  return fetch(new URL(path, base), {
    method,
    headers: { ...(actor ? { "x-usuario-prueba": actor } : {}), "content-type": "application/json" },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
}

const verificationRetirement = `/api/admin/ediciones/${edicion}/retiro`;
const verificationClosure = (edition = edicion, night = nocheUno) =>
  `/api/escribano/ediciones/${edition}/noches/${night}/cierre`;
const verificationRetired = { error: "edicion_retirada", mensaje: "La edición retirada es de solo lectura." };

async function verificationRejected(pool, operation, status, body) {
  const before = await verificationHash(pool);
  const result = await operation();
  assert.equal(result.status, status);
  assert.deepEqual(await result.json(), body);
  assert.equal(await verificationHash(pool), before);
}

for (const [state, published] of [["CONFIGURING", false], ["CONFIGURING", true], ["OPEN", true]]) {
  test(`independent retirement eligibility ${state}/${published}`, { skip }, async () => {
    await withIsolatedSchema(databaseUrl, async (pool) => {
      await preparar(pool);
      if (published) await pool.query(
        "UPDATE version_reglamento SET estado='PUBLICADA', publicada_por=$1, publicada_en=now() WHERE id=$2",
        [admin, version],
      );
      if (state === "OPEN") await pool.query(
        "UPDATE edicion SET estado='OPEN', abierta_por=$1, abierta_en=now() WHERE id=$2", [admin, edicion],
      );
      await conServidor(pool, async (base) => {
        const before = await verificationHash(pool, ["edicion", "auditoria"]);
        const retirement = await verificationApi(base, verificationRetirement, admin);
        assert.equal(retirement.status, 200);
        const acknowledgement = await retirement.json();
        assert.equal(acknowledgement.edicionId, edicion);
        assert.ok(Number.isFinite(Date.parse(acknowledgement.retiradaEn)));
        const repeat = await verificationApi(base, verificationRetirement, admin);
        assert.equal(repeat.status, 200);
        assert.deepEqual(await repeat.json(), acknowledgement);
        assert.equal(await verificationHash(pool, ["edicion", "auditoria"]), before);
        assert.deepEqual((await pool.query("SELECT actor_id FROM auditoria WHERE operacion='edicion_retirada'")).rows,
          [{ actor_id: admin }]);
        assert.deepEqual((await (await verificationApi(base, "/api/admin/ediciones", admin, undefined, "GET")).json()).items, []);
        const retired = await verificationApi(base, "/api/admin/ediciones/retiradas", admin, undefined, "GET");
        assert.equal(retired.status, 200);
        assert.equal((await retired.json()).items[0].id, edicion);
        const hash = await verificationHash(pool);
        await assert.rejects(pool.query(
          "UPDATE edicion SET retirada_en=NULL, retirada_por=NULL WHERE id=$1", [edicion],
        ), { code: "23514", message: "EDICION_RETIRADA" });
        assert.equal(await verificationHash(pool), hash);
      });
    });
  });
}

test("independent closure and retirement rejection compatibility", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(pool, async (base) => {
      const reject = (path, actor, body, status, expected) => verificationRejected(pool,
        () => verificationApi(base, path, actor, body), status, expected);
      for (const [path, actor, other, error] of [
        [verificationClosure(), escribano, admin, "confirmacion_cierre_requerida"],
        [verificationRetirement, admin, escribano, "confirmacion_retiro_requerida"],
      ]) {
        await reject(path, null, {}, 401, { error: "no_autenticado" });
        await reject(path, other, { confirmar: true }, 403, { error: "sin_permiso" });
        for (const body of [{}, { confirmar: false }, { confirmar: "true" }, { confirmar: 1 }, []]) {
          await reject(path, actor, body, 400, { error });
        }
      }
      const missing = "ffffffff-ffff-4fff-8fff-ffffffffffff";
      const nonexistent = { error: "noche_inexistente", mensaje: "La noche competitiva no existe en la edición." };
      for (const path of [verificationClosure(edicion, missing), verificationClosure(missing), verificationClosure(missing, missing)]) {
        await reject(path, escribano, { confirmar: true }, 404, nonexistent);
      }
      assert.equal((await verificationApi(base, verificationRetirement, admin)).status, 200);
      for (const path of [verificationClosure(), verificationClosure(edicion, missing)]) {
        await reject(path, escribano, { confirmar: true }, 409, verificationRetired);
      }
      await reject(verificationClosure(edicion, "invalid"), escribano, { confirmar: true }, 404,
        { error: "noche_inexistente", mensaje: "El recurso no existe." });
      await reject(verificationClosure(), escribano, {}, 400, { error: "confirmacion_cierre_requerida" });
    });
  });
});

for (const closedInitially of [false, true]) for (const retirementFirst of [false, true]) {
  test(`independent retirement/closure closed=${closedInitially} retirementFirst=${retirementFirst}`, { skip }, async () => {
    await withIsolatedSchema(databaseUrl, async (pool) => {
      await preparar(pool);
      await abrirParaRecepcion(pool);
      await conServidor(pool, async (base) => {
        assert.equal((await enviar(base, juradoUno, envio)).status, 201);
        assert.equal((await enviar(base, juradoDos, {
          ...envio, asignacionId: asignacionAjena, operationId: dispositivoDePrueba,
        })).status, 201);
        const close = () => verificationApi(base, verificationClosure(), escribano);
        const retire = () => verificationApi(base, verificationRetirement, admin);
        if (closedInitially) assert.equal((await close()).status, 200);
        if (!closedInitially) await verificationRejected(pool, retire, 409,
          { error: "edicion_en_votacion", mensaje: "Hay una jornada competitiva en votación." });
        const history = await verificationHash(pool, ["edicion", "noche", "auditoria"]);
        const oldAudit = (await pool.query("SELECT * FROM auditoria ORDER BY id")).rows;
        const gate = await pool.connect();
        const pending = [];
        async function waitFor(count) {
          for (let attempt = 0; attempt < 300; attempt++) {
            const { rows } = await pool.query(`WITH RECURSIVE blocked(pid) AS (
              SELECT $1::int UNION
              SELECT a.pid FROM pg_stat_activity a JOIN blocked b ON b.pid=ANY(pg_blocking_pids(a.pid))
            ) SELECT pid FROM blocked WHERE pid<>$1`, [gate.processID]);
            if (rows.length >= count) return;
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          assert.fail(`Expected ${count} blocked transactions`);
        }
        let results;
        try {
          await gate.query("BEGIN");
          await gate.query("SELECT id FROM edicion WHERE id=$1 FOR UPDATE", [edicion]);
          pending.push((retirementFirst ? retire : close)());
          await waitFor(1);
          pending.push((retirementFirst ? close : retire)());
          await waitFor(2);
        } finally {
          await gate.query("ROLLBACK");
          gate.release();
          results = await Promise.all(pending);
        }
        const [retirement, closure] = retirementFirst ? results : results.toReversed();
        assert.equal(closure.status, retirementFirst && closedInitially ? 409 : 200);
        if (closure.status === 409) assert.deepEqual(await closure.json(), verificationRetired);
        assert.equal(retirement.status, retirementFirst && !closedInitially ? 409 : 200);
        if (retirement.status === 409) {
          assert.deepEqual(await retirement.json(), { error: "edicion_en_votacion", mensaje: "Hay una jornada competitiva en votación." });
          assert.equal((await retire()).status, 200);
        }
        assert.equal(await verificationHash(pool, ["edicion", "noche", "auditoria"]), history);
        const audit = (await pool.query("SELECT * FROM auditoria ORDER BY id")).rows;
        assert.deepEqual(audit.filter((a) => oldAudit.some((b) => b.id === a.id)), oldAudit);
        for (const operation of ["noche_cerrada", "edicion_retirada"]) {
          assert.equal(audit.filter((a) => a.operacion === operation).length, 1);
        }
        const state = (await pool.query("SELECT estado, cerrada_en FROM noche WHERE id=$1", [nocheUno])).rows[0];
        assert.equal(state.estado, "CLOSED");
        const read = await verificationApi(base, verificationClosure(), escribano, undefined, "GET");
        assert.equal(read.status, 200);
        assert.deepEqual(await read.json(), {
          nocheId: nocheUno, puedeCerrar: false, motivo: "noche_cerrada", cerradaEn: state.cerrada_en.toISOString(),
        });
        await verificationRejected(pool, close, 409, verificationRetired);
        const readDenied = await verificationApi(base, verificationClosure(), admin, undefined, "GET");
        assert.equal(readDenied.status, 403);
        assert.deepEqual(await readDenied.json(), { error: "sin_permiso" });
        const receipt = await enviar(base, juradoUno, envio);
        assert.equal(receipt.status, 200);
        assert.equal((await receipt.json()).estado, "RECIBIDA");
        assert.equal(await verificationHash(pool, ["edicion", "noche", "auditoria"]), history);
      });
    });
  });
}

test("independent pre-retirement closure compatibility", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(pool, async (base) => {
      const missing = "ffffffff-ffff-4fff-8fff-ffffffffffff";
      for (const [path, actor, body, status, expected] of [
        [verificationClosure(), null, {}, 401, { error: "no_autenticado" }],
        [verificationClosure(), admin, { confirmar: true }, 403, { error: "sin_permiso" }],
        [verificationClosure(), escribano, { confirmar: "true" }, 400, { error: "confirmacion_cierre_requerida" }],
        [verificationClosure(), escribano, { confirmar: true }, 409, { error: "noche_no_abierta" }],
        ...[verificationClosure(edicion, missing), verificationClosure(missing), verificationClosure(missing, missing)].map((path) =>
          [path, escribano, { confirmar: true }, 404, { error: "noche_inexistente", mensaje: "La noche competitiva no existe en la edición." }]),
        [verificationClosure(edicion, "invalid"), escribano, { confirmar: true }, 404,
          { error: "noche_inexistente", mensaje: "El recurso no existe." }],
      ]) await verificationRejected(pool, () => verificationApi(base, path, actor, body), status, expected);
    });
  });
});

for (const openingFirst of [true, false]) {
  test(`night closure serializes with an opening retry: ${openingFirst ? "opening" : "closure"} first`, { skip }, async () => {
    await withIsolatedSchema(databaseUrl, async (pool) => {
      await preparar(pool);
      await abrirParaRecepcion(pool);
      await conServidor(pool, async (base) => {
        assert.equal((await enviar(base, juradoUno, envio)).status, 201);
        assert.equal((await enviar(base, juradoDos, {
          ...envio, asignacionId: asignacionAjena, operationId: dispositivoDePrueba,
        })).status, 201);
        const evidence = async () => (await pool.query(`SELECT
          (SELECT jsonb_agg(p ORDER BY p.id) FROM planilla_recibida p) AS receipts,
          (SELECT jsonb_agg(p ORDER BY p.planilla_id, p.fila_id) FROM puntaje_recibido p) AS scores,
          (SELECT jsonb_agg(o ORDER BY o.id) FROM operacion_apertura o) AS openings,
          (SELECT jsonb_agg(a ORDER BY a.id) FROM auditoria a WHERE operacion <> 'noche_cerrada') AS audit`
        )).rows[0];
        const before = await evidence();
        const { rows: [opened] } = await pool.query("SELECT abierta_en FROM noche WHERE id = $1", [nocheUno]);
        const closure = () => fetch(new URL(`/api/escribano/ediciones/${edicion}/noches/${nocheUno}/cierre`, base), {
          method: "POST", headers: { "x-usuario-prueba": escribano, "content-type": "application/json" },
          body: JSON.stringify({ confirmar: true }),
        });
        const opening = () => abrirNoche(pool, {
          edicionId: edicion, nocheId: nocheUno, actorId: admin, claveOperacion: operacion,
        });
        const gate = await pool.connect();
        const pending = [];
        async function observeWaiters(minimum) {
          const deadline = Date.now() + 3000;
          let waiters = [];
          do {
            const { rows } = await pool.query(`WITH RECURSIVE blocked(pid) AS (
              SELECT $1::int UNION
              SELECT a.pid FROM pg_stat_activity a JOIN blocked b ON b.pid = ANY(pg_blocking_pids(a.pid))
            ) SELECT pid, pg_blocking_pids(pid) AS blockers FROM blocked WHERE pid <> $1`, [gate.processID]);
            waiters = rows;
            if (rows.length >= minimum) return;
            await new Promise((resolve) => setTimeout(resolve, 10));
          } while (Date.now() < deadline);
          assert.fail(`Expected ${minimum} night-lock waiters: ${JSON.stringify(waiters)}`);
        }
        // Observe lock waiters, rather than assuming request order from elapsed time.
        const queue = (operation) => {
          const promise = operation();
          promise.catch(() => {}); // Retain rejection until both transactions have been released.
          pending.push(promise);
        };
        let results;
        try {
          await gate.query("BEGIN");
          await gate.query("SELECT id FROM noche WHERE id = $1 FOR UPDATE", [nocheUno]);
          queue(openingFirst ? opening : closure);
          await observeWaiters(1);
          queue(openingFirst ? closure : opening);
          await observeWaiters(2);
        } finally {
          await gate.query("ROLLBACK");
          gate.release();
          results = await Promise.allSettled(pending);
        }
        for (const result of results) {
          assert.equal(result.status, "fulfilled", `${result.reason?.code}: ${result.reason?.message}`);
        }
        const retry = results[openingFirst ? 0 : 1].value;
        const closed = results[openingFirst ? 1 : 0].value;
        assert.equal(closed.status, 200);
        const acknowledgement = await closed.json();
        assert.deepEqual(retry, {
          nocheId: nocheUno, estado: "OPEN", abiertaEn: opened.abierta_en.toISOString(),
          claveOperacion: operacion, repetida: true,
        });
        assert.deepEqual((await pool.query(
          "SELECT estado, cerrada_en, cerrada_por FROM noche WHERE id = $1", [nocheUno],
        )).rows, [{ estado: "CLOSED", cerrada_en: new Date(acknowledgement.cerradaEn), cerrada_por: escribano }]);
        assert.deepEqual(acknowledgement, {
          nocheId: nocheUno, estado: "CLOSED", cerradaEn: acknowledgement.cerradaEn,
        });
        assert.deepEqual((await pool.query("SELECT actor_id FROM auditoria WHERE operacion = 'noche_cerrada'")).rows,
          [{ actor_id: escribano }]);
        assert.deepEqual(await evidence(), before);
      });
    });
  });
}

for (const receiptFirst of [true, false]) {
  test(`night closure serializes with the last receipt: ${receiptFirst ? "receipt" : "closure"} first`, { skip }, async () => {
    await withIsolatedSchema(databaseUrl, async (pool) => {
      await preparar(pool);
      await abrirParaRecepcion(pool);
      await conServidor(pool, async (base) => {
        assert.equal((await enviar(base, juradoUno, envio)).status, 201);
        const cierre = () => fetch(new URL(`/api/escribano/ediciones/${edicion}/noches/${nocheUno}/cierre`, base), {
          method: "POST", headers: { "x-usuario-prueba": escribano, "content-type": "application/json" },
          body: JSON.stringify({ confirmar: true }),
        });
        const entrega = () => enviar(base, juradoDos, {
          ...envio, asignacionId: asignacionAjena, operationId: dispositivoDePrueba,
        });
        const gate = await pool.connect();
        const pending = [];
        async function esperarBloqueados(minimo) {
          const limite = Date.now() + 3000;
          do {
            const { rows: [{ count }] } = await pool.query(`WITH RECURSIVE bloqueados(pid) AS (
              SELECT $1::int UNION
              SELECT a.pid FROM pg_stat_activity a JOIN bloqueados b ON b.pid = ANY(pg_blocking_pids(a.pid))
            ) SELECT count(*)::int FROM bloqueados WHERE pid <> $1`, [gate.processID]);
            if (count >= minimo) return;
            await new Promise((resolve) => setTimeout(resolve, 10));
          } while (Date.now() < limite);
          assert.fail(`Expected ${minimo} night-lock waiters`);
        }
        try {
          await gate.query("BEGIN");
          await gate.query("SELECT id FROM noche WHERE id = $1 FOR UPDATE", [nocheUno]);
          pending.push((receiptFirst ? entrega : cierre)());
          await esperarBloqueados(1);
          pending.push((receiptFirst ? cierre : entrega)());
          await esperarBloqueados(2);
        } finally {
          await gate.query("ROLLBACK");
          gate.release();
          await Promise.allSettled(pending);
        }
        const [primera, segunda] = await Promise.all(pending);
        assert.equal((receiptFirst ? primera : segunda).status, 201);
        assert.equal((receiptFirst ? segunda : primera).status, receiptFirst ? 200 : 409);
        if (!receiptFirst) {
          assert.equal((await primera.json()).error, "planillas_pendientes");
          assert.equal((await cierre()).status, 200);
        }
        assert.deepEqual((await pool.query("SELECT estado FROM noche WHERE id = $1", [nocheUno])).rows,
          [{ estado: "CLOSED" }]);
        assert.equal((await pool.query("SELECT 1 FROM auditoria WHERE operacion = 'noche_cerrada'")).rowCount, 1);
      });
    });
  });
}

test("night closure readiness blocks missing and empty snapshots without exposing counts", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query("UPDATE noche SET estado = 'OPEN', abierta_en = CURRENT_TIMESTAMP WHERE id = $1", [nocheDos]);
    await conServidor(pool, async (base) => {
      const consultar = (id = nocheDos) => fetch(new URL(`/api/escribano/ediciones/${edicion}/noches/${id}/cierre`, base), {
        headers: { "x-usuario-prueba": escribano },
      });
      const ausente = await consultar();
      assert.equal(ausente.status, 200);
      assert.deepEqual(await ausente.json(), { nocheId: nocheDos, puedeCerrar: false, motivo: "instantanea_no_disponible" });
      await pool.query(`INSERT INTO instantanea_planillas_esperadas
        (edicion_id, noche_id, version_id, congelada_en, filas_configuradas)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, true)`, [edicion, nocheDos, version]);
      const vacia = await consultar();
      assert.equal(vacia.status, 200);
      assert.equal(vacia.headers.get("cache-control"), "no-store");
      assert.deepEqual(await vacia.json(), { nocheId: nocheDos, puedeCerrar: false, motivo: "sin_planillas_esperadas" });
      assert.equal((await consultar("invalida")).status, 404);
      const idAjena = "10000000-0000-4000-8000-000000000099";
      const ajena = await fetch(new URL(`/api/escribano/ediciones/${idAjena}/noches/${nocheDos}/cierre`, base), {
        headers: { "x-usuario-prueba": escribano },
      });
      assert.equal(ajena.status, 404);
      await pool.query("DELETE FROM usuario_rol WHERE usuario_id = $1", [escribano]);
      const sinRol = await consultar();
      assert.equal(sinRol.status, 403);
      assert.deepEqual(await sinRol.json(), { error: "sin_permiso" });
    });
  });
});

test("activation waits for a matching acknowledgement after a dropped freeze response", { skip }, async () => {
  await conSuplencia(async ({ pool, post, reclamar, activar }) => {
    const { randomUUID } = await import("node:crypto");
    await abrirParaRecepcion(pool);
    assert.equal((await reclamar(asignacionActiva, juradoUno)).status, 200);
    const route = `/api/jurado/planillas/${asignacionActiva}`;
    const freeze = () => post(`${route}/borrador-traspaso`, juradoUno, {
      operationId: operacion, versionId: version, dispositivoId: dispositivoDePrueba, puntajes: [puntajes[0]],
    });
    const activate = () => activar(asignacionActiva, suplentesDePrueba[0]);
    const confirm = (confirmacionId, dispositivoId = dispositivoDePrueba) => post(`${route}/confirmar-traspaso`, juradoUno, {
      operationId: operacion, dispositivoId, confirmacionId,
    });
    const state = async () => (await pool.query(`SELECT confirmacion_id, confirmado_en,
      (SELECT asignacion_activa_id FROM suplentes_asignacion_jurado WHERE asignacion_id = $1) AS activa,
      (SELECT count(*) FROM auditoria WHERE operacion = 'acuse_traspaso_confirmado') AS acuses
      FROM borrador_traspaso_jurado WHERE asignacion_id = $1`, [asignacionActiva])).rows[0];
    const dropped = await freeze();
    assert.equal(dropped.status, 201);
    await dropped.body.cancel();
    const frozen = await state();
    assert.equal(frozen.confirmado_en, null);
    assert.equal(frozen.activa, asignacionActiva);
    assert.equal((await activate()).status, 409);
    assert.deepEqual(await state(), frozen);
    const replay = await freeze();
    assert.equal(replay.status, 200);
    assert.deepEqual(await replay.json(), {
      estado: "BORRADOR_CONGELADO", asignacionId: asignacionActiva, operationId: operacion, confirmacionId: frozen.confirmacion_id,
    });
    const bad = await confirm(randomUUID());
    assert.equal(bad.status, 409);
    assert.deepEqual(await bad.json(), { error: "acuse_traspaso_invalido", mensaje: "El acuse no corresponde al borrador congelado." });
    const wrongDevice = await confirm(frozen.confirmacion_id, randomUUID());
    assert.equal(wrongDevice.status, 409);
    assert.equal((await wrongDevice.json()).error, "dispositivo_no_autorizado");
    assert.equal((await activate()).status, 409);
    assert.deepEqual(await state(), frozen);
    for (let i = 0; i < 2; i++) {
      const accepted = await confirm(frozen.confirmacion_id);
      assert.equal(accepted.status, 200);
      assert.deepEqual(await accepted.json(), { estado: "TRASPASO_CONFIRMADO", asignacionId: asignacionActiva, operationId: operacion });
    }
    assert.equal((await state()).acuses, "1");
    assert.equal((await activate()).status, 200);
  });
});

test("a successor completes only missing rows without receiving inherited score values", { skip }, async () => {
  await conSuplencia(async ({ pool, base, post, reclamar, activar, congeladas }) => {
    await abrirParaRecepcion(pool);
    const instantanea = await congeladas();
    assert.equal((await reclamar(asignacionActiva, juradoUno)).status, 200);
    const congelado = await post(`/api/jurado/planillas/${asignacionActiva}/borrador-traspaso`, juradoUno, {
      operationId: operacion, versionId: version, dispositivoId: dispositivoDePrueba, puntajes: [puntajes[0]],
    });
    assert.equal(congelado.status, 201);
    assert.equal((await activar(asignacionActiva, suplentesDePrueba[0])).status, 409);
    const acuse = await congelado.json();
    const confirmarAcuse = (confirmacionId) =>
      post(`/api/jurado/planillas/${asignacionActiva}/confirmar-traspaso`, juradoUno, {
        operationId: operacion, dispositivoId: dispositivoDePrueba, confirmacionId,
      });
    assert.equal((await confirmarAcuse(operacion)).status, 409);
    assert.equal((await confirmarAcuse(acuse.confirmacionId)).status, 200);
    assert.equal((await confirmarAcuse(acuse.confirmacionId)).status, 200);
    const relevo = await activar(asignacionActiva, suplentesDePrueba[0]);
    assert.equal(relevo.status, 200);
    const { id } = await relevo.json();
    assert.equal((await pedir(base, `/planillas/${id}`, juradoUno)).status, 404);
    const apertura = await reclamar(id, suplentesDePrueba[0]);
    assert.equal(apertura.status, 200);
    const planilla = await apertura.json();
    assert.deepEqual(planilla.filasHeredadas, [primeraFila]);
    assert.doesNotMatch(JSON.stringify(planilla), /"(?:puntajes|valor|noPresentado|autorId)"/);
    const baseEnvio = { ...envio, asignacionId: id, dispositivoId: dispositivoDePrueba };
    assert.equal((await enviar(base, suplentesDePrueba[0], baseEnvio)).status, 422);
    const complemento = { ...baseEnvio, puntajes: [puntajes[1]] };
    assert.equal((await enviar(base, suplentesDePrueba[0], complemento)).status, 201);
    assert.equal((await enviar(base, suplentesDePrueba[0], complemento)).status, 200);
    assert.deepEqual(await congeladas(), instantanea);
    const { rows } = await pool.query("SELECT fila_id, valor, autor_id FROM puntaje_recibido ORDER BY fila_id");
    assert.deepEqual(rows, [
      { fila_id: primeraFila, valor: 5, autor_id: juradoUno },
      { fila_id: ultimaFila, valor: 0, autor_id: suplentesDePrueba[0] },
    ]);
  });
});

test("two confirmed handoffs preserve both authors and one official receipt", { skip }, async () => {
  await conSuplencia(async ({ pool, base, post, reclamar, activar, congeladas }) => {
    await abrirParaRecepcion(pool);
    const instantanea = await congeladas();
    const relevar = async (anterior, saliente, entrante, nota) => {
      const ruta = `/api/jurado/planillas/${anterior}`;
      const cuerpo = { operationId: operacion, dispositivoId: dispositivoDePrueba };
      const freeze = await post(`${ruta}/borrador-traspaso`, saliente, {
        ...cuerpo, versionId: version, puntajes: [nota],
      });
      assert.equal(freeze.status, 201);
      const { confirmacionId } = await freeze.json();
      assert.equal((await post(`${ruta}/confirmar-traspaso`, saliente, { ...cuerpo, confirmacionId })).status, 200);
      const relevo = await activar(anterior, entrante);
      assert.equal(relevo.status, 200);
      return (await relevo.json()).id;
    };
    const [primero, segundo] = suplentesDePrueba;
    assert.equal((await reclamar(asignacionActiva, juradoUno)).status, 200);
    const medio = await relevar(asignacionActiva, juradoUno, primero, puntajes[0]);
    const previa = await reclamar(medio, primero);
    assert.equal(previa.status, 200);
    assert.deepEqual((await previa.json()).filasHeredadas, [primeraFila]);
    const final = await relevar(medio, primero, segundo, puntajes[1]);
    assert.equal((await pedir(base, `/planillas/${medio}`, primero)).status, 404);
    const apertura = await reclamar(final, segundo);
    assert.equal(apertura.status, 200);
    const planilla = await apertura.json();
    assert.deepEqual(planilla.filasHeredadas, [primeraFila, ultimaFila]);
    assert.doesNotMatch(JSON.stringify(planilla), /"(?:puntajes|valor|noPresentado|autorId|dispositivoId)"/);
    const cuerpo = { ...envio, asignacionId: final, dispositivoId: dispositivoDePrueba, puntajes: [] };
    const respuestas = await Promise.all([enviar(base, segundo, cuerpo), enviar(base, segundo, cuerpo)]);
    assert.deepEqual(respuestas.map(({ status }) => status).sort(), [200, 201]);
    const [acuse, repetido] = await Promise.all(respuestas.map((respuesta) => respuesta.json()));
    assert.deepEqual(acuse, repetido);
    assert.doesNotMatch(JSON.stringify(acuse), /"(?:puntajes|valor|noPresentado|autorId|dispositivoId)"/);
    assert.deepEqual((await pool.query("SELECT fila_id, valor, autor_id FROM puntaje_recibido ORDER BY fila_id")).rows, [
      { fila_id: primeraFila, valor: 5, autor_id: juradoUno },
      { fila_id: ultimaFila, valor: 0, autor_id: primero },
    ]);
    assert.equal((await pool.query("SELECT 1 FROM planilla_recibida")).rowCount, 1);
    assert.deepEqual(await congeladas(), instantanea);
    assert.equal((await pool.query("SELECT estado FROM noche WHERE id = $1", [nocheUno])).rows[0].estado, "OPEN");
  });
});

for (const freezeFirst of [true, false]) {
  test(`ordered handoff race: ${freezeFirst ? "freeze" : "receipt"} queues first`, { skip }, async () => {
    await conSuplencia(async ({ pool, base, reclamar, post }) => {
      await abrirParaRecepcion(pool);
      assert.equal((await reclamar(asignacionActiva, juradoUno)).status, 200);
      const body = { ...envio, dispositivoId: dispositivoDePrueba };
      const freeze = () => post(`/api/jurado/planillas/${asignacionActiva}/borrador-traspaso`,
        juradoUno, { ...body, puntajes: [puntajes[0]] });
      const receipt = () => enviar(base, juradoUno, body);
      const gate = await pool.connect();
      const pending = [];
      async function observeWaiters(minimum) {
        const deadline = Date.now() + 2000;
        do {
          const { rows: [{ count }] } = await pool.query(`WITH RECURSIVE blocked(pid) AS (
            SELECT $1::int UNION
            SELECT a.pid FROM pg_stat_activity a JOIN blocked b ON b.pid = ANY(pg_blocking_pids(a.pid))
          ) SELECT count(*)::int FROM blocked WHERE pid <> $1`, [gate.processID]);
          if (count >= minimum) return;
          await new Promise((resolve) => setTimeout(resolve, 10));
        } while (Date.now() < deadline);
        assert.fail(`expected ${minimum} queued assignment writer(s)`);
      }
      try {
        await gate.query("BEGIN");
        await gate.query("SELECT id FROM asignacion_jurado WHERE id = $1 FOR UPDATE", [asignacionActiva]);
        pending.push((freezeFirst ? freeze : receipt)());
        await observeWaiters(1);
        pending.push((freezeFirst ? receipt : freeze)());
        await observeWaiters(2);
      } finally {
        await gate.query("ROLLBACK");
        gate.release();
        await Promise.allSettled(pending);
      }
      const [winner, loser] = await Promise.all(pending);
      assert.equal(winner.status, 201);
      assert.equal(loser.status, 409);
      assert.equal((await loser.json()).error, freezeFirst ? "borrador_traspaso_congelado" : "planilla_ya_recibida");
      assert.equal((await pool.query("SELECT 1 FROM borrador_traspaso_jurado")).rowCount, +freezeFirst);
      assert.equal((await pool.query("SELECT 1 FROM planilla_recibida")).rowCount, +!freezeFirst);
      assert.equal((await pool.query("SELECT 1 FROM puntaje_recibido")).rowCount, freezeFirst ? 0 : puntajes.length);
    });
  });
}

test("an officially received ballot cannot be frozen for handoff", { skip }, async () => {
  await conSuplencia(async ({ pool, base, post, reclamar }) => {
    await abrirParaRecepcion(pool);
    assert.equal((await reclamar(asignacionActiva, juradoUno)).status, 200);
    const cuerpo = { ...envio, dispositivoId: dispositivoDePrueba };
    assert.equal((await enviar(base, juradoUno, cuerpo)).status, 201);
    const respuesta = await post(
      `/api/jurado/planillas/${asignacionActiva}/borrador-traspaso`, juradoUno, cuerpo,
    );
    assert.equal(respuesta.status, 409);
    assert.equal((await respuesta.json()).error, "planilla_ya_recibida");
    assert.equal((await pool.query("SELECT 1 FROM borrador_traspaso_jurado")).rowCount, 0);
    await assert.rejects(pool.query(
      `INSERT INTO borrador_traspaso_jurado (asignacion_id, operation_id, version_id, autor_id, puntajes)
       VALUES ($1, $2, $3, $4, '[]')`, [asignacionActiva, operacion, version, juradoUno],
    ), { code: "23514", message: "PLANILLA_YA_RECIBIDA" });
    assert.equal((await enviar(base, juradoUno, cuerpo)).status, 200);
  });
});

test("named activation and first device claim have exactly one winner", { skip }, async () => {
  await conSuplencia(async ({ pool, activar, reclamar, congeladas }) => {
    await abrirParaRecepcion(pool);
    const instantanea = await congeladas();
    const [relevo, apertura] = await Promise.all([
      activar(asignacionActiva, suplentesDePrueba[0]),
      reclamar(asignacionActiva, juradoUno),
    ]);
    const { rows: [registro] } = await pool.query(
      "SELECT asignacion_activa_id, dispositivo_id FROM suplentes_asignacion_jurado WHERE asignacion_id = $1",
      [asignacionActiva],
    );
    if (relevo.status === 200) {
      assert.equal(apertura.status, 404);
      assert.equal((await apertura.json()).error, "asignacion_no_encontrada");
      assert.equal(registro.asignacion_activa_id, (await relevo.json()).id);
      assert.equal(registro.dispositivo_id, null);
    } else {
      assert.equal(apertura.status, 200);
      assert.equal(JSON.stringify(await apertura.json()).includes(dispositivoDePrueba), false);
      assert.equal(relevo.status, 409);
      assert.equal((await relevo.json()).error, "planilla_abierta_para_editar");
      assert.equal(registro.asignacion_activa_id, asignacionActiva);
      assert.equal(registro.dispositivo_id, dispositivoDePrueba);
    }
    assert.deepEqual(await congeladas(), instantanea);
  });
});

test("recibir y reenviar simultáneamente devuelve el mismo acuse sin puntajes y no duplica el voto", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await abrirParaRecepcion(pool);
    await conServidor(pool, async (base) => {
      const lectura = await pedir(base, `/planillas/${asignacionActiva}`, juradoUno);
      assert.equal((await lectura.json()).versionId, version);
      const respuestas = await Promise.all([
        enviar(base, juradoUno, envio),
        enviar(base, juradoUno, { ...envio, puntajes: [...puntajes].reverse() }),
      ]);
      assert.deepEqual(respuestas.map((r) => r.status).sort(), [200, 201]);
      const [acuse, repetido] = await Promise.all(respuestas.map((r) => r.json()));
      assert.deepEqual(acuse, repetido);
      assert.deepEqual(Object.keys(acuse).sort(), ["asignacionId", "estado", "operationId", "recibidaEn"]);
      assert.equal(acuse.estado, "RECIBIDA");
      assert.equal(acuse.operationId, operacion);
      for (const [cuerpo, error] of [
        [{ ...envio, puntajes: [{ ...puntajes[0], valor: 4 }, puntajes[1]] }, "operacion_conflictiva"],
        [{ ...envio, operationId: "b0000000-0000-4000-8000-000000000002" }, "planilla_ya_recibida"],
      ]) {
        const r = await enviar(base, juradoUno, cuerpo);
        assert.equal(r.status, 409);
        assert.equal((await r.json()).error, error);
      }
      assert.deepEqual((await pool.query("SELECT fila_id, valor FROM puntaje_recibido ORDER BY fila_id")).rows,
        [{ fila_id: primeraFila, valor: 5 }, { fila_id: ultimaFila, valor: 0 }]);
      assert.deepEqual((await pool.query(
        "SELECT operacion, count(*)::int AS cantidad FROM auditoria WHERE operacion IN ('planilla_recibida', 'planilla_rechazada') GROUP BY operacion ORDER BY operacion COLLATE \"C\"",
      )).rows, [{ operacion: "planilla_rechazada", cantidad: 2 }, { operacion: "planilla_recibida", cantidad: 1 }]);
    });
    await assert.rejects(revocarAsignacion(pool, { id: asignacionActiva, actorId: admin }), { codigo: "planilla_ya_recibida" });
    await assert.rejects(reemplazarAsignacion(pool, { id: asignacionActiva, juradoId: juradoDos, actorId: admin }), { codigo: "planilla_ya_recibida" });
    for (const sql of [
      "UPDATE puntaje_recibido SET valor = valor",
      "DELETE FROM planilla_recibida",
      "TRUNCATE puntaje_recibido",
      `INSERT INTO puntaje_recibido (planilla_id, fila_id, valor, no_presentado)
        SELECT id, '${primeraFila}', 5, false FROM planilla_recibida`,
    ]) await assert.rejects(pool.query(sql), { code: "23514" });
  });
});

test("recepción rechaza contextos no autorizados o no verificables, y puntajes incompletos", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(pool, async (base) => {
      for (const [usuario, status] of [[null, 401], [escribano, 403], [juradoDos, 404], [juradoUno, 409]]) {
        assert.equal((await enviar(base, usuario, envio)).status, status);
      }
      await abrirParaRecepcion(pool);
      for (const [cuerpo, status] of [
        [{ ...envio, versionId: operacion }, 409],
        [{ ...envio, versionId: undefined }, 400],
        [{ ...envio, puntajes: [puntajes[0]] }, 422],
        [{ ...envio, puntajes: [puntajes[0], puntajes[0]] }, 422],
        [{ ...envio, puntajes: [{ ...puntajes[0], valor: 0 }, puntajes[1]] }, 422],
      ]) assert.equal((await enviar(base, juradoUno, cuerpo)).status, status);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM planilla_recibida")).rows[0].n, 0);
    });
  });
});

test("una selección congelada exclusivamente informativa se recibe sin puntajes", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await abrirParaRecepcion(pool, true);
    await conServidor(pool, async (base) => {
      const r = await enviar(base, juradoUno, { ...envio, puntajes: [] });
      assert.equal(r.status, 201, await r.clone().text());
      assert.equal((await r.json()).estado, "RECIBIDA");
    });
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM puntaje_recibido")).rows[0].n, 0);
  });
});

test("sin sesión o sin rol JURADO no se consultan los contextos", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(pool, async (base) => {
      const anonimo = await pedir(base, "/contextos");
      assert.equal(anonimo.status, 401);
      assert.deepEqual(await anonimo.json(), { error: "no_autenticado" });

      const sinRol = await pedir(base, "/contextos", escribano);
      assert.equal(sinRol.status, 403);
      assert.deepEqual(await sinRol.json(), { error: "sin_permiso" });

      const planillaAnonima = await pedir(base, `/planillas/${asignacionActiva}`);
      assert.equal(planillaAnonima.status, 401);
      const planillaSinRol = await pedir(base, `/planillas/${asignacionActiva}`, escribano);
      assert.equal(planillaSinRol.status, 403);
    });
  });
});

test("el jurado ve solo sus asignaciones activas", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(pool, async (base) => {
      const respuesta = await pedir(base, "/contextos", juradoUno);
      assert.equal(respuesta.status, 200);
      const { items } = await respuesta.json();
      assert.deepEqual(items, [{
        asignacionId: asignacionActiva,
        noche: { id: nocheUno, nombre: "Primera noche", orden: 1, estado: "DRAFT",
          edicion: { id: edicion, nombre: "Carnaval 2027", anio: 2027 } },
        especialidad: { id: especialidadJ1, nombre: "Vestuario", codigo: "J1" },
      }]);
    });
  });
});

test("el rol se consulta en cada petición", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(pool, async (base) => {
      assert.equal((await pedir(base, "/contextos", juradoUno)).status, 200);
      await pool.query("DELETE FROM usuario_rol WHERE usuario_id = $1", [juradoUno]);
      assert.equal((await pedir(base, "/contextos", juradoUno)).status, 403);
    });
  });
});

test("la planilla esperada incluye filas grises, excluye las descartadas y no expone puntajes", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(pool, async (base) => {
      const respuesta = await pedir(base, `/planillas/${asignacionActiva}`, juradoUno);
      const cuerpo = await respuesta.json();
      assert.equal(respuesta.status, 200, JSON.stringify(cuerpo));
      assert.equal(cuerpo.asignacionId, asignacionActiva);
      assert.equal(cuerpo.noche.id, nocheUno);
      assert.equal(cuerpo.especialidad.id, especialidadJ1);
      assert.deepEqual(cuerpo.filas.map((f) => ({ id: f.id, evaluable: f.evaluable })), [
        { id: "a0000000-0000-4000-8000-000000000001", evaluable: true },
        { id: "a0000000-0000-4000-8000-000000000003", evaluable: true },
      ]);
      assert.equal(cuerpo.filas[0].rubro.codigo, "R1");
      assert.equal(cuerpo.filas[0].sujeto.nombre, "Persona Uno");
      assert.deepEqual(Object.keys(cuerpo.filas[0]).sort(), [
        "evaluable", "id", "orden", "origen", "rubro", "sujeto",
      ]);
      assert.deepEqual(Object.keys(cuerpo.filas[0].rubro).sort(), [
        "codigo", "id", "nombre", "padreId", "tipo",
      ]);
      assert.doesNotMatch(JSON.stringify(cuerpo), /puntaje|nota|valor|calificacion|score/i);
    });
  });
});

test("una fila gris aparece marcada como no evaluable", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query("UPDATE rubro_version SET evaluable = false WHERE id = $1", [rubro]);
    await conServidor(pool, async (base) => {
      const respuesta = await pedir(base, `/planillas/${asignacionActiva}`, juradoUno);
      const cuerpo = await respuesta.json();
      assert.deepEqual(cuerpo.filas.map((f) => f.evaluable), [false, true]);
    });
  });
});

test("una noche de premiación no aparece como contexto", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    const nochePremiacion = "30000000-0000-4000-8000-000000000003";
    const asignacionPremiacion = "80000000-0000-4000-8000-000000000004";
    await pool.query(
      `INSERT INTO noche (id, edicion_id, orden, nombre, tipo, estado)
       VALUES ($1, $2, 3, 'Premiación', 'PREMIACION', 'DRAFT')`,
      [nochePremiacion, edicion],
    );
    await pool.query(
      `INSERT INTO asignacion_jurado
          (id, edicion_id, jurado_id, noche_id, especialidad_id, creada_por, creada_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [asignacionPremiacion, edicion, juradoUno, nochePremiacion, especialidadJ1, admin, creadaEn],
    );
    await conServidor(pool, async (base) => {
      const { items } = await (await pedir(base, "/contextos", juradoUno)).json();
      assert.deepEqual(items.map((i) => i.asignacionId), [asignacionActiva]);
      const planilla = await pedir(base, `/planillas/${asignacionPremiacion}`, juradoUno);
      assert.equal(planilla.status, 404);
    });
  });
});

test("la lectura sigue funcionando si la versión dejó de estar en borrador", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await pool.query(
      `UPDATE version_reglamento
          SET estado = 'PUBLICADA', publicada_por = $1, publicada_en = $2
        WHERE id = $3`,
      [admin, creadaEn, version],
    );
    await pool.query(
      `UPDATE version_reglamento SET estado = 'CONGELADA', congelada_en = $1 WHERE id = $2`,
      [creadaEn, version],
    );
    await conServidor(pool, async (base) => {
      const respuesta = await pedir(base, `/planillas/${asignacionActiva}`, juradoUno);
      assert.equal(respuesta.status, 200);
      assert.equal((await respuesta.json()).filas.length, 2);
    });
  });
});

test("no se puede consultar una planilla ajena, revocada ni con un id inválido", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(pool, async (base) => {
      for (const [ruta, estado, codigo] of [
        [`/planillas/${asignacionAjena}`, 404, "asignacion_no_encontrada"],
        [`/planillas/${asignacionRevocada}`, 404, "asignacion_no_encontrada"],
        ["/planillas/no-es-un-uuid", 400, "campos_invalidos"],
        ["/planillas/30000000-0000-4000-8000-000000000099", 404, "asignacion_no_encontrada"],
      ]) {
        const respuesta = await pedir(base, ruta, juradoUno);
        assert.equal(respuesta.status, estado, ruta);
        assert.equal((await respuesta.json()).error, codigo, ruta);
      }
    });
  });
});
