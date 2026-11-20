import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { App } from "./App.jsx";
import { crearClienteApi } from "./cliente-api.js";

const noche = { nombre: "Primera noche", estado: "OPEN", edicion: { nombre: "Carnaval 2027" } };
const especialidad = { nombre: "Vestuario" };
const contexto = { asignacionId: "asignacion-1", noche, especialidad };
const fila = (id, nombre, evaluable = true) => ({
  id, evaluable, rubro: { id, nombre }, sujeto: { nombre: "Persona", comparsa: { nombre: "Comparsa" } },
});
const planilla = { ...contexto, versionId: "version-1", recepcionHabilitada: true,
  filas: [fila("1", "Traje"), fila("2", "Tocado"), fila("3", "Informativa", false)] };

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
    guardar, registros, peticiones,
    conectar: (valor) => { conectado = valor; },
    cambiarUsuario: (valor) => { usuario = valor; },
  };
}

async function abrir() {
  fireEvent.click(await screen.findByRole("button", { name: /Primera noche.*Vestuario/ }));
}

test("an activated substitute edits and sends only missing scores", async () => {
  const heredada = { ...planilla, requiereDispositivo: true, filasHeredadas: ["1"] };
  const enviar = vi.fn(() => Response.json({}, { status: 503 }));
  entorno({ ...heredada, recepcionHabilitada: false }, enviar, () => Response.json(heredada)).montar();
  await abrir();
  const tocado = await screen.findByRole("combobox", { name: /Tocado/ });
  expect(screen.queryByRole("combobox", { name: /Traje/ })).not.toBeInTheDocument();
  expect(screen.getByText(/Traje.*Puntaje heredado/)).toBeInTheDocument();
  fireEvent.change(tocado, { target: { value: "3" } });
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
  const traje = await screen.findByRole("combobox", { name: /Traje/ });
  fireEvent.change(traje, { target: { value: "1" } });
  await vi.waitFor(() => expect(traje).toHaveValue("1"));
  fireEvent.click(screen.getByRole("button", { name: "Preparar traspaso" }));

  const key = JSON.stringify(["jurado-1", "asignacion-1"]);
  const newer = { ...prueba.registros.get(key), puntajes: { 1: 4 } };
  prueba.registros.set(key, newer);
  fireEvent.click(screen.getByRole("button", { name: "Bloquear y guardar borrador" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/revisá los puntajes/i);
  expect(screen.getByRole("combobox", { name: /Traje/ })).toHaveValue("4");
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
  const prueba = entorno({ ...planilla, requiereDispositivo: true, recepcionHabilitada: false },
    undefined, reclamo, congelar, confirmarTraspaso);
  const vista = prueba.montar();
  await abrir();
  const nota = await screen.findByRole("combobox", { name: /Traje/ });
  fireEvent.change(nota, { target: { value: "5" } });
  await vi.waitFor(() => expect(nota).toHaveValue("5"));
  fireEvent.click(screen.getByRole("button", { name: "Preparar traspaso" }));
  expect(congelar).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Bloquear y guardar borrador" }));
  await screen.findByText("Borrador pendiente de guardar para el traspaso.");
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
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
  const traje = await screen.findByRole("combobox", { name: /Traje/ });
  const { dispositivoId } = reclamar.mock.calls[0][0];
  expect(dispositivoId).toMatch(/^[0-9a-f-]{36}$/);
  fireEvent.change(traje, { target: { value: "5" } });
  fireEvent.change(screen.getByRole("combobox", { name: /Tocado/ }), { target: { value: "3" } });
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
  const traje = await screen.findByRole("combobox", { name: /Traje/ });
  const tocado = screen.getByRole("combobox", { name: /Tocado/ });
  expect(entornoP3.peticiones.slice(-2)).toEqual([
    ["/api/jurado/contextos", "GET", "no-store"],
    ["/api/jurado/planillas/asignacion-1", "GET", "no-store"],
  ]);
  expect(screen.queryByRole("combobox", { name: /Informativa/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirmar planilla" })).toBeDisabled();

  entornoP3.conectar(false);
  const peticionesAntes = entornoP3.peticiones.length;
  fireEvent.change(traje, { target: { value: "5" } });
  await vi.waitFor(() => expect(traje).toHaveValue("5"));
  expect(screen.getByRole("button", { name: "Confirmar planilla" })).toBeDisabled();
  fireEvent.change(tocado, { target: { value: "0" } });
  await vi.waitFor(() => expect(tocado).toHaveValue("0"));
  expect(screen.getAllByRole("option", { name: "No se presentó" })).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Confirmar planilla" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar y bloquear" }));
  expect(await screen.findByText("Pendiente de recepción")).toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
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
  expect(await screen.findByRole("combobox", { name: /Traje/ })).toHaveValue("");
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
  expect(screen.getByRole("combobox", { name: /Traje/ })).toHaveValue("4");
  expect(registros.get(clave).estado).toBe("borrador");
});

test("confirma una planilla abierta con solo filas informativas", async () => {
  const { montar, registros } = entorno({ ...planilla, filas: [fila("3", "Informativa", false)] });
  montar();
  await abrir();
  expect(await screen.findByText(/Fila informativa/)).toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
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
    operationId: "op-1", asignacionId: "asignacion-1", versionId: "version-1",
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
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
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
    deliver(Response.json({ estado: "RECIBIDA", asignacionId, operationId,
      recibidaEn: "2026-11-20T12:00:00.000Z" }));
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
  const traje = await screen.findByRole("combobox", { name: /Traje/ });
  expect(traje).toHaveValue("5");
  expect(traje).toBeDisabled();
  expect(registros.get(claveLocal)).toEqual(borrador);
  fireEvent.click(screen.getByRole("button", { name: "Vincular borrador revisado" }));
  await vi.waitFor(() => expect(traje).toBeEnabled());
  expect(registros.get(claveLocal)).toEqual({ ...borrador, versionId: planilla.versionId });
  const tocado = screen.getByRole("combobox", { name: /Tocado/ });
  fireEvent.change(tocado, { target: { value: "0" } });
  await vi.waitFor(() => expect(screen.getByRole("button", { name: "Confirmar planilla" })).toBeEnabled());
});
