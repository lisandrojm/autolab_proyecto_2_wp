import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { uriDeBackup, prefijoDeBase, esClusterAparte, proximaBaseCopia } from "./backupDestinoMongo.js";
/**
 * La configuración del destino Mongo: dónde se clona y con qué nombre.
 *
 * El armado del nombre en sí vive en `utils/nombreBackup.ts` y tiene sus propios tests; acá se prueba
 * lo que decide este módulo — qué cluster, qué prefijo, y qué base toca la próxima vez.
 *
 * Run with:  npx tsx --test src/services/backupDestinoMongo.test.ts  —o—  npm run test:backup-mongo
 */
const guardado = {
    MONGO_URI: process.env.MONGO_URI,
    MONGO_URI_BACKUP: process.env.MONGO_URI_BACKUP,
    MONGO_DB_NAME_BACKUP: process.env.MONGO_DB_NAME_BACKUP,
    MONGO_BACKUP_ESTRATEGIA: process.env.MONGO_BACKUP_ESTRATEGIA,
};
beforeEach(() => {
    delete process.env.MONGO_URI;
    delete process.env.MONGO_URI_BACKUP;
    delete process.env.MONGO_DB_NAME_BACKUP;
    delete process.env.MONGO_BACKUP_ESTRATEGIA;
});
process.on("exit", () => Object.assign(process.env, guardado));
describe("uriDeBackup", () => {
    it("sin nada configurado no hay destino", () => {
        assert.equal(uriDeBackup(), null);
    });
    it("por defecto clona en el MISMO cluster de la aplicación: no hace falta pagar otro", () => {
        process.env.MONGO_URI = "mongodb+srv://user:pass@prod.mongodb.net/";
        assert.equal(uriDeBackup(), "mongodb+srv://user:pass@prod.mongodb.net/");
        assert.equal(esClusterAparte(), false);
    });
    it("con MONGO_URI_BACKUP apunta a otro cluster, que es el escenario fuerte", () => {
        process.env.MONGO_URI = "mongodb+srv://user:pass@prod.mongodb.net/";
        process.env.MONGO_URI_BACKUP = "mongodb+srv://user:pass@backup.mongodb.net/";
        assert.equal(uriDeBackup(), "mongodb+srv://user:pass@backup.mongodb.net/");
        assert.equal(esClusterAparte(), true);
    });
    it("apuntarla al mismo cluster a mano no la hace «aparte»", () => {
        const misma = "mongodb+srv://user:pass@prod.mongodb.net/";
        process.env.MONGO_URI = misma;
        process.env.MONGO_URI_BACKUP = misma;
        assert.equal(esClusterAparte(), false, "la pantalla no puede prometer una protección que no hay");
    });
});
describe("prefijoDeBase", () => {
    it("sin la variable, el prefijo es el nombre de la base de origen", () => {
        assert.equal(prefijoDeBase("weprodu_production_integration"), "weprodu_production_integration");
    });
    it("MONGO_DB_NAME_BACKUP lo pisa", () => {
        process.env.MONGO_DB_NAME_BACKUP = "copias";
        assert.equal(prefijoDeBase("weprodu_production_integration"), "copias");
    });
});
describe("proximaBaseCopia", () => {
    it("por defecto la FECHA va en el nombre: es lo que se lee desde el listado de Atlas", () => {
        const r = proximaBaseCopia("weprodu_production_integration", null);
        assert.match(r.base, /_\d{4}_\d{2}_\d{2}_\d{2}-\d{2}$/, `${r.base} debería terminar en fecha y hora`);
        assert.ok(r.bytes <= r.maximo, `${r.base} ocupa ${r.bytes} y el máximo es ${r.maximo}`);
    });
    it("con un prefijo corto el nombre queda legible y sobra lugar", () => {
        // Es lo que se consigue poniendo `MONGO_DB_NAME_BACKUP=weprodu`.
        process.env.MONGO_DB_NAME_BACKUP = "weprodu";
        const r = proximaBaseCopia("weprodu_production_integration", null);
        assert.match(r.base, /^weprodu_\d{4}_\d{2}_\d{2}_\d{2}-\d{2}$/, "weprodu_2026_09_10_04-34");
        assert.equal(r.bytes, 24);
    });
    it("con `slots` vuelve a los dos nombres fijos y alterna", () => {
        process.env.MONGO_BACKUP_ESTRATEGIA = "slots";
        assert.equal(proximaBaseCopia("weprodu_production_integration", null).base, "weprodu_production_integration_bkpA");
        assert.equal(proximaBaseCopia("weprodu_production_integration", "A").base, "weprodu_production_integration_bkpB");
        assert.equal(proximaBaseCopia("weprodu_production_integration", "B").base, "weprodu_production_integration_bkpA");
    });
    it("con el prefijo largo configurado hoy, el nombre se recorta y NO pasa el límite", () => {
        // `MONGO_DB_NAME_BACKUP=weprodu_production_integration_backup` son 37 bytes: +_bkpA daría 42, que es
        // justo el error que rompía el backup. El recorte con hash lo deja adentro.
        process.env.MONGO_DB_NAME_BACKUP = "weprodu_production_integration_backup";
        const r = proximaBaseCopia("weprodu_production_integration", null);
        assert.ok(r.bytes <= r.maximo, `${r.base} ocupa ${r.bytes} y el máximo es ${r.maximo}`);
    });
});
