import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PlanillasNoche } from "./PlanillasNoche.jsx";

const edicion = { id: "ed1", nombre: "Carnaval", anio: 2027 };

const ok = (cuerpo) => ({ ok: true, status: 200, cuerpo });

function noches(estado = "DRAFT") {
  return ok({
    items: [
      { id: "n1", nombre: "Primera noche", tipo: "COMPETENCIA", estado, orden: 1 },
      { id: "n2", nombre: "Premiación", tipo: "PREMIACION", estado: "DRAFT", orden: 2 },
    ],
  });
}

const especialidades = ok({ items: [{ id: "e1", nombre: "Vestuario", codigo: "J1", activa: true, orden: 1 }] });

const candidatas = [
  { id: "f1", rubroNombre: "Traje", comparsaNombre: "Alfa" },
  { id: "f2", rubroNombre: "Traje", comparsaNombre: "Beta" },
];

function crearApi({ noche = "DRAFT", versionesRespuesta } = {}) {
  return {
    listarNochesEdicion: vi.fn(async () => noches(noche)),
    listarEspecialidadesEdicion: vi.fn(async () => especialidades),
  };
}

function crearPlanillas({ seleccion = { configurada: false, filaIds: ["f1", "f2"] }, versiones, guardar } = {}) {
  return {
    listarVersiones: vi.fn(async () => versiones ?? ok({ items: [{ id: "v2", numero: 2, estado: "BORRADOR" }] })),
    obtenerSeleccion: vi.fn(async () => ok(seleccion)),
    listarCandidatas: vi.fn(async () => ok({ items: candidatas })),
    guardarSeleccion: guardar ?? vi.fn(async (_e, _v, _n, _x, filaIds) => ok({ configurada: true, filaIds })),
  };
}

describe("PlanillasNoche", () => {
  it("muestra la propuesta del desfile cuando no hay selección guardada", async () => {
    render(<PlanillasNoche edicion={edicion} api={crearApi()} planillas={crearPlanillas()} />);

    expect(await screen.findByText("Filas a evaluar (2 de 2)")).toBeInTheDocument();
    expect(screen.getByText(/Sin selección guardada/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Traje · Alfa" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Traje · Beta" })).toBeChecked();
  });

  it("pide confirmación y envía solo las filas marcadas en orden de desfile", async () => {
    const user = userEvent.setup();
    const planillas = crearPlanillas();
    render(<PlanillasNoche edicion={edicion} api={crearApi()} planillas={planillas} />);

    await user.click(await screen.findByRole("checkbox", { name: "Traje · Beta" }));
    await user.click(screen.getByRole("button", { name: "Guardar selección" }));

    const dialogo = await screen.findByRole("dialog", { name: "Guardar planilla" });
    expect(within(dialogo).getByText(/Vas a guardar 1 fila\(s\)/)).toBeInTheDocument();
    await user.click(within(dialogo).getByRole("button", { name: "Confirmar guardado" }));

    await waitFor(() => expect(planillas.guardarSeleccion).toHaveBeenCalledWith("ed1", "v2", "n1", "e1", ["f1"]));
    expect(await screen.findByText("Guardado correctamente.")).toBeInTheDocument();
  });

  it("una lista vacía exige confirmación explícita y Cancelar no llama a la API", async () => {
    const user = userEvent.setup();
    const planillas = crearPlanillas();
    render(<PlanillasNoche edicion={edicion} api={crearApi()} planillas={planillas} />);

    await user.click(await screen.findByRole("checkbox", { name: "Traje · Alfa" }));
    await user.click(screen.getByRole("checkbox", { name: "Traje · Beta" }));
    await user.click(screen.getByRole("button", { name: "Guardar selección" }));

    const dialogo = await screen.findByRole("dialog", { name: "Confirmar lista vacía" });
    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(planillas.guardarSeleccion).not.toHaveBeenCalled();
  });

  it("una noche que ya no está en borrador es de solo lectura", async () => {
    render(<PlanillasNoche edicion={edicion} api={crearApi({ noche: "OPEN" })} planillas={crearPlanillas()} />);

    expect(await screen.findByText(/solo lectura/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Traje · Alfa" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Guardar selección" })).not.toBeInTheDocument();
  });

  it("un error al cargar las versiones muestra alerta y permite reintentar", async () => {
    const user = userEvent.setup();
    const planillas = crearPlanillas();
    planillas.listarVersiones
      .mockResolvedValueOnce({ ok: false, status: 503, cuerpo: { mensaje: "Servicio no disponible." } })
      .mockResolvedValueOnce(ok({ items: [{ id: "v2", numero: 2, estado: "BORRADOR" }] }));
    render(<PlanillasNoche edicion={edicion} api={crearApi()} planillas={planillas} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Servicio no disponible.");
    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByText("Filas a evaluar (2 de 2)")).toBeInTheDocument();
    expect(planillas.listarVersiones).toHaveBeenCalledTimes(2);
  });

  it("un rechazo de la API al guardar se muestra y no confirma la selección", async () => {
    const user = userEvent.setup();
    const planillas = crearPlanillas({
      guardar: vi.fn(async () => ({ ok: false, status: 409, cuerpo: { mensaje: "La noche ya no está en borrador." } })),
    });
    render(<PlanillasNoche edicion={edicion} api={crearApi()} planillas={planillas} />);

    await user.click(await screen.findByRole("button", { name: "Guardar selección" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Confirmar guardado" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("La noche ya no está en borrador.");
    expect(screen.queryByText("Selección guardada.")).not.toBeInTheDocument();
  });

  it("sin versiones de reglamento explica qué falta en vez de mostrar un panel vacío", async () => {
    render(<PlanillasNoche edicion={edicion} api={crearApi()} planillas={crearPlanillas({ versiones: ok({ items: [] }) })} />);

    expect(await screen.findByText(/Todavía no hay reglamento/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar selección" })).not.toBeInTheDocument();
  });
});
