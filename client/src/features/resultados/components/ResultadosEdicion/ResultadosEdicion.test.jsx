import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { crearClienteApi } from "../../../../shared/api/cliente-api.js";
import { PanelEdiciones } from "../../../admin/ediciones/components/PanelEdiciones/PanelEdiciones.jsx";
import { PanelEscribano } from "../../../escribano/components/PanelEscribano/PanelEscribano.jsx";
import { VistaResultadosEdicion } from "./ResultadosEdicion.jsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

// jsdom no implementa URL.createObjectURL: se refleja el guardado del blob sin descargar archivos.
Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:acta"), configurable: true });
Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

const edicionActas = { id: "e1", nombre: "Carnaval", anio: 2027, estado: "CLOSED" };
const calculoPublicado = {
  id: "calc1", numero: 1, estado: "PUBLICADO", hashEntradas: "b".repeat(64),
  comparsas: [], rubros: [], empates: [],
};
const actaEmitida = {
  id: "acta1", edicionId: "e1", calculoId: "calc1", numero: 1,
  generadaEn: "2026-11-24T12:30:00.000Z",
  representaciones: [
    { formato: "PDF", contentType: "application/pdf", tamanioBytes: 1024, sha256: "a".repeat(64) },
    { formato: "CSV", contentType: "text/csv; charset=utf-8", tamanioBytes: 256, sha256: "b".repeat(64) },
  ],
};
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";

function apiConActas({ items = [], ...metodos } = {}) {
  return {
    obtenerResultadosEdicion: async () => ({
      ok: true, cuerpo: { edicion: edicionActas, snapshots: [calculoPublicado], activo: calculoPublicado },
    }),
    listarActas: vi.fn(async () => ({ ok: true, cuerpo: { items } })),
    ...metodos,
  };
}

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

  // Estado del servidor: cada mutación deja el snapshot vigente que la consulta posterior devuelve.
  let vigente = null;
  const api = {
    listarNochesEscribano: async () => ({ ok: true, cuerpo: { items: [] } }),
    consultarCierreNoche: vi.fn(),
    cerrarNoche: vi.fn(),
    listarEdicionesEscribano: async () => ({ ok: true, cuerpo: { items: [edicion] } }),
    consultarCierreTotal: vi.fn(),
    cerrarVotacionTotal: vi.fn(),
    obtenerResultadosEdicion: vi.fn(async () => ({
      ok: true,
      cuerpo: { edicion, snapshots: vigente ? [vigente] : [], activo: vigente },
    })),
    obtenerPuntajesDetallados: vi.fn().mockResolvedValue({ ok: true, cuerpo: { edicion, items: [] } }),
    calcularResultados: vi.fn(async () => {
      vigente = snapshotConEmpate;
      return { ok: true, status: 201, cuerpo: snapshotConEmpate };
    }),
    resolverEmpate: vi.fn(async () => {
      vigente = { ...snapshotConEmpate, empates: [empateResuelto] };
      return { ok: true, status: 200, cuerpo: empateResuelto };
    }),
    publicarResultados: vi.fn(async () => {
      vigente = snapshotPublicado;
      return { ok: true, status: 200, cuerpo: snapshotPublicado };
    }),
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
  expect(screen.getAllByText("Aymara").length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: "Calcular resultados" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Publicar resultados oficiales" })).toBeNull();
});

test("after recalculating, choosing an older snapshot reloads it", async () => {
  const edicion = { id: "e1", nombre: "Carnaval 2027", anio: 2027, estado: "CLOSED", cerradaEn: "2026-11-24T12:00:00Z" };
  const base = {
    edicionId: "e1", versionReglamentoId: "v1", algoritmo: "GOYA_2026_V1",
    parametros: { maxCarrosComparsa: 2, categoriasGenerales: ["PRIMERA"] },
    hashEntradas: "a".repeat(64), publicadoEn: null, comparsas: [], rubros: [], empates: [],
  };
  const snap1 = { ...base, id: "calc1", numero: 1, estado: "CALCULADO", calculadoEn: "2026-11-24T12:10:00Z" };
  const snap2 = { ...base, id: "calc2", numero: 2, estado: "CALCULADO", calculadoEn: "2026-11-24T12:20:00Z" };
  const snap3 = { ...base, id: "calc3", numero: 3, estado: "CALCULADO", calculadoEn: "2026-11-24T12:30:00Z" };
  const porId = { calc1: snap1, calc2: snap2, calc3: snap3 };
  let historial = [snap2, snap1];

  const api = {
    obtenerResultadosEdicion: vi.fn(async (_edicionId, calculoId) => ({
      ok: true,
      cuerpo: { edicion, snapshots: historial, activo: porId[calculoId ?? "calc2"] },
    })),
    calcularResultados: vi.fn(async () => {
      historial = [snap3, snap2, snap1];
      return { ok: true, status: 201, cuerpo: snap3 };
    }),
    obtenerPuntajesDetallados: async () => ({ ok: true, cuerpo: { edicion, items: [] } }),
  };

  render(<VistaResultadosEdicion api={api} edicion={edicion} puedeOperar />);
  await screen.findByText(/Snapshot #2 calculado/);

  const selector = screen.getByLabelText("Snapshot");
  fireEvent.change(selector, { target: { value: "calc1" } });
  await screen.findByText(/Snapshot #1 calculado/);

  fireEvent.click(screen.getByRole("button", { name: "Recalcular nuevo snapshot" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cálculo" }));
  await screen.findByText(/Snapshot #3 calculado/);

  fireEvent.change(screen.getByLabelText("Snapshot"), { target: { value: "calc1" } });
  await screen.findByText(/Snapshot #1 calculado/);
  expect(api.obtenerResultadosEdicion).toHaveBeenLastCalledWith("e1", "calc1");
});

test("el podio muestra Reina, princesas y comparsa ganadora según los rankings publicados", async () => {
  const edicion = { id: "e1", nombre: "Carnaval", anio: 2027, estado: "CLOSED" };
  const snapshot = {
    id: "calc1", numero: 1, estado: "PUBLICADO", hashEntradas: "b".repeat(64),
    comparsas: [
      { comparsa: { id: "c1", nombre: "Aymara" }, puntajeFijos: 12, puntajeNominativos: 5, puntajeCarros: 9, descuentoGeneral: 5, puntajeTotal: 21, descalificadaComparsa: false, posicion: 1, empatado: false },
      { comparsa: { id: "c2", nombre: "Poramba" }, puntajeFijos: 10, puntajeNominativos: 5, puntajeCarros: 9, descuentoGeneral: 5, puntajeTotal: 19, descalificadaComparsa: false, posicion: 2, empatado: false },
      { comparsa: { id: "c3", nombre: "Tundra" }, puntajeFijos: 8, puntajeNominativos: 5, puntajeCarros: 9, descuentoGeneral: 5, puntajeTotal: 17, descalificadaComparsa: false, posicion: 3, empatado: false },
    ],
    rubros: [{
      rubro: { id: "r1", codigo: "R1", nombre: "Reina del Carnaval" },
      resultados: [
        { sujeto: { id: "s1", nombre: "Ester" }, comparsa: { nombre: "Aymara" }, posicion: 1, puntajeArtistico: 15, descuentoRubro: 0, puntajeNeto: 15 },
        { sujeto: { id: "s2", nombre: "María" }, comparsa: { nombre: "Poramba" }, posicion: 2, puntajeArtistico: 14, descuentoRubro: 0, puntajeNeto: 14 },
        { sujeto: { id: "s3", nombre: "Ana" }, comparsa: { nombre: "Aymara" }, posicion: 3, puntajeArtistico: 13, descuentoRubro: 0, puntajeNeto: 13 },
      ],
    }],
    empates: [],
  };

  render(<VistaResultadosEdicion api={{
    obtenerResultadosEdicion: async () => ({ ok: true, cuerpo: { edicion, snapshots: [snapshot], activo: snapshot } }),
  }} edicion={edicion} />);

  const podio = await screen.findByRole("region", { name: "Podio oficial" });
  expect(within(podio).getByRole("heading", { name: "Reina del Carnaval" })).toBeVisible();
  expect(within(podio).getByText(/Ester · Aymara/)).toBeVisible();
  expect(within(podio).getByText("Primera Princesa")).toBeVisible();
  expect(within(podio).getByText(/María · Poramba/)).toBeVisible();
  expect(within(podio).getByText("Segunda Princesa")).toBeVisible();
  expect(within(podio).getByText(/Ana · Aymara/)).toBeVisible();
  expect(within(podio).getByText("Comparsa ganadora")).toBeVisible();
  expect(within(podio).getByText(/^21,00 pts$/)).toBeVisible();
});

test("el podio no adjudica un puesto empatado sin resolver", async () => {
  const edicion = { id: "e1", nombre: "Carnaval", anio: 2027, estado: "CLOSED" };
  const snapshot = {
    id: "calc1", numero: 1, estado: "CALCULADO", hashEntradas: "b".repeat(64),
    comparsas: [],
    rubros: [{
      rubro: { id: "r1", codigo: "R1", nombre: "Reina del Carnaval" },
      resultados: [
        { sujeto: { id: "s1", nombre: "Ester" }, comparsa: { nombre: "Aymara" }, posicion: 1, puntajeArtistico: 15, descuentoRubro: 0, puntajeNeto: 15, empatado: true },
        { sujeto: { id: "s2", nombre: "María" }, comparsa: { nombre: "Poramba" }, posicion: 1, puntajeArtistico: 15, descuentoRubro: 0, puntajeNeto: 15, empatado: true },
      ],
    }],
    empates: [{
      id: "emp1", ambito: "RUBRO", rubro: { id: "r1", codigo: "R1", nombre: "Reina del Carnaval" },
      posicionEmpatada: 1, puntajeEmpatado: 15, estado: "PENDIENTE",
      candidatos: [{ id: "s1", nombre: "Ester" }, { id: "s2", nombre: "María" }], resolucion: null,
    }],
  };

  render(<VistaResultadosEdicion api={{
    obtenerResultadosEdicion: async () => ({ ok: true, cuerpo: { edicion, snapshots: [snapshot], activo: snapshot } }),
  }} edicion={edicion} />);

  const podio = await screen.findByRole("region", { name: "Podio oficial" });
  expect(within(podio).getByText(/Empate en 1.º puesto: Ester, María/)).toBeVisible();
  expect(within(podio).queryByText(/Ester · Aymara/)).toBeNull();
});

test("el podio usa la resolución oficial de empate para adjudicar reina y comparsa", async () => {
  const edicion = { id: "e1", nombre: "Carnaval", anio: 2027, estado: "CLOSED" };
  const snapshot = {
    id: "calc1", numero: 1, estado: "CALCULADO", hashEntradas: "b".repeat(64),
    comparsas: [
      { comparsa: { id: "c1", nombre: "Aymara" }, puntajeFijos: 10, puntajeNominativos: 5, puntajeCarros: 5, descuentoGeneral: 0, puntajeTotal: 20, descalificadaComparsa: false, posicion: 1, empatado: true },
      { comparsa: { id: "c2", nombre: "Poramba" }, puntajeFijos: 10, puntajeNominativos: 5, puntajeCarros: 5, descuentoGeneral: 0, puntajeTotal: 20, descalificadaComparsa: false, posicion: 1, empatado: true },
    ],
    rubros: [{
      rubro: { id: "r1", codigo: "R1", nombre: "Reina del Carnaval" },
      resultados: [
        { sujeto: { id: "s1", nombre: "Ester" }, comparsa: { nombre: "Aymara" }, posicion: 1, puntajeArtistico: 15, descuentoRubro: 0, puntajeNeto: 15, empatado: true },
        { sujeto: { id: "s2", nombre: "María" }, comparsa: { nombre: "Poramba" }, posicion: 1, puntajeArtistico: 15, descuentoRubro: 0, puntajeNeto: 15, empatado: true },
      ],
    }],
    empates: [
      {
        id: "e1", ambito: "RUBRO", rubro: { id: "r1", codigo: "R1", nombre: "Reina del Carnaval" },
        posicionEmpatada: 1, puntajeEmpatado: 15, estado: "RESUELTO",
        candidatos: [{ id: "s1", nombre: "Ester" }, { id: "s2", nombre: "María" }],
        resolucion: { ganadorId: "s2", motivo: "Desempate oficial", referenciaActa: "Acta 90" },
      },
      {
        id: "e2", ambito: "COMPARSA", rubro: null,
        posicionEmpatada: 1, puntajeEmpatado: 20, estado: "RESUELTO",
        candidatos: [{ id: "c1", nombre: "Aymara" }, { id: "c2", nombre: "Poramba" }],
        resolucion: { ganadorId: "c2", motivo: "Desempate oficial", referenciaActa: "Acta 91" },
      },
    ],
  };

  render(<VistaResultadosEdicion api={{
    obtenerResultadosEdicion: async () => ({ ok: true, cuerpo: { edicion, snapshots: [snapshot], activo: snapshot } }),
  }} edicion={edicion} />);

  const podio = await screen.findByRole("region", { name: "Podio oficial" });
  expect(within(podio).getByText(/María · Poramba/)).toBeVisible();
  expect(within(podio).getAllByText("Resuelto por empate").length).toBe(1);
  expect(within(podio).getAllByText(/Poramba/).length).toBeGreaterThan(1);
});

test("la planilla de resultados organiza el escrutinio en bloques con tablas desplazables", async () => {
  const edicion = { id: "e1", nombre: "Carnaval", anio: 2027, estado: "CLOSED" };
  const snapshot = {
    id: "calc1", numero: 1, estado: "PUBLICADO", hashEntradas: "b".repeat(64),
    comparsas: [{
      comparsa: { id: "c1", nombre: "Aymara" }, puntajeFijos: 12, puntajeNominativos: 5,
      puntajeCarros: 9, descuentoGeneral: 5, puntajeTotal: 21,
      descalificadaComparsa: false, posicion: 1, empatado: false,
    }],
    rubros: [{
      rubro: { id: "r1", codigo: "R1", nombre: "Vestuario" },
      resultados: [{
        sujeto: { id: "s1", nombre: "Ester" }, comparsa: { nombre: "Aymara" },
        posicion: 1, puntajeArtistico: 10, descuentoRubro: 0, puntajeNeto: 10,
      }],
    }],
    empates: [],
  };

  render(<VistaResultadosEdicion api={{
    obtenerResultadosEdicion: async () => ({ ok: true, cuerpo: { edicion, snapshots: [snapshot], activo: snapshot } }),
  }} edicion={edicion} />);

  const total = (await screen.findByText("21,00")).closest("td");
  expect(total?.className).toMatch(/tablaTotal/);
  expect(total?.closest("table")?.parentElement?.className).toMatch(/tablaWrap/);
  expect(screen.getByText("Publicado").className).toMatch(/badgePublicado/);
  expect(screen.getByRole("heading", { name: "Ranking general de comparsas" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Resultados por rubro" })).toBeVisible();
});

test("sin actas oficiales se muestra el estado vacío y solo el Escribano puede emitir", async () => {
  const api = apiConActas();
  render(<VistaResultadosEdicion api={api} edicion={edicionActas} puedeOperar />);

  const seccion = await screen.findByRole("region", { name: "Actas oficiales" });
  expect(await within(seccion).findByText("Todavía no hay actas oficiales emitidas para esta edición.")).toBeVisible();
  expect(within(seccion).getByRole("button", { name: "Emitir acta" })).toBeEnabled();
  expect(api.listarActas).toHaveBeenCalledWith("e1");
});

test("un administrador consulta las actas pero no ve el botón de emisión", async () => {
  render(<VistaResultadosEdicion api={apiConActas({ items: [actaEmitida] })} edicion={edicionActas} />);

  const seccion = await screen.findByRole("region", { name: "Actas oficiales" });
  expect(await within(seccion).findByText("Acta #1")).toBeVisible();
  expect(within(seccion).queryByRole("button", { name: "Emitir acta" })).toBeNull();
  expect(within(seccion).getByRole("button", { name: "Verificar integridad" })).toBeVisible();
});

test("la emisión pide confirmación y reutiliza el mismo operationId en el reintento", async () => {
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => OPERATION_ID) });
  const emitirActa = vi.fn()
    .mockResolvedValueOnce({ ok: false, status: 409, cuerpo: { mensaje: "El resultado todavía no está publicado." } })
    .mockResolvedValueOnce({ ok: true, status: 201, cuerpo: actaEmitida });
  render(<VistaResultadosEdicion
    api={apiConActas({ emitirActa })}
    edicion={edicionActas}
    puedeOperar
  />);

  const seccion = await screen.findByRole("region", { name: "Actas oficiales" });
  fireEvent.click(within(seccion).getByRole("button", { name: "Emitir acta" }));

  const modal = screen.getByRole("dialog");
  expect(within(modal).getByText(/nueva versión inmutable del acta oficial/)).toBeVisible();
  fireEvent.click(within(modal).getByRole("button", { name: "Confirmar emisión" }));

  expect(await within(modal).findByRole("alert")).toHaveTextContent("El resultado todavía no está publicado.");
  fireEvent.click(within(modal).getByRole("button", { name: "Reintentar emisión" }));

  expect(await within(seccion).findByText("Acta #1")).toBeVisible();
  expect(emitirActa).toHaveBeenCalledTimes(2);
  expect(emitirActa).toHaveBeenNthCalledWith(1, "e1", "calc1", OPERATION_ID);
  expect(emitirActa).toHaveBeenNthCalledWith(2, "e1", "calc1", OPERATION_ID);
  expect(globalThis.crypto.randomUUID).toHaveBeenCalledTimes(1);
});

test("se descargan las representaciones y se muestra la verificación de integridad con los hashes", async () => {
  const descargarActa = vi.fn(async () => ({
    ok: true, status: 200, cuerpo: { blob: new Blob(["acta"]), nombreArchivo: "acta-e1-v1.pdf" },
  }));
  const verificarActa = vi.fn(async (_edicionId, _actaId, formato) => ({
    ok: true,
    cuerpo: {
      coincide: true,
      hashAlmacenado: formato === "PDF" ? "a".repeat(64) : "b".repeat(64),
      hashRecalculado: formato === "PDF" ? "a".repeat(64) : "b".repeat(64),
    },
  }));
  render(<VistaResultadosEdicion
    api={apiConActas({ items: [actaEmitida], descargarActa, verificarActa })}
    edicion={edicionActas}
  />);

  const seccion = await screen.findByRole("region", { name: "Actas oficiales" });
  expect(await within(seccion).findByText(`SHA-256: ${"a".repeat(64)}`)).toBeVisible();
  expect(within(seccion).getByText(`SHA-256: ${"b".repeat(64)}`)).toBeVisible();

  fireEvent.click(within(seccion).getByRole("button", { name: "Descargar PDF" }));
  expect(await within(seccion).findByText("Descarga del PDF iniciada.")).toBeVisible();
  expect(descargarActa).toHaveBeenCalledWith("e1", "acta1", "PDF");

  fireEvent.click(within(seccion).getByRole("button", { name: "Verificar integridad" }));
  expect(await within(seccion).findByText(/Integridad verificada: PDF y CSV coinciden con su SHA-256/)).toBeVisible();
  expect(verificarActa).toHaveBeenCalledWith("e1", "acta1", "PDF");
  expect(verificarActa).toHaveBeenCalledWith("e1", "acta1", "CSV");
});

test("una verificación que no coincide se muestra como error con ambos hashes", async () => {
  const verificarActa = vi.fn(async (_edicionId, _actaId, formato) => ({
    ok: true,
    cuerpo: {
      coincide: false,
      hashAlmacenado: "a".repeat(64),
      hashRecalculado: formato === "PDF" ? "c".repeat(64) : "d".repeat(64),
    },
  }));
  render(<VistaResultadosEdicion
    api={apiConActas({ items: [actaEmitida], verificarActa })}
    edicion={edicionActas}
  />);

  const seccion = await screen.findByRole("region", { name: "Actas oficiales" });
  fireEvent.click(await within(seccion).findByRole("button", { name: "Verificar integridad" }));

  const aviso = await within(seccion).findByRole("alert");
  expect(aviso).toHaveTextContent(/Integridad no verificada: PDF y CSV no coinciden con su SHA-256/);
  expect(aviso).toHaveTextContent(new RegExp(`recalculado: ${"c".repeat(64)}`));
});
