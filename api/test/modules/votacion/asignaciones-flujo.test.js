import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../../../src/app.js";
import { createAuth } from "../../../src/modules/auth/auth.js";
import { bootstrapFirstAdmin } from "../../../src/modules/auth/bootstrap.js";
import { iniciarSesion, puertoLibre } from "../../helpers/auth-flujo.js";
import { withIsolatedSchema } from "../../helpers/isolated-schema.js";

// Recorrido real: createApp, Better Auth con OTP capturado, cookies y PostgreSQL
// descartable. No hay endpoints para crear noches ni especialidades, así que el
// catálogo mínimo se inserta directamente, como en las pruebas de migración.
const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const secret = "un-secreto-de-prueba-de-al-menos-32-caracteres";
const datos = { name: "Admin", email: "admin@example.test", password: "contraseña-de-prueba" };
const edicion = "10000000-0000-0000-0000-000000000027";
const noche = "20000000-0000-0000-0000-000000000001";
const especialidadJ1 = "30000000-0000-0000-0000-000000000001";
const especialidadJ3 = "30000000-0000-0000-0000-000000000003";
const juradoUno = "u-jurado-1";
const juradoDos = "u-jurado-2";

async function prepararCatalogo(pool, adminId) {
  await pool.query(
    `INSERT INTO edicion (id, nombre, anio, estado, creada_por, abierta_por, abierta_en)
     VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $2, NULL, NULL)`,
    [edicion, adminId],
  );
  await pool.query(
    `INSERT INTO noche (id, edicion_id, orden, nombre, tipo, estado, abierta_en, cerrada_en)
     VALUES ($1, $2, 1, 'Primera noche', 'COMPETENCIA', 'DRAFT', NULL, NULL)`,
    [noche, edicion],
  );
  await pool.query(
    `INSERT INTO especialidad (id, edicion_id, nombre, codigo, orden, activa)
     VALUES ($1, $2, 'Vestuario', 'J1', 1, true),
            ($3, $2, 'Batería', 'J3', 3, true)`,
    [especialidadJ1, edicion, especialidadJ3],
  );
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Jurado uno', 'jurado1@example.test', true),
            ($2, 'Jurado dos', 'jurado2@example.test', true)`,
    [juradoUno, juradoDos],
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT u.id, r.id, $1, false
       FROM (VALUES ($2::text, 'JURADO'), ($3::text, 'JURADO')) AS u(id, codigo)
       JOIN rol r ON r.codigo = u.codigo`,
    [adminId, juradoUno, juradoDos],
  );
}

test("una sesión real de administrador gestiona asignaciones y deja auditoría sin secretos", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    const port = await puertoLibre();
    const baseUrl = `http://127.0.0.1:${port}`;
    const adminId = await bootstrapFirstAdmin({ pool, secret, baseUrl, ...datos });
    await prepararCatalogo(pool, adminId);
    const codigos = [];
    const auth = createAuth({ pool, secret, baseUrl, sendOTP: async ({ otp }) => codigos.push(otp) });
    const server = createApp({ pool, auth }).listen(port, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const headersConOrigen = { "content-type": "application/json", origin: baseUrl };
    try {
      const anonimo = await fetch(`${baseUrl}/api/admin/asignaciones`);
      assert.equal(anonimo.status, 401);
      assert.deepEqual(await anonimo.json(), { error: "no_autenticado" });

      const cookie = await iniciarSesion(baseUrl, headersConOrigen, codigos, datos);
      const conSesion = (metodo, ruta, cuerpo) => fetch(`${baseUrl}${ruta}`, {
        method: metodo,
        headers: { ...headersConOrigen, cookie },
        ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
      });

      const jurados = await conSesion("GET", "/api/admin/jurados");
      assert.equal(jurados.status, 200);
      assert.deepEqual((await jurados.json()).items.map((j) => j.id), [juradoDos, juradoUno]);

      const noches = await conSesion("GET", "/api/admin/noches");
      assert.equal(noches.status, 200);
      assert.ok((await noches.json()).items.some((n) => n.id === noche && n.estado === "DRAFT"));

      const especialidades = await conSesion("GET", "/api/admin/especialidades");
      assert.equal(especialidades.status, 200);
      assert.deepEqual(
        (await especialidades.json()).items.filter((e) => e.edicion.id === edicion).map((e) => e.id),
        [especialidadJ1, especialidadJ3],
      );

      const alta = await conSesion("POST", "/api/admin/asignaciones", {
        // creadaPor es un campo extra del cuerpo: el actor real debe salir de la sesión.
        juradoId: juradoUno, nocheId: noche, especialidadId: especialidadJ1, creadaPor: juradoDos,
      });
      const cuerpoAlta = await alta.json();
      assert.equal(alta.status, 201, JSON.stringify(cuerpoAlta));
      const original = cuerpoAlta;
      assert.equal(original.estado, "ACTIVA");
      assert.equal(original.jurado.id, juradoUno);

      const listado = await conSesion("GET", "/api/admin/asignaciones");
      assert.equal(listado.status, 200);
      assert.equal((await listado.json()).items.length, 1);

      const reemplazo = await conSesion("PATCH", `/api/admin/asignaciones/${original.id}`, {
        juradoId: juradoDos, especialidadId: especialidadJ3,
      });
      const cuerpoReemplazo = await reemplazo.json();
      assert.equal(reemplazo.status, 200, JSON.stringify(cuerpoReemplazo));
      const nueva = cuerpoReemplazo;
      assert.notEqual(nueva.id, original.id);
      assert.equal(nueva.estado, "ACTIVA");
      assert.equal(nueva.jurado.id, juradoDos);
      assert.equal(nueva.especialidad.id, especialidadJ3);

      const trasReemplazo = await conSesion("GET", "/api/admin/asignaciones");
      assert.deepEqual(
        (await trasReemplazo.json()).items.map((a) => a.estado).sort(),
        ["ACTIVA", "REVOCADA"],
      );

      const baja = await conSesion("DELETE", `/api/admin/asignaciones/${nueva.id}`);
      const cuerpoBaja = await baja.json();
      assert.equal(baja.status, 200, JSON.stringify(cuerpoBaja));
      assert.equal(cuerpoBaja.estado, "REVOCADA");

      const final = await conSesion("GET", "/api/admin/asignaciones");
      assert.deepEqual((await final.json()).items.map((a) => a.estado), ["REVOCADA", "REVOCADA"]);
    } finally {
      await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }

    // Persistencia: dos filas (la original y la del reemplazo), ninguna borrada.
    const { rows: asignaciones } = await pool.query(
      `SELECT id, jurado_id, especialidad_id, estado, creada_por, revocada_por
         FROM asignacion_jurado ORDER BY creada_en, id`,
    );
    assert.equal(asignaciones.length, 2);
    assert.deepEqual(asignaciones.map((a) => a.estado), ["REVOCADA", "REVOCADA"]);
    assert.ok(asignaciones.every((a) => a.creada_por === adminId && a.revocada_por === adminId));
    const filaOriginal = asignaciones.find((a) => a.jurado_id === juradoUno);
    const filaNueva = asignaciones.find((a) => a.jurado_id === juradoDos);
    assert.ok(filaOriginal && filaNueva);

    // Trazabilidad: los cuatro eventos sensibles, con el actor y la entidad correctos.
    // SELECT * incluye todas las columnas para que la búsqueda de secretos no se
    // limite a un subconjunto elegido a mano.
    const { rows: auditoria } = await pool.query("SELECT * FROM auditoria");
    assert.equal(auditoria.length, 4);
    assert.ok(auditoria.every((a) => a.actor_id === adminId && a.entidad_tipo === "asignacion_jurado"));
    assert.deepEqual(
      auditoria.map((a) => `${a.operacion}:${a.entidad_id}`).sort(),
      [
        `asignacion_creada:${filaOriginal.id}`,
        `asignacion_creada:${filaNueva.id}`,
        `asignacion_reemplazada:${filaOriginal.id}`,
        `asignacion_revocada:${filaNueva.id}`,
      ].sort(),
    );
    assert.doesNotMatch(JSON.stringify(auditoria), /otp|token|password|contraseña|secreto|código/i);
  });
});
