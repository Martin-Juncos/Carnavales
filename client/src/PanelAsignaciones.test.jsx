import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { PanelAsignaciones } from "./PanelAsignaciones.jsx";

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
