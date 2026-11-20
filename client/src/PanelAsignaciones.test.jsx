import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { PanelAsignaciones } from "./PanelAsignaciones.jsx";

const ok = (items) => ({ ok: true, cuerpo: { items } });

test("a failed assignment list can be retried without leaving the panel", async () => {
  const listarAsignaciones = vi.fn()
    .mockResolvedValueOnce({ ok: false, cuerpo: { mensaje: "No se pudo cargar la cobertura." } })
    .mockResolvedValue(ok([]));
  render(<PanelAsignaciones api={{
    listarAsignaciones, listarJurados: async () => ok([]),
    listarNoches: async () => ok([]), listarEspecialidades: async () => ok([]),
  }} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar la cobertura.");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByText("Todavía no hay noches para asignar jurados.")).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("filters coverage by specialty within the selected night", async () => {
  const noche = { id: "n", nombre: "Primera noche", estado: "DRAFT", edicion: { nombre: "Carnaval" } };
  const otra = { ...noche, id: "m", nombre: "Segunda noche" };
  const vestuario = { id: "v", nombre: "Vestuario", codigo: "V", activa: true };
  const danza = { id: "d", nombre: "Danza", codigo: "D", activa: true };
  const asignacion = (nombre, contexto, especialidad) => ({
    id: nombre, jurado: { id: nombre, nombre }, noche: contexto, especialidad, estado: "REVOCADA",
  });
  render(<PanelAsignaciones api={{
    listarJurados: async () => ok([]), listarNoches: async () => ok([noche, otra]),
    listarEspecialidades: async () => ok([vestuario, danza]),
    listarAsignaciones: async () => ok([
      asignacion("Ana", noche, danza), asignacion("Beatriz", noche, vestuario), asignacion("Clara", otra, danza),
    ]),
  }} />);
  expect(await screen.findByText("Ana")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Especialidad en vista"), { target: { value: "d" } });
  expect(screen.getByText("Ana")).toBeVisible();
  expect(screen.queryByText("Beatriz")).toBeNull();
  expect(screen.queryByText("Clara")).toBeNull();
});

test("registers two substitutes and activates one only after confirmation", async () => {
  const noche = { id: "n", nombre: "Primera noche", estado: "DRAFT", edicion: { nombre: "Edición" } };
  const especialidad = { id: "e", nombre: "Vestuario", codigo: "J1", activa: true };
  const jurados = [{ id: "a", nombre: "Titular" }, { id: "b", nombre: "Suplente B" }, { id: "c", nombre: "Suplente C" }];
  let asignacion = { id: "a1", estado: "ACTIVA", jurado: jurados[0], noche, especialidad };
  const listar = (items) => ({ ok: true, cuerpo: { items } });
  const api = {
    listarJurados: async () => listar(jurados),
    listarNoches: async () => listar([noche]),
    listarEspecialidades: async () => listar([especialidad]),
    listarAsignaciones: async () => listar([asignacion]),
    registrarSuplentes: vi.fn(async () => {
      asignacion = { ...asignacion, suplencia: { suplenteIds: ["b", "c"], abiertaParaEditar: false } };
      return { ok: true };
    }),
    activarSuplente: vi.fn(async () => ({ ok: true })),
  };
  render(<PanelAsignaciones api={api} />);
  fireEvent.click(await screen.findByRole("button", { name: "Registrar suplentes" }));
  let dialogo = within(screen.getByRole("dialog"));
  fireEvent.change(dialogo.getByLabelText("Primer suplente"), { target: { value: "b" } });
  fireEvent.change(dialogo.getByLabelText("Segundo suplente"), { target: { value: "c" } });
  expect(api.registrarSuplentes).not.toHaveBeenCalled();
  fireEvent.click(dialogo.getByRole("button", { name: "Registrar suplentes" }));
  fireEvent.click(await screen.findByRole("button", { name: "Activar suplente" }));
  expect(api.registrarSuplentes).toHaveBeenCalledWith("a1", ["b", "c"]);
  expect(screen.queryByRole("button", { name: "Revocar" })).not.toBeInTheDocument();
  dialogo = within(screen.getByRole("dialog"));
  fireEvent.change(dialogo.getByLabelText("Suplente"), { target: { value: "c" } });
  expect(api.activarSuplente).not.toHaveBeenCalled();
  fireEvent.click(dialogo.getByRole("button", { name: "Activar suplente" }));
  await screen.findByText("Suplente activado.");
  expect(api.activarSuplente).toHaveBeenCalledWith("a1", "c");
});
