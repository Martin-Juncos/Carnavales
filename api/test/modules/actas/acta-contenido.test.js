import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  construirContenidoActa,
  generarCsv,
  generarPdf,
  sha256,
} from "../../../src/modules/actas/acta-contenido.js";

function datos() {
  return {
    edicion: {
      id: "ed-1",
      nombre: "Carnaval de Goya 2027",
      anio: 2027,
      cerrada_en: "2027-02-10T03:00:00.000Z",
    },
    snapshot: {
      id: "calc-1",
      numero: 3,
      algoritmo: "GOYA_2026_V1",
      publicadoEn: "2027-02-10T04:00:00.000Z",
      hashEntradas: "abc123",
      comparsas: [
        {
          comparsa: { id: "c1", nombre: "Los Rebeldes", categoria: "PRIMERA" },
          posicion: 1,
          descalificadaComparsa: false,
          puntajeFijos: 12.5,
          puntajeNominativos: 20,
          puntajeCarros: 8.25,
          descuentoRubros: 0.5,
          descuentoGeneral: 1,
          puntajeTotal: 39.25,
          detalle: [{ jurado: "JURADO-SECRETO", nota: 5 }],
        },
      ],
      rubros: [
        {
          rubro: { id: "r1", codigo: "REI", nombre: "Reina del Carnaval" },
          resultados: [
            {
              sujeto: { id: "s1", nombre: "Ana Gómez" },
              comparsa: { id: "c1", nombre: "Los Rebeldes" },
              puntajeArtistico: 18,
              descuentoRubro: 0.5,
              puntajeNeto: 17.5,
              posicion: 1,
              empatado: true,
              detalleJurado: "NOTA-INDIVIDUAL-NO-DEBE-APARECER",
            },
          ],
        },
      ],
      empates: [
        {
          ambito: "RUBRO",
          rubro: { codigo: "REI", nombre: "Reina del Carnaval" },
          posicionEmpatada: 1,
          puntajeEmpatado: 17.5,
          estado: "RESUELTO",
          candidatos: [
            { id: "s1", nombre: "Ana Gómez" },
            { id: "s2", nombre: "Lucía Pérez" },
          ],
          resolucion: {
            ganadorId: "s1",
            motivo: "Desempate reglamentario",
            referenciaActa: "ACT-9",
            resueltoEn: "2027-02-10T04:30:00.000Z",
          },
        },
      ],
    },
    premios: [
      {
        nombre: "Reina del Carnaval",
        modalidad: "INDIVIDUAL",
        ambito: "RUBRO",
        rubro: { codigo: "REI", nombre: "Reina del Carnaval" },
        posicion: 1,
        ganador: "Ana Gómez",
        comparsa: "Los Rebeldes",
        resolucion: "ACT-9",
      },
    ],
    penalizaciones: [
      {
        tipo: "RETRASO_INGRESO",
        comparsa: "Los Rebeldes",
        minutos: 1,
        motivo: "Retraso en el ingreso",
        referenciaActa: "PEN-1",
      },
    ],
    generadaEn: new Date("2027-02-10T05:00:00.000Z"),
    generador: { id: "u-1", nombre: "Escribano Pérez" },
  };
}

const secciones = [
  "Cabecera del acta",
  "Clasificación de comparsas",
  "Desglose por rubro",
  "Premios",
  "Penalizaciones",
  "Resoluciones de empate",
];

test("construirContenidoActa expone solo los campos del acta y ninguna nota por jurado", () => {
  const contenido = construirContenidoActa(datos());

  assert.deepEqual(Object.keys(contenido).sort(), [
    "calculo", "comparsas", "edicion", "empates", "generadaEn", "generador",
    "penalizaciones", "premios", "rubros",
  ]);
  assert.deepEqual(contenido.edicion, {
    id: "ed-1",
    nombre: "Carnaval de Goya 2027",
    anio: 2027,
    cerradaEn: "2027-02-10T03:00:00.000Z",
  });
  assert.deepEqual(contenido.calculo, {
    id: "calc-1",
    numero: 3,
    algoritmo: "GOYA_2026_V1",
    publicadoEn: "2027-02-10T04:00:00.000Z",
    hashEntradas: "abc123",
  });
  assert.equal(contenido.generadaEn, "2027-02-10T05:00:00.000Z");
  assert.deepEqual(contenido.generador, { id: "u-1", nombre: "Escribano Pérez" });
  assert.deepEqual(Object.keys(contenido.comparsas[0]).sort(), [
    "categoria", "descalificada", "descuentoGeneral", "descuentoRubros", "nombre",
    "posicion", "puntajeCarros", "puntajeFijos", "puntajeNominativos", "puntajeTotal",
  ]);
  assert.equal(contenido.comparsas[0].nombre, "Los Rebeldes");
  assert.deepEqual(Object.keys(contenido.rubros[0].resultados[0]).sort(), [
    "comparsa", "empatado", "posicion", "puntajeNeto", "sujeto",
  ]);
  assert.equal(contenido.rubros[0].resultados[0].sujeto, "Ana Gómez");
  assert.deepEqual(contenido.empates[0].candidatos, ["Ana Gómez", "Lucía Pérez"]);
  assert.ok(contenido.empates[0].resolucion.includes("Ana Gómez"));

  const serializado = JSON.stringify(contenido);
  assert.ok(!serializado.includes("JURADO-SECRETO"));
  assert.ok(!serializado.includes("NOTA-INDIVIDUAL-NO-DEBE-APARECER"));
  assert.ok(!serializado.includes("puntajeArtistico"));
});

test("generarCsv agrega BOM UTF-8, usa CRLF e incluye todas las secciones", () => {
  const csv = generarCsv(construirContenidoActa(datos()));
  assert.ok(Buffer.isBuffer(csv));
  assert.equal(csv.subarray(0, 3).toString("utf8"), "\uFEFF");

  const texto = csv.toString("utf8");
  assert.ok(texto.includes("\r\n"));
  for (const titulo of secciones) assert.ok(texto.includes(titulo), `falta la sección ${titulo}`);
  assert.ok(!texto.includes("JURADO-SECRETO"));
  assert.ok(!texto.includes("NOTA-INDIVIDUAL-NO-DEBE-APARECER"));
});

test("generarCsv neutraliza fórmulas y escapa comillas según RFC 4180", () => {
  const entrada = datos();
  entrada.snapshot.comparsas[0].comparsa.nombre = '=SUM(A1:A9),"Hola"';
  entrada.snapshot.comparsas.push({
    comparsa: { id: "c2", nombre: "@Admin", categoria: "PRIMERA" },
    posicion: 2,
    puntajeFijos: 1,
  });
  const texto = generarCsv(construirContenidoActa(entrada)).toString("utf8");

  assert.ok(texto.includes('"\'=SUM(A1:A9),""Hola"""'));
  assert.ok(texto.includes('"\'@Admin"'));
});

test("generarCsv serializa los puntajes con punto y dos decimales fijos", () => {
  const texto = generarCsv(construirContenidoActa(datos())).toString("utf8");

  assert.ok(texto.includes('"12.50"'));
  assert.ok(texto.includes('"8.25"'));
  assert.ok(texto.includes('"39.25"'));
  assert.ok(texto.includes('"17.50"'));
});

test("generarPdf produce un PDF válido con paginación", async () => {
  const pdf = await generarPdf(construirContenidoActa(datos()));
  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");

  const documento = await PDFDocument.load(pdf);
  assert.ok(documento.getPageCount() >= 1);

  const entrada = datos();
  entrada.snapshot.comparsas = Array.from({ length: 80 }, (_, indice) => ({
    comparsa: { id: `c${indice}`, nombre: `Comparsa número ${indice} con ñ y acentos áéíóú`, categoria: "PRIMERA" },
    posicion: indice + 1,
    puntajeTotal: indice + 0.5,
  }));
  const documentoLargo = await PDFDocument.load(await generarPdf(construirContenidoActa(entrada)));
  assert.ok(documentoLargo.getPageCount() > documento.getPageCount());
});

test("sha256 produce 64 hexadecimales y distingue buffers distintos", () => {
  const hash = sha256(Buffer.from("abc"));
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.notEqual(hash, sha256(Buffer.from("abd")));
});
