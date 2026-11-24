import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ConfiguracionEdicion } from "./ConfiguracionEdicion.jsx";

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test("Paso 7 (En vivo) opens the edition and opens a DRAFT night with idempotent UUID and modal confirmation", async () => {
  const abrirEdicion = vi.fn(async () => ({ ok: true, cuerpo: { edicionId: "e1", estado: "OPEN" } }));
  const abrirNoche = vi.fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 409,
      cuerpo: {
        error: "apertura_con_bloqueantes",
        mensaje: "Hay bloqueantes antes de abrir la noche.",
        bloqueantes: [{ codigo: "especialidades_sin_planilla", mensaje: "Falta guardar la planilla de Vestuario." }],
      },
    })
    .mockResolvedValueOnce({ ok: true, cuerpo: { nocheId: "n1", estado: "OPEN" } });

  render(<ConfiguracionEdicion
    edicion={{
      id: "e1",
      nombre: "Carnaval",
      anio: 2027,
      estado: "CONFIGURING",
      version: { id: "v1", numero: 1, estado: "PUBLICADA" },
    }}
    alVolver={() => {}}
    api={{
      listarNochesEdicion: async () => ({
        ok: true,
        cuerpo: { items: [{ id: "n1", orden: 1, nombre: "Primera noche", tipo: "COMPETENCIA", estado: "DRAFT" }] },
      }),
      listarEspecialidadesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      abrirEdicion,
      abrirNoche,
    }}
  />);

  await screen.findByText("Primera noche");
  fireEvent.click(screen.getByRole("button", { name: /Planilla y habilitación/ }));

  const secVivo = within(await screen.findByRole("region", { name: "Operación en vivo" }));
  fireEvent.click(secVivo.getByRole("button", { name: "Abrir edición" }));
  const modalEd = within(screen.getByRole("dialog", { name: "Abrir edición" }));
  fireEvent.click(modalEd.getByRole("button", { name: "Confirmar apertura" }));
  await secVivo.findByText(/Edición abierta correctamente/);
  expect(abrirEdicion).toHaveBeenCalledWith("e1", expect.stringMatching(uuidRe));

  fireEvent.click(secVivo.getByRole("button", { name: "Abrir Primera noche" }));
  let modalNoche = within(screen.getByRole("dialog", { name: "Abrir jornada para votación" }));
  fireEvent.click(modalNoche.getByRole("button", { name: "Confirmar apertura de jornada" }));
  expect(await secVivo.findByText(/Falta guardar la planilla de Vestuario/)).toBeVisible();

  fireEvent.click(secVivo.getByRole("button", { name: "Abrir Primera noche" }));
  modalNoche = within(screen.getByRole("dialog", { name: "Abrir jornada para votación" }));
  fireEvent.click(modalNoche.getByRole("button", { name: "Confirmar apertura de jornada" }));
  await secVivo.findByText(/Jornada «Primera noche» abierta para votación/);
  expect(abrirNoche).toHaveBeenLastCalledWith("e1", "n1", expect.stringMatching(uuidRe));
  expect(await screen.findByText(/Reglamento y padrón congelados/)).toBeVisible();
});
