import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
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
      await run({ pool, base, activar, reclamar, congeladas });
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
