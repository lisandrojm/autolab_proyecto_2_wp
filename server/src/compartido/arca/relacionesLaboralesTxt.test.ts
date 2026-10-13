/**
 *   npx tsx --test src/compartido/arca/relacionesLaboralesTxt.test.ts
 *
 * Los datos son filas reales de los TXT guardados en Dropbox (FZERO, 2010-06 / 2021-03 / 2026-08),
 * reconstruidas columna por columna sobre el encabezado real de 1020 caracteres.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { claveTexto, coincideTextoArca, COLUMNAS, decodificarTxtRelaciones, fechaDdMmAaaaAIso, franjasDelEncabezado, importeArca, parsearBytesRelaciones, parsearTxtRelaciones } from "./relacionesLaboralesTxt.js";

// Dónde empieza cada columna en el TXT real (medido sobre el encabezado que escribe ARCA).
const OFFSETS = [0, 12, 72, 232, 332, 392, 647, 671, 701, 714, 727, 740, 810, 880, 960];
const LARGO = 1020;

/** Arma una fila de ancho fijo poniendo cada valor donde empieza su columna. */
function filaDe(valores: string[]): string {
  let s = "";
  valores.forEach((v, i) => {
    const hasta = OFFSETS[i + 1] ?? LARGO;
    s += v.slice(0, hasta - OFFSETS[i]).padEnd(hasta - OFFSETS[i]);
  });
  return s;
}
const HEADER = filaDe(COLUMNAS.map((c) => c.rotulo));

const ROMERO = filaDe(["27204809696", "ROMERO GABRIELA AGUEDA", "OS DE LOS INMIGRANTES ESPANOLES Y SUS DESCENDIENTES RESIDENTES DE LA RA", "A tiempo completo determinado (contrato a plazo fijo)", "SERVICIOS CONEXOS A LA PRODUCCION DE ESPECTACULOS TEATRALES", "Empleados de servicios de apoyo a la producción", "51337,27", "MES", "NO", "31/03/2021", "02/04/2021", "Vencimiento de contrato a plazo fijo o determinado, a tiempo completo", "TELEVISIÓN - SINDICATO ARGENTINO DE TELEVISION C/ CAMARA ARGENTINA DE", "PEINADOR - GRUPO 7", "SERVICIOS COMUNES DISCONTINUOS"]);
const DE_FEO = filaDe(["20251910821", "DE FEO PABLO NICOLAS", "O.S.DEL PERSONAL DE TELEVISION", "A tiempo completo indeterminado/Trabajo permanente", "SERVICIOS CONEXOS A LA PRODUCCION DE ESPECTACULOS TEATRALES", "Operadores de equipos de radiodifusión, televisión y telecomunicaciones", "3800,00", "MES", "NO", "01/06/2010", "31/12/2016", "Despido / ART. 245 - LCT", "TELEVISIÓN - SINDICATO ARGENTINO DE TELEVISION c/ L.S.TV CANAL 7 Y OTR", "3ª CATEGORIA - OPERADOR TECNICO DE VIDEO", "SERVICIOS COMUNES CONTINUOS"]);
// Relación abierta: FECHA DE FIN y SITUACION De BAJA en blanco.
const ANDREOLI_ABIERTO = filaDe(["20169676322", "ANDREOLI NESTOR RAUL", "Sin Obra Social", "Actor - Intérprete en Empleador Contratante Ley 27.203- S/OBRA SOCIAL", "PRODUCCIÓN DE FILMES Y VIDEOCINTAS", "Actores y directores de cine, radio, teatro, televisión y afines", "631894,00", "MES", "NO", "10/08/2026", "", "", "ACTORES - ASOCIACION ARGENTINA DE ACTORES c/ ASOCIACIÓN ARGENTINAS DE", "PERSONAJE SECUNDARIO", "SERVICIOS COMUNES DISCONTINUOS"]);

/**
 * Los bytes como los escribe ARCA: UTF-8, pero con la «Ó» rota (C3 93 → C3 1D) y la «ª» ya
 * convertida en U+FFFD (EF BF BD). Ver el comentario de `decodificarTxtRelaciones`.
 */
function bytesComoArca(texto: string): Uint8Array {
  const b = Array.from(Buffer.from(texto.replace(/ª/g, "�"), "utf8"));
  for (let i = 0; i + 1 < b.length; i++) if (b[i] === 0xc3 && b[i + 1] === 0x93) b[i + 1] = 0x1d;
  return Uint8Array.from(b);
}
const archivo = (...lineas: string[]) => bytesComoArca(lineas.join("\r\n") + "\r\n");

describe("el layout sale del encabezado", () => {
  it("cada columna empieza donde empieza su rótulo, en el mismo orden que ARCA", () => {
    const franjas = franjasDelEncabezado(HEADER)!;
    assert.deepEqual(franjas.map((f) => f.desde), OFFSETS);
    assert.equal(franjas.at(-1)!.hasta, Infinity);
    assert.equal(franjas[9].clave, "fechaInicio");
    assert.equal(franjas[9].hasta, 727);
  });
  it("si ARCA ensancha una columna, las franjas se corren solas", () => {
    const ancho = HEADER.replace("APELLIDO Y NOMBRE      ", "APELLIDO Y NOMBRE           "); // +5
    const franjas = franjasDelEncabezado(ancho)!;
    assert.equal(franjas[2].desde, 77);
    assert.equal(franjas[1].hasta, 77);
  });
  it("un encabezado al que le falta una columna no sirve", () => {
    assert.equal(franjasDelEncabezado(HEADER.replace("RETRIB. PACTADA", "RETRIBUCION    ")), null);
  });
});

describe("los bytes de ARCA", () => {
  it("la Ó rota ocupa un solo lugar, así las columnas no se corren", () => {
    const texto = decodificarTxtRelaciones(archivo(HEADER, ROMERO));
    const [h, fila] = texto.split("\r\n");
    assert.equal(h.length, LARGO);
    assert.equal(fila.length, LARGO);
    assert.ok(fila.includes("TELEVISI�N - SINDICATO"));
    assert.ok(fila.includes("a la producción")); // la ó que llegó bien se conserva
  });
  it("decodificar como latin-1 habría corrido la fila (por eso no se hace)", () => {
    const b = archivo(HEADER, ROMERO);
    const latin1 = Buffer.from(b).toString("latin1").split("\r\n")[1];
    assert.notEqual(latin1.length, LARGO);
  });
});

describe("leer filas", () => {
  it("ROMERO GABRIELA 27204809696: 31/03/2021 → 02/04/2021", () => {
    const r = parsearBytesRelaciones(archivo(HEADER, ROMERO));
    assert.equal(r.descartes.length, 0);
    assert.equal(r.filas.length, 1);
    const f = r.filas[0];
    assert.equal(f.cuil, "27204809696");
    assert.equal(f.apellidoNombre, "ROMERO GABRIELA AGUEDA");
    assert.equal(f.fechaInicio, "2021-03-31");
    assert.equal(f.fechaFin, "2021-04-02");
    assert.equal(f.retribucionPactada, 51337.27);
    assert.equal(f.modLiquidacion, "MES");
    assert.equal(f.trabajadorAgropecuario, false);
    assert.equal(f.obraSocial, "OS DE LOS INMIGRANTES ESPANOLES Y SUS DESCENDIENTES RESIDENTES DE LA RA");
    assert.equal(f.modalidadContrato, "A tiempo completo determinado (contrato a plazo fijo)");
    assert.equal(f.situacionBaja, "Vencimiento de contrato a plazo fijo o determinado, a tiempo completo");
    assert.equal(f.convenioColectivo, "TELEVISI�N - SINDICATO ARGENTINO DE TELEVISION C/ CAMARA ARGENTINA DE");
    assert.equal(f.categoria, "PEINADOR - GRUPO 7");
    assert.equal(f.tipoServicio, "SERVICIOS COMUNES DISCONTINUOS");
    assert.equal(f.rawLinea.length, LARGO);
  });
  it("una fila con acentos intactos y otros perdidos (DE FEO, 2010): todo en su columna", () => {
    const f = parsearBytesRelaciones(archivo(HEADER, DE_FEO)).filas[0];
    assert.equal(f.puestoDesempenado, "Operadores de equipos de radiodifusión, televisión y telecomunicaciones");
    assert.equal(f.fechaInicio, "2010-06-01");
    assert.equal(f.fechaFin, "2016-12-31");
    assert.equal(f.situacionBaja, "Despido / ART. 245 - LCT");
    assert.equal(f.categoria, "3� CATEGORIA - OPERADOR TECNICO DE VIDEO");
    assert.equal(f.retribucionPactada, 3800);
  });
  it("FECHA DE FIN en blanco = relación abierta", () => {
    const f = parsearBytesRelaciones(archivo(HEADER, ANDREOLI_ABIERTO)).filas[0];
    assert.equal(f.fechaInicio, "2026-08-10");
    assert.equal(f.fechaFin, null);
    assert.equal(f.situacionBaja, "");
    assert.equal(f.actividadLaboral, "PRODUCCI�N DE FILMES Y VIDEOCINTAS");
  });
  it("varias páginas pegadas: los encabezados repetidos y las líneas en blanco se saltean", () => {
    const r = parsearBytesRelaciones(archivo(HEADER, ROMERO, "", HEADER, DE_FEO, ""));
    assert.equal(r.filas.length, 2);
    assert.equal(r.descartes.length, 0);
    assert.equal(r.header, HEADER);
  });
  it("la última fila de cada página viene sin el relleno final (977 caracteres): se lee igual", () => {
    const corta = DE_FEO.trimEnd();
    assert.ok(corta.length < LARGO);
    const f = parsearBytesRelaciones(archivo(HEADER, corta)).filas[0];
    assert.equal(f.tipoServicio, "SERVICIOS COMUNES CONTINUOS");
    assert.equal(f.categoria, "3� CATEGORIA - OPERADOR TECNICO DE VIDEO");
  });
  it("la misma fila dos veces se devuelve dos veces: quién la guarda decide (upsert por clave natural)", () => {
    assert.equal(parsearBytesRelaciones(archivo(HEADER, ROMERO, HEADER, ROMERO)).filas.length, 2);
  });
});

describe("lo que no se entiende no tira: va a descartes", () => {
  it("una línea basura y una con fecha imposible", () => {
    const rota = ROMERO.replace("31/03/2021", "31/02/2021");
    const r = parsearTxtRelaciones([HEADER, "esto no es una fila", rota, DE_FEO].join("\n"));
    assert.equal(r.filas.length, 1);
    assert.deepEqual(r.descartes.map((d) => [d.linea, d.motivo]), [
      [2, "CUIL inválido: «esto no es u»"],
      [3, "FECHA INICIO inválida: «31/02/2021»"],
    ]);
    assert.equal(r.descartes[1].rawLinea, rota);
  });
  it("sin encabezado, todo es descarte", () => {
    const r = parsearTxtRelaciones(`${ROMERO}\n${DE_FEO}\n`);
    assert.equal(r.filas.length, 0);
    assert.equal(r.descartes.length, 2);
    assert.equal(r.descartes[0].motivo, "No hay fila de encabezado");
  });
  it("texto vacío", () => {
    assert.deepEqual(parsearTxtRelaciones(""), { header: "", franjas: [], filas: [], descartes: [] });
  });
});

describe("piezas", () => {
  it("fechas", () => {
    assert.equal(fechaDdMmAaaaAIso("02/04/2021"), "2021-04-02");
    assert.equal(fechaDdMmAaaaAIso(" 01/06/2010 "), "2010-06-01");
    assert.equal(fechaDdMmAaaaAIso("29/02/2021"), null);
    assert.equal(fechaDdMmAaaaAIso("2021-04-02"), null);
    assert.equal(fechaDdMmAaaaAIso(""), null);
  });
  it("importes con coma decimal", () => {
    assert.equal(importeArca("59334,99"), 59334.99);
    assert.equal(importeArca("1.234,50"), 1234.5);
    assert.equal(importeArca(""), null);
    assert.equal(importeArca("s/d"), null);
  });
  it("comparar textos: sin acentos y con el carácter perdido como comodín", () => {
    assert.equal(claveTexto("Producción  de filmes"), "PRODUCCION DE FILMES");
    assert.equal(claveTexto("PRODUCCI�N"), "PRODUCCI?N");
    assert.ok(coincideTextoArca("PRODUCCI�N DE FILMES", "Producción de filmes"));
    assert.ok(coincideTextoArca("TELEVISI�N", "TELEVISION"));
    assert.ok(!coincideTextoArca("TELEVISI�N", "TELEVISIONES"));
  });
});
