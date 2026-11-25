import { expect, test } from "vitest";
import { textoParticipante, formatearFechaAcuse } from "./formateadores.js";

test("evita repetir rubro/comparsa y conserva el nombre del participante", () => {
  expect(textoParticipante("Bateria", "Comparsa", "  comparsa ")).toBeNull();
  expect(textoParticipante("Bateria", "Comparsa", "BATERIA")).toBeNull();
  expect(textoParticipante("Bateria", "Comparsa", " ")).toBeNull();
  expect(textoParticipante("Bateria", "Comparsa", " Ana ")).toBe("Ana");
});
test("solo presenta fechas de acuse validas", () => {
  expect(formatearFechaAcuse(null)).toBeNull();
  expect(formatearFechaAcuse("invalida")).toBeNull();
  const iso="2026-11-25T12:00:00Z";
  expect(formatearFechaAcuse(iso)).toBe(new Date(iso).toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }));
});
