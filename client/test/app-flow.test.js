import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { createServer } from "vite";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const globals = [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Node",
  "Event",
  "MouseEvent",
  "MutationObserver",
  "history",
  "location",
  "sessionStorage",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "IS_REACT_ACT_ENVIRONMENT",
];
const originalGlobals = new Map(
  globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
);

// El cierre se registra antes de cualquier paso que pueda fallar: si la carga falla,
// el servidor (si llegó a crearse) se cierra y los globals se restauran igual.
let vite = null;
after(async () => {
  if (vite) await vite.close();
  dom.window.close();
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      delete globalThis[name];
    }
  }
});

const domGlobals = {
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  MutationObserver: dom.window.MutationObserver,
  history: dom.window.history,
  location: dom.window.location,
  sessionStorage: dom.window.sessionStorage,
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  IS_REACT_ACT_ENVIRONMENT: true,
};
for (const [name, value] of Object.entries(domGlobals)) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}

const { act, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const clientRoot = fileURLToPath(new URL("..", import.meta.url));
vite = await createServer({
  root: clientRoot,
  configFile: fileURLToPath(new URL("../vite.config.js", import.meta.url)),
  logLevel: "error",
  optimizeDeps: { entries: [] },
  server: { middlewareMode: true, ws: false },
});
const { App } = await vite.ssrLoadModule("/src/App.jsx");

async function renderApp({ url, user, roles = [], apiExtra = {} }) {
  dom.window.history.replaceState(null, "", url);
  dom.window.document.body.replaceChildren();

  const calls = { session: 0, roles: 0 };
  const api = {
    async obtenerSesion() {
      calls.session += 1;
      return { cuerpo: { user } };
    },
    async obtenerMisRoles() {
      calls.roles += 1;
      return { ok: true, cuerpo: { roles } };
    },
    ...apiExtra,
  };

  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(App, { api }));
  });

  return {
    calls,
    container,
    async unmount() {
      await act(async () => root.unmount());
    },
  };
}

for (const route of [
  {
    name: "password-reset",
    url: "/restablecer-contrasena?token=reset-token",
    otherScreen: "Nueva contraseña",
  },
  {
    name: "invitation",
    url: "/aceptar-invitacion?token=invitation-token",
    otherScreen: "Aceptar invitación",
  },
]) {
  test(`an authenticated session takes precedence over the ${route.name} route and loads its roles`, async () => {
    const app = await renderApp({
      url: route.url,
      user: { name: "Ana", email: "ana@example.test" },
    });

    try {
      assert.match(app.container.textContent, /Bienvenido, Ana/);
      assert.doesNotMatch(app.container.textContent, new RegExp(route.otherScreen));
      assert.equal(app.container.querySelector("form"), null);
      assert.deepEqual(app.calls, { session: 1, roles: 1 });
    } finally {
      await app.unmount();
    }
  });
}

for (const route of [
  {
    name: "password-reset",
    url: "/restablecer-contrasena?token=reset-token",
    heading: "Nueva contraseña",
  },
  {
    name: "invitation",
    url: "/aceptar-invitacion?token=invitation-token",
    heading: "Aceptar invitación",
  },
]) {
  test(`an unauthenticated visitor sees the ${route.name} form for its URL`, async () => {
    const app = await renderApp({ url: route.url, user: null });

    try {
      assert.equal(app.container.querySelector("h2")?.textContent, route.heading);
      assert.ok(app.container.querySelector("form"));
      assert.deepEqual(app.calls, { session: 1, roles: 0 });
    } finally {
      await app.unmount();
    }
  });
}

// Sección administrativa identificada por su encabezado.
function seccionDe(container, titulo) {
  const seccion = [...container.querySelectorAll("section")].find((s) => s.querySelector("h2")?.textContent === titulo);
  assert.ok(seccion, `falta la sección ${titulo}`);
  return seccion;
}

// Escribe en un campo de formulario por su etiqueta, como lo haría la persona.
async function escribirCampo(seccion, etiqueta, valor) {
  const etiquetaDelCampo = [...seccion.querySelectorAll("label")].find((l) => l.textContent.trim() === etiqueta);
  assert.ok(etiquetaDelCampo, `falta el campo ${etiqueta}`);
  const campo = etiquetaDelCampo.querySelector("input");
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(campo, valor);
    campo.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
}

async function enviarFormulario(formulario) {
  await act(async () => {
    formulario.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  });
}

test("un administrador crea una edición desde el panel y la ve en el listado con su estado", async () => {
  const ediciones = [];
  const app = await renderApp({
    url: "/",
    user: { name: "Ana", email: "ana@example.test" },
    roles: ["ADMINISTRADOR"],
    apiExtra: {
      listarUsuarios: async () => ({ ok: true, status: 200, cuerpo: { items: [], total: 0 } }),
      listarInvitaciones: async () => ({ ok: true, status: 200, cuerpo: { items: [], total: 0 } }),
      listarEdiciones: async () => ({ ok: true, status: 200, cuerpo: { items: ediciones.map((e) => ({ ...e })) } }),
      crearEdicion: async (nombre, anio) => {
        const edicion = {
          id: `edicion-${ediciones.length + 1}`,
          nombre,
          anio: Number(anio),
          estado: "CONFIGURING",
          version: { numero: 1, estado: "BORRADOR" },
        };
        ediciones.push(edicion);
        return { ok: true, status: 201, cuerpo: edicion };
      },
    },
  });

  try {
    const seccion = seccionDe(app.container, "Ediciones");
    await escribirCampo(seccion, "Nombre", "Carnaval 2027");
    await escribirCampo(seccion, "Año", "2027");
    await enviarFormulario(seccion.querySelector("form"));

    assert.match(seccion.textContent, /Edición creada\./);
    const filas = [...seccion.querySelectorAll("tbody tr")].map((fila) =>
      [...fila.querySelectorAll("td")].map((celda) => celda.textContent),
    );
    assert.deepEqual(filas, [["2027", "Carnaval 2027", "CONFIGURING", "Versión 1: BORRADOR"]]);
  } finally {
    await app.unmount();
  }
});

test("un año repetido muestra el mensaje de conflicto que devuelve la API", async () => {
  const app = await renderApp({
    url: "/",
    user: { name: "Ana", email: "ana@example.test" },
    roles: ["ADMINISTRADOR"],
    apiExtra: {
      listarUsuarios: async () => ({ ok: true, status: 200, cuerpo: { items: [], total: 0 } }),
      listarInvitaciones: async () => ({ ok: true, status: 200, cuerpo: { items: [], total: 0 } }),
      listarEdiciones: async () => ({ ok: true, status: 200, cuerpo: { items: [] } }),
      crearEdicion: async () => ({
        ok: false,
        status: 409,
        cuerpo: { error: "anio_existente", mensaje: "Ya existe una edición para ese año." },
      }),
    },
  });

  try {
    const seccion = seccionDe(app.container, "Ediciones");
    await escribirCampo(seccion, "Nombre", "Repetida");
    await escribirCampo(seccion, "Año", "2027");
    await enviarFormulario(seccion.querySelector("form"));

    assert.match(seccion.textContent, /Ya existe una edición para ese año\./);
    assert.doesNotMatch(seccion.textContent, /Edición creada\./);
  } finally {
    await app.unmount();
  }
});
