/*
 * Pruebas de la numeración de los rubros: al borrar uno, los que quedan se renumeran sin huecos
 * (3 rubros y se borra el 2 → quedan 1 y 2). Depende de PasoReglamento, Testing Library y vitest.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { PasoReglamento } from "./PasoReglamento.jsx";

const edicion = { id: "e1", nombre: "Carnaval", anio: 2027, estado: "CONFIGURING" };
const versionActiva = { id: "v1", numero: 1, estado: "BORRADOR" };

test("al borrar un rubro, los que quedan se renumeran sin huecos", async () => {
  let rubros = [
    { id: "r1", nombre: "Reina de Comparsas", orden: 1, tipoSujeto: "PERSONA", tipoRubro: "NOMINATIVO", especialidadIds: [] },
    { id: "r2", nombre: "Reina del Carnaval", orden: 2, tipoSujeto: "PERSONA", tipoRubro: "NOMINATIVO", especialidadIds: [] },
    { id: "r3", nombre: "Mejor Traje Femenino", orden: 3, tipoSujeto: "PERSONA", tipoRubro: "NOMINATIVO", especialidadIds: [] },
  ];
  const eliminarRubro = vi.fn(async (_e, _v, rubroId) => {
    rubros = rubros.filter((r) => r.id !== rubroId);
    return { ok: true, cuerpo: null };
  });
  const reordenarRubros = vi.fn(async (_e, _v, items) => {
    rubros = rubros.map((r) => {
      const nuevo = items.find((i) => i.rubroId === r.id);
      return nuevo ? { ...r, orden: nuevo.orden } : r;
    });
    return { ok: true, cuerpo: { items } };
  });

  render(<PasoReglamento
    edicion={edicion}
    versionActiva={versionActiva}
    especialidades={[]}
    soloLectura={false}
    api={{
      listarRubros: async () => ({ ok: true, cuerpo: { items: rubros } }),
      eliminarRubro,
      reordenarRubros,
    }}
  />);

  await screen.findByText("3. Mejor Traje Femenino");
  fireEvent.click(screen.getByRole("button", { name: "Eliminar rubro Reina del Carnaval" }));
  fireEvent.click(within(screen.getByRole("dialog", { name: "Eliminar rubro" })).getByRole("button", { name: "Confirmar eliminación" }));

  await waitFor(() => expect(eliminarRubro).toHaveBeenCalledWith("e1", "v1", "r2"));
  await waitFor(() => expect(reordenarRubros).toHaveBeenCalledWith("e1", "v1", [{ rubroId: "r3", orden: 2 }]));
  expect(await screen.findByText("2. Mejor Traje Femenino")).toBeVisible();
  expect(screen.queryByText("3. Mejor Traje Femenino")).toBeNull();
});
