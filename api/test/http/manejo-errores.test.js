import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { createApp } from "../../src/app.js";
import { crearRutasAdminUsuarios } from "../../src/modules/usuarios/admin-usuarios.routes.js";
import { ErrorAsignacion } from "../../src/modules/votacion/asignaciones.js";
import { ErrorInvitacion } from "../../src/modules/usuarios/invitaciones.js";
import { manejarErrores } from "../../src/http/manejo-errores.js";

async function conServidor(app, run) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

// Captura los logs para comprobar que no filtran el error original.
async function conLogCapturado(run) {
  const lineas = [];
  const original = console.error;
  console.error = (linea) => lineas.push(String(linea));
  try {
    await run(lineas);
  } finally {
    console.error = original;
  }
}

test("un error inesperado responde 500 controlado y se registra sin detalles internos", async () => {
  const mensajeInterno = "SELECT token FROM sesion WHERE token = 'secreto-abc'";
  const app = express();
  app.get("/boom", () => {
    throw new Error(`${mensajeInterno}\n    at modulo.js:1:1`);
  });
  app.use(manejarErrores);

  await conLogCapturado(async (lineas) => {
    await conServidor(app, async (base) => {
      const respuesta = await fetch(`${base}/boom`);
      assert.equal(respuesta.status, 500);
      assert.deepEqual(await respuesta.json(), {
        error: "error_interno",
        mensaje: "No se pudo completar la operación.",
      });
    });
    assert.equal(lineas.length, 1);
    assert.doesNotMatch(lineas.join("\n"), /SELECT|token|secreto|modulo\.js|at\s/);
  });
});

test("un cuerpo JSON inválido responde 400 con código de dominio", async () => {
  const app = express();
  app.use(express.json());
  app.post("/json", (request, response) => response.json(request.body));
  app.use(manejarErrores);

  await conServidor(app, async (base) => {
    const respuesta = await fetch(`${base}/json`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ esto no es json",
    });
    assert.equal(respuesta.status, 400);
    assert.deepEqual(await respuesta.json(), {
      error: "campos_invalidos",
      mensaje: "El cuerpo debe ser un JSON válido.",
    });
  });
});

test("los errores de dominio se traducen sin manejadores locales", async () => {
  const app = express();
  app.get("/duplicado", () => {
    throw new ErrorAsignacion("asignacion_duplicada", "Ya existe una asignación activa.");
  });
  app.get("/datos", () => {
    throw new ErrorInvitacion("datos_invalidos", "No se pudo crear la cuenta con esos datos.");
  });
  app.use(manejarErrores);

  await conServidor(app, async (base) => {
    const duplicado = await fetch(`${base}/duplicado`);
    assert.equal(duplicado.status, 409);
    assert.deepEqual(await duplicado.json(), {
      error: "asignacion_duplicada",
      mensaje: "Ya existe una asignación activa.",
    });

    const datos = await fetch(`${base}/datos`);
    assert.equal(datos.status, 422);
    assert.deepEqual(await datos.json(), {
      error: "datos_invalidos",
      mensaje: "No se pudo crear la cuenta con esos datos.",
    });
  });
});

test("un router real conserva sus estados con el middleware compartido", async () => {
  const app = express();
  // Pool falso: devuelve lo justo para cada decisión del router de usuarios.
  const pool = {
    query: async (sql, parametros = []) => {
      if (sql.includes("FROM usuario_rol ur")) {
        return { rows: parametros[0] === "u-sin-rol" ? [] : [{ existe: 1 }] };
      }
      if (sql === "SELECT id FROM usuario WHERE id = $1") {
        return parametros[0] === "u-no" ? { rows: [] } : { rows: [{ id: parametros[0] }] };
      }
      if (sql === "DELETE FROM usuario WHERE id = $1") {
        const error = new Error("restricción");
        error.code = "23514";
        throw error;
      }
      throw new Error("consulta inesperada");
    },
  };
  app.use(
    "/api/admin/usuarios",
    crearRutasAdminUsuarios({
      pool,
      obtenerSesion: async (request) => {
        const id = request.headers["x-usuario-prueba"];
        return id ? { user: { id } } : null;
      },
    }),
  );

  await conServidor(app, async (base) => {
    const url = `${base}/api/admin/usuarios`;
    const sesion = { "x-usuario-prueba": "u-admin" };
    const borrar = (id, cabeceras) => fetch(`${url}/${id}`, { method: "DELETE", headers: cabeceras });

    const anonimo = await borrar("u-no");
    assert.equal(anonimo.status, 401);
    assert.deepEqual(await anonimo.json(), { error: "no_autenticado" });

    const sinRol = await borrar("u-no", { "x-usuario-prueba": "u-sin-rol" });
    assert.equal(sinRol.status, 403);
    assert.deepEqual(await sinRol.json(), { error: "sin_permiso" });

    const noEncontrado = await borrar("u-no", sesion);
    assert.equal(noEncontrado.status, 404);
    assert.deepEqual(await noEncontrado.json(), {
      error: "usuario_no_encontrado",
      mensaje: "El usuario no existe.",
    });

    const protegido = await borrar("u-protegido", sesion);
    assert.equal(protegido.status, 409);
    assert.deepEqual(await protegido.json(), {
      error: "usuario_protegido",
      mensaje: "No se puede eliminar al primer administrador.",
    });

    const invalido = await fetch(`${url}?limite=101`, { headers: sesion });
    assert.equal(invalido.status, 400);
    assert.equal((await invalido.json()).error, "parametros_invalidos");
  });
});

test("un cuerpo demasiado grande responde 413 controlado", async () => {
  const app = express();
  app.use(express.json({ limit: "10b" }));
  app.post("/json", (request, response) => response.json(request.body));
  app.use(manejarErrores);

  await conServidor(app, async (base) => {
    const respuesta = await fetch(`${base}/json`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dato: "x".repeat(50) }),
    });
    assert.equal(respuesta.status, 413);
    assert.deepEqual(await respuesta.json(), {
      error: "cuerpo_demasiado_grande",
      mensaje: "El cuerpo de la petición es demasiado grande.",
    });
  });
});

test("si ya se enviaron cabeceras, se delega el cierre a Express", () => {
  const error = new Error("interno");
  const response = {
    headersSent: true,
    status: () => {
      throw new Error("no se debe responder dos veces");
    },
  };
  let propagado;
  manejarErrores(error, { method: "GET" }, response, (recibido) => {
    propagado = recibido;
  });
  assert.equal(propagado, error);
});

test("createApp usa el middleware global para los errores de sus rutas", async () => {
  // Sesión simulada y un pool que falla solo en la consulta de roles: la ruta
  // /api/mi-cuenta/roles pasa el error al middleware global de la aplicación.
  const pool = {
    query: async (sql) => {
      if (String(sql).includes("FROM usuario_rol")) {
        throw new Error("SELECT token FROM sesion; token=secreto-abc");
      }
      return { rows: [] };
    },
  };
  const auth = {
    api: { getSession: async () => ({ user: { id: "u-admin" } }) },
    handler: async () => {},
  };

  await conLogCapturado(async (lineas) => {
    await conServidor(createApp({ pool, auth }), async (base) => {
      const respuesta = await fetch(`${base}/api/mi-cuenta/roles`);
      assert.equal(respuesta.status, 500);
      assert.deepEqual(await respuesta.json(), {
        error: "error_interno",
        mensaje: "No se pudo completar la operación.",
      });
    });
    assert.doesNotMatch(lineas.join("\n"), /SELECT|token|secreto/);
  });
});
