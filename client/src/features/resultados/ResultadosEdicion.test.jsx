import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { crearClienteApi } from "../../shared/api/cliente-api.js";
import { PanelEdiciones } from "../admin/ediciones/PanelEdiciones.jsx";
import { PanelEscribano } from "../escribano/PanelEscribano.jsx";

test("the resultados client posts explicit JSON confirmations", async () => {
  const fetch = vi.fn(async () => Response.json({ id: "calc1" }));
  const api = crearClienteApi(fetch);
  await api.calcularResultados("e1");
  expect(fetch).toHaveBeenCalledWith("/api/escribano/ediciones/e1/resultados/calcular", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmar: true }),
  });
  await api.resolverEmpate("e1", "calc1", "emp1", { ganadorId: "c1", motivoResolucion: "Sorteo", referenciaActa: "Acta 9" });
  expect(fetch).toHaveBeenCalledWith("/api/escribano/ediciones/e1/resultados/calc1/empates/emp1/resolver", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ganadorId: "c1", motivoResolucion: "Sorteo", referenciaActa: "Acta 9", confirmar: true }),
  });
  await api.publicarResultados("e1", "calc1");
  expect(fetch).toHaveBeenLastCalledWith("/api/escribano/ediciones/e1/resultados/calc1/publicar", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmar: true }),
  });
});

test("the Escribano calculates, resolves a pending tie, and publishes official results", async () => {
  const edicion = { id: "e1", nombre: "Carnaval 2027", anio: 2027, estado: "CLOSED", cerradaEn: "2026-11-24T12:00:00Z" };
  const empatePendiente = {
    id: "emp1", ambito: "COMPARSA", rubro: null, posicionEmpatada: 1, puntajeEmpatado: 20,
    estado: "PENDIENTE",
    candidatos: [{ id: "c1", nombre: "Aymara" }, { id: "c2", nombre: "Poramba" }],
    resolucion: null,
  };
  const empateResuelto = {
    ...empatePendiente, estado: "RESUELTO",
    resolucion: { ganadorId: "c1", motivo: "Desempate oficial", referenciaActa: "Acta 90", resueltoEn: "2026-11-24T12:15:00Z" },
  };
  const snapshotConEmpate = {
    id: "calc1", edicionId: "e1", versionReglamentoId: "v1", numero: 1, algoritmo: "GOYA_2026_V1",
    parametros: { maxCarrosComparsa: 2, categoriasGenerales: ["PRIMERA"] },
    hashEntradas: "a".repeat(64), estado: "CALCULADO",
    calculadoEn: "2026-11-24T12:10:00Z", publicadoEn: null,
    comparsas: [
      { comparsa: { id: "c1", nombre: "Aymara", categoria: "PRIMERA" }, puntajeFijos: 10, puntajeNominativos: 5, puntajeCarros: 5, descuentoRubros: 0, descuentoGeneral: 0, puntajeTotal: 20, descalificadaComparsa: false, posicion: 1, empatado: true },
      { comparsa: { id: "c2", nombre: "Poramba", categoria: "PRIMERA" }, puntajeFijos: 10, puntajeNominativos: 5, puntajeCarros: 5, descuentoRubros: 0, descuentoGeneral: 0, puntajeTotal: 20, descalificadaComparsa: false, posicion: 1, empatado: true },
    ],
    rubros: [],
    empates: [empatePendiente],
  };
  const snapshotPublicado = { ...snapshotConEmpate, estado: "PUBLICADO", publicadoEn: "2026-11-24T12:20:00Z", empates: [empateResuelto] };

  const api = {
    listarNochesEscribano: async () => ({ ok: true, cuerpo: { items: [] } }),
    consultarCierreNoche: vi.fn(),
    cerrarNoche: vi.fn(),
    listarEdicionesEscribano: async () => ({ ok: true, cuerpo: { items: [edicion] } }),
    consultarCierreTotal: vi.fn(),
    cerrarVotacionTotal: vi.fn(),
    obtenerResultadosEdicion: vi.fn().mockResolvedValue({ ok: true, cuerpo: { edicion, snapshots: [], activo: null } }),
    obtenerPuntajesDetallados: vi.fn().mockResolvedValue({ ok: true, cuerpo: { edicion, items: [] } }),
    calcularResultados: vi.fn().mockResolvedValue({ ok: true, status: 201, cuerpo: snapshotConEmpate }),
    resolverEmpate: vi.fn().mockResolvedValue({ ok: true, status: 200, cuerpo: empateResuelto }),
    publicarResultados: vi.fn().mockResolvedValue({ ok: true, status: 200, cuerpo: snapshotPublicado }),
  };

  render(<PanelEscribano api={api} />);
  const seccion = screen.getByRole("region", { name: "Resultados y publicación" });
  fireEvent.click(await within(seccion).findByRole("button", { name: /Carnaval 2027 · 2027/ }));
  await within(seccion).findByText("Todavía no se calcularon resultados para esta edición.");

  fireEvent.click(within(seccion).getByRole("button", { name: "Calcular resultados" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar cálculo" }));

  await within(seccion).findByText("Aymara");
  const botonPublicar = within(seccion).getByRole("button", { name: "Publicar resultados oficiales" });
  expect(botonPublicar).toBeDisabled();

  fireEvent.click(within(seccion).getByRole("button", { name: "Resolver empate" }));
  const modalEmpate = screen.getByRole("dialog");
  fireEvent.change(within(modalEmpate).getByLabelText("Motivo de resolución"), { target: { value: "Desempate oficial" } });
  fireEvent.change(within(modalEmpate).getByLabelText("Referencia de acta"), { target: { value: "Acta 90" } });
  fireEvent.click(within(modalEmpate).getByRole("button", { name: "Confirmar resolución" }));

  await within(seccion).findByText(/Desempate oficial/);
  expect(botonPublicar).toBeEnabled();

  fireEvent.click(botonPublicar);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirmar publicación" }));
  await within(seccion).findByText("Resultados publicados oficialmente.");
  expect(api.publicarResultados).toHaveBeenCalledExactlyOnceWith("e1", "calc1");
});

test("Administrator views read-only results for a CLOSED edition without mutation buttons", async () => {
  const edicion = { id: "e1", nombre: "Carnaval", anio: 2027, estado: "CLOSED", cerradaEn: "2026-11-24T12:00:00Z" };
  const snapshot = {
    id: "calc1", edicionId: "e1", versionReglamentoId: "v1", numero: 1, algoritmo: "GOYA_2026_V1",
    parametros: { maxCarrosComparsa: 2 }, hashEntradas: "b".repeat(64), estado: "PUBLICADO",
    calculadoEn: "2026-11-24T12:10:00Z", publicadoEn: "2026-11-24T12:20:00Z",
    comparsas: [
      { comparsa: { id: "c1", nombre: "Aymara", categoria: "PRIMERA" }, puntajeFijos: 12, puntajeNominativos: 5, puntajeCarros: 9, descuentoRubros: 2, descuentoGeneral: 5, puntajeTotal: 21, descalificadaComparsa: false, posicion: 1, empatado: false },
    ],
    rubros: [],
    empates: [],
  };
  render(<PanelEdiciones api={{
    listarEdiciones: async () => ({ ok: true, cuerpo: { items: [edicion] } }),
    obtenerResultadosEdicion: async () => ({ ok: true, cuerpo: { edicion, snapshots: [snapshot], activo: snapshot } }),
    obtenerPuntajesDetallados: async () => ({ ok: true, cuerpo: { edicion, items: [] } }),
  }} />);

  fireEvent.click(await screen.findByRole("button", { name: "Ver resultados Carnaval 2027" }));
  await screen.findByText("Resultados publicados oficialmente.");
  expect(screen.getByText("Aymara")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Calcular resultados" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Publicar resultados oficiales" })).toBeNull();
});
