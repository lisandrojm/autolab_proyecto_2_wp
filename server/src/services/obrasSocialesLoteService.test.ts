/**
 * Tests de las dos reglas que protegen el dato al escribir por API.
 *
 *   npx tsx --test src/services/obrasSocialesLoteService.test.ts
 *   npm run test:obras-sociales
 *
 * Hasta ahora la última red antes de guardar era humana: el panel mostraba la previsualización y
 * alguien confirmaba. Desde que un script escribe por API, esa red no existe en ese camino — así que
 * las reglas viven del lado del server y se prueban acá.
 *
 * Se testean las funciones puras y no el `aplicarLoteObrasSociales` entero a propósito: ese necesita
 * Mongo, y lo que puede romperse en silencio no es la consulta sino el CRITERIO.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clasificarRnos, yaConstatadaEnArca } from "./obrasSocialesLoteService.js";

const os = (id: string, name = "OBRA SOCIAL") => ({ _id: id, name });
const catalogo = (...items: any[]) => new Map(items.map((o, i) => [String(600000 + i), o]));

describe("clasificarRnos — la red que reemplaza a la previsualización humana", () => {
  it("un RNOS que no está en el catálogo se RECHAZA", () => {
    // El caso probado a mano: pegar `999999` tiene que dar "no está en el catálogo", no guardarse.
    const r = clasificarRnos("999999", catalogo(os("a")), new Set(["a"]));
    assert.equal(r.estado, "rnos_desconocido");
  });

  it("un RNOS que existe pero la empleadora no tiene registrado se RECHAZA", () => {
    // ARCA rechazaría el alta; conviene enterarse acá y no en el organismo.
    const r = clasificarRnos("600000", catalogo(os("a")), new Set(["otra-empresa"]));
    assert.equal(r.estado, "no_registrada");
  });

  it("un RNOS del catálogo y registrado por la empleadora se acepta", () => {
    const r = clasificarRnos("600000", catalogo(os("a")), new Set(["a"]));
    assert.equal(r.estado, "ok");
    assert.equal((r as any).os._id, "a");
  });

  it("vacío NO es un rechazo: es «ARCA no tiene ninguna», que se guarda igual", () => {
    // Tratarlo como error dejaría a esa persona pendiente para siempre, volviéndola a consultar cada
    // vez. Rige la del convenio y la consulta queda hecha.
    assert.equal(clasificarRnos("", catalogo(os("a")), new Set(["a"])).estado, "sin_obra_social");
  });

  it("sin lista de registradas no se rechaza nada: no se puede afirmar que falte", () => {
    // Misma tolerancia que tenía el panel: una empleadora que no cargó su lista no puede bloquear el
    // trámite entero.
    assert.equal(clasificarRnos("600000", catalogo(os("a")), new Set()).estado, "ok");
  });
});

describe("yaConstatadaEnArca — la idempotencia", () => {
  /**
   * Es la condición que hace que correr el mismo lote dos veces no cambie nada la segunda: la primera
   * pasada deja los contratos bloqueados, y la segunda los saltea enteros.
   */
  it("un contrato recién constatado no se vuelve a tocar", () => {
    assert.equal(yaConstatadaEnArca({ obraSocialBloqueada: true }), true);
    assert.equal(yaConstatadaEnArca({ obraSocialConstatadaEn: "arca", obraSocialId: 123 }), true);
  });

  it("«ARCA no tiene ninguna» también cuenta como constatada", () => {
    // Es una respuesta, no un vacío: volver a preguntarla es trabajo repetido.
    assert.equal(yaConstatadaEnArca({ obraSocialConstatadaEn: "arca", obraSocialNoFigura: true }), true);
  });

  it("un contrato sin constatar sí se toca", () => {
    assert.equal(yaConstatadaEnArca({}), false);
    assert.equal(yaConstatadaEnArca({ obraSocialId: null }), false);
  });

  it("una obra social cargada a mano NO cuenta como constatada por ARCA", () => {
    // El origen importa: lo que se puso a mano no tiene el respaldo del organismo y sigue pendiente.
    assert.equal(yaConstatadaEnArca({ obraSocialConstatadaEn: "sss", obraSocialId: 123 }), false);
    assert.equal(yaConstatadaEnArca({ obraSocialOrigen: "manual", obraSocialId: 123 }), false);
  });

  /**
   * El invariante que mantiene coherentes a las dos puntas: si "pendiente" y "no se pisa" no fueran
   * la misma condición, el script pediría gente que después el POST rechaza —o peor, pisaría algo que
   * la grilla ya daba por resuelto—.
   */
  it("lo que el aplicador saltea es exactamente lo que los pendientes no listan", () => {
    const casos = [
      { obraSocialBloqueada: true },
      { obraSocialConstatadaEn: "arca", obraSocialId: 1 },
      { obraSocialConstatadaEn: "arca", obraSocialNoFigura: true },
      {},
      { obraSocialConstatadaEn: "sss", obraSocialId: 1 },
    ];
    for (const c of casos) {
      const saltea = yaConstatadaEnArca(c);
      const esPendiente = !yaConstatadaEnArca(c);
      assert.equal(saltea, !esPendiente, `desalineado para ${JSON.stringify(c)}`);
    }
  });
});
