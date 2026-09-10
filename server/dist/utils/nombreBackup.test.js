import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { backupDbName, siguienteSlot, preflight, backupMeta, esBaseDeCopia, truncarBytes, MAX_DB_BYTES } from "./nombreBackup.js";
/**
 * Los nombres de las bases de copia contra el límite de 38 bytes de Atlas Free/Flex.
 *
 * Es lo que hizo fallar el backup en producción: el nombre llevaba la fecha y daba 53 bytes. Todo lo de
 * acá se puede probar sin tocar ninguna base.
 *
 * Run with:  npx tsx --test src/utils/nombreBackup.test.ts  —o—  npm run test:nombre-backup
 */
const B = (s) => Buffer.byteLength(s, "utf8");
const ORIGEN = "weprodu_production_integration"; // 30 bytes: la base real
describe("backupDbName", () => {
    it("la base real entra en los dos slots, con margen", () => {
        assert.equal(backupDbName(ORIGEN, "A"), "weprodu_production_integration_bkpA");
        assert.equal(backupDbName(ORIGEN, "B"), "weprodu_production_integration_bkpB");
        assert.equal(B(backupDbName(ORIGEN, "A")), 35);
        assert.equal(B(backupDbName(ORIGEN, "B")), 35);
    });
    it("el esquema viejo NO entraba: es el error que estamos arreglando", () => {
        assert.ok(B("weprodu_production_integration_backup_2026-09-10_1048") > MAX_DB_BYTES);
    });
    it("una base larga se recorta con hash y queda EXACTAMENTE en el límite", () => {
        const larga = "una_base_con_un_nombre_larguisimo_que_no_entra_ni_a_palos";
        const a = backupDbName(larga, "A");
        assert.equal(B(a), MAX_DB_BYTES, `${a} debería ocupar ${MAX_DB_BYTES} bytes`);
        assert.match(a, /_bkpA$/);
    });
    it("dos bases con el mismo prefijo largo NO terminan en la misma copia", () => {
        // Sin el hash, la segunda pisaría a la primera sin que nada avisara.
        const uno = "weprodu_production_integration_de_la_vieja_epoca_uno";
        const otro = "weprodu_production_integration_de_la_vieja_epoca_dos";
        assert.notEqual(backupDbName(uno, "A"), backupDbName(otro, "A"));
    });
    it("respeta un límite distinto: en M10 el tope es otro", () => {
        assert.equal(B(backupDbName(ORIGEN, "A", 64)), 35, "si entra, no recorta");
        const larga = "x".repeat(80);
        assert.equal(B(backupDbName(larga, "A", 64)), 64);
    });
});
describe("siguienteSlot", () => {
    it("alterna, y sin copia previa arranca en A", () => {
        assert.equal(siguienteSlot(undefined), "A");
        assert.equal(siguienteSlot(null), "A");
        assert.equal(siguienteSlot("A"), "B");
        assert.equal(siguienteSlot("B"), "A");
    });
    it("dos ciclos seguidos no escriben nunca sobre la copia buena", () => {
        let ultimoOk = null;
        for (let i = 0; i < 4; i++) {
            const destino = siguienteSlot(ultimoOk);
            assert.notEqual(destino, ultimoOk, "se escribiría encima de la única copia completa");
            ultimoOk = destino;
        }
    });
});
describe("preflight", () => {
    it("con la base real y sus colecciones no encuentra problemas", () => {
        const r = preflight({ baseOrigen: ORIGEN, slot: "A", colecciones: ["users", "userprojects", "requests"], coleccionesEnCluster: 200 });
        assert.deepEqual(r.problemas, []);
        assert.equal(r.dbName, "weprodu_production_integration_bkpA");
    });
    it("detecta un namespace que pasa los 95 bytes", () => {
        const r = preflight({ baseOrigen: ORIGEN, slot: "A", colecciones: ["c".repeat(70)] });
        assert.equal(r.problemas.length, 1);
        assert.match(r.problemas[0], /namespace/);
    });
    it("detecta el tope de 500 colecciones del cluster", () => {
        const r = preflight({ baseOrigen: ORIGEN, slot: "A", colecciones: Array.from({ length: 58 }, (_, i) => `col${i}`), coleccionesEnCluster: 460 });
        assert.equal(r.problemas.length, 1);
        assert.match(r.problemas[0], /518 colecciones/);
    });
    it("sin el dato de cuántas colecciones hay en el cluster, no inventa un problema", () => {
        // `listDatabases` pide permisos de admin que en Free/Flex no tenemos: el chequeo se saltea.
        const r = preflight({ baseOrigen: ORIGEN, slot: "A", colecciones: ["users"] });
        assert.deepEqual(r.problemas, []);
    });
});
describe("esBaseDeCopia", () => {
    it("reconoce los dos slots de su base de origen", () => {
        assert.equal(esBaseDeCopia("weprodu_production_integration_bkpA", ORIGEN), true);
        assert.equal(esBaseDeCopia("weprodu_production_integration_bkpB", ORIGEN), true);
    });
    it("NO reconoce nada más: es la última barrera antes de un dropDatabase", () => {
        // En este cluster conviven bases de otros proyectos; borrar la equivocada no se deshace.
        for (const ajena of [ORIGEN, "weprodu_mvp_new", "raal_prod", "staff", "local", "weprodu_production_integration_backup_2026-09-10_1048"]) {
            assert.equal(esBaseDeCopia(ajena, ORIGEN), false, `${ajena} no es una copia y no se puede borrar`);
        }
    });
});
describe("backupMeta", () => {
    it("guarda el timestamp real, que es lo que se sacó del nombre", () => {
        const m = backupMeta({ baseOrigen: ORIGEN, slot: "A", colecciones: ["users", "areas"], documentos: 21240 });
        assert.equal(m._id, "meta");
        assert.equal(m.slot, "A");
        assert.equal(m.colecciones, 2);
        assert.equal(m.documentos, 21240);
        assert.ok(m.createdAt instanceof Date);
    });
});
describe("truncarBytes", () => {
    it("no devuelve medio carácter cuando el corte cae en el medio de uno multibyte", () => {
        // "café" son 5 bytes: c-a-f (3) + é (2). Cortar en 4 parte la "é" al medio, y eso NO puede salir
        // como un carácter de reemplazo pegado al nombre de una base.
        assert.equal(truncarBytes("café", 4), "caf");
        assert.equal(truncarBytes("café", 3), "caf", "cortar justo antes de la é");
        assert.equal(truncarBytes("café", 5), "café", "si entra entero, no toca nada");
    });
});
