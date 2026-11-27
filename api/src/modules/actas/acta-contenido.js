// Contenido y representaciones de las actas oficiales de resultados (P6D).
// Capa pura: recibe un snapshot ya publicado, arma un objeto serializable y
// renderiza CSV/PDF sin acceso a base de datos ni HTTP.
// Invariante D15: nunca incluye notas individuales por jurado.
// Diseño §7: no hay firma digital ni certificación definida, por lo que el
// texto generado no afirma ninguna de esas cosas.

import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function texto(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string") return valor;
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  if (typeof valor === "object") {
    if (valor.nombre !== undefined && valor.nombre !== null) return texto(valor.nombre);
    if (valor.codigo !== undefined && valor.codigo !== null) return texto(valor.codigo);
  }
  return null;
}

function etiqueta(valor) {
  if (!valor || typeof valor !== "object") return texto(valor);
  const codigo = texto(valor.codigo);
  const nombre = texto(valor.nombre);
  if (codigo && nombre) return `${codigo} - ${nombre}`;
  return nombre ?? codigo ?? null;
}

function entero(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? Math.trunc(resultado) : null;
}

function numero(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : null;
}

function fecha(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor.toISOString();
  }
  if (typeof valor === "number") {
    const fechaNumero = new Date(valor);
    return Number.isNaN(fechaNumero.getTime()) ? null : fechaNumero.toISOString();
  }
  return String(valor);
}

function textoResolucion(valor, resolverId = (id) => id) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "object") return String(valor);

  const idGanador = valor.ganadorId ?? valor.ganador_id;
  const ganador = texto(valor.ganador)
    ?? (idGanador === undefined || idGanador === null ? null : texto(resolverId(idGanador)) ?? texto(idGanador));
  const motivo = valor.motivo ?? valor.motivo_resolucion;
  const referencia = valor.referenciaActa ?? valor.referencia_acta;
  const partes = [
    ganador ? `Ganador: ${ganador}` : null,
    motivo ? `Motivo: ${texto(motivo)}` : null,
    referencia ? `Referencia: ${texto(referencia)}` : null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join("; ") : null;
}

export function construirContenidoActa({
  edicion,
  snapshot,
  premios,
  penalizaciones,
  generadaEn,
  generador,
} = {}) {
  const datos = snapshot ?? {};

  const comparsas = (datos.comparsas ?? []).map((fila) => ({
    nombre: texto(fila.comparsa?.nombre) ?? texto(fila.comparsaNombre) ?? texto(fila.nombre) ?? null,
    categoria: texto(fila.comparsa?.categoria) ?? texto(fila.categoria) ?? null,
    posicion: entero(fila.posicion),
    descalificada: Boolean(fila.descalificadaComparsa ?? fila.descalificada ?? false),
    puntajeFijos: numero(fila.puntajeFijos ?? fila.puntaje_fijos),
    puntajeNominativos: numero(fila.puntajeNominativos ?? fila.puntaje_nominativos),
    puntajeCarros: numero(fila.puntajeCarros ?? fila.puntaje_carros),
    descuentoRubros: numero(fila.descuentoRubros ?? fila.descuento_rubros),
    descuentoGeneral: numero(fila.descuentoGeneral ?? fila.descuento_general),
    puntajeTotal: numero(fila.puntajeTotal ?? fila.puntaje_total),
  }));

  const rubros = (datos.rubros ?? []).map((rubro) => ({
    codigo: texto(rubro.rubro?.codigo) ?? texto(rubro.codigo) ?? null,
    nombre: texto(rubro.rubro?.nombre) ?? texto(rubro.nombre) ?? null,
    resultados: (rubro.resultados ?? []).map((resultado) => ({
      sujeto: texto(resultado.sujeto?.nombre) ?? texto(resultado.sujeto) ?? null,
      comparsa: texto(resultado.comparsa?.nombre) ?? texto(resultado.comparsa) ?? null,
      posicion: entero(resultado.posicion),
      puntajeNeto: numero(resultado.puntajeNeto ?? resultado.puntaje_neto),
      empatado: Boolean(resultado.empatado ?? false),
    })),
  }));

  const empates = (datos.empates ?? []).map((empate) => {
    const candidatos = (empate.candidatos ?? []).map(
      (candidato) => texto(candidato?.nombre) ?? texto(candidato) ?? null,
    ).filter((nombre) => nombre !== null);
    const nombresPorId = new Map((empate.candidatos ?? []).map((candidato) => [
      texto(candidato?.id),
      texto(candidato?.nombre) ?? texto(candidato) ?? null,
    ]));

    return {
      ambito: texto(empate.ambito),
      rubro: etiqueta(empate.rubro),
      posicion: entero(empate.posicion ?? empate.posicionEmpatada),
      candidatos,
      resolucion: textoResolucion(
        empate.resolucion,
        (id) => nombresPorId.get(texto(id)) ?? null,
      ),
    };
  });

  return {
    edicion: {
      id: texto(edicion?.id),
      nombre: texto(edicion?.nombre),
      anio: entero(edicion?.anio),
      cerradaEn: fecha(edicion?.cerradaEn ?? edicion?.cerrada_en),
    },
    calculo: {
      id: texto(datos.id),
      numero: entero(datos.numero),
      algoritmo: texto(datos.algoritmo),
      publicadoEn: fecha(datos.publicadoEn ?? datos.publicado_en),
      hashEntradas: texto(datos.hashEntradas ?? datos.hash_entradas),
    },
    generadaEn: fecha(generadaEn),
    generador: {
      id: texto(generador?.id),
      nombre: texto(generador?.nombre),
    },
    comparsas,
    rubros,
    premios: (premios ?? []).map((premio) => ({
      nombre: texto(premio.nombre),
      modalidad: texto(premio.modalidad),
      ambito: texto(premio.ambito),
      rubro: etiqueta(premio.rubro),
      posicion: entero(premio.posicion),
      ganador: texto(premio.ganador) ?? texto(premio.ganadorNombre) ?? null,
      comparsa: texto(premio.comparsa),
      resolucion: textoResolucion(premio.resolucion),
    })),
    penalizaciones: (penalizaciones ?? []).map((penalizacion) => ({
      tipo: texto(penalizacion.tipo),
      comparsa: texto(penalizacion.comparsa),
      minutos: numero(penalizacion.minutos),
      motivo: texto(penalizacion.motivo),
      referenciaActa: texto(penalizacion.referenciaActa ?? penalizacion.referencia_acta),
    })),
    empates,
  };
}

function celdaTexto(valor) {
  return valor === null || valor === undefined ? "" : String(valor);
}

function celdaNumero(valor) {
  const resultado = numero(valor);
  return resultado === null ? "" : resultado.toFixed(2);
}

function celdaSiNo(valor) {
  return valor ? "Sí" : "No";
}

// Un único modelo de secciones alimenta ambos formatos: ninguno puede
// incorporar datos que el otro no muestre (§11 del diseño).
function seccionesDe(contenido) {
  return [
    {
      titulo: "Cabecera del acta",
      filas: [
        ["Acta oficial de resultados"],
        ["Edición", celdaTexto(contenido.edicion?.id), celdaTexto(contenido.edicion?.nombre),
          "Año", celdaTexto(contenido.edicion?.anio), "Cerrada en", celdaTexto(contenido.edicion?.cerradaEn)],
        ["Cálculo", celdaTexto(contenido.calculo?.id), "Número", celdaTexto(contenido.calculo?.numero),
          "Algoritmo", celdaTexto(contenido.calculo?.algoritmo),
          "Publicado en", celdaTexto(contenido.calculo?.publicadoEn),
          "Hash de entradas", celdaTexto(contenido.calculo?.hashEntradas)],
        ["Generada en", celdaTexto(contenido.generadaEn)],
        ["Generador", celdaTexto(contenido.generador?.id), celdaTexto(contenido.generador?.nombre)],
      ],
    },
    {
      titulo: "Clasificación de comparsas",
      filas: [
        ["Nombre", "Categoría", "Posición", "Descalificada", "Fijos", "Nominativos",
          "Carros", "Descuento rubros", "Descuento general", "Total"],
        ...(contenido.comparsas ?? []).map((comparsa) => [
          celdaTexto(comparsa.nombre), celdaTexto(comparsa.categoria), celdaTexto(comparsa.posicion),
          celdaSiNo(comparsa.descalificada), celdaNumero(comparsa.puntajeFijos),
          celdaNumero(comparsa.puntajeNominativos), celdaNumero(comparsa.puntajeCarros),
          celdaNumero(comparsa.descuentoRubros), celdaNumero(comparsa.descuentoGeneral),
          celdaNumero(comparsa.puntajeTotal),
        ]),
      ],
    },
    {
      titulo: "Desglose por rubro",
      filas: [
        ["Código", "Rubro", "Sujeto", "Comparsa", "Posición", "Puntaje neto", "Empatado"],
        ...(contenido.rubros ?? []).flatMap((rubro) => (rubro.resultados ?? []).map((resultado) => [
          celdaTexto(rubro.codigo), celdaTexto(rubro.nombre), celdaTexto(resultado.sujeto),
          celdaTexto(resultado.comparsa), celdaTexto(resultado.posicion),
          celdaNumero(resultado.puntajeNeto), celdaSiNo(resultado.empatado),
        ])),
      ],
    },
    {
      titulo: "Premios",
      filas: [
        ["Nombre", "Modalidad", "Ámbito", "Rubro", "Posición", "Ganador", "Comparsa", "Resolución"],
        ...(contenido.premios ?? []).map((premio) => [
          celdaTexto(premio.nombre), celdaTexto(premio.modalidad), celdaTexto(premio.ambito),
          celdaTexto(premio.rubro), celdaTexto(premio.posicion), celdaTexto(premio.ganador),
          celdaTexto(premio.comparsa), celdaTexto(premio.resolucion),
        ]),
      ],
    },
    {
      titulo: "Penalizaciones",
      filas: [
        ["Tipo", "Comparsa", "Minutos", "Motivo", "Referencia del acta"],
        ...(contenido.penalizaciones ?? []).map((penalizacion) => [
          celdaTexto(penalizacion.tipo), celdaTexto(penalizacion.comparsa),
          celdaNumero(penalizacion.minutos), celdaTexto(penalizacion.motivo),
          celdaTexto(penalizacion.referenciaActa),
        ]),
      ],
    },
    {
      titulo: "Resoluciones de empate",
      filas: [
        ["Ámbito", "Rubro", "Posición", "Candidatos", "Resolución"],
        ...(contenido.empates ?? []).map((empate) => [
          celdaTexto(empate.ambito), celdaTexto(empate.rubro), celdaTexto(empate.posicion),
          celdaTexto((empate.candidatos ?? []).join("; ")), celdaTexto(empate.resolucion),
        ]),
      ],
    },
  ];
}

function celdaCsv(valor) {
  const contenido = celdaTexto(valor);
  const neutralizado = /^[=+\-@]/.test(contenido) ? `'${contenido}` : contenido;
  return `"${neutralizado.replace(/"/g, '""')}"`;
}

export function generarCsv(contenido) {
  const lineas = [];
  for (const seccion of seccionesDe(contenido)) {
    lineas.push([seccion.titulo]);
    for (const fila of seccion.filas) lineas.push(fila.map(celdaCsv));
  }
  return Buffer.from(`\uFEFF${lineas.map((fila) => fila.join(",")).join("\r\n")}\r\n`, "utf8");
}

const ANCHO_PAGINA = 595.28;
const ALTO_PAGINA = 841.89;
const MARGEN = 42;
const INTERLINEADO = 13;

// Helvetica con codificación WinAnsi cubre acentos y eñe; el resto se
// sustituye para que un carácter externo no invalide toda la generación.
function paraPdf(valor) {
  return celdaTexto(valor)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, "?");
}

export async function generarPdf(contenido) {
  const documento = await PDFDocument.create();
  documento.setTitle("Acta oficial de resultados");
  const fuente = await documento.embedFont(StandardFonts.Helvetica);
  const anchoUtil = ANCHO_PAGINA - 2 * MARGEN;
  let pagina = documento.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
  let y = ALTO_PAGINA - MARGEN;

  function nuevaPagina() {
    pagina = documento.addPage([ANCHO_PAGINA, ALTO_PAGINA]);
    y = ALTO_PAGINA - MARGEN;
  }

  function dibujar(linea, tamano) {
    if (y - tamano < MARGEN) nuevaPagina();
    pagina.drawText(linea, { x: MARGEN, y, size: tamano, font: fuente, color: rgb(0, 0, 0) });
    y -= INTERLINEADO;
  }

  function escribir(valor, tamano = 9) {
    const limpio = paraPdf(valor);
    if (!limpio) {
      y -= INTERLINEADO;
      return;
    }
    let actual = "";
    for (const palabra of limpio.split(/\s+/).filter(Boolean)) {
      const candidata = actual ? `${actual} ${palabra}` : palabra;
      if (fuente.widthOfTextAtSize(candidata, tamano) <= anchoUtil || !actual) {
        actual = candidata;
      } else {
        dibujar(actual, tamano);
        actual = palabra;
      }
    }
    dibujar(actual, tamano);
  }

  for (const seccion of seccionesDe(contenido)) {
    escribir(seccion.titulo, 12);
    for (const fila of seccion.filas) escribir(fila.join(" | "), 9);
    y -= 6;
  }

  return Buffer.from(await documento.save());
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
