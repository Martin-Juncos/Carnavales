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
    // Defaults vacíos: los tests que ejercitan cada panel los reemplazan con apiExtra.
    async listarEdiciones() {
      return { ok: true, status: 200, cuerpo: { items: [] } };
    },
    async listarUsuarios() {
      return { ok: true, status: 200, cuerpo: { items: [], total: 0 } };
    },
    async listarInvitaciones() {
      return { ok: true, status: 200, cuerpo: { items: [], total: 0 } };
    },
    async listarAsignaciones() {
      return { ok: true, status: 200, cuerpo: { items: [] } };
    },
    async listarJurados() {
      return { ok: true, status: 200, cuerpo: { items: [] } };
    },
    async listarNoches() {
      return { ok: true, status: 200, cuerpo: { items: [] } };
    },
    async listarEspecialidades() {
      return { ok: true, status: 200, cuerpo: { items: [] } };
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
    assert.deepEqual(filas, [["2027", "Carnaval 2027", "En configuración", "Versión 1: BORRADOR", "Configurar"]]);
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

// Utilidades para el panel de asignaciones. Buscan por texto visible, no por
// clases ni por estado interno del componente.

function botonConTexto(raiz, texto) {
  const boton = [...raiz.querySelectorAll("button")].find((b) => b.textContent.trim() === texto);
  assert.ok(boton, `falta el botón ${texto}`);
  return boton;
}

async function clicarBoton(raiz, texto) {
  const boton = botonConTexto(raiz, texto);
  await act(async () => {
    boton.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
}

async function elegirOpcion(seccion, etiqueta, valor) {
  // El textContent de un label con select incluye las opciones; la etiqueta es
  // el primer nodo de texto, igual que en los campos de los otros paneles.
  const etiquetaDelCampo = [...seccion.querySelectorAll("label")].find(
    (l) => l.childNodes[0]?.textContent.trim() === etiqueta,
  );
  assert.ok(etiquetaDelCampo, `falta el campo ${etiqueta}`);
  const campo = etiquetaDelCampo.querySelector("select");
  assert.ok(campo, `el campo ${etiqueta} no es un selector`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value").set.call(campo, valor);
    campo.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}

function dialogoAbierto() {
  const dialogo = dom.window.document.body.querySelector('[role="dialog"]');
  assert.ok(dialogo, "falta el modal de confirmación");
  return dialogo;
}

function catalogoAsignaciones({ asignaciones = [], jurados = [], noches = [], especialidades = [] } = {}) {
  return {
    listarAsignaciones: async () => ({ ok: true, status: 200, cuerpo: { items: asignaciones.map((a) => ({ ...a })) } }),
    listarJurados: async () => ({ ok: true, status: 200, cuerpo: { items: jurados } }),
    listarNoches: async () => ({ ok: true, status: 200, cuerpo: { items: noches } }),
    listarEspecialidades: async () => ({ ok: true, status: 200, cuerpo: { items: especialidades } }),
  };
}

const juradoUno = { id: "j1", nombre: "Jurado uno" };
const juradoDos = { id: "j2", nombre: "Jurado dos" };
const nocheUno = { id: "n1", nombre: "Primera noche", orden: 1, estado: "DRAFT", edicion: { id: "ed1", nombre: "Carnaval 2027", anio: 2027 } };
const especialidadUno = { id: "e1", nombre: "Vestuario", codigo: "J1", activa: true, edicion: nocheUno.edicion };
const asignacionActiva = {
  id: "a1",
  estado: "ACTIVA",
  jurado: { ...juradoUno, activo: true },
  noche: { id: nocheUno.id, nombre: nocheUno.nombre, orden: nocheUno.orden, estado: nocheUno.estado },
  especialidad: { ...especialidadUno },
};

test("un administrador da de alta una asignación después de confirmarla", async () => {
  const asignaciones = [];
  const llamadas = [];
  const app = await renderApp({
    url: "/",
    user: { name: "Ana", email: "ana@example.test" },
    roles: ["ADMINISTRADOR"],
    apiExtra: {
      ...catalogoAsignaciones({
        asignaciones,
        jurados: [juradoUno, juradoDos],
        noches: [nocheUno],
        especialidades: [especialidadUno],
      }),
      crearAsignacion: async (...argumentos) => {
        llamadas.push(argumentos);
        asignaciones.push({ ...asignacionActiva, id: `a${asignaciones.length + 1}` });
        return { ok: true, status: 201, cuerpo: asignaciones.at(-1) };
      },
    },
  });

  try {
    const seccion = seccionDe(app.container, "Asignaciones de jurado");
    await elegirOpcion(seccion, "Jurado", juradoUno.id);
    await elegirOpcion(seccion, "Noche", nocheUno.id);
    await elegirOpcion(seccion, "Especialidad", especialidadUno.id);
    await clicarBoton(seccion, "Asignar jurado");
    assert.match(dialogoAbierto().textContent, /Confirmar alta/);

    await clicarBoton(dialogoAbierto(), "Cancelar");
    assert.equal(llamadas.length, 0, "cancelar no llama a la API");
    assert.equal(dom.window.document.body.querySelector('[role="dialog"]'), null);

    await clicarBoton(seccion, "Asignar jurado");
    await clicarBoton(dialogoAbierto(), "Confirmar alta");

    assert.deepEqual(llamadas, [[juradoUno.id, nocheUno.id, especialidadUno.id]]);
    assert.match(seccion.textContent, /Jurado uno/);
    assert.match(seccion.textContent, /Primera noche/);
    assert.match(seccion.textContent, /Vestuario/);
  } finally {
    await app.unmount();
  }
});

test("cancelar una revocación no llama a la API", async () => {
  let revocada = 0;
  const app = await renderApp({
    url: "/",
    user: { name: "Ana", email: "ana@example.test" },
    roles: ["ADMINISTRADOR"],
    apiExtra: {
      ...catalogoAsignaciones({
        asignaciones: [asignacionActiva],
        jurados: [juradoUno],
        noches: [nocheUno],
        especialidades: [especialidadUno],
      }),
      revocarAsignacion: async () => {
        revocada += 1;
        return { ok: true, status: 200, cuerpo: {} };
      },
    },
  });

  try {
    const seccion = seccionDe(app.container, "Asignaciones de jurado");
    assert.match(seccion.textContent, /Jurado uno/);
    await clicarBoton(seccion, "Revocar");
    assert.match(dialogoAbierto().textContent, /Confirmar revocación/);
    await clicarBoton(dialogoAbierto(), "Cancelar");
    assert.equal(revocada, 0);
    assert.equal(dom.window.document.body.querySelector('[role="dialog"]'), null);
  } finally {
    await app.unmount();
  }
});

test("confirmar una revocación y un reemplazo usa la API y recarga el listado", async () => {
  const asignaciones = [{ ...asignacionActiva }];
  const revocaciones = [];
  const reemplazos = [];
  const app = await renderApp({
    url: "/",
    user: { name: "Ana", email: "ana@example.test" },
    roles: ["ADMINISTRADOR"],
    apiExtra: {
      ...catalogoAsignaciones({
        asignaciones,
        jurados: [juradoUno, juradoDos],
        noches: [nocheUno],
        especialidades: [especialidadUno],
      }),
      revocarAsignacion: async (id) => {
        revocaciones.push(id);
        const fila = asignaciones.find((asignacion) => asignacion.id === id);
        fila.estado = "REVOCADA";
        return { ok: true, status: 200, cuerpo: fila };
      },
      reemplazarAsignacion: async (...argumentos) => {
        reemplazos.push(argumentos);
        const original = asignaciones.find((asignacion) => asignacion.id === argumentos[0]);
        original.estado = "REVOCADA";
        asignaciones.push({ ...asignacionActiva, id: "a2" });
        return { ok: true, status: 200, cuerpo: asignaciones.at(-1) };
      },
    },
  });

  try {
    const seccion = seccionDe(app.container, "Asignaciones de jurado");
    // Primero se reemplaza la asignación activa; después se revoca la nueva.
    await clicarBoton(seccion, "Reemplazar");
    const dialogo = dialogoAbierto();
    await elegirOpcion(dialogo, "Jurado", juradoDos.id);
    await clicarBoton(dialogo, "Confirmar reemplazo");
    assert.deepEqual(reemplazos, [["a1", juradoDos.id, especialidadUno.id]]);
    assert.equal([...seccion.querySelectorAll("tbody tr")].length, 2);

    await clicarBoton(seccion, "Revocar");
    await clicarBoton(dialogoAbierto(), "Confirmar revocación");
    assert.deepEqual(revocaciones, ["a2"]);
  } finally {
    await app.unmount();
  }
});

test("un error de la API se muestra en el panel", async () => {
  const app = await renderApp({
    url: "/",
    user: { name: "Ana", email: "ana@example.test" },
    roles: ["ADMINISTRADOR"],
    apiExtra: {
      ...catalogoAsignaciones({ jurados: [juradoUno], noches: [nocheUno], especialidades: [especialidadUno] }),
      crearAsignacion: async () => ({
        ok: false,
        status: 409,
        cuerpo: { error: "asignacion_duplicada", mensaje: "Ya existe una asignación activa." },
      }),
    },
  });

  try {
    const seccion = seccionDe(app.container, "Asignaciones de jurado");
    await elegirOpcion(seccion, "Jurado", juradoUno.id);
    await elegirOpcion(seccion, "Noche", nocheUno.id);
    await elegirOpcion(seccion, "Especialidad", especialidadUno.id);
    await clicarBoton(seccion, "Asignar jurado");
    await clicarBoton(dialogoAbierto(), "Confirmar alta");
    assert.match(seccion.textContent, /Ya existe una asignación activa\./);
    assert.match(seccion.textContent, /asignacion_duplicada/);
  } finally {
    await app.unmount();
  }
});

test("el reemplazo no precarga opciones que ya no están en el catálogo", async () => {
  const otraEspecialidad = { ...especialidadUno, id: "e2", nombre: "Batería", codigo: "J3" };
  const reemplazos = [];
  const app = await renderApp({
    url: "/",
    user: { name: "Ana", email: "ana@example.test" },
    roles: ["ADMINISTRADOR"],
    apiExtra: {
      ...catalogoAsignaciones({
        asignaciones: [{ ...asignacionActiva, especialidad: { ...especialidadUno, activa: false } }],
        jurados: [juradoUno],
        noches: [nocheUno],
        especialidades: [otraEspecialidad],
      }),
      reemplazarAsignacion: async (...argumentos) => {
        reemplazos.push(argumentos);
        return { ok: true, status: 200, cuerpo: {} };
      },
    },
  });

  try {
    const seccion = seccionDe(app.container, "Asignaciones de jurado");
    await clicarBoton(seccion, "Reemplazar");
    const dialogo = dialogoAbierto();
    const etiqueta = [...dialogo.querySelectorAll("label")].find(
      (l) => l.childNodes[0]?.textContent.trim() === "Especialidad",
    );
    assert.equal(etiqueta.querySelector("select").value, "", "la especialidad inactiva no se ofrece");
    assert.equal(botonConTexto(dialogo, "Confirmar reemplazo").disabled, true);

    await elegirOpcion(dialogo, "Especialidad", otraEspecialidad.id);
    assert.equal(botonConTexto(dialogo, "Confirmar reemplazo").disabled, false);
    await clicarBoton(dialogo, "Confirmar reemplazo");
    assert.deepEqual(reemplazos, [["a1", juradoUno.id, otraEspecialidad.id]]);
  } finally {
    await app.unmount();
  }
});

test("el selector de noche permite ver la cobertura de todas las noches", async () => {
  const otraNoche = { id: "n2", nombre: "Segunda noche", orden: 2, estado: "DRAFT", edicion: nocheUno.edicion };
  const app = await renderApp({
    url: "/",
    user: { name: "Ana", email: "ana@example.test" },
    roles: ["ADMINISTRADOR"],
    apiExtra: {
      ...catalogoAsignaciones({
        asignaciones: [asignacionActiva, { ...asignacionActiva, id: "a2", noche: { ...otraNoche } }],
        jurados: [juradoUno],
        noches: [nocheUno, otraNoche],
        especialidades: [especialidadUno],
      }),
    },
  });

  try {
    const seccion = seccionDe(app.container, "Asignaciones de jurado");
    assert.equal([...seccion.querySelectorAll("tbody tr")].length, 1, "por defecto se ve la primera noche");
    await elegirOpcion(seccion, "Noche en vista", "");
    assert.equal([...seccion.querySelectorAll("tbody tr")].length, 2);
  } finally {
    await app.unmount();
  }
});

test("el panel de asignaciones se oculta si la API responde 403", async () => {
  const app = await renderApp({
    url: "/",
    user: { name: "Ana", email: "ana@example.test" },
    roles: ["ADMINISTRADOR"],
    apiExtra: {
      ...catalogoAsignaciones(),
      listarJurados: async () => ({ ok: false, status: 403, cuerpo: { error: "sin_permiso" } }),
    },
  });

  try {
    assert.doesNotMatch(app.container.textContent, /Asignaciones de jurado/);
    assert.match(app.container.textContent, /Ediciones/);
  } finally {
    await app.unmount();
  }
});
