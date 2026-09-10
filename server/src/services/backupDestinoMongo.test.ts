import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { uriDeBackup, nombreDeBaseDestino } from "./backupDestinoMongo.js";

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
  it("sin la variable devuelve null: no está configurado, y eso no es un error", () => {
    // El backup tiene que seguir andando contra Dropbox aunque este destino no exista.
    assert.equal(uriDeBackup(), null);
    process.env.MONGO_URI_BACKUP = "   ";
    assert.equal(uriDeBackup(), null, "solo espacios cuenta como vacío");
  });

  it("devuelve la URI cuando apunta a otro lado", () => {
    process.env.MONGO_URI = "mongodb+srv://user:pass@prod.mongodb.net/";
    process.env.MONGO_URI_BACKUP = "mongodb+srv://user:pass@backup.mongodb.net/";
    assert.equal(uriDeBackup(), "mongodb+srv://user:pass@backup.mongodb.net/");
  });

  it("SE NIEGA si el destino es la misma base que la aplicación", () => {
    const misma = "mongodb+srv://user:pass@prod.mongodb.net/weprodu";
    process.env.MONGO_URI = misma;
    process.env.MONGO_URI_BACKUP = misma;
    assert.throws(() => uriDeBackup(), /MISMA base/, "guardar el backup adentro de lo que respalda no es un backup");
  });
});

describe("nombreDeBaseDestino", () => {
  it("saca el nombre de la base de la URI, para poder mostrarlo sin exponer credenciales", () => {
    assert.equal(nombreDeBaseDestino("mongodb+srv://user:pass@backup.mongodb.net/weprodu_backup"), "weprodu_backup");
    assert.equal(nombreDeBaseDestino("mongodb://localhost:27017/copia?retryWrites=true"), "copia");
  });

  it("MONGO_DB_NAME_BACKUP le gana a lo que diga la URI", () => {
    process.env.MONGO_DB_NAME_BACKUP = "elegida_a_mano";
    assert.equal(nombreDeBaseDestino("mongodb+srv://user:pass@backup.mongodb.net/otra"), "elegida_a_mano");
  });

  it("sin base en la URI no inventa un nombre", () => {
    assert.equal(nombreDeBaseDestino("mongodb+srv://user:pass@backup.mongodb.net/"), "(la de la URI)");
  });
});
