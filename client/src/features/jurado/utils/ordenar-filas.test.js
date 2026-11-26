import { describe, expect, it } from "vitest";
import { ordenarFilasPorParticipante } from "./ordenar-filas.js";

describe("ordenarFilasPorParticipante", () => {
  it("mantiene juntos los rubros de cada participante y conserva su orden", () => {
    const filas = [
      { id: "ester-reina", sujeto: { id: "ester" }, rubro: { nombre: "Reina del Carnaval" } },
      { id: "maria-reina", sujeto: { id: "maria" }, rubro: { nombre: "Reina del Carnaval" } },
      { id: "ester-comparsa", sujeto: { id: "ester" }, rubro: { nombre: "Reina de Comparsa" } },
      { id: "maria-comparsa", sujeto: { id: "maria" }, rubro: { nombre: "Reina de Comparsa" } },
    ];

    expect(ordenarFilasPorParticipante(filas).map(({ id }) => id)).toEqual([
      "ester-reina",
      "ester-comparsa",
      "maria-reina",
      "maria-comparsa",
    ]);
  });

  it("conserva el orden de llegada cuando cada participante tiene un solo rubro", () => {
    const filas = [
      { id: "a", sujeto: { id: "uno" } },
      { id: "b", sujeto: { id: "dos" } },
    ];

    expect(ordenarFilasPorParticipante(filas)).toEqual(filas);
  });
});
