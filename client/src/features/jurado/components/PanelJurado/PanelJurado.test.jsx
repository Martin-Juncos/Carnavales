import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { App } from "../../../../App.jsx";
import { crearClienteApi } from "../../../../shared/api/cliente-api.js";

const noche = { nombre: "Primera noche", estado: "OPEN", edicion: { nombre: "Carnaval 2027" } };
const especialidad = { nombre: "Vestuario" };
const contexto = { asignacionId: "asignacion-1", noche, especialidad };
const fila = (id, nombre, evaluable = true, comparsa = "Comparsa", sujetoNombre = "Persona") => ({
  id,
  evaluable,
  rubro: { id, nombre },
  sujeto: { nombre: sujetoNombre, comparsa: { nombre: comparsa } },
});
const planilla = {
  ...contexto,
  versionId: "version-1",
  recepcionHabilitada: true,
  filas: [fila("1", "Traje"), fila("2", "Tocado"), fila("3", "Informativa", false)],
};

function entorno(planillaDevuelta = planilla, responderEnvio = () => Response.json({}, { status: 503 }), abrirEdicion, congelar, confirmarTraspaso) {
  let conectado = true;
  let usuario = "jurado-1";
  const registros = new Map();
  const peticiones = [];
  const api = crearClienteApi(async (url, opciones) => {
    peticiones.push([url, opciones.method, opciones.cache]);
    if (!conectado) throw new TypeError("Offline");
    if (url === "/api/jurado/planillas" && opciones.method === "POST") {
      return responderEnvio(JSON.parse(opciones.body));
    }
    if (url === "/api/jurado/planillas/asignacion-1/abrir-edicion" && abrirEdicion) {
      return abrirEdicion(JSON.parse(opciones.body));
    }
    if (url === "/api/jurado/planillas/asignacion-1/borrador-traspaso" && congelar) {
      return congelar(JSON.parse(opciones.body));
    }
    if (url === "/api/jurado/planillas/asignacion-1/confirmar-traspaso" && confirmarTraspaso) {
      return confirmarTraspaso(JSON.parse(opciones.body));
    }
    const datos = {
      "/api/auth/get-session": { user: { id: usuario, name: "Jurado" } },
      "/api/mi-cuenta/roles": { roles: ["JURADO"] },
      "/api/jurado/contextos": { items: [contexto] },
      "/api/jurado/planillas/asignacion-1": planillaDevuelta,
    };
    return Response.json(datos[url] ?? {}, { status: url in datos ? 200 : 404 });
  });
  const guardar = vi.fn(async (clave, actualizar) => {
    const id = JSON.stringify(clave);
    const actual = registros.get(id);
    const siguiente = actualizar(actual);
    if (siguiente !== actual) registros.set(id, siguiente);
    return siguiente;
  });
  return {
    montar: () => render(<App api={api} guardarPlanillaLocal={guardar} />),
    guardar,
    registros,
    peticiones,
    conectar: (valor) => { conectado = valor; },
    cambiarUsuario: (valor) => { usuario = valor; },
  };
}

async function abrir() {
  fireEvent.click(await screen.findByRole("button", { name: /Primera noche.*Vestuario/ }));
}

async function buscarGrupo(rubroRegex) {
  return screen.findByRole("group", { name: rubroRegex });
}

async function puntuarEnGrupo(grupo, valor) {
  const etiqueta = valor === 0 ? /No se presentó/ : new RegExp(`^${valor}$`);
  fireEvent.click(within(grupo).getByRole("button", { name: etiqueta }));
  const dialogo = await screen.findByRole("dialog", { name: /Confirmar votación/i });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Confirmar voto" }));
  await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: /Confirmar votación/i })).not.toBeInTheDocument());
}

function botonDeNota(grupo, valor) {
  const etiqueta = valor === 0 ? /No se presentó/ : new RegExp(`^${valor}$`);
  return within(grupo).getByRole("button", { name: etiqueta });
}

test("an activated substitute edits and sends only missing scores", async () => {
  const heredada = { ...planilla, requiereDispositivo: true, filasHeredadas: ["1"] };
  const enviar = vi.fn(() => Response.json({}, { status: 503 }));
  entorno({ ...heredada, recepcionHabilitada: false }, enviar, () => Response.json(heredada)).montar();
  await abrir();
  expect(await screen.findByText(/Puntaje heredado/)).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: /Traje/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
  const tocado = await buscarGrupo(/Tocado/);
  await puntuarEnGrupo(tocado, 3);
  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Confirmar planilla" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Confirmar planilla" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar y bloquear" }));
  await vi.waitFor(() => expect(enviar).toHaveBeenCalledWith(expect.objectContaining({
    puntajes: [{ filaId: "2", valor: 3, noPresentado: false }],
  })));
});

test("a stale freeze review reports rejection without sending or changing the newer draft", async () => {
  const congelar = vi.fn();
  const prueba = entorno(
    { ...planilla, requiereDispositivo: true, recepcionHabilitada: false },
    undefined,
    () => Response.json({ ...planilla, requiereDispositivo: true }),
    congelar,
  );
  prueba.montar();
  await abrir();
  const traje = await buscarGrupo(/Traje/);
  await puntuarEnGrupo(traje, 1);
  await vi.waitFor(() => expect(within(traje).getByText(/Votado · 1 pts/)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Preparar traspaso" }));

  const key = JSON.stringify(["jurado-1", "asignacion-1"]);
  const newer = { ...prueba.registros.get(key), puntajes: { 1: 4 } };
  prueba.registros.set(key, newer);
  fireEvent.click(screen.getByRole("button", { name: "Bloquear y guardar borrador" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/revisá los puntajes/i);
  expect(within(screen.getByRole("group", { name: /Traje/ })).getByText(/Votado · 4 pts/)).toBeInTheDocument();
  expect(prueba.registros.get(key)).toEqual(newer);
  expect(congelar).not.toHaveBeenCalled();
});

test("freeze locks the local draft before sending and retries the same snapshot after reopening", async () => {
  const confirmacionId = "c0000000-0000-4000-8000-000000000001";
  const reclamo = vi.fn(() => Response.json({ ...planilla, requiereDispositivo: true }));
  const congelar = vi.fn()
    .mockImplementationOnce(() => Response.json({}, { status: 503 }))
    .mockImplementation(({ operationId }) => Response.json({
      estado: "BORRADOR_CONGELADO", asignacionId: contexto.asignacionId, operationId, confirmacionId,
    }));
  const confirmarTraspaso = vi.fn(({ operationId }) => Response.json({
    estado: "TRASPASO_CONFIRMADO", asignacionId: contexto.asignacionId, operationId,
  }));
  const prueba = entorno(
    { ...planilla, requiereDispositivo: true, recepcionHabilitada: false },
    undefined,
    reclamo,
    congelar,
    confirmarTraspaso,
  );
  const vista = prueba.montar();
  await abrir();
  const traje = await buscarGrupo(/Traje/);
  await puntuarEnGrupo(traje, 5);
  await vi.waitFor(() => expect(within(traje).getByText(/Votado · 5 pts/)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Preparar traspaso" }));
  expect(congelar).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Bloquear y guardar borrador" }));
  await screen.findByText("Borrador pendiente de guardar para el traspaso.");
  expect(screen.queryByRole("group", { name: /Traje/ })).not.toBeInTheDocument();
  expect(prueba.registros.get('["jurado-1","asignacion-1"]').estado).toBe("traspaso_pendiente");
  await vi.waitFor(() => expect(congelar).toHaveBeenCalledTimes(1));
  expect(confirmarTraspaso).not.toHaveBeenCalled();
  vista.unmount();
  prueba.montar();
  await abrir();
  fireEvent.click(await screen.findByRole("button", { name: "Reintentar guardar borrador" }));
  await screen.findByText("Borrador guardado en el servidor. La planilla quedó bloqueada.");
  expect(reclamo).toHaveBeenCalledTimes(1);
  expect(congelar.mock.calls[1][0]).toEqual(congelar.mock.calls[0][0]);
  expect(confirmarTraspaso).toHaveBeenCalledWith({
    operationId: congelar.mock.calls[0][0].operationId,
    dispositivoId: congelar.mock.calls[0][0].dispositivoId,
    confirmacionId,
  });
  expect(congelar.mock.calls[0][0].puntajes).toEqual([{ filaId: "1", valor: 5, noPresentado: false }]);
  expect(prueba.registros.get('["jurado-1","asignacion-1"]').estado).toBe("traspaso_guardado");
});

test("an editable roster ballot requires a durable device claim and sends it with the receipt", async () => {
  const reclamar = vi.fn(() => Response.json({ ...planilla, requiereDispositivo: true }));
  const enviar = vi.fn(() => Response.json({}, { status: 503 }));
  const prueba = entorno({ ...planilla, requiereDispositivo: true, recepcionHabilitada: false }, enviar, reclamar);
  const vista = prueba.montar();
  await abrir();
  const traje = await buscarGrupo(/Traje/);
  const { dispositivoId } = reclamar.mock.calls[0][0];
  expect(dispositivoId).toMatch(/^[0-9a-f-]{36}$/);
  await puntuarEnGrupo(traje, 5);
  fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
  await puntuarEnGrupo(screen.getByRole("group", { name: /Tocado/ }), 3);
  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Confirmar planilla" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Confirmar planilla" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar y bloquear" }));
  await vi.waitFor(() => expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ dispositivoId })));
  vista.unmount();
  prueba.montar();
  await abrir();
  await vi.waitFor(() => expect(reclamar).toHaveBeenLastCalledWith({ dispositivoId }));
});

test("el jurado completa y confirma sin red; la confirmación persiste y no muestra puntajes", async () => {
  const entornoP3 = entorno();
  const vista = entornoP3.montar();
  await abrir();
  const traje = await buscarGrupo(/Traje/);
  expect(entornoP3.peticiones.slice(-2)).toEqual([
    ["/api/jurado/contextos", "GET", "no-store"],
    ["/api/jurado/planillas/asignacion-1", "GET", "no-store"],
  ]);
  expect(screen.queryByRole("group", { name: /Informativa/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirmar planilla" })).toBeDisabled();

  entornoP3.conectar(false);
  const peticionesAntes = entornoP3.peticiones.length;
  await puntuarEnGrupo(traje, 5);
  await vi.waitFor(() => expect(within(traje).getByText(/Votado · 5 pts/)).toBeInTheDocument());
  const resumenLateral = screen.getByRole("complementary", { name: "Navegación de comparsas" });
  expect(within(resumenLateral).getByText("Votado")).toBeInTheDocument();
  expect(within(resumenLateral).queryByText("5")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirmar planilla" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
  const tocado = screen.getByRole("group", { name: /Tocado/ });
  await puntuarEnGrupo(tocado, 0);
  await vi.waitFor(() => expect(within(tocado).getByText(/Votado · No se presentó/)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Confirmar planilla" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar y bloquear" }));
  expect(await screen.findByText("Pendiente de recepción")).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: /Traje/ })).not.toBeInTheDocument();
  expect(entornoP3.peticiones.slice(peticionesAntes).every(([ruta, metodo]) =>
    ruta === "/api/jurado/planillas" && metodo === "POST")).toBe(true);
  const pendiente = entornoP3.registros.get('["jurado-1","asignacion-1"]');
  expect(pendiente).toMatchObject({ estado: "pendiente", puntajes: { 1: 5, 2: 0 } });
  expect(pendiente.operationId).toMatch(/^[0-9a-f-]{36}$/);

  vista.unmount();
  const sinRed = entornoP3.montar();
  await screen.findByRole("region", { name: "Iniciar sesión" });
  expect(screen.queryByText("Pendiente de recepción")).not.toBeInTheDocument();
  sinRed.unmount();

  entornoP3.conectar(true);
  const reabierta = entornoP3.montar();
  await abrir();
  expect(await screen.findByText("Pendiente de recepción")).toBeInTheDocument();
  expect(entornoP3.registros.get('["jurado-1","asignacion-1"]').operationId).toBe(pendiente.operationId);
  reabierta.unmount();

  entornoP3.cambiarUsuario("jurado-2");
  entornoP3.montar();
  await abrir();
  const trajeNuevo = await buscarGrupo(/Traje/);
  expect(botonDeNota(trajeNuevo, 5)).toHaveAttribute("aria-pressed", "false");
});

test("una falla al guardar la confirmación no muestra la planilla como pendiente", async () => {
  const { montar, guardar, registros } = entorno();
  registros.set('["jurado-1","asignacion-1"]', { estado: "borrador", versionId: "version-1", puntajes: { 1: 1, 2: 0 } });
  montar();
  await abrir();
  const confirmar = await screen.findByRole("button", { name: "Confirmar planilla" });
  guardar.mockRejectedValueOnce(new Error("Quota exceeded"));
  fireEvent.click(confirmar);
  fireEvent.click(screen.getByRole("button", { name: "Guardar y bloquear" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo guardar/i);
  expect(screen.queryByText("Pendiente de recepción")).not.toBeInTheDocument();
  expect(registros.get('["jurado-1","asignacion-1"]').estado).toBe("borrador");
});

test("si otra pestaña cambió un puntaje, el jurado debe revisarlo antes de bloquear", async () => {
  const { montar, registros } = entorno();
  const clave = '["jurado-1","asignacion-1"]';
  registros.set(clave, { estado: "borrador", versionId: "version-1", puntajes: { 1: 1, 2: 0 } });
  montar();
  await abrir();
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar planilla" }));
  registros.set(clave, { estado: "borrador", versionId: "version-1", puntajes: { 1: 4, 2: 0 } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar y bloquear" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/otra pestaña/i);
  expect(within(screen.getByRole("group", { name: /Traje/ })).getByText(/Votado · 4 pts/)).toBeInTheDocument();
  expect(registros.get(clave).estado).toBe("borrador");
});

test("confirma una planilla abierta con solo filas informativas", async () => {
  const { montar, registros } = entorno({ ...planilla, filas: [fila("3", "Informativa", false)] });
  montar();
  await abrir();
  expect(await screen.findByText(/Fila informativa/)).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: /Informativa/ })).not.toBeInTheDocument();
  const confirmar = screen.getByRole("button", { name: "Confirmar planilla" });
  expect(confirmar).toBeEnabled();
  fireEvent.click(confirmar);
  fireEvent.click(screen.getByRole("button", { name: "Guardar y bloquear" }));
  expect(await screen.findByText("Pendiente de recepción")).toBeInTheDocument();
  expect(registros.get('["jurado-1","asignacion-1"]')).toMatchObject({
    estado: "pendiente",
    versionId: "version-1",
    puntajes: {},
    operationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
});

test("una asignación sin filas no se puede confirmar", async () => {
  const { montar, registros } = entorno({ ...planilla, filas: [] });
  montar();
  await abrir();
  expect(await screen.findByRole("button", { name: "Confirmar planilla" })).toBeDisabled();
  expect(registros.size).toBe(0);
});

const claveLocal = '["jurado-1","asignacion-1"]';
const confirmada = { estado: "pendiente", versionId: "version-1", operationId: "op-1", puntajes: { 1: 5, 2: 0 } };

test("tras un fallo transitorio, un acuse válido se guarda y el envío conserva el identificador", async () => {
  const recibidaEn = "2026-11-20T15:00:00.000Z";
  const responder = vi.fn()
    .mockImplementationOnce(() => Response.json({}, { status: 503 }))
    .mockImplementation(({ operationId, asignacionId }) =>
      Response.json({ estado: "RECIBIDA", operationId, asignacionId, recibidaEn }));
  const { montar, registros } = entorno(planilla, responder);
  registros.set(claveLocal, confirmada);
  const vista = montar();
  await abrir();
  expect(await screen.findByText("Recibida")).toBeInTheDocument();
  expect(responder.mock.calls).toEqual(Array.from({ length: 2 }, () => [{
    operationId: "op-1",
    asignacionId: "asignacion-1",
    versionId: "version-1",
    puntajes: [{ filaId: "1", valor: 5, noPresentado: false }, { filaId: "2", valor: 0, noPresentado: true }],
  }]));
  expect(registros.get(claveLocal)).toMatchObject({ estado: "recibida", operationId: "op-1", recibidaEn });
  expect(registros.get(claveLocal)).not.toHaveProperty("puntajes");
  vista.unmount();
  montar();
  await abrir();
  expect(await screen.findByText("Recibida")).toBeInTheDocument();
  expect(responder).toHaveBeenCalledTimes(2);
});

test("un conflicto queda guardado y no reintenta al recuperar la conexión", async () => {
  const responder = vi.fn(() => Response.json({ error: "operacion_conflictiva" }, { status: 409 }));
  const { montar, registros } = entorno(planilla, responder);
  registros.set(claveLocal, confirmada);
  const vista = montar();
  await abrir();
  expect(await screen.findByText(/rechazó el envío/)).toBeInTheDocument();
  expect(registros.get(claveLocal)).toMatchObject({ ...confirmada, conflicto: true });
  expect(screen.queryByRole("button", { name: "Reintentar ahora" })).not.toBeInTheDocument();
  vista.unmount();
  montar();
  await abrir();
  expect(await screen.findByText(/rechazó el envío/)).toBeInTheDocument();
  window.dispatchEvent(new Event("online"));
  expect(responder).toHaveBeenCalledTimes(1);
});

test("no se envían planillas sin versión histórica verificable", async () => {
  const responder = vi.fn();
  const { montar, registros } = entorno(planilla, responder);
  const sinVersion = { ...confirmada, versionId: undefined };
  registros.set(claveLocal, sinVersion);
  montar();
  await abrir();
  expect(await screen.findByText(/sin una versión verificable/)).toBeInTheDocument();
  expect(registros.get(claveLocal)).toEqual(sinVersion);
  expect(responder).not.toHaveBeenCalled();
});

test("una noche histórica conserva la lectura de filas pero no permite ingresar puntajes", async () => {
  const { montar, registros } = entorno({ ...planilla, recepcionHabilitada: false });
  montar();
  await abrir();
  expect(await screen.findByText(/Traje · Persona/)).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: /Traje/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Confirmar planilla" })).not.toBeInTheDocument();
  expect(registros.size).toBe(0);
});

test("Reintentar ahora conserva el UUID y un acuse de otra operación no cambia el estado", async () => {
  const responder = vi.fn()
    .mockImplementationOnce(({ asignacionId }) => Response.json({
      estado: "RECIBIDA", asignacionId, operationId: "otra-op", recibidaEn: "2026-11-20T15:00:00.000Z",
    }))
    .mockImplementation(({ operationId, asignacionId }) => Response.json({
      estado: "RECIBIDA", asignacionId, operationId, recibidaEn: "2026-11-20T15:00:00.000Z",
    }));
  const { montar, registros } = entorno(planilla, responder);
  registros.set(claveLocal, confirmada);
  montar();
  await abrir();
  expect(await screen.findByText("No se pudo obtener el acuse del servidor.")).toBeInTheDocument();
  expect(registros.get(claveLocal)).toEqual(confirmada);
  fireEvent.click(screen.getByRole("button", { name: "Reintentar ahora" }));
  expect(await screen.findByText("Recibida")).toBeInTheDocument();
  expect(responder.mock.calls[0]).toEqual(responder.mock.calls[1]);
});

test("volver a la pestaña no reinicia el envío de la misma planilla", async () => {
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  let deliver;
  const held = new Promise((resolve) => { deliver = resolve; });
  const post = vi.fn(() => held);
  const fixture = entorno(planilla, post);
  let stored = confirmada;
  fixture.guardar.mockImplementation(async (_key, update) => {
    stored = update(structuredClone(stored));
    return stored;
  });
  const view = fixture.montar();
  try {
    await abrir();
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await act(async () => { fireEvent(document, new Event("visibilitychange")); });
    await vi.waitFor(() => expect(fixture.guardar).toHaveBeenCalledTimes(2));
    const [{ asignacionId, operationId }] = post.mock.calls[0];
    deliver(Response.json({
      estado: "RECIBIDA",
      asignacionId,
      operationId,
      recibidaEn: "2026-11-20T12:00:00.000Z",
    }));
    expect(await screen.findByText("Recibida")).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
  } finally {
    view.unmount();
    visibility.mockRestore();
  }
});

test("un borrador anterior solo se vincula al reglamento después de que el jurado lo revise", async () => {
  const { montar, registros } = entorno();
  const borrador = { estado: "borrador", puntajes: { 1: 5 } };
  registros.set(claveLocal, borrador);
  montar();
  await abrir();
  const traje = await buscarGrupo(/Traje/);
  expect(within(traje).getByText(/Votado · 5 pts/)).toBeInTheDocument();
  expect(registros.get(claveLocal)).toEqual(borrador);
  fireEvent.click(screen.getByRole("button", { name: "Vincular borrador revisado" }));
  await vi.waitFor(() => expect(registros.get(claveLocal)).toEqual({ ...borrador, versionId: planilla.versionId }));
  fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
  const tocado = screen.getByRole("group", { name: /Tocado/ });
  expect(botonDeNota(tocado, 1)).toBeEnabled();
  await puntuarEnGrupo(tocado, 0);
  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Confirmar planilla" })).toBeEnabled());
});

test("muestra la comparsa arriba del rubro sin etiquetas redundantes y oculta subtotales al cerrar", async () => {
  const multiComparsa = {
    ...contexto,
    versionId: "version-1",
    recepcionHabilitada: true,
    filas: [
      fila("1", "Batería de Comparsa", true, "Aramí", null),
      fila("2", "Reina de la Comparsa", true, "Aramí", "Lucía Gómez"),
      fila("3", "Batería de Comparsa", true, "Aymará", null),
    ],
  };
  const { montar } = entorno(multiComparsa);
  montar();
  await abrir();

  await puntuarEnGrupo(await buscarGrupo(/Aramí.*Batería de Comparsa/), 4);
  fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));

  const tarjetaReina = await buscarGrupo(/Reina de la Comparsa/);
  const textosTarjeta = tarjetaReina.textContent ?? "";
  expect(textosTarjeta.indexOf("Aramí")).toBeGreaterThanOrEqual(0);
  expect(textosTarjeta.indexOf("Aramí")).toBeLessThan(textosTarjeta.indexOf("Reina de la Comparsa"));
  expect(within(tarjetaReina).getByText("Lucía Gómez")).toBeInTheDocument();
  expect(textosTarjeta).not.toMatch(/Sujeto esperado/i);
  expect(textosTarjeta).not.toMatch(/Rubro:/i);

  await puntuarEnGrupo(tarjetaReina, 5);
  // Al completar Aramí aparece el banner para continuar con Aymará
  fireEvent.click(await screen.findByRole("button", { name: /Continuar con Aymará/i }));
  await puntuarEnGrupo(await buscarGrupo(/Aymará.*Batería de Comparsa/), 5);

  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Confirmar planilla" })).toBeEnabled());
  // En la vista lista tampoco se muestran subtotales acumulados
  expect(document.body.textContent).not.toMatch(/\b(9|14)\s*pts\b/i);

  fireEvent.click(screen.getByRole("button", { name: "Confirmar planilla" }));
  const dialogo = await screen.findByRole("dialog", { name: /Cierre definitivo de planilla/i });
  expect(within(dialogo).getByText("Aramí")).toBeInTheDocument();
  expect(within(dialogo).getByText("Aymará")).toBeInTheDocument();
  expect(within(dialogo).getAllByText("Completa")).toHaveLength(2);
  // Anti-filtración (D15): nunca mostrar subtotales ni sumas numéricas en el cierre
  expect(dialogo.textContent).not.toMatch(/subtotal|\bpts\b|\bpuntos\b/i);
});

test("mantiene el diseño nuevo después de confirmar en estado pendiente y recibida", async () => {
  const recibidaEn = "2026-11-20T15:00:00.000Z";
  const responder = vi.fn(({ operationId, asignacionId }) =>
    Response.json({ estado: "RECIBIDA", operationId, asignacionId, recibidaEn }));
  const { montar, registros } = entorno(planilla, responder);
  registros.set(claveLocal, confirmada);
  montar();
  await abrir();

  expect(await screen.findByText("Recibida")).toBeInTheDocument();
  // Mantiene la cabecera del flujo del jurado (contexto de noche y especialidad)
  expect(screen.getByRole("banner")).toHaveTextContent(/Primera noche/);
  expect(screen.getByRole("banner")).toHaveTextContent(/Vestuario/);
  expect(screen.getByRole("button", { name: /Volver a las asignaciones/ })).toBeInTheDocument();
});

test("confirma cada voto en modal irreversible, muestra decisión registrada y pasa al siguiente al pulsar Siguiente", async () => {
  const { montar, registros } = entorno();
  montar();
  await abrir();
  const traje = await buscarGrupo(/Traje/);

  // Cancelar en el modal no guarda ni bloquea el ítem
  fireEvent.click(botonDeNota(traje, 4));
  const dialogoCancelar = await screen.findByRole("dialog", { name: /Confirmar votación/i });
  expect(dialogoCancelar).toHaveTextContent(/no puede ser modificada/i);
  fireEvent.click(within(dialogoCancelar).getByRole("button", { name: "Cancelar" }));
  expect(screen.queryByRole("dialog", { name: /Confirmar votación/i })).not.toBeInTheDocument();
  expect(botonDeNota(traje, 4)).toBeEnabled();
  expect(registros.size).toBe(0);

  // Confirmar guarda el voto, muestra el bloque de decisión registrada y espera a que pulse Siguiente
  fireEvent.click(botonDeNota(traje, 5));
  const dialogo = await screen.findByRole("dialog", { name: /Confirmar votación/i });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Confirmar voto" }));
  await vi.waitFor(() => expect(screen.queryByRole("dialog", { name: /Confirmar votación/i })).not.toBeInTheDocument());

  expect(within(traje).getByText(/Votado · 5 pts/i)).toBeInTheDocument();
  expect(within(traje).getByText(/Decisión registrada · No modificable/i)).toBeInTheDocument();
  expect(within(traje).queryByRole("button", { name: /^5$/ })).not.toBeInTheDocument();

  // Al pulsar Siguiente pasa a Tocado
  fireEvent.click(screen.getByRole("button", { name: /Siguiente/ }));
  expect(screen.getByRole("group", { name: /Tocado/ })).toBeInTheDocument();
  expect(screen.getByText(/ÍTEM 2 DE 3/i)).toBeInTheDocument();
});

test("muestra el logo de la comparsa junto a su nombre al votar cuando está configurado", async () => {
  const logo = "data:image/png;base64,iVBORw0KGgo=";
  const conLogo = {
    ...planilla,
    filas: planilla.filas.map((f) => ({
      ...f,
      sujeto: { ...f.sujeto, comparsa: { ...f.sujeto.comparsa, logoDataUrl: logo } },
    })),
  };
  const { montar } = entorno(conLogo);
  montar();
  await abrir();
  const traje = await buscarGrupo(/Traje/);
  const imgs = traje.querySelectorAll("img");
  expect(imgs.length).toBeGreaterThanOrEqual(1);
  expect(imgs[0]).toHaveAttribute("src", logo);
});
