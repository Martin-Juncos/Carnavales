/*
 * Pruebas del alta de integrantes en una comparsa: se elige la categoría del reglamento, se
 * escribe el nombre una sola vez y se marcan los rubros de esa categoría en los que está
 * nominado. El participante se crea una única vez. Depende de ConfiguracionEdicion,
 * Testing Library y vitest.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ConfiguracionEdicion } from "./components/ConfiguracionEdicion/ConfiguracionEdicion.jsx";

const edicionBase = {
  id: "e1",
  nombre: "Carnaval",
  anio: 2027,
  estado: "CONFIGURING",
  version: { id: "v1", numero: 1, estado: "BORRADOR" },
};

const categorias = [{ id: "cat-reina", nombre: "Reina", orden: 1 }];

const rubros = [
  { id: "r-reina", nombre: "Reina de Comparsas", tipoSujeto: "PERSONA", tipoRubro: "NOMINATIVO", categoriaId: "cat-reina", especialidadIds: ["esp1"] },
  { id: "r-porta", nombre: "Mejor Porta Estandarte", tipoSujeto: "PERSONA", tipoRubro: "NOMINATIVO", categoriaId: "cat-reina", especialidadIds: ["esp1"] },
  { id: "r-otro", nombre: "Mejor Traje Femenino", tipoSujeto: "PERSONA", tipoRubro: "NOMINATIVO", categoriaId: null, especialidadIds: ["esp1"] },
  { id: "r-bat", nombre: "Batería", tipoSujeto: "BATERIA", tipoRubro: "NOMINATIVO", categoriaId: "cat-reina", especialidadIds: ["esp1"] },
];

function montar() {
  let filasPlanilla = [];
  const crearParticipante = vi.fn(async (_e, cuerpo) => ({ ok: true, cuerpo: { ...cuerpo, id: "p-ana" } }));
  const crearSujetoComparsa = vi.fn(async (_e, _c, cuerpo) => ({ ok: true, cuerpo: { ...cuerpo, id: "s-ana" } }));
  const crearCategoriaRubro = vi.fn(async (_e, _v, cuerpo) => ({ ok: true, cuerpo: { ...cuerpo, id: "cat-porta" } }));
  const nominarEnRubro = vi.fn(async (_e, _v, rubroId, { sujetoId, especialidadId }) => {
    const fila = {
      id: `f-${rubroId}`, rubroId, sujetoId, sujetoNombre: "Ana Gómez", comparsaId: "c1",
      comparsaNombre: "Poramba", especialidadId, origen: "MANUAL", excluida: false,
    };
    filasPlanilla = [...filasPlanilla, fila];
    return { ok: true, cuerpo: fila };
  });

  render(<ConfiguracionEdicion
    edicion={edicionBase}
    alVolver={() => {}}
    api={{
      listarNochesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarEspecialidadesEdicion: async () => ({ ok: true, cuerpo: { items: [] } }),
      listarComparsas: async () => ({
        ok: true,
        cuerpo: { items: [{ id: "c1", nombre: "Poramba", categoria: "PRIMERA", activa: true }] },
      }),
      listarCategoriasRubro: async () => ({ ok: true, cuerpo: { items: categorias } }),
      crearCategoriaRubro,
      listarRubros: async () => ({ ok: true, cuerpo: { items: rubros } }),
      listarPlanillaVersion: async () => ({ ok: true, cuerpo: { items: filasPlanilla } }),
      crearParticipante,
      crearSujetoComparsa,
      nominarEnRubro,
    }}
  />);

  return { crearParticipante, crearSujetoComparsa, nominarEnRubro, crearCategoriaRubro };
}

async function abrirIntegrantes() {
  fireEvent.click(screen.getByRole("button", { name: /Comparsas y orden/ }));
  const secComparsas = within(await screen.findByRole("region", { name: "Comparsas" }));
  fireEvent.click(secComparsas.getByRole("button", { name: "Participantes de Poramba" }));
  return within(await screen.findByRole("region", { name: "Participantes de Poramba" }));
}

// Escribe o elige la categoría del integrante por su nombre.
function elegirCategoria(sec, nombre) {
  fireEvent.change(sec.getByLabelText("Categoría"), { target: { value: nombre } });
}

test("elegir la categoría muestra solo sus rubros y el integrante se nomina en los marcados", async () => {
  const { crearParticipante, crearSujetoComparsa, nominarEnRubro } = montar();
  const sec = await abrirIntegrantes();

  // No aparece un campo de nombre por rubro: el formulario es único.
  expect(sec.queryByLabelText(/Nombre para/)).toBeNull();

  fireEvent.change(sec.getByLabelText("Nombre del integrante"), { target: { value: "Ana Gómez" } });
  elegirCategoria(sec, "Reina");

  // Solo los rubros de la categoría Reina; Batería (de otro tipo) y Traje Femenino (sin categoría) no aparecen.
  const rubrosDelIntegrante = within(sec.getByRole("group", { name: "Rubros en los que está nominado" }));
  expect(rubrosDelIntegrante.queryByRole("checkbox", { name: "Mejor Traje Femenino" })).toBeNull();
  expect(rubrosDelIntegrante.queryByRole("checkbox", { name: "Batería" })).toBeNull();
  fireEvent.click(rubrosDelIntegrante.getByRole("checkbox", { name: "Reina de Comparsas" }));
  fireEvent.click(rubrosDelIntegrante.getByRole("checkbox", { name: "Mejor Porta Estandarte" }));
  fireEvent.click(sec.getByRole("button", { name: "Agregar integrante" }));

  const grupoAna = within(await sec.findByRole("group", { name: "Rubros de Ana Gómez" }));
  expect(grupoAna.getByRole("checkbox", { name: "Reina de Comparsas" })).toBeChecked();
  expect(grupoAna.getByRole("checkbox", { name: "Mejor Porta Estandarte" })).toBeChecked();
  // La categoría del integrante se deduce de los rubros en los que está nominado.
  expect(sec.getByText("Reina", { selector: "p" })).toBeVisible();

  expect(crearParticipante).toHaveBeenCalledTimes(1);
  expect(crearParticipante).toHaveBeenCalledWith("e1", { nombreCompleto: "Ana Gómez", esMenor: false, activo: true });
  expect(crearSujetoComparsa).toHaveBeenCalledTimes(1);
  expect(nominarEnRubro).toHaveBeenCalledTimes(2);
  expect(nominarEnRubro).toHaveBeenCalledWith("e1", "v1", "r-reina", { sujetoId: "s-ana", especialidadId: "esp1" });
  expect(nominarEnRubro).toHaveBeenCalledWith("e1", "v1", "r-porta", { sujetoId: "s-ana", especialidadId: "esp1" });
});

test("escribir una categoría que no existe la crea en el reglamento, sin rubros todavía", async () => {
  const { crearCategoriaRubro } = montar();
  const sec = await abrirIntegrantes();

  elegirCategoria(sec, "Porta");
  fireEvent.click(sec.getByRole("button", { name: "Crear categoría «Porta»" }));

  expect(await screen.findByText(/Categoría «Porta» creada/)).toBeVisible();
  expect(crearCategoriaRubro).toHaveBeenCalledWith("e1", "v1", { nombre: "Porta", orden: 2 });
  // Sin rubros aún: la categoría nueva se completa en la etapa Reglamento y puntajes.
  expect(sec.getByText(/Creá sus rubros en la etapa Reglamento y puntajes/)).toBeVisible();
  expect(sec.queryByRole("checkbox", { name: "Reina de Comparsas" })).toBeNull();
});

test("no se puede agregar un integrante sin elegir al menos un rubro", async () => {
  const { crearParticipante } = montar();
  const sec = await abrirIntegrantes();

  fireEvent.change(sec.getByLabelText("Nombre del integrante"), { target: { value: "Ana Gómez" } });
  elegirCategoria(sec, "Reina");
  fireEvent.click(sec.getByRole("button", { name: "Agregar integrante" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Elegí al menos un rubro para el integrante.");
  expect(crearParticipante).not.toHaveBeenCalled();
});
