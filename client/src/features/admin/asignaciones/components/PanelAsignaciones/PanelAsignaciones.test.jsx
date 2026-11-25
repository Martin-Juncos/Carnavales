import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { PanelAsignaciones } from "./PanelAsignaciones.jsx";

const ok = (items) => ({ ok: true, cuerpo: { items } });

test("keeps a juror with an active assignment out of other specialties on that night only", async () => {
  const noche = { id: "n", nombre: "Primera noche", estado: "DRAFT", edicion: { nombre: "Carnaval" } };
  const otra = { ...noche, id: "m", nombre: "Segunda noche" };
  const jurados = [{ id: "a", nombre: "Ana" }, { id: "b", nombre: "Beatriz" }];
  const danza = { id: "d", nombre: "Danza", codigo: "D", activa: true };
  const vestuario = { id: "v", nombre: "Vestuario", codigo: "V", activa: true };
  const asignaciones = [{ id: "anterior", noche, especialidad: vestuario, jurado: jurados[1], estado: "REVOCADA" }];
  const crearAsignacion = vi.fn(async () => {
    const nueva = { id: "nueva", noche, especialidad: danza, jurado: jurados[0], estado: "ACTIVA" };
    asignaciones.push(nueva);
    return { ok: true, cuerpo: nueva };
  });
  render(<PanelAsignaciones api={{
    listarJurados: async () => ok(jurados), listarNoches: async () => ok([noche, otra]),
    listarEspecialidades: async () => ok([danza, vestuario]), listarAsignaciones: async () => ok([...asignaciones]),
    crearAsignacion,
  }} />);
  const selectorJurado = await screen.findByRole("combobox", { name: "Jurado" });
  // Las opciones llegan con los datos: se espera su carga antes de leerlas.
  await within(selectorJurado).findByRole("option", { name: "Beatriz" });
  const selectorNoche = screen.getByRole("combobox", { name: "Noche" });
  const selectorEspecialidad = screen.getByRole("combobox", { name: "Especialidad" });
  fireEvent.change(selectorNoche, { target: { value: "n" } });
  expect(within(selectorJurado).getByRole("option", { name: "Ana" })).toBeInTheDocument();
  expect(within(selectorJurado).getByRole("option", { name: "Beatriz" })).toBeInTheDocument();
  fireEvent.change(selectorJurado, { target: { value: "a" } });
  fireEvent.change(selectorEspecialidad, { target: { value: "d" } });
  fireEvent.click(screen.getByRole("button", { name: "Asignar jurado" }));
  expect(crearAsignacion).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar alta" }));
  await screen.findByText("Asignación creada.");
  expect(selectorNoche).toHaveValue("n");
  fireEvent.change(selectorEspecialidad, { target: { value: "v" } });
  expect(within(selectorJurado).queryByRole("option", { name: "Ana" })).toBeNull();
  expect(within(selectorJurado).getByRole("option", { name: "Beatriz" })).toBeInTheDocument();
  fireEvent.change(selectorNoche, { target: { value: "m" } });
  expect(within(selectorJurado).getByRole("option", { name: "Ana" })).toBeInTheDocument();
  fireEvent.change(selectorJurado, { target: { value: "a" } });
  fireEvent.change(selectorNoche, { target: { value: "n" } });
  expect(selectorJurado).toHaveValue("");
  expect(screen.getByRole("button", { name: "Asignar jurado" })).toBeDisabled();
});

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
