import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { crearClienteApi } from "../../../shared/api/cliente-api.js";
import { PanelEdiciones } from "./PanelEdiciones.jsx";

const ediciones = [
  { id: "e1", nombre: "Carnaval", anio: 2027, estado: "CONFIGURING" },
  { id: "e2", nombre: "Carnaval", anio: 2026, estado: "CONFIGURING" },
];

test("deleting an edition requires confirmation and leaves the row visible on conflict", async () => {
  const edicion = { ...ediciones[0], estado: "OPEN", version: { numero: 2, estado: "PUBLICADA" } };
  const borrar = vi.fn()
    .mockResolvedValueOnce(Response.json({ mensaje: "La edición tiene configuración." }, { status: 409 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  render(<PanelEdiciones api={crearClienteApi((url, opciones) => opciones.method === "DELETE"
    ? borrar(url, opciones) : Promise.resolve(Response.json({ items: [edicion] })))} />);
  const abrir = () => fireEvent.click(screen.getByRole("button", { name: "Eliminar Carnaval 2027" }));
  await screen.findByRole("button", { name: "Eliminar Carnaval 2027" });
  abrir();
  const modal = () => within(screen.getByRole("dialog", { name: "Eliminar edición" }));
  expect(modal().getByText(/Carnaval 2027/)).toBeVisible();
  fireEvent.click(modal().getByRole("button", { name: "Cancelar" }));
  expect(borrar).not.toHaveBeenCalled();
  abrir();
  fireEvent.click(modal().getByRole("button", { name: "Confirmar eliminación" }));
  expect(await modal().findByRole("alert")).toHaveTextContent("La edición tiene configuración.");
  fireEvent.click(modal().getByRole("button", { name: "Cancelar" }));
  abrir();
  fireEvent.click(modal().getByRole("button", { name: "Confirmar eliminación" }));
  await screen.findByText("Edición eliminada.");
  expect(screen.queryByRole("button", { name: "Configurar Carnaval 2027" })).toBeNull();
  expect(borrar).toHaveBeenLastCalledWith("/api/admin/ediciones/e1", expect.objectContaining({
    method: "DELETE", credentials: "same-origin",
    body: JSON.stringify({ confirmar: true }),
  }));
});

function preparar() {
  const colecciones = new Map();
  const fetch = vi.fn(async (url, opciones) => {
    if (url === "/api/admin/ediciones") return Response.json({ items: ediciones });
    const items = colecciones.get(url) ?? [];
    if (opciones.method === "GET") return Response.json({ items });
    const item = { ...JSON.parse(opciones.body), id: `nuevo-${items.length}`, estado: "DRAFT", activa: true };
    colecciones.set(url, [...items, item]);
    return Response.json(item, { status: 201 });
  });
  return { fetch, api: crearClienteApi(fetch) };
}

async function configurar(anio) {
  fireEvent.click(await screen.findByRole("button", { name: `Configurar Carnaval ${anio}` }));
  return within(await screen.findByRole("region", { name: `Configurar Carnaval ${anio}` }));
}

function escribir(seccion, etiqueta, value) {
  fireEvent.change(seccion.getByLabelText(etiqueta), { target: { value } });
}

test("creates a night under the selected edition and reloads it without leaking to another edition", async () => {
  const { api, fetch } = preparar();
  const vista = () => render(<PanelEdiciones api={api} />);
  const primera = vista();
  const noches = within((await configurar(2027)).getByRole("region", { name: "Noches" }));
  await noches.findByText("Todavía no hay noches en esta edición.");
  escribir(noches, "Nombre", "Primera noche");
  expect(noches.queryByRole("spinbutton", { name: "Orden" })).toBeNull();
  fireEvent.click(noches.getByRole("button", { name: "Agregar noche" }));
  expect(await noches.findByRole("cell", { name: "Primera noche" })).toBeVisible();
  expect(fetch).toHaveBeenCalledWith("/api/admin/ediciones/e1/noches", expect.objectContaining({
    method: "POST", credentials: "same-origin",
    body: JSON.stringify({ nombre: "Primera noche", orden: 1, tipo: "COMPETENCIA", cuentaParaPuntaje: true }),
  }));
  primera.unmount();
  vista();
  const recargada = within((await configurar(2027)).getByRole("region", { name: "Noches" }));
  expect(await recargada.findByRole("cell", { name: "Primera noche" })).toBeVisible();
  escribir(recargada, "Nombre", "Noche inaugural");
  fireEvent.click(recargada.getByRole("button", { name: "Agregar noche" }));
  expect(await recargada.findByRole("cell", { name: "Noche inaugural" })).toBeVisible();
  expect(within(recargada.getByRole("row", { name: /Noche inaugural/ })).getByRole("cell", { name: "2" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Volver a ediciones" }));
  const otra = await configurar(2026);
  await otra.findByText("Todavía no hay noches en esta edición.");
  expect(otra.queryByText("Primera noche")).toBeNull();
});

test("creates a specialty with the edition-scoped endpoint", async () => {
  const { api, fetch } = preparar();
  render(<PanelEdiciones api={api} />);
  const especialidades = within((await configurar(2026)).getByRole("region", { name: "Especialidades" }));
  await especialidades.findByText("Todavía no hay especialidades en esta edición.");
  escribir(especialidades, "Nombre", "Baíle escénico");
  expect(especialidades.queryByRole("textbox", { name: "Código" })).toBeNull();
  escribir(especialidades, "Orden", "2");
  fireEvent.click(especialidades.getByRole("button", { name: "Agregar especialidad" }));
  expect(await especialidades.findByRole("cell", { name: "BAILE-ESCENICO" })).toBeVisible();
  expect(fetch).toHaveBeenCalledWith("/api/admin/ediciones/e2/especialidades", expect.objectContaining({
    method: "POST", body: JSON.stringify({ nombre: "Baíle escénico", orden: 2, codigo: "BAILE-ESCENICO" }),
  }));
  escribir(especialidades, "Nombre", "Baile escénico");
  escribir(especialidades, "Orden", "3");
  fireEvent.click(especialidades.getByRole("button", { name: "Agregar especialidad" }));
  expect(await especialidades.findByRole("cell", { name: "BAILE-ESCENICO-2" })).toBeVisible();
});

test("retries a failed list and preserves the form when the API rejects a write", async () => {
  const listarNochesEdicion = vi.fn()
    .mockResolvedValueOnce({ ok: false, cuerpo: { mensaje: "No se pudo consultar la edición." } })
    .mockResolvedValue({ ok: true, cuerpo: { items: [] } });
  render(<PanelEdiciones api={{
    listarEdiciones: async () => ({ ok: true, cuerpo: { items: ediciones } }),
    listarNochesEdicion,
    listarEspecialidadesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
    crearNocheEdicion: async () => ({ ok: false, cuerpo: { mensaje: "Ese orden ya existe." } }),
  }} />);
  const noches = within((await configurar(2027)).getByRole("region", { name: "Noches" }));
  expect(await noches.findByRole("alert")).toHaveTextContent("No se pudo consultar la edición.");
  fireEvent.click(noches.getByRole("button", { name: "Reintentar" }));
  await noches.findByText("Todavía no hay noches en esta edición.");
  escribir(noches, "Nombre", "Primera noche");
  fireEvent.click(noches.getByRole("button", { name: "Agregar noche" }));
  expect(await noches.findByRole("alert")).toHaveTextContent("Ese orden ya existe.");
  expect(noches.getByLabelText("Nombre")).toHaveValue("Primera noche");
});

test("a CLOSED edition renders Votación cerrada, hides operational add forms, and keeps deletion available", async () => {
  const cerrada = { id: "e-closed", nombre: "Carnaval", anio: 2027, estado: "CLOSED", cerradaEn: "2026-11-24T12:00:00Z" };
  render(<PanelEdiciones api={{
    listarEdiciones: async () => ({ ok: true, cuerpo: { items: [cerrada] } }),
    listarNochesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
    listarEspecialidadesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
    eliminarEdicion: vi.fn(),
  }} />);
  expect(await screen.findByText("Votación cerrada")).toBeVisible();
  expect(screen.getByRole("button", { name: "Eliminar Carnaval 2027" })).toBeEnabled();
  const seccion = await configurar(2027);
  await seccion.findByText("Votación cerrada.");
  expect(seccion.queryByRole("button", { name: "Agregar noche" })).toBeNull();
  expect(seccion.queryByRole("button", { name: "Agregar especialidad" })).toBeNull();
});

test("stepper switches to Evaluación, auto-saves scale 1-5, creates a rubro, and assigns a specialty", async () => {
  const edicionConVersion = {
    id: "e1", nombre: "Carnaval", anio: 2027, estado: "CONFIGURING",
    version: { id: "v1", numero: 1, estado: "BORRADOR" },
  };
  let rubros = [];
  let escala = null;
  const crearRubro = vi.fn(async (_e, _v, cuerpo) => {
    const nuevo = { ...cuerpo, id: "r1", especialidadIds: [] };
    rubros = [...rubros, nuevo];
    return { ok: true, cuerpo: nuevo };
  });
  const asignarEspecialidadesRubro = vi.fn(async (_e, _v, _r, ids) => {
    rubros = rubros.map((r) => ({ ...r, especialidadIds: ids }));
    return { ok: true, cuerpo: { especialidadIds: ids } };
  });
  const guardarEscala = vi.fn(async (_e, _v, minimo, maximo) => {
    escala = { minimo, maximo };
    return { ok: true, cuerpo: escala };
  });

  render(<PanelEdiciones api={{
    listarEdiciones: async () => ({ ok: true, cuerpo: { items: [edicionConVersion] } }),
    listarNochesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
    listarEspecialidadesEdicion: async () => ({ ok: true, cuerpo: { items: [{ id: "esp1", nombre: "Batería", codigo: "BATERIA", orden: 1, activa: true }] } }),
    listarVersionesEdicion: async () => ({ ok: true, cuerpo: { items: [edicionConVersion.version] } }),
    listarRubros: async () => ({ ok: true, cuerpo: { items: rubros } }),
    obtenerEscala: async () => ({ ok: true, cuerpo: escala }),
    crearRubro,
    asignarEspecialidadesRubro,
    guardarEscala,
  }} />);

  const seccion = await configurar(2027);
  fireEvent.click(seccion.getByRole("button", { name: /Evaluación/ }));

  const regionRubros = within(await seccion.findByRole("region", { name: "Rubros y especialidades" }));
  await regionRubros.findByText(/Escala: 1 a 5/);
  expect(guardarEscala).toHaveBeenCalledWith("e1", "v1", 1, 5);

  fireEvent.change(regionRubros.getByLabelText("Nombre del rubro"), { target: { value: "Batería de comparsa" } });
  fireEvent.change(regionRubros.getByLabelText("Tipo de sujeto"), { target: { value: "BATERIA" } });
  fireEvent.click(regionRubros.getByRole("button", { name: "Agregar rubro" }));
  expect(await regionRubros.findByText(/Batería de comparsa/)).toBeVisible();
  expect(crearRubro).toHaveBeenCalledWith("e1", "v1", expect.objectContaining({
    nombre: "Batería de comparsa",
    tipoSujeto: "BATERIA",
    tipoRubro: "NOMINATIVO",
  }));

  fireEvent.click(regionRubros.getByRole("checkbox", { name: "Batería" }));
  await seccion.findByText(/Especialidades actualizadas/);
  expect(asignarEspecialidadesRubro).toHaveBeenCalledWith("e1", "v1", "r1", ["esp1"]);
});

test("shows a freeze banner when at least one night is already OPEN", async () => {
  const edicionAbierta = {
    id: "e1", nombre: "Carnaval", anio: 2027, estado: "OPEN",
    version: { id: "v1", numero: 1, estado: "CONGELADA" },
  };
  render(<PanelEdiciones api={{
    listarEdiciones: async () => ({ ok: true, cuerpo: { items: [edicionAbierta] } }),
    listarNochesEdicion: async () => ({ ok: true, cuerpo: { items: [{ id: "n1", orden: 1, nombre: "Noche 1", tipo: "COMPETENCIA", estado: "OPEN" }] } }),
    listarEspecialidadesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
  }} />);
  const seccion = await configurar(2027);
  expect(await seccion.findByText(/Reglamento y padrón congelados/)).toBeVisible();
});
