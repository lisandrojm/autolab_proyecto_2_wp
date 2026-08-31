/**
 * La resolución de carpetas: por propósito primero, por nombre solo como último recurso.
 *
 * EL CASO QUE JUSTIFICA TODO EL CAMBIO está en el bloque «carpeta renombrada»: con la resolución
 * por nombre, renombrar una carpeta en Dropbox hacía que la transición dejara de dispararse **sin
 * error, sin log y sin ningún síntoma** hasta que alguien notaba que los contratos no avanzaban.
 * Acá queda escrito que con propósito eso ya no pasa, y que sin propósito sigue pasando.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { elegirCarpeta, elegirSinCuit, EstadoConCarpetas } from "./estadoCarpetas.js";

/** La configuración real del tenant demo, después del backfill. */
const CONFIGURADO: EstadoConCarpetas[] = [
  {
    name: "Envio de documentacion",
    carpetas: [
      { dropboxCarpeta: "/WEPRODU/ARCA/Alta temprana de Arca", proposito: "alta_temprana" },
      { dropboxCarpeta: "/WEPRODU/ARCA/Constancia de cuit", proposito: "constancia_cuit" },
      { dropboxCarpeta: "/WEPRODU/ARCA/Sin cuit", proposito: "sin_cuit", detalle: "Personas sin CUIT/CUIL" },
    ],
  },
  { name: "Disponible", carpetas: [{ dropboxCarpeta: "/HelloSign/Requested signatures", proposito: "firmados" }] },
  { name: "Firma pendiente", carpetas: [{ dropboxCarpeta: "/HelloSign/Outbox", proposito: "outbox" }] },
  { name: "Firma enviada", carpetas: [{ dropboxCarpeta: "/HelloSign/Pendbox", proposito: "pendbox" }] },
];

/** La misma configuración ANTES del backfill: sin `proposito`, solo nombres. */
const SIN_MIGRAR: EstadoConCarpetas[] = CONFIGURADO.map((e) => ({ name: e.name, carpetas: e.carpetas.map(({ dropboxCarpeta, detalle }) => ({ dropboxCarpeta, detalle })) }));

describe("resolución por propósito", () => {
  it("los seis resuelven, y dicen que fue por propósito", () => {
    for (const [p, esperado] of [
      ["alta_temprana", "/WEPRODU/ARCA/Alta temprana de Arca"],
      ["constancia_cuit", "/WEPRODU/ARCA/Constancia de cuit"],
      ["sin_cuit", "/WEPRODU/ARCA/Sin cuit"],
      ["outbox", "/HelloSign/Outbox"],
      ["pendbox", "/HelloSign/Pendbox"],
      ["firmados", "/HelloSign/Requested signatures"],
    ] as Array<[any, string]>) {
      const r = elegirCarpeta(CONFIGURADO, p);
      assert.equal(r.carpeta, esperado, p);
      assert.equal(r.origen, "proposito", p);
    }
  });

  it("dice en QUÉ estado está configurada, para saber dónde arreglarla", () => {
    assert.equal(elegirCarpeta(CONFIGURADO, "outbox").estado, "Firma pendiente");
  });

  it("un propósito sin carpeta no resuelve, y no inventa una parecida", () => {
    const soloOutbox: EstadoConCarpetas[] = [{ name: "X", carpetas: [{ dropboxCarpeta: "/HelloSign/Outbox", proposito: "outbox" }] }];
    const r = elegirCarpeta(soloOutbox, "firmados");
    assert.equal(r.carpeta, null);
    assert.equal(r.origen, "no_resuelta");
  });
});

describe("fallback por patrón (carpetas sin migrar)", () => {
  it("resuelve igual, pero avisa que fue por el nombre", () => {
    const r = elegirCarpeta(SIN_MIGRAR, "outbox");
    assert.equal(r.carpeta, "/HelloSign/Outbox");
    assert.equal(r.origen, "patron", "tiene que quedar dicho que resolvió de casualidad, no por propósito");
  });

  it("los seis siguen resolviendo sin migrar: el backfill no es un requisito para operar", () => {
    for (const p of ["alta_temprana", "constancia_cuit", "sin_cuit", "outbox", "pendbox", "firmados"] as const) {
      assert.ok(elegirCarpeta(SIN_MIGRAR, p).carpeta, p);
    }
  });

  it("una carpeta con OTRO propósito NO se presta por parecido de nombre", () => {
    /*
      El acierto por casualidad, que es el riesgo de ensanchar el patrón.

      Acá la única carpeta que existe dice explícitamente que es «firmados». Aunque su nombre matchee
      el patrón de outbox, no puede usarse para outbox: alguien ya decidió qué es, y el patrón no
      puede pisar una decisión explícita.
    */
    const confusa: EstadoConCarpetas[] = [{ name: "X", carpetas: [{ dropboxCarpeta: "/HelloSign/Outbox", proposito: "firmados" }] }];
    assert.equal(elegirCarpeta(confusa, "outbox").carpeta, null);
  });

  it("el propósito le gana al patrón aunque el nombre diga otra cosa", () => {
    // Una carpeta llamada «Acuses» marcada como alta_temprana gana sobre otra llamada «Alta temprana
    // de Arca» sin propósito. Es exactamente el escenario después de un renombre bien registrado.
    const mixto: EstadoConCarpetas[] = [
      { name: "A", carpetas: [{ dropboxCarpeta: "/X/Alta temprana de Arca" }] },
      { name: "B", carpetas: [{ dropboxCarpeta: "/X/Acuses", proposito: "alta_temprana" }] },
    ];
    const r = elegirCarpeta(mixto, "alta_temprana");
    assert.equal(r.carpeta, "/X/Acuses");
    assert.equal(r.origen, "proposito");
  });
});

describe("carpeta renombrada — el fallo silencioso que motivó el cambio", () => {
  const renombrada = (proposito?: string): EstadoConCarpetas[] => [{ name: "Envio de documentacion", carpetas: [{ dropboxCarpeta: "/WEPRODU/ARCA/Acuses", ...(proposito ? { proposito } : {}) }] }];

  it("SIN propósito, un renombre deja de resolver: nada avisa", () => {
    const r = elegirCarpeta(renombrada(), "alta_temprana");
    assert.equal(r.carpeta, null);
    assert.equal(r.origen, "no_resuelta");
  });

  it("CON propósito, el mismo renombre sigue resolviendo", () => {
    const r = elegirCarpeta(renombrada("alta_temprana"), "alta_temprana");
    assert.equal(r.carpeta, "/WEPRODU/ARCA/Acuses");
    assert.equal(r.origen, "proposito");
  });

  it("«Requested signatures» traducida a «Firmados» rompe el patrón y no el propósito", () => {
    const traducida: EstadoConCarpetas[] = [{ name: "Disponible", carpetas: [{ dropboxCarpeta: "/HelloSign/Firmados" }] }];
    assert.equal(elegirCarpeta(traducida, "firmados").carpeta, null);

    const conProposito: EstadoConCarpetas[] = [{ name: "Disponible", carpetas: [{ dropboxCarpeta: "/HelloSign/Firmados", proposito: "firmados" }] }];
    assert.equal(elegirCarpeta(conProposito, "firmados").carpeta, "/HelloSign/Firmados");
  });
});

describe("«Sin CUIT»: la deducción también pasa por propósito", () => {
  it("si está configurada, se usa esa", () => {
    const r = elegirSinCuit(CONFIGURADO);
    assert.equal(r.carpeta, "/WEPRODU/ARCA/Sin cuit");
    assert.equal(r.origen, "proposito");
  });

  it("si no está, se deduce como hermana de la de Constancia — resuelta POR PROPÓSITO", () => {
    // Antes la deducción resolvía Constancia por patrón, así que seguía atada al nombre por la
    // puerta de atrás. Acá Constancia se llama «Acuse fiscal»: el patrón no la encontraría.
    const sinSinCuit: EstadoConCarpetas[] = [{ name: "E", carpetas: [{ dropboxCarpeta: "/WEPRODU/ARCA/Acuse fiscal", proposito: "constancia_cuit" }] }];
    const r = elegirSinCuit(sinSinCuit);
    assert.equal(r.carpeta, "/WEPRODU/ARCA/Sin cuit");
    assert.equal(r.origen, "derivada", "tiene que quedar dicho que la ruta se dedujo y no está configurada");
  });

  it("sin Constancia tampoco, no se deduce nada", () => {
    assert.equal(elegirSinCuit([{ name: "E", carpetas: [{ dropboxCarpeta: "/HelloSign/Outbox", proposito: "outbox" }] }]).carpeta, null);
  });
});
