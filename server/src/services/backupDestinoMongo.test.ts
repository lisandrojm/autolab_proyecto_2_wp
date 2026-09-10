import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { uriDeBackup, prefijoDeBase, nombreDeBaseCopia, esClusterAparte } from "./backupDestinoMongo.js";

/**
 * La configuración del segundo destino, que es lo único testeable sin una base de verdad.
 *
 * Lo que se prueba acá es la GUARDA: que el destino no pueda ser la misma base que se respalda. Si eso
 * falla, la copia queda adentro del original —no sería un backup— y encima el dump siguiente se
 * respaldaría a sí mismo, creciendo en potencia.
 *
 * Run with:  npx tsx --test src/services/backupDestinoMongo.test.ts  —o—  npm run test:backup-mongo
 */

const guardado = { MONGO_URI: process.env.MONGO_URI, MONGO_URI_BACKUP: process.env.MONGO_URI_BACKUP, MONGO_DB_NAME_BACKUP: process.env.MONGO_DB_NAME_BACKUP };

beforeEach(() => {
  delete process.env.MONGO_URI;
  delete process.env.MONGO_URI_BACKUP;
  delete process.env.MONGO_DB_NAME_BACKUP;
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

describe("la copia nunca cae sobre la base de origen", () => {
  it("el nombre SIEMPRE difiere del de la base respaldada", () => {
    /*
      Es la garantía que reemplaza a la vieja guarda de «otro cluster». Si la copia cayera en la misma
      base, el próximo dump se respaldaría a sí mismo y cada copia sería más grande que la anterior.
    */
    const origen = "weprodu_production_integration";
    for (const sello of ["2026-09-10_1010", "2026-01-01_0000"]) {
      assert.notEqual(nombreDeBaseCopia(origen, `${origen}_${sello}`), origen);
    }
    process.env.MONGO_DB_NAME_BACKUP = origen;
    assert.notEqual(nombreDeBaseCopia(origen, `${origen}_2026-09-10_1010`), origen, "aunque el prefijo sea el mismo nombre, el sello lo separa");
  });
});

describe("nombreDeBaseCopia", () => {
  it("la base lleva la FECHA en el nombre: es lo que permite reconocerla desde Atlas", () => {
    // Sin la fecha, dos backups distintos se ven igual en el Data Explorer.
    assert.equal(nombreDeBaseCopia("weprodu_production_integration", "weprodu_production_integration_2026-09-10_1010"), "weprodu_production_integration_2026-09-10_1010");
  });

  it("no repite el nombre de la base cuando el prefijo ya es ese", () => {
    // Sin esto quedaría `weprodu_production_integration_weprodu_production_integration_2026-…`.
    const r = nombreDeBaseCopia("weprodu_production_integration", "weprodu_production_integration_2026-09-10_1010");
    assert.equal((r.match(/weprodu_production_integration/g) || []).length, 1);
  });

  it("MONGO_DB_NAME_BACKUP es un PREFIJO, no el nombre final", () => {
    process.env.MONGO_DB_NAME_BACKUP = "copias";
    assert.equal(prefijoDeBase("weprodu_production_integration"), "copias");
    assert.equal(nombreDeBaseCopia("weprodu_production_integration", "weprodu_production_integration_2026-09-10_1010"), "copias_2026-09-10_1010");
  });

  it("sin la variable, el prefijo es el nombre de la base de origen", () => {
    assert.equal(prefijoDeBase("weprodu_production_integration"), "weprodu_production_integration");
  });
});
