/**
 *   npm run test:colocacion-firma
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REGLAS_COLOCACION, buscarTexto, distanciaARect, motivoPorTipo, pdfAPantalla, pantallaAPdf, reglaDe, resolverColocacion, validarPunto, type PaginaPdf } from "./reglasColocacionFirma.js";

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "../services/dropboxSignBot/fixtures");
const fixture = (nombre: string): { archivo: string; firmante: string; paginas: PaginaPdf[] } => JSON.parse(readFileSync(resolve(FIXTURES, `${nombre}.json`), "utf8"));

// Nombres reales del Outbox (anonimizados).
const NOMBRES = {
  AltaAFIP: "426_LN+_PEREZ_AltaAFIP_Jornada_D-20261010_H-20261010_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000123.pdf",
  Contrato_Jornada: "426_LN+_PEREZ_Contrato_Jornada_D-20261010_H-20261010_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000124.pdf",
  "Contrato_Plazo-fijo": "426_LN+_PEREZ_Contrato_Plazo-fijo-6x6_D-20261010_H-20261210_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000125.pdf",
  Release: "426_LN+_PEREZ_Release_Jornada_D-20261010_H-20261010_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000126.pdf",
  REC_SUELDO: "99_PRODUCTORA_REC_SUELDO_2026_PERIODO_09_PEREZ_Juana_fulano-ARROBA-gmail.com_20273130293_ID-000900.pdf",
};
const DESCONOCIDOS = ["701_X_PEREZ_CCM_Jornada_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000001.pdf", "99_PRODUCTORA_PEREZ_Contrato_Servicios_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000002.pdf", "99_PRODUCTORA_PEREZ_Release_Servicios_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000003.pdf"];

describe("1. resolución por nombre de archivo", () => {
  it("cada patrón matchea su archivo real", () => {
    for (const [tipo, nombre] of Object.entries(NOMBRES)) assert.equal(reglaDe(nombre)?.tipo, tipo, nombre);
  });
  it("los desconocidos caen a revisión y el motivo dice qué patrón faltó; Release_Servicios NO matchea Release", () => {
    for (const n of DESCONOCIDOS) {
      assert.equal(reglaDe(n), null, n);
      assert.match(motivoPorTipo(n)!, /no matchea ningún patrón conocido/);
      assert.equal(resolverColocacion(n, null).ok, false);
    }
  });
  it("REC_SUELDO está pendiente: se reconoce pero nunca se resuelve una colocación", () => {
    assert.equal(reglaDe(NOMBRES.REC_SUELDO)?.estado, "pendiente");
    assert.equal(motivoPorTipo(NOMBRES.REC_SUELDO), "Tipo REC_SUELDO: Falta definir posición de firma del recibo");
    const r = resolverColocacion(NOMBRES.REC_SUELDO, fixture("rec-sueldo").paginas, { nombreFirmante: "JUANA PEREZ" });
    assert.equal(r.ok, false);
  });
  it("todas las reglas activas tienen ancla y fallback", () => {
    for (const r of REGLAS_COLOCACION.filter((x) => x.estado === "activo")) assert.ok(r.ancla && r.fallback, r.tipo);
  });
});

describe("2. anclas sobre fixtures de texto PDF", () => {
  it("Contrato_Jornada: sobre la línea «Firma:» de la última página, a la derecha de la palabra", () => {
    const f = fixture("contrato-jornada");
    const r = resolverColocacion(f.archivo, f.paginas, { nombreFirmante: f.firmante });
    assert.ok(r.ok, "r.ok");
    const c = r.colocacion;
    assert.equal(c.estrategia, "ancla");
    assert.equal(c.paginaIndex, 1, "última página");
    assert.ok(c.puntoPdf!.x > 280 && c.puntoPdf!.x < 360, `x=${c.puntoPdf!.x}: a la derecha de «Firma:»`);
    assert.ok(Math.abs(c.puntoPdf!.y - 241) < 8, `y=${c.puntoPdf!.y}: sobre la línea`);
    assert.ok(c.rectEsperado && distanciaARect(c.puntoPdf!, c.rectEsperado) === 0, "c.rectEsperado && distanciaARect(c.puntoPdf!, c.rectEsperado");
  });
  it("Contrato_Plazo-fijo: misma ancla, más abajo (mitad inferior), con la viñeta «·» delante", () => {
    const f = fixture("contrato-plazo-fijo");
    const r = resolverColocacion(f.archivo, f.paginas, { nombreFirmante: f.firmante });
    assert.ok(r.ok && r.colocacion.estrategia === "ancla" && r.colocacion.paginaIndex === 2, "r.ok && r.colocacion.estrategia === \"ancla\" && r.colocacion.");
    assert.ok(r.ok && r.colocacion.puntoPdf!.y > 842 / 2, "queda en la mitad inferior");
  });
  it("Release: la línea de firma de la columna IZQUIERDA, sobre «Aclaración: <EMPLEADO>», lejos del empleador", () => {
    const f = fixture("release");
    const r = resolverColocacion(f.archivo, f.paginas, { nombreFirmante: f.firmante });
    assert.ok(r.ok, "r.ok");
    const c = r.colocacion;
    assert.equal(c.estrategia, "ancla");
    assert.equal(c.paginaIndex, 4);
    assert.ok(c.puntoPdf!.x < 595 / 2, "mitad izquierda");
    assert.ok(Math.abs(c.puntoPdf!.y - 230) < 10, `y=${c.puntoPdf!.y}: sobre la línea «______» de arriba`);
    // Con el nombre de la base en otro orden o con segundo nombre igual lo encuentra.
    assert.ok(resolverColocacion(f.archivo, f.paginas, { nombreFirmante: "PEREZ JUANA" }).ok, "resolverColocacion(f.archivo, f.paginas, { nombreFirmante: \"");
  });
  it("Release: sin nombre de firmante no se resuelve (no se puede verificar la cercanía); con el nombre del EMPLEADOR, frena", () => {
    const f = fixture("release");
    const sinNombre = resolverColocacion(f.archivo, f.paginas, {});
    assert.equal(sinNombre.ok, false);
    assert.match(!sinNombre.ok ? sinNombre.motivo : "", /firmante/);
    // Si el nombre de la base fuera el del EMPLEADOR, la validación «lejos de Pellegrini» frena.
    const malo = resolverColocacion(f.archivo, f.paginas, { nombreFirmante: "HERNAN PELLEGRINI" });
    assert.equal(malo.ok, false);
    assert.match(!malo.ok ? malo.motivo : "", /Pellegrini/);
  });
  it("AltaAFIP: la celda de la página 1, mitad derecha; con PDF de 2 páginas nunca apunta a la 2", () => {
    const f = fixture("alta-afip");
    const r = resolverColocacion(f.archivo, f.paginas, { nombreFirmante: f.firmante });
    assert.ok(r.ok, "r.ok");
    assert.equal(r.colocacion.paginaIndex, 0);
    assert.ok(r.colocacion.puntoPdf!.x > 595 / 2, "r.colocacion.puntoPdf!.x > 595 / 2");
    assert.ok(r.colocacion.puntoPdf!.y < 430, "apenas arriba del rótulo");
  });
});

describe("3. pdfAPantalla", () => {
  it("convierte por posición relativa dentro de la caja renderizada, con páginas de distinto tamaño", () => {
    const caja = { x: 300, y: 100, w: 700, h: 990 };
    assert.deepEqual(pdfAPantalla({ x: 0, y: 0 }, { ancho: 595, alto: 842 }, caja), { x: 300, y: 100 });
    const p = pdfAPantalla({ x: 297.5, y: 421 }, { ancho: 595, alto: 842 }, caja);
    assert.ok(Math.abs(p.x - 650) < 0.01 && Math.abs(p.y - 595) < 0.01, "Math.abs(p.x - 650) < 0.01 && Math.abs(p.y - 595) < 0.01");
    const carta = pdfAPantalla({ x: 612, y: 792 }, { ancho: 612, alto: 792 }, { x: 10, y: 20, w: 100, h: 200 });
    assert.deepEqual(carta, { x: 110, y: 220 });
    // Ida y vuelta.
    const v = pantallaAPdf(p, { ancho: 595, alto: 842 }, caja);
    assert.ok(Math.abs(v.x - 297.5) < 0.01 && Math.abs(v.y - 421) < 0.01, "Math.abs(v.x - 297.5) < 0.01 && Math.abs(v.y - 421) < 0.01");
  });
});

describe("4. fallbacks", () => {
  it("sin texto del PDF, cada tipo activo devuelve su receta de pantalla y lo dice en la nota", () => {
    for (const [tipo, nombre] of Object.entries(NOMBRES).filter(([t]) => t !== "REC_SUELDO")) {
      const r = resolverColocacion(nombre, null);
      assert.ok(r.ok, tipo);
      assert.equal(r.colocacion.estrategia, "fallback");
      assert.match(r.colocacion.nota, /receta de pantalla/);
      assert.deepEqual(r.colocacion.fallback, REGLAS_COLOCACION.find((x) => x.tipo === tipo)!.fallback);
    }
    const rel = resolverColocacion(NOMBRES.Release, null);
    assert.deepEqual(rel.ok ? rel.colocacion.fallback!.soltarEn : null, { x: 465, y: 418 });
  });
  it("si el texto no trae el ancla (se la saca del fixture), usa el fallback y lo loguea", () => {
    const f = fixture("contrato-jornada");
    const sinAncla = f.paginas.map((p) => ({ ...p, items: p.items.filter((i) => !/Firma:/.test(i.str)) }));
    const r = resolverColocacion(f.archivo, sinAncla, { nombreFirmante: f.firmante });
    assert.ok(r.ok && r.colocacion.estrategia === "fallback" && r.colocacion.paginaIndex === 1, "r.ok && r.colocacion.estrategia === \"fallback\" && r.colocaci");
    assert.match(r.colocacion.nota, /No apareció el ancla/);
  });
});

describe("5. validaciones", () => {
  const f = fixture("release");
  const pagina = f.paginas[4];
  const ctx = { pagina, paginaIndex: 4, totalPaginas: 5, nombreFirmante: f.firmante };
  it("cada validación bloquea su caso", () => {
    assert.deepEqual(validarPunto({ x: 150, y: 230 }, [{ tipo: "enMitadIzquierda" }], ctx), []);
    assert.equal(validarPunto({ x: 400, y: 230 }, [{ tipo: "enMitadIzquierda" }], ctx).length, 1);
    assert.equal(validarPunto({ x: 150, y: 230 }, [{ tipo: "enMitadDerecha" }], ctx).length, 1);
    assert.equal(validarPunto({ x: 150, y: 230 }, [{ tipo: "enPrimeraPagina" }], ctx).length, 1);
    assert.deepEqual(validarPunto({ x: 150, y: 230 }, [{ tipo: "enUltimaPagina" }], ctx), []);
    assert.equal(validarPunto({ x: 150, y: 230 }, [{ tipo: "enUltimaPagina" }], { ...ctx, paginaIndex: 3 }).length, 1);
    assert.equal(validarPunto({ x: 390, y: 232 }, [{ tipo: "lejosDeTexto", patron: /Pellegrini|FZERO/i, distanciaMin: 60 }], ctx).length, 1);
    assert.deepEqual(validarPunto({ x: 150, y: 230 }, [{ tipo: "lejosDeTexto", patron: /Pellegrini|FZERO/i, distanciaMin: 60 }], ctx), []);
    assert.deepEqual(validarPunto({ x: 150, y: 230 }, [{ tipo: "textoCercano", patron: "FIRMANTE", distanciaMax: 90 }], ctx), []);
    assert.equal(validarPunto({ x: 150, y: 60 }, [{ tipo: "textoCercano", patron: "FIRMANTE", distanciaMax: 90 }], ctx).length, 1);
    assert.equal(validarPunto({ x: 150, y: 230 }, [{ tipo: "textoCercano", patron: "FIRMANTE", distanciaMax: 90 }], { ...ctx, nombreFirmante: "" }).length, 1);
  });
  it("buscarTexto también encuentra una frase partida en varios ítems de la misma línea", () => {
    const p: PaginaPdf = { numero: 1, ancho: 595, alto: 842, items: [{ str: "Firma empleado y", x: 350, y: 430, w: 80, h: 9 }, { str: "fecha de notificacion", x: 435, y: 431, w: 95, h: 9 }] };
    const r = buscarTexto(p, /Firma empleado y fecha de notificaci[oó]n/i);
    assert.equal(r.length, 1);
    assert.ok(r[0].x === 350 && r[0].w === 180, "r[0].x === 350 && r[0].w === 180");
  });
});

describe("REC_SUELDO (pendiente): el test que se destraba cuando se defina la regla", () => {
  it.skip("coloca la firma sobre «Firma Empleado» del ORIGINAL", () => {
    const f = fixture("rec-sueldo");
    const r = resolverColocacion(f.archivo, f.paginas, { nombreFirmante: f.firmante });
    assert.ok(r.ok && r.colocacion.paginaIndex === 0, "r.ok && r.colocacion.paginaIndex === 0");
  });
});
