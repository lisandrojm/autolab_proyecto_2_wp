import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planDeReparacion } from "./reparacionEstadosImpositivos.js";

const semillas = [{ name: "Pedido de AFIP", tipoImpositivo: "alta_temprana_afip" }, { name: "Pedido de Servicios", tipoImpositivo: "constancia_cuit" }];
const estado = (_id: string, name: string, tipoImpositivo: string, contratoFrameIds: string[], id = 1) => ({ _id, name, data: { id, esSistema: true, tipoImpositivo, contratoFrameIds } });

describe("planDeReparacion", () => {
  it("renombrado + recreado: queda el de los tipos, con el nombre de fábrica", () => {
    const [p] = planDeReparacion([estado("nuevo", "Pedido de AFIP", "alta_temprana_afip", []), estado("viejo", "AFIP", "alta_temprana_afip", ["a", "b"])], semillas);
    assert.equal(p.conservar._id, "viejo");
    assert.equal(p.renombrar, true);
    assert.equal(p.nombreFinal, "Pedido de AFIP");
    assert.deepEqual(p.borrar.map((b) => b._id), ["nuevo"]);
    assert.deepEqual(p.contratoFrameIds, ["a", "b"]);
  });
  it("los tipos del que se borra pasan al que queda", () => {
    const [p] = planDeReparacion([estado("x", "Servicios", "constancia_cuit", ["a", "b"]), estado("y", "Pedido de Servicios", "constancia_cuit", ["c"])], semillas);
    assert.deepEqual([...p.contratoFrameIds].sort(), ["a", "b", "c"]);
  });
  it("sin dobles y con su nombre: nada que hacer", () => {
    assert.deepEqual(planDeReparacion([estado("a", "Pedido de AFIP", "alta_temprana_afip", ["t"]), estado("b", "Pedido de Servicios", "constancia_cuit", [])], semillas), []);
  });
  it("uno solo pero renombrado: vuelve al nombre de fábrica", () => {
    const [p] = planDeReparacion([estado("a", "AFIP", "alta_temprana_afip", ["t"])], semillas);
    assert.equal(p.renombrar, true);
    assert.equal(p.borrar.length, 0);
  });
  it("los que no son de sistema no se tocan", () => {
    assert.deepEqual(planDeReparacion([{ _id: "z", name: "AFIP", data: { tipoImpositivo: "alta_temprana_afip" } }], semillas), []);
  });
});
