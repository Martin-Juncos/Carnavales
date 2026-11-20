import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { App } from "./App.jsx";
import { crearClienteApi } from "./cliente-api.js";

const noche = { nombre: "Primera noche", estado: "OPEN", edicion: { nombre: "Carnaval 2027" } };
const especialidad = { nombre: "Vestuario" };
const contexto = { asignacionId: "asignacion-1", noche, especialidad };
const fila = (id, nombre, evaluable = true) => ({
  id, evaluable, rubro: { id, nombre }, sujeto: { nombre: "Persona", comparsa: { nombre: "Comparsa" } },
});
const planilla = { ...contexto, filas: [fila("1", "Traje"), fila("2", "Tocado"), fila("3", "Informativa", false)] };

function entorno(planillaDevuelta = planilla) {
  let conectado = true;
  let usuario = "jurado-1";
  const registros = new Map();
  const peticiones = [];
  const api = crearClienteApi(async (url, opciones) => {
    peticiones.push([url, opciones.method, opciones.cache]);
    if (!conectado) throw new TypeError("Offline");
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
  expect(entornoP3.peticiones).toHaveLength(peticionesAntes);
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
  registros.set('["jurado-1","asignacion-1"]', { estado: "borrador", puntajes: { 1: 1, 2: 0 } });
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
  registros.set(clave, { estado: "borrador", puntajes: { 1: 1, 2: 0 } });
  montar();
  await abrir();
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar planilla" }));
  registros.set(clave, { estado: "borrador", puntajes: { 1: 4, 2: 0 } });
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
  expect(registros.get('["jurado-1","asignacion-1"]')).toEqual({
    estado: "pendiente",
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
