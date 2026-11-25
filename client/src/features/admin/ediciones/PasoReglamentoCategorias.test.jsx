/*
 * Pruebas de las categorías del reglamento: se escribe el nombre de la categoría y después se
 * crean sus rubros eligiéndola en el formulario de rubros. Depende de PasoReglamento,
 * Testing Library y vitest.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { PasoReglamento } from "./PasoReglamento.jsx";

const edicion = { id: "e1", nombre: "Carnaval", anio: 2027, estado: "CONFIGURING" };
const versionActiva = { id: "v1", numero: 1, estado: "BORRADOR" };

test("la categoría se crea por nombre y luego el rubro se crea dentro de ella", async () => {
  let categorias = [];
  let rubros = [];
  const crearCategoriaRubro = vi.fn(async (_e, _v, cuerpo) => {
    const nueva = { ...cuerpo, id: "cat-reina" };
    categorias = [...categorias, nueva];
    return { ok: true, cuerpo: nueva };
  });
  const crearRubro = vi.fn(async (_e, _v, cuerpo) => {
    const nuevo = { ...cuerpo, id: "r-reina", especialidadIds: [] };
    rubros = [...rubros, nuevo];
    return { ok: true, cuerpo: nuevo };
  });

  render(<PasoReglamento
    edicion={edicion}
    versionActiva={versionActiva}
    especialidades={[]}
    soloLectura={false}
    api={{
      listarRubros: async () => ({ ok: true, cuerpo: { items: rubros } }),
      listarCategoriasRubro: async () => ({ ok: true, cuerpo: { items: categorias } }),
      crearCategoriaRubro,
      crearRubro,
    }}
  />);

  const sec = within(await screen.findByRole("region", { name: "Categorías" }));
  fireEvent.change(sec.getByLabelText("Nombre de la categoría"), { target: { value: "Reina" } });
  fireEvent.click(sec.getByRole("button", { name: "Agregar categoría" }));

  expect(await sec.findByRole("heading", { name: "Reina" })).toBeVisible();
  expect(crearCategoriaRubro).toHaveBeenCalledWith("e1", "v1", { nombre: "Reina", orden: 1 });

  const formulario = screen.getByRole("button", { name: "Agregar rubro" }).closest("form");
  const rubroForm = within(formulario);
  fireEvent.change(rubroForm.getByLabelText("Nombre del rubro"), { target: { value: "Reina de Comparsas" } });
  fireEvent.change(rubroForm.getByLabelText("Categoría"), { target: { value: "cat-reina" } });
  fireEvent.click(rubroForm.getByRole("button", { name: "Agregar rubro" }));

  await screen.findByText(/Rubro «Reina de Comparsas» creado/);
  expect(crearRubro).toHaveBeenCalledWith("e1", "v1", expect.objectContaining({
    nombre: "Reina de Comparsas", categoriaId: "cat-reina",
  }));
  expect(await screen.findByText(/Categoría: Reina/)).toBeVisible();
});
