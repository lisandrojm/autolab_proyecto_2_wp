/**
 * Tests de la cuenta de una escala salarial, con los valores REALES del CCT 634/11.
 *
 * Run with:
 *   npx tsx --test src/utils/escalaCalculo.test.ts
 *   – o –
 *   npm run test:escalas-634
 *
 * Los números de abril 2026 salen del Anexo A del acta ATA–CAPIT–SATTSAID (expediente
 * RE-2026-43103223-APN-DTD#JGM); los de junio 2026, de los importes que ya están cargados en el
 * sistema para ese tramo. Los dos juegos son fuente, no invención: si esta cuenta se mueve, el sueldo
 * que se le ofrece a alguien se mueve con ella.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { calcularEscalaGrupo, compararConActa, deducirAdicionalPct, redondearCentavos } from "./escalaCalculo.js";

describe("calcularEscalaGrupo — Anexo A, abril 2026", () => {
  it("grupo 1: A = 1.132.832,62 y B = 62,5 % dan C, D y total del acta", () => {
    const e = calcularEscalaGrupo({ basico: 1132832.62, adicionalPct: 62.5 });
    assert.equal(e.adicionalMonto, 708020.39); // C
    assert.equal(e.presentismoMonto, 184085.3); // D
    assert.equal(e.total, 2024938.31);
  });
});

describe("calcularEscalaGrupo — tramo de junio 2026", () => {
  /* Los cuatro grupos que están cargados con estos importes exactos. */
  it("grupo 1 (62,5 %)", () => {
    const e = calcularEscalaGrupo({ basico: 1187208.59, adicionalPct: 62.5 });
    assert.equal(e.adicionalMonto, 742005.37);
    assert.equal(e.presentismoMonto, 192921.4);
    assert.equal(e.total, 2122135.35);
  });

  it("grupo 3 (38 %)", () => {
    const e = calcularEscalaGrupo({ basico: 1057091.72, adicionalPct: 38 });
    assert.equal(e.adicionalMonto, 401694.85);
    assert.equal(e.presentismoMonto, 145878.66);
    assert.equal(e.total, 1604665.23);
  });

  it("grupo 7 (26,5 %)", () => {
    const e = calcularEscalaGrupo({ basico: 838211.43, adicionalPct: 26.5 });
    assert.equal(e.adicionalMonto, 222126.03);
    assert.equal(e.presentismoMonto, 106033.75);
    assert.equal(e.total, 1166371.2);
  });
});

describe("el total sale de la cadena exacta, no de sumar los redondeados", () => {
  it("grupo 1 de junio: sumar los importes redondeados da un centavo de más", () => {
    /*
     * Es LA razón por la que la cuenta no redondea paso a paso. Con A = 1.187.208,59:
     *   cadena exacta  → 2.122.135,35  ← lo que dice el acta
     *   C + D ya redondeados → 2.122.135,36
     * Un centavo por grupo por mes, por toda la plantilla, aparece en la conciliación y en ninguna
     * pantalla. Lo mismo pasa en el grupo 7.
     */
    const e = calcularEscalaGrupo({ basico: 1187208.59, adicionalPct: 62.5 });
    assert.equal(e.total, 2122135.35);
    assert.equal(redondearCentavos(e.basico + e.adicionalMonto + e.presentismoMonto), 2122135.36);
  });
});

describe("compararConActa — el acta manda, la cuenta sólo avisa", () => {
  it("cuando cierra, no hay diferencias", () => {
    const e = calcularEscalaGrupo({ basico: 1057091.72, adicionalPct: 38 });
    assert.deepEqual(compararConActa(e, { adicionalMonto: 401694.85, presentismoMonto: 145878.66, total: 1604665.23 }), []);
  });

  it("grupo 8 de junio: el acta declara un centavo MÁS que A+C+D", () => {
    const e = calcularEscalaGrupo({ basico: 790549.83, adicionalPct: 23.5 });
    assert.equal(e.total, 1073961.94);
    const difs = compararConActa(e, { adicionalMonto: 185779.21, presentismoMonto: 97632.9, total: 1073961.95 });
    assert.equal(difs.length, 1);
    assert.equal(difs[0].campo, "total");
    assert.equal(difs[0].delta, 0.01);
    assert.equal(difs[0].acta, 1073961.95);
  });

  it("grupo 12 de junio: el adicional está truncado y el total queda un centavo abajo", () => {
    const e = calcularEscalaGrupo({ basico: 615952.41, adicionalPct: 16 });
    assert.equal(e.adicionalMonto, 98552.39);
    assert.equal(e.total, 785955.28);
    const difs = compararConActa(e, { adicionalMonto: 98552.38, presentismoMonto: 71450.48, total: 785955.27 });
    assert.deepEqual(
      difs.map((d) => [d.campo, d.delta]),
      [
        ["adicionalMonto", -0.01],
        ["total", -0.01],
      ]
    );
  });

  it("lo que el acta no trae, no se compara", () => {
    const e = calcularEscalaGrupo({ basico: 615952.41, adicionalPct: 16 });
    assert.deepEqual(compararConActa(e, { total: null, neto: undefined }), []);
  });
});

describe("neto sugerido", () => {
  it("el factor 0,81 reproduce el neto vigente del grupo 1", () => {
    // 2.255.744,99 × 0,81 = 1.827.153,44, que es el neto cargado. Igual es un SUPUESTO: hay grupos
    // cuyo neto redondea para el otro lado, así que el neto real siempre viene del acta.
    const e = calcularEscalaGrupo({ basico: 1261955.24, adicionalPct: 62.5 });
    assert.equal(e.total, 2255744.99);
    assert.equal(e.netoSugerido, 1827153.44);
  });

  it("el factor se puede cambiar por período", () => {
    const e = calcularEscalaGrupo({ basico: 1000000, adicionalPct: 0, presentismoPct: 0, netoFactor: 0.83 });
    assert.equal(e.netoSugerido, 830000);
  });
});

describe("deducirAdicionalPct — para migrar lo que ya está cargado", () => {
  it("saca el 62,5 % del grupo 1", () => {
    assert.equal(deducirAdicionalPct(1261955.24, 788722.03), 62.5);
  });

  it("deja ver el grupo 8: su adicional vigente implica 23,5025 %, no 23,5 %", () => {
    // $21,15 de diferencia contra 840.232,85 × 23,5 %. Es el caso que justifica guardar A y B como
    // datos de origen: con sólo A y C, el error es invisible.
    assert.equal(deducirAdicionalPct(840232.85, 197475.87), 23.5025);
  });

  it("sin básico no hay porcentaje que deducir", () => {
    assert.equal(deducirAdicionalPct(0, 100), null);
  });
});
