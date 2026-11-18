/**
 * Etapa 2c: las referencias de otras colecciones guardan la clave del contrato. Sin base.
 *
 *   npm run test:referencias-clave
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Types } from "mongoose";
import { claveEnPosicion, filtroDeContrato, huellaNoCoincide, indiceDeReferencia } from "./identidadContrato.js";
const k = () => new Types.ObjectId();
const [k0, k1, k2] = [k(), k(), k()];
const contratos = [
    { contratoKey: k0, fecha_alta_contrato: "2026-01-01", fecha_baja_contrato: "2026-03-31", empresaContratoId: "e1" },
    { contratoKey: k1, estadoContrato: "ANULADO" },
    { contratoKey: k2, fecha_alta_contrato: "01/05/2026", fecha_baja_contrato: null, empresaContratoId: "e2" },
];
test("claveEnPosicion: la clave de esa posición, también de una lápida; null fuera de rango o sin clave", () => {
    assert.equal(String(claveEnPosicion(contratos, 0)), String(k0));
    assert.equal(String(claveEnPosicion(contratos, 1)), String(k1));
    assert.equal(claveEnPosicion(contratos, 3), null);
    assert.equal(claveEnPosicion(contratos, -1), null);
    assert.equal(claveEnPosicion(contratos, null), null);
    assert.equal(claveEnPosicion([{}], 0), null);
});
test("indiceDeReferencia: manda la clave; la posición sólo sin clave; clave desconocida = rota (-1), nunca la posición", () => {
    assert.equal(indiceDeReferencia(contratos, { contratoKey: k2, indice: 0 }), 2, "la clave gana aunque la posición diga otra cosa");
    assert.equal(indiceDeReferencia(contratos, { contratoKey: String(k0) }), 0, "acepta la clave como texto");
    assert.equal(indiceDeReferencia(contratos, { contratoKey: k(), indice: 0 }), -1, "una clave que no está no cae a la posición");
    assert.equal(indiceDeReferencia(contratos, { contratoKey: null, indice: 2 }), 2, "lo viejo sin clave: por posición");
    assert.equal(indiceDeReferencia(contratos, { indice: 9 }), -1);
    assert.equal(indiceDeReferencia(contratos, { indice: null }), -1);
});
test("filtroDeContrato: lo de su clave + lo viejo sin clave en su posición; sin clave, sólo la posición", () => {
    assert.deepEqual(filtroDeContrato(3, null), { contractIndex: 3 });
    const f = filtroDeContrato(3, k0);
    assert.deepEqual(f.$or[0], { contratoKey: k0 });
    assert.deepEqual(f.$or[1].$and[0], { contractIndex: 3 });
    assert.deepEqual(f.$or[1].$and[1], { $or: [{ contratoKey: null }, { contratoKey: { $exists: false } }] });
    const g = filtroDeContrato(1, k1, "indiceContrato", "metadata.renovacionDe.");
    assert.deepEqual(g.$or[0], { "metadata.renovacionDe.contratoKey": k1 });
    assert.deepEqual(g.$or[1].$and[0], { "metadata.renovacionDe.indiceContrato": 1 });
});
test("huellaNoCoincide: compara alta, baja y empleadora normalizando el formato de fecha", () => {
    assert.equal(huellaNoCoincide(contratos[0], { alta: "2026-01-01", baja: "2026-03-31", empresaId: "e1" }), null);
    assert.equal(huellaNoCoincide(contratos[2], { alta: "2026-05-01" }), null, "DD/MM/YYYY en el contrato");
    assert.equal(huellaNoCoincide(contratos[0], {}), null, "sin nada que comparar, coincide");
    assert.match(huellaNoCoincide(contratos[0], { alta: "2026-02-01" }), /^alta/);
    assert.match(huellaNoCoincide(contratos[0], { baja: "2026-04-30" }), /^baja/);
    assert.match(huellaNoCoincide(contratos[2], { baja: "2026-04-30" }), /sin baja/);
    assert.match(huellaNoCoincide(contratos[0], { empresaId: "e2" }), /^empleadora/);
    assert.match(huellaNoCoincide(undefined, {}), /no hay contrato/);
});
/*
  CADA ESCRITOR DE UNA REFERENCIA PONE LA CLAVE. Barrido del código: todo sitio (fuera de scripts y
  tests) que escribe `contractIndex`/`indiceContrato` en una de las 7 colecciones tiene que escribir
  también `contratoKey` cerca. Un escritor nuevo que se olvide hace fallar esto.
*/
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITIOS = [
    { archivo: "services/arca/verificacionAltas.ts", patron: /ArcaVerificacionAlta\.create\(|\$push: \{ contratos:/, ventana: 6 },
    { archivo: "services/arca/corridaAltas.ts", patron: /contractIndex: (i|x\.item)\.contractIndex,.*resultado/, ventana: 0 }, // las líneas del log (`aItem` arma ítems en memoria para el motor: no se guardan)
    { archivo: "services/arca/constanciasArca.ts", patron: /^\s*contractIndex: o\.idx,/, ventana: 1 },
    { archivo: "services/recibosSueldo.ts", patron: /contractIndex"?:? .*contrato\??\.contractIndex|r\.contractIndex = |^\s*contractIndex: r\.contractIndex/, ventana: 1 },
    { archivo: "services/referenciasContrato.ts", patron: /\$set: \{ (contractIndex|"recibos\.\$\[r\]\.contractIndex")/, ventana: 0 },
    { archivo: "routes/contratosPorVencer.ts", patron: /RenovacionContrato\.updateOne\(/, ventana: 8 },
    { archivo: "services/solicitudes.ts", patron: /RenovacionContrato\.updateOne\(/, ventana: 10 },
];
for (const s of SITIOS) {
    test(`escritor de referencia lleva la clave: ${s.archivo}`, () => {
        const lineas = fs.readFileSync(path.join(raiz, s.archivo), "utf8").split("\n");
        const hits = lineas.flatMap((l, i) => (s.patron.test(l) ? [i] : []));
        assert.ok(hits.length > 0, `no encontré el sitio en ${s.archivo}: si se movió, actualizá esta prueba`);
        for (const i of hits) {
            const tramo = lineas.slice(i, i + s.ventana + 1).join("\n");
            assert.match(tramo, /contratoKey/, `${s.archivo}:${i + 1} escribe la posición sin la clave`);
        }
    });
}
