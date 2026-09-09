import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { XMLParser } from "fast-xml-parser";
import { elegirDomicilio } from "../afipService.js";

/**
 * EL DOMICILIO DEL PADRÓN, Y LA TRAMPA DE UNA SOLA ETIQUETA.
 *
 * `<domicilio>` tiene multiplicidad 0..* en el A13 (§4.2 del manual): puede venir el FISCAL, el
 * LEGAL/REAL, los dos, o ninguno. Pero `XMLParser` se construye sin `isArray` —igual que en
 * `soapPost`—, así que dos etiquetas llegan como array y UNA SOLA llega como objeto.
 *
 * Ese es el bug que este test existe para atrapar: un `.find()` sobre el objeto no rompe, devuelve
 * `undefined` sin decir nada, y el domicilio desaparecería para toda persona que tenga uno solo
 * declarado. Se vería como «ARCA no lo mandó» y no como un error nuestro.
 *
 * Se parsea XML de verdad, con las MISMAS opciones que usa `soapPost`, en vez de armar el objeto a
 * mano: si el objeto se arma a mano, el test pasa aunque el parser haga otra cosa.
 *
 * Run with:
 *   npx tsx --test src/services/arca/domicilioPadron.test.ts
 *   – o –
 *   npm run test:domicilio-padron
 */

const parsear = (xml: string): any => {
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: false });
  return parser.parse(xml).persona;
};

/** Los dos domicilios del ejemplo del manual (p. 11): FISCAL primero, LEGAL/REAL después. */
const PERSONA_CON_DOS = `<persona>
  <domicilio>
    <calle>AV LOS INCAS</calle>
    <codigoPostal>5881</codigoPostal>
    <descripcionProvincia>SAN LUIS</descripcionProvincia>
    <direccion>AV LOS INCAS 4137</direccion>
    <idProvincia>11</idProvincia>
    <localidad>MERLO</localidad>
    <numero>4137</numero>
    <tipoDomicilio>FISCAL</tipoDomicilio>
  </domicilio>
  <domicilio>
    <calle>SAN RAMON</calle>
    <codigoPostal>4600</codigoPostal>
    <descripcionProvincia>JUJUY</descripcionProvincia>
    <direccion>SAN RAMON 415</direccion>
    <idProvincia>6</idProvincia>
    <localidad>CHIJRA</localidad>
    <numero>415</numero>
    <tipoDomicilio>LEGAL/REAL</tipoDomicilio>
  </domicilio>
</persona>`;

const PERSONA_CON_UNO = `<persona>
  <domicilio>
    <calle>AV LOS INCAS</calle>
    <codigoPostal>5881</codigoPostal>
    <descripcionProvincia>SAN LUIS</descripcionProvincia>
    <idProvincia>11</idProvincia>
    <localidad>MERLO</localidad>
    <numero>4137</numero>
    <tipoDomicilio>FISCAL</tipoDomicilio>
  </domicilio>
</persona>`;

describe("elegirDomicilio — cuál de los domicilios del padrón va a la ficha", () => {
  it("con los dos declarados, se queda con el LEGAL/REAL", () => {
    const d = elegirDomicilio(parsear(PERSONA_CON_DOS));
    // El legal/real es el que más se parece a dónde vive la persona; el fiscal es el declarado ante ARCA.
    assert.equal(d?.tipo, "LEGAL/REAL");
    assert.equal(d?.calle, "SAN RAMON");
    assert.equal(d?.numero, "415");
    assert.equal(d?.localidad, "CHIJRA");
    assert.equal(d?.codigoPostal, "4600");
    assert.equal(d?.provincia, "JUJUY");
  });

  it("con UNA sola etiqueta —que el parser entrega como objeto, no como array— igual la encuentra", () => {
    const d = elegirDomicilio(parsear(PERSONA_CON_UNO));
    assert.equal(d?.tipo, "FISCAL");
    assert.equal(d?.calle, "AV LOS INCAS");
    assert.equal(d?.numero, "4137");
  });

  it("sin domicilios devuelve undefined, no un objeto de campos vacíos", () => {
    // Un objeto con todo en undefined haría que el formulario "prellene" pisando con vacío.
    assert.equal(elegirDomicilio(parsear("<persona><nombre>JAZMIN</nombre></persona>")), undefined);
    assert.equal(elegirDomicilio(undefined), undefined);
    assert.equal(elegirDomicilio(null), undefined);
  });

  it("los números llegan como número y salen como texto", () => {
    // El parser convierte `<numero>415</numero>` a Number; el formulario espera strings.
    const d = elegirDomicilio(parsear(PERSONA_CON_UNO));
    assert.equal(typeof d?.numero, "string");
    assert.equal(typeof d?.codigoPostal, "string");
  });

  it("un campo vacío no viaja como string vacío", () => {
    // `<localidad></localidad>` se parsea como "" y pisaría lo que la persona ya tenía cargado.
    const d = elegirDomicilio(parsear("<persona><domicilio><calle>ZAPIOLA</calle><localidad></localidad><tipoDomicilio>FISCAL</tipoDomicilio></domicilio></persona>"));
    assert.equal(d?.calle, "ZAPIOLA");
    assert.equal(d?.localidad, undefined);
  });
});
