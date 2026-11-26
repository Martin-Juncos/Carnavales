/*
 * Pruebas del progreso en el listado "Mis eventos": cada tarjeta muestra los pasos completos
 * según los conteos de la API, el "Siguiente paso" apunta a la edición pendiente y el menu
 * "Más opciones" explica retirar y eliminar antes de confirmar.
 * Depende de PanelEdiciones, Testing Library y vitest.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { PanelEdiciones } from "./PanelEdiciones.jsx";

const edicion = {
  id: "e1",
  nombre: "Carnaval",
  anio: 2027,
  estado: "CONFIGURING",
  version: { numero: 1, estado: "BORRADOR" },
};

function apiCon(conteos) {
  return {
    listarEdiciones: vi.fn(async () => ({ ok: true, cuerpo: { items: [edicion] } })),
    listarNochesEdicion: async () => ({ ok: true, cuerpo: { items: Array(conteos.noches).fill({}) } }),
    listarEspecialidadesEdicion: async () => ({ ok: true, cuerpo: { items: Array(conteos.especialidades).fill({}) } }),
    listarComparsas: async () => ({ ok: true, cuerpo: { items: Array(conteos.comparsas).fill({}) } }),
    retirarEdicion: vi.fn(async () => ({ ok: true, cuerpo: {} })),
  };
}

test("cada evento muestra cuántos pasos de configuración están completos según la API", async () => {
  render(<PanelEdiciones api={apiCon({ noches: 3, especialidades: 5, comparsas: 0 })} />);

  const tarjeta = within(await screen.findByRole("article"));
  expect(await tarjeta.findByText("1 de 4 pasos")).toBeVisible();
  expect(tarjeta.getByText("En preparación")).toBeVisible();
  expect(await screen.findByRole("region", { name: "Siguiente paso" })).toHaveTextContent(
    "Falta terminar la configuración de Carnaval 2027: 1 de 4 pasos completos.",
  );
});

test("sin conteos de la API la tarjeta no inventa un progreso", async () => {
  render(<PanelEdiciones api={{
    listarEdiciones: async () => ({ ok: true, cuerpo: { items: [edicion] } }),
  }} />);

  const tarjeta = within(await screen.findByRole("article"));
  expect(tarjeta.getByRole("button", { name: "Administrar evento Carnaval 2027" })).toBeVisible();
  expect(tarjeta.queryByText(/pasos$/)).toBeNull();
  expect(screen.queryByRole("region", { name: "Siguiente paso" })).toBeNull();
});

test("Más opciones explica que retirar conserva los datos antes de confirmar", async () => {
  const api = apiCon({ noches: 0, especialidades: 0, comparsas: 0 });
  render(<PanelEdiciones api={api} />);

  fireEvent.click(await screen.findByRole("button", { name: "Más opciones de Carnaval 2027" }));
  const menu = within(screen.getByRole("group", { name: "Más opciones de Carnaval 2027" }));
  expect(menu.getByText("Conserva todos los datos. No se puede reactivar.")).toBeVisible();
  expect(menu.getByText("Borra el evento y su historial. No se puede deshacer.")).toBeVisible();

  fireEvent.click(menu.getByRole("button", { name: "Retirar del listado Carnaval 2027" }));
  expect(screen.getByRole("dialog", { name: "Retirar edición" })).toBeVisible();
  expect(api.retirarEdicion).not.toHaveBeenCalled();
});
