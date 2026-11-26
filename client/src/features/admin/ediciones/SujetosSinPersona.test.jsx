/*
 * Pruebas de los sujetos con nombre que no son personas (carros, batería, banda, tema inédito,
 * carroza de reina, pareja): se listan sin mostrar a las personas, se agregan con su tipo y
 * nombre, se renombran y se quitan con confirmación. Depende de SujetosSinPersona,
 * Testing Library y vitest.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { SujetosSinPersona } from "./SujetosSinPersona.jsx";

const edicion = { id: "e1", nombre: "Carnaval", anio: 2027 };
const comparsa = { id: "c1", nombre: "Poramba" };

function montar({ soloLectura = false } = {}) {
  let items = [
    { id: "s-persona", tipoSujeto: "PERSONA", participanteId: "p1", nombre: null, activo: true },
    { id: "s-carro", tipoSujeto: "CARRO", participanteId: null, nombre: "Carro 1: Templo", activo: true },
  ];
  const api = {
    listarSujetosComparsa: vi.fn(async () => ({ ok: true, cuerpo: { items } })),
    crearSujetoComparsa: vi.fn(async (_e, _c, cuerpo) => {
      const nuevo = { id: "s-nuevo", participanteId: null, activo: true, ...cuerpo };
      items = [...items, nuevo];
      return { ok: true, cuerpo: nuevo };
    }),
    actualizarSujeto: vi.fn(async (_e, sujetoId, cambios) => {
      items = items.map((s) => (s.id === sujetoId ? { ...s, ...cambios } : s));
      return { ok: true, cuerpo: items.find((s) => s.id === sujetoId) };
    }),
    eliminarSujeto: vi.fn(async (_e, sujetoId) => {
      items = items.filter((s) => s.id !== sujetoId);
      return { ok: true, cuerpo: null, status: 204 };
    }),
  };
  render(<SujetosSinPersona edicion={edicion} comparsa={comparsa} api={api} soloLectura={soloLectura} />);
  return api;
}

test("lista solo los sujetos que no son personas", async () => {
  montar();
  const sec = within(await screen.findByRole("region", { name: "Carros, batería, banda y tema" }));

  expect(sec.getByText("Carro 1: Templo")).toBeVisible();
  expect(sec.getAllByRole("listitem")).toHaveLength(1);
});

test("agregar un sujeto elige su tipo, escribe su nombre y lo guarda una vez", async () => {
  const api = montar();
  const sec = within(await screen.findByRole("region", { name: "Carros, batería, banda y tema" }));

  fireEvent.change(sec.getByLabelText("Tipo"), { target: { value: "CARRO" } });
  fireEvent.change(sec.getByLabelText("Nombre"), { target: { value: "Carro 2: Sirena" } });
  fireEvent.click(sec.getByRole("button", { name: "Agregar" }));

  expect(await sec.findByText("Carro 2: Sirena")).toBeVisible();
  expect(api.crearSujetoComparsa).toHaveBeenCalledWith("e1", "c1", { tipoSujeto: "CARRO", nombre: "Carro 2: Sirena" });
});

test("renombrar un sujeto actualiza solo su nombre", async () => {
  const api = montar();
  const sec = within(await screen.findByRole("region", { name: "Carros, batería, banda y tema" }));

  fireEvent.click(sec.getByRole("button", { name: "Editar Carro 1: Templo" }));
  fireEvent.change(sec.getByLabelText("Nuevo nombre"), { target: { value: "Carro 1: Nuevo" } });
  fireEvent.click(sec.getByRole("button", { name: "Guardar nombre" }));

  await waitFor(() => expect(api.actualizarSujeto).toHaveBeenCalledWith("e1", "s-carro", { nombre: "Carro 1: Nuevo" }));
  expect(await sec.findByText("Carro 1: Nuevo")).toBeVisible();
});

test("quitar un sujeto pide confirmación antes de llamar a la API", async () => {
  const api = montar();
  const sec = within(await screen.findByRole("region", { name: "Carros, batería, banda y tema" }));

  fireEvent.click(sec.getByRole("button", { name: "Quitar Carro 1: Templo" }));
  expect(api.eliminarSujeto).not.toHaveBeenCalled();
  const dialogo = within(screen.getByRole("dialog", { name: "Quitar sujeto" }));
  fireEvent.click(dialogo.getByRole("button", { name: "Confirmar" }));

  await waitFor(() => expect(api.eliminarSujeto).toHaveBeenCalledWith("e1", "s-carro"));
  await waitFor(() => expect(sec.queryByText("Carro 1: Templo")).toBeNull());
});

test("en solo lectura se ven los sujetos sin formulario ni acciones", async () => {
  montar({ soloLectura: true });
  const sec = within(await screen.findByRole("region", { name: "Carros, batería, banda y tema" }));

  expect(sec.getByText("Carro 1: Templo")).toBeVisible();
  expect(sec.queryByRole("button", { name: "Agregar" })).toBeNull();
  expect(sec.queryByRole("button", { name: "Editar Carro 1: Templo" })).toBeNull();
});

test("un grupo muestra sus integrantes: se agregan personas de la edición y se quitan con confirmación", async () => {
  let integrantes = [];
  const api = {
    listarSujetosComparsa: vi.fn(async () => ({
      ok: true,
      cuerpo: { items: [{ id: "s-grupo", tipoSujeto: "GRUPO", participanteId: null, nombre: "Gladiadores", activo: true }] },
    })),
    listarParticipantes: vi.fn(async () => ({
      ok: true,
      cuerpo: { items: [{ id: "p1", nombreCompleto: "Ana Gómez" }, { id: "p2", nombreCompleto: "Luz Silva" }] },
    })),
    listarIntegrantesGrupo: vi.fn(async () => ({ ok: true, cuerpo: { items: integrantes } })),
    agregarIntegranteGrupo: vi.fn(async (_e, _s, participanteId) => {
      integrantes = [...integrantes, { participanteId, nombreCompleto: participanteId === "p1" ? "Ana Gómez" : "Luz Silva" }];
      return { ok: true, cuerpo: {} };
    }),
    quitarIntegranteGrupo: vi.fn(async () => {
      integrantes = [];
      return { ok: true, cuerpo: null, status: 204 };
    }),
  };
  render(<SujetosSinPersona edicion={edicion} comparsa={comparsa} api={api} />);

  const sec = within(await screen.findByRole("region", { name: "Carros, batería, banda y tema" }));
  const grupo = within(await sec.findByRole("region", { name: "Integrantes de Gladiadores" }));
  await grupo.findByRole("option", { name: "Ana Gómez" });
  fireEvent.change(grupo.getByLabelText("Persona"), { target: { value: "p1" } });
  fireEvent.click(grupo.getByRole("button", { name: "Agregar integrante" }));

  // La opción del selector también dice "Ana Gómez": se busca el integrante en la lista.
  await waitFor(() => expect(grupo.getByText("Ana Gómez", { selector: "span" })).toBeVisible());
  expect(api.agregarIntegranteGrupo).toHaveBeenCalledWith("e1", "s-grupo", "p1");

  fireEvent.click(grupo.getByRole("button", { name: "Quitar Ana Gómez" }));
  expect(api.quitarIntegranteGrupo).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole("dialog", { name: "Quitar integrante" })).getByRole("button", { name: "Confirmar" }));

  await waitFor(() => expect(api.quitarIntegranteGrupo).toHaveBeenCalledWith("e1", "s-grupo", "p1"));
});
