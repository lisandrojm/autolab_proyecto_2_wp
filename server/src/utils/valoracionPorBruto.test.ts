/**
 * Tests de la valoración de las categorías de una función según su BRUTO.
 *
 * Run with:
 *   npx tsx --test src/utils/valoracionPorBruto.test.ts
 *   – o –
 *   npm run test:valoracion
 *
 * De esta regla sale qué categoría se le ofrece a un proyecto Plata: si se equivoca, se ofrece el
 * sueldo equivocado, y eso no falla en ningún lado — aparece en el recibo.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { valorarPorBruto, CategoriaParaValorar } from "./valoracionPorBruto.js";

/* El `orden` 1 es el nivel MÁS ALTO (como quedó en producción: Oro 1, Plata 2). */
const PLATINO = { _id: "platino", orden: 1 };
const ORO = { _id: "oro", orden: 2 };
const PLATA = { _id: "plata", orden: 3 };
const BRONCE = { _id: "bronce", orden: 4 };
/** Las dos de producción, con sus `orden` reales. */
const ORO_PROD = { _id: "oro", orden: 1 };
const PLATA_PROD = { _id: "plata", orden: 2 };

const cat = (id: string, bruto: number | null, convenio = "0634/11"): CategoriaParaValorar => ({ id, convenio, bruto });
const nivelDe = (r: Map<string, { valoracionId: string | null }>, id: string) => r.get(id)?.valoracionId ?? null;

describe("valorarPorBruto — de menor a mayor", () => {
  it("Camarógrafo: la más barata Plata, las otras dos Oro", () => {
    const r = valorarPorBruto([cat("realizador", 1842179), cat("conductor", 1073962), cat("operador", 1481790)], [ORO, PLATA]);
    assert.equal(nivelDe(r, "conductor"), "plata");
    assert.equal(nivelDe(r, "operador"), "oro");
    assert.equal(nivelDe(r, "realizador"), "oro");
  });

  it("el nivel sale del ORDEN de la valoración, no del orden en que llegan", () => {
    // Si se tomara el orden de la lista, pasar [ORO, PLATA] daría la barata en Oro.
    const r = valorarPorBruto([cat("a", 100), cat("b", 200)], [ORO, PLATA]);
    assert.equal(nivelDe(r, "a"), "plata");
  });

  it("ORDEN 1 ES EL NIVEL MÁS ALTO: con Oro 1 y Plata 2, la barata es Plata", () => {
    /*
      Es la convención que quedó en producción (se ordenó Oro arriba). Leído al revés —1 como el
      nivel más bajo— la categoría más barata de cada función se habría ofrecido como Oro.
    */
    const r = valorarPorBruto([cat("barata", 100), cat("cara", 200)], [ORO_PROD, PLATA_PROD]);
    assert.equal(nivelDe(r, "barata"), "plata");
    assert.equal(nivelDe(r, "cara"), "oro");
  });

  it("mismo bruto, mismo nivel: dos empatadas en la más barata son las dos Plata", () => {
    const r = valorarPorBruto([cat("apuntador", 5460313), cat("tira", 5460313), cat("unitario", 6066032)], [PLATA, ORO]);
    assert.equal(nivelDe(r, "apuntador"), "plata");
    assert.equal(nivelDe(r, "tira"), "plata");
    assert.equal(nivelDe(r, "unitario"), "oro");
  });

  it("con cuatro niveles escala sola: Bronce, Plata, Oro, Platino", () => {
    const r = valorarPorBruto([cat("1", 10), cat("2", 20), cat("3", 30), cat("4", 40), cat("5", 50)], [PLATINO, ORO, PLATA, BRONCE]);
    assert.deepEqual(["1", "2", "3", "4", "5"].map((id) => nivelDe(r, id)), ["bronce", "plata", "oro", "platino", "platino"]);
  });

  it("con más niveles que categorías, se usan los de abajo", () => {
    const r = valorarPorBruto([cat("barata", 10), cat("cara", 20)], [BRONCE, PLATA, ORO, PLATINO]);
    assert.equal(nivelDe(r, "barata"), "bronce");
    assert.equal(nivelDe(r, "cara"), "plata");
  });
});

describe("valorarPorBruto — lo que queda sin valorar", () => {
  it("la única categoría de un convenio queda sin valorar, con el motivo", () => {
    const r = valorarPorBruto([cat("unica", 1000)], [PLATA, ORO]);
    assert.equal(nivelDe(r, "unica"), null);
    assert.match(r.get("unica")?.motivo || "", /única/);
  });

  it("todas al mismo bruto: no hay una más barata", () => {
    const r = valorarPorBruto([cat("a", 1000), cat("b", 1000)], [PLATA, ORO]);
    assert.equal(nivelDe(r, "a"), null);
    assert.match(r.get("a")?.motivo || "", /mismo/);
  });

  it("sin bruto no se valora, y no arrastra a las demás", () => {
    const r = valorarPorBruto([cat("sin", null), cat("barata", 10), cat("cara", 20)], [PLATA, ORO]);
    assert.equal(nivelDe(r, "sin"), null);
    assert.equal(nivelDe(r, "barata"), "plata");
    assert.equal(nivelDe(r, "cara"), "oro");
  });

  it("sin valoraciones activas, nada", () => {
    const r = valorarPorBruto([cat("a", 10), cat("b", 20)], []);
    assert.equal(nivelDe(r, "a"), null);
  });
});

describe("valorarPorBruto — por convenio", () => {
  it("cada convenio tiene su propia más barata", () => {
    // La más barata de la función es del 0131/75, pero un proyecto que contrata por el 0634/11
    // también tiene que tener su opción Plata.
    const r = valorarPorBruto([cat("tv-barata", 900, "0634/11"), cat("tv-cara", 1500, "0634/11"), cat("otro-barata", 500, "0131/75"), cat("otro-cara", 800, "0131/75")], [PLATA, ORO]);
    assert.equal(nivelDe(r, "tv-barata"), "plata");
    assert.equal(nivelDe(r, "otro-barata"), "plata");
    assert.equal(nivelDe(r, "tv-cara"), "oro");
    assert.equal(nivelDe(r, "otro-cara"), "oro");
  });
});
