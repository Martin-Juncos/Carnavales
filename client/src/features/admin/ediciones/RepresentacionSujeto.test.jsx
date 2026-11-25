/*
 * Pruebas de la representación de un sujeto («Representa: …»): se edita en texto de hasta 1000
 * caracteres, se guarda con la API y en solo lectura solo se muestra. Depende de
 * RepresentacionSujeto, Testing Library y vitest.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { RepresentacionSujeto } from "./RepresentacionSujeto.jsx";

test("editar la representación la guarda y la muestra con el texto nuevo", async () => {
  const api = {
    actualizarSujeto: vi.fn(async (_e, _s, cambios) => ({ ok: true, cuerpo: { representacion: cambios.representacion } })),
  };
  const alGuardar = vi.fn();
  render(<RepresentacionSujeto
    api={api}
    edicionId="e1"
    sujetoId="s1"
    nombre="Carro 1: Templo"
    valor={null}
    alGuardar={alGuardar}
  />);

  expect(screen.getByText("Sin representación cargada.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Editar representación de Carro 1: Templo" }));
  fireEvent.change(screen.getByLabelText("Representa"), { target: { value: "Templo egipcio" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar representación" }));

  await waitFor(() => expect(api.actualizarSujeto).toHaveBeenCalledWith("e1", "s1", { representacion: "Templo egipcio" }));
  expect(alGuardar).toHaveBeenCalledWith("Templo egipcio");
});

test("el texto admite hasta 1000 caracteres y muestra el contador", () => {
  render(<RepresentacionSujeto api={{ actualizarSujeto: vi.fn() }} edicionId="e1" sujetoId="s1" nombre="Carro" valor="Hera" />);

  fireEvent.click(screen.getByRole("button", { name: "Editar representación de Carro" }));

  expect(screen.getByLabelText("Representa")).toHaveAttribute("maxlength", "1000");
  expect(screen.getByText("4/1000")).toBeVisible();
});

test("en solo lectura se muestra el texto sin botón de edición", () => {
  render(<RepresentacionSujeto
    api={{ actualizarSujeto: vi.fn() }}
    edicionId="e1"
    sujetoId="s1"
    nombre="Carro"
    valor="Hera"
    soloLectura
  />);

  expect(screen.getByText("Representa: Hera")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Editar representación de Carro" })).toBeNull();
});
