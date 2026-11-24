import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { crearRutasAdminPadron } from "../src/modules/padron/admin-padron.routes.js";
import { withIsolatedSchema } from "./helpers/isolated-schema.js";

const databaseUrl = process.env.TEST_DATABASE_URL?.trim();
const skip = databaseUrl ? false : "TEST_DATABASE_URL no está definido";

const admin = "u-admin";
const jurado = "u-jurado";
const edicion = "10000000-0000-0000-0000-000000000027";
const noche = "20000000-0000-0000-0000-000000000001";

async function preparar(pool) {
  await pool.query(
    `INSERT INTO usuario (id, nombre, correo, correo_verificado)
     VALUES ($1, 'Admin', 'admin@example.test', true),
            ($2, 'Jurado', 'jurado@example.test', true)`,
    [admin, jurado],
  );
  await pool.query(
    `INSERT INTO usuario_rol (usuario_id, rol_id, asignado_por, es_inicial)
     SELECT u.id, r.id, $1, false
       FROM (VALUES ($2::text, 'ADMINISTRADOR'), ($3::text, 'JURADO')) AS u(id, codigo)
       JOIN rol r ON r.codigo = u.codigo`,
    [admin, admin, jurado],
  );
  await pool.query(
    `INSERT INTO edicion (id, nombre, anio, estado, creada_por)
     VALUES ($1, 'Carnaval 2027', 2027, 'CONFIGURING', $2)`,
    [edicion, admin],
  );
  await pool.query(
    `INSERT INTO noche (id, edicion_id, orden, nombre, tipo)
     VALUES ($1, $2, 1, 'Primera', 'COMPETENCIA')`,
    [noche, edicion],
  );
}

function appPadron(pool) {
  const app = express();
  app.use(
    "/api/admin/ediciones",
    crearRutasAdminPadron({
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

async function pedir(base, ruta, { metodo = "GET", usuario = admin, cuerpo } = {}) {
  const cabeceras = {};
  if (usuario) cabeceras["x-usuario-prueba"] = usuario;
  if (cuerpo !== undefined) cabeceras["content-type"] = "application/json";
  const respuesta = await fetch(`${base}/api/admin/ediciones${ruta}`, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  return { status: respuesta.status, cuerpo: texto === "" ? null : JSON.parse(texto) };
}

async function crearComparsa(base, nombre, extra = {}) {
  const respuesta = await pedir(base, `/${edicion}/comparsas`, {
    metodo: "POST",
    cuerpo: { nombre, categoria: "PRIMERA", ...extra },
  });
  assert.equal(respuesta.status, 201);
  return respuesta.cuerpo;
}

test("una comparsa se crea, se lista y se modifica con auditoría", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appPadron(pool), async (base) => {
      const creada = await crearComparsa(base, "  Los Pioneros  ");
      assert.equal(creada.nombre, "Los Pioneros");
      assert.equal(creada.categoria, "PRIMERA");
      assert.equal(creada.activa, true);

      const invalida = await pedir(base, `/${edicion}/comparsas`, {
        metodo: "POST",
        cuerpo: { nombre: "Otra", categoria: "LIBRE" },
      });
      assert.equal(invalida.status, 400);
      assert.equal(invalida.cuerpo.error, "categoria_invalida");

      const modificada = await pedir(base, `/${edicion}/comparsas/${creada.id}`, {
        metodo: "PATCH",
        cuerpo: { categoria: "AGRUPACION" },
      });
      assert.equal(modificada.status, 200);
      assert.equal(modificada.cuerpo.categoria, "AGRUPACION");

      const listado = await pedir(base, `/${edicion}/comparsas`);
      assert.deepEqual(listado.cuerpo.items.map((c) => c.nombre), ["Los Pioneros"]);
    });

    const { rows } = await pool.query("SELECT operacion FROM auditoria ORDER BY operacion");
    assert.deepEqual(rows, [{ operacion: "comparsa_actualizada" }, { operacion: "comparsa_creada" }]);
  });
});

test("una persona referencia a un participante y los demás sujetos llevan nombre", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appPadron(pool), async (base) => {
      const comparsa = await crearComparsa(base, "Los Pioneros");
      const participante = await pedir(base, `/${edicion}/participantes`, {
        metodo: "POST",
        cuerpo: { nombreCompleto: "Ana Pérez", esMenor: true },
      });
      assert.equal(participante.status, 201);
      assert.equal(participante.cuerpo.esMenor, true);

      const personaSinParticipante = await pedir(base, `/${edicion}/comparsas/${comparsa.id}/sujetos`, {
        metodo: "POST",
        cuerpo: { tipoSujeto: "PERSONA" },
      });
      assert.equal(personaSinParticipante.status, 400);
      assert.equal(personaSinParticipante.cuerpo.error, "sujeto_datos_invalidos");

      const carroSinNombre = await pedir(base, `/${edicion}/comparsas/${comparsa.id}/sujetos`, {
        metodo: "POST",
        cuerpo: { tipoSujeto: "CARRO" },
      });
      assert.equal(carroSinNombre.status, 400);
      assert.equal(carroSinNombre.cuerpo.error, "nombre_invalido");

      const tipoInvalido = await pedir(base, `/${edicion}/comparsas/${comparsa.id}/sujetos`, {
        metodo: "POST",
        cuerpo: { tipoSujeto: "OTRO", nombre: "X" },
      });
      assert.equal(tipoInvalido.cuerpo.error, "tipo_sujeto_invalido");

      const persona = await pedir(base, `/${edicion}/comparsas/${comparsa.id}/sujetos`, {
        metodo: "POST",
        cuerpo: { tipoSujeto: "PERSONA", participanteId: participante.cuerpo.id },
      });
      assert.equal(persona.status, 201);

      const repetida = await pedir(base, `/${edicion}/comparsas/${comparsa.id}/sujetos`, {
        metodo: "POST",
        cuerpo: { tipoSujeto: "PERSONA", participanteId: participante.cuerpo.id },
      });
      assert.equal(repetida.status, 409);
      assert.equal(repetida.cuerpo.error, "participante_ya_en_comparsa");

      const carro = await pedir(base, `/${edicion}/comparsas/${comparsa.id}/sujetos`, {
        metodo: "POST",
        cuerpo: { tipoSujeto: "CARRO", nombre: "Carro alegórico" },
      });
      assert.equal(carro.status, 201);
      assert.equal(carro.cuerpo.participanteId, null);

      const listado = await pedir(base, `/${edicion}/comparsas/${comparsa.id}/sujetos`);
      assert.equal(listado.cuerpo.items.length, 2);
    });
  });
});

test("el orden de presentación se guarda en DRAFT, admite intercambio y se congela al abrir la noche", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appPadron(pool), async (base) => {
      const primera = await crearComparsa(base, "Primera");
      const segunda = await crearComparsa(base, "Segunda");
      const ruta = `/${edicion}/noches/${noche}/orden`;

      const inicial = await pedir(base, ruta, {
        metodo: "PUT",
        cuerpo: { items: [{ comparsaId: primera.id, orden: 1 }, { comparsaId: segunda.id, orden: 2 }] },
      });
      assert.equal(inicial.status, 200);

      const intercambio = await pedir(base, ruta, {
        metodo: "PUT",
        cuerpo: { items: [{ comparsaId: primera.id, orden: 2 }, { comparsaId: segunda.id, orden: 1 }] },
      });
      assert.equal(intercambio.status, 200);

      const repetido = await pedir(base, ruta, {
        metodo: "PUT",
        cuerpo: { items: [{ comparsaId: primera.id, orden: 1 }, { comparsaId: segunda.id, orden: 1 }] },
      });
      assert.equal(repetido.status, 409);
      assert.equal(repetido.cuerpo.error, "orden_existente");

      const listado = await pedir(base, ruta);
      assert.deepEqual(
        listado.cuerpo.items.map((item) => [item.comparsaId, item.orden]),
        [[segunda.id, 1], [primera.id, 2]],
      );

      await pool.query("UPDATE noche SET estado = 'OPEN', abierta_en = CURRENT_TIMESTAMP WHERE id = $1", [noche]);
      const congelado = await pedir(base, ruta, {
        metodo: "PUT",
        cuerpo: { items: [{ comparsaId: primera.id, orden: 1 }] },
      });
      assert.equal(congelado.status, 409);
      assert.equal(congelado.cuerpo.error, "noche_no_editable");
    });
  });
});

test("con una noche abierta el padrón no admite altas ni borrados", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appPadron(pool), async (base) => {
      const comparsa = await crearComparsa(base, "Los Pioneros");
      await pool.query("UPDATE noche SET estado = 'OPEN', abierta_en = CURRENT_TIMESTAMP WHERE id = $1", [noche]);

      const alta = await pedir(base, `/${edicion}/comparsas`, {
        metodo: "POST",
        cuerpo: { nombre: "Nueva", categoria: "PRIMERA" },
      });
      assert.equal(alta.status, 409);
      assert.equal(alta.cuerpo.error, "padron_congelado");

      const borrado = await pedir(base, `/${edicion}/comparsas/${comparsa.id}`, { metodo: "DELETE" });
      assert.equal(borrado.status, 409);
      assert.equal(borrado.cuerpo.error, "padron_congelado");
    });
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM comparsa");
    assert.equal(rows[0].n, 1);
  });
});

test("listar sujetos de una comparsa inexistente responde 404 y no una lista vacía", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appPadron(pool), async (base) => {
      const comparsa = await crearComparsa(base, "Los Pioneros");
      const existente = await pedir(base, `/${edicion}/comparsas/${comparsa.id}/sujetos`);
      assert.equal(existente.status, 200);
      assert.deepEqual(existente.cuerpo.items, []);

      const inexistente = await pedir(base, `/${edicion}/comparsas/99999999-0000-0000-0000-000000000000/sujetos`);
      assert.equal(inexistente.status, 404);
      assert.equal(inexistente.cuerpo.error, "comparsa_inexistente");
    });
  });
});

test("una comparsa con padrón no se borra ni se desactiva, y una inactiva no admite sujetos", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appPadron(pool), async (base) => {
      const conPadron = await crearComparsa(base, "Con padrón");
      const vacia = await crearComparsa(base, "Vacía");
      const inactiva = await crearComparsa(base, "Inactiva", { activa: false });

      await pedir(base, `/${edicion}/comparsas/${conPadron.id}/sujetos`, {
        metodo: "POST",
        cuerpo: { tipoSujeto: "CARRO", nombre: "Carro" },
      });

      const borradoConPadron = await pedir(base, `/${edicion}/comparsas/${conPadron.id}`, { metodo: "DELETE" });
      assert.equal(borradoConPadron.status, 409);
      assert.equal(borradoConPadron.cuerpo.error, "con_dependencias");

      const desactivacion = await pedir(base, `/${edicion}/comparsas/${conPadron.id}`, {
        metodo: "PATCH",
        cuerpo: { activa: false },
      });
      assert.equal(desactivacion.status, 409);
      assert.equal(desactivacion.cuerpo.error, "comparsa_con_padron");

      const sujetoInactiva = await pedir(base, `/${edicion}/comparsas/${inactiva.id}/sujetos`, {
        metodo: "POST",
        cuerpo: { tipoSujeto: "CARRO", nombre: "Carro" },
      });
      assert.equal(sujetoInactiva.status, 409);
      assert.equal(sujetoInactiva.cuerpo.error, "comparsa_inactiva");

      const borradoVacia = await pedir(base, `/${edicion}/comparsas/${vacia.id}`, { metodo: "DELETE" });
      assert.equal(borradoVacia.status, 204);
    });
  });
});

test("un sujeto no se crea ni se desactiva con activo; el nombre sí se corrige", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appPadron(pool), async (base) => {
      const comparsa = await crearComparsa(base, "Comparsa");

      const altaInactiva = await pedir(base, `/${edicion}/comparsas/${comparsa.id}/sujetos`, {
        metodo: "POST",
        cuerpo: { tipoSujeto: "CARRO", nombre: "Carro", activo: false },
      });
      assert.equal(altaInactiva.status, 400);
      assert.equal(altaInactiva.cuerpo.error, "sujeto_activo_no_editable");

      const sujeto = await pedir(base, `/${edicion}/comparsas/${comparsa.id}/sujetos`, {
        metodo: "POST",
        cuerpo: { tipoSujeto: "CARRO", nombre: "Carro" },
      });
      assert.equal(sujeto.status, 201);
      assert.equal(sujeto.cuerpo.activo, true);

      const desactivacion = await pedir(base, `/${edicion}/sujetos/${sujeto.cuerpo.id}`, {
        metodo: "PATCH",
        cuerpo: { activo: false },
      });
      assert.equal(desactivacion.status, 400);
      assert.equal(desactivacion.cuerpo.error, "sujeto_activo_no_editable");

      const renombrado = await pedir(base, `/${edicion}/sujetos/${sujeto.cuerpo.id}`, {
        metodo: "PATCH",
        cuerpo: { nombre: "Carro nuevo" },
      });
      assert.equal(renombrado.status, 200);
      assert.equal(renombrado.cuerpo.nombre, "Carro nuevo");
      assert.equal(renombrado.cuerpo.activo, true);
    });
  });
});

test("sin administrador no se opera el padrón", { skip }, async () => {
  await withIsolatedSchema(databaseUrl, async (pool) => {
    await preparar(pool);
    await conServidor(appPadron(pool), async (base) => {
      const sinSesion = await pedir(base, `/${edicion}/comparsas`, {
        metodo: "POST",
        usuario: null,
        cuerpo: { nombre: "X", categoria: "PRIMERA" },
      });
      assert.equal(sinSesion.status, 401);

      const comoJurado = await pedir(base, `/${edicion}/participantes`, {
        metodo: "POST",
        usuario: jurado,
        cuerpo: { nombreCompleto: "Ana" },
      });
      assert.equal(comoJurado.status, 403);
    });
  });
});
