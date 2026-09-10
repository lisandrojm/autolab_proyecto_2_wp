import mongoose from "mongoose";
import { backupDbName, siguienteSlot, preflight, backupMeta, esBaseDeCopia, MAX_DB_BYTES, MAX_NS_BYTES, MAX_COLECCIONES } from "../utils/nombreBackup.js";
/*
  LOS LÍMITES SE LEEN DE `process.env` Y NO DE `config/env.ts`.

  `config/env.ts` los declara y los valida al arrancar —que es donde corresponde—, pero importarlo acá
  haría que este módulo no se pueda cargar sin un `.env` completo: el esquema de zod corre al importar y
  aborta. Un módulo cuya única lógica testeable son nombres y límites no puede exigir una base y un JWT
  para poder probarse.
*/
const numeroDeEnv = (clave, porDefecto) => {
    const v = Number(process.env[clave]);
    return Number.isFinite(v) && v > 0 ? v : porDefecto;
};
const limites = () => ({
    maxDbBytes: numeroDeEnv("MONGO_BACKUP_MAX_DB_BYTES", MAX_DB_BYTES),
    maxNsBytes: numeroDeEnv("MONGO_BACKUP_MAX_NS_BYTES", MAX_NS_BYTES),
    maxColecciones: numeroDeEnv("MONGO_BACKUP_MAX_COLECCIONES", MAX_COLECCIONES),
});
/**
 * SEGUNDO DESTINO DE LOS BACKUPS: OTRA BASE DEL MISMO CLUSTER, UNA POR COPIA.
 *
 * La copia se sube a Dropbox (destino principal) y además se clona acá, en una base aparte.
 *
 * MISMO CLUSTER, Y ESO TIENE UN LÍMITE QUE HAY QUE TENER PRESENTE: si el cluster se cae, se pierde o
 * alguien entra con las credenciales, la copia se va con el original. No es un backup contra desastre;
 * es un «deshacer» para el caso mucho más común —alguien borró una colección, un script escribió mal—
 * donde tener la base de hace unas horas al lado, consultable, resuelve el problema en minutos. El
 * respaldo fuera del cluster es Dropbox, y por eso sigue siendo el destino principal.
 *
 * Lo que sí se garantiza es que la copia va a una BASE DISTINTA de la que se respalda. Con el mismo
 * nombre, el próximo dump se respaldaría a sí mismo: `generarArchivos()` recorre las colecciones de la
 * base de la aplicación, y una copia adentro entraría en la siguiente, y esa en la próxima, en potencia.
 * El sello de fecha en el nombre lo hace imposible por construcción.
 *
 * LA BASE NO LLEVA LA FECHA: LLEVA UN SLOT QUE ROTA.
 *
 *   weprodu_production_integration_bkpA    35 bytes
 *   weprodu_production_integration_bkpB    35 bytes
 *
 * La fecha en el nombre era lo natural, y no entra: los clusters Atlas **Free y Flex** cortan los
 * nombres de base en **38 bytes** —MongoDB permite 64, esto es un límite del tier— y
 * `weprodu_production_integration_backup_2026-09-10_1048` da 53. Con una base de 30 bytes quedan 8 para
 * el sufijo: no entra ninguna fecha, ni recortada. Así que el timestamp vive en un documento adentro de
 * la copia (`_backup_meta`), donde además se puede leer sin mirar el nombre.
 *
 * Dos slots y no uno solo: con un nombre fijo habría que borrar la copia buena antes de escribir la
 * nueva, y en esa ventana no existiría ninguna copia válida. Rotando, mientras se escribe un slot el
 * otro sigue completo. Ver `utils/nombreBackup.ts`.
 *
 * Y NO SE GUARDAN ARCHIVOS: SE ESCRIBEN LAS COLECCIONES.
 *
 * La primera versión guardaba los `.json` en GridFS. Andaba, pero para usarlos había que bajarlos y
 * pasarles `mongoimport` — o sea, un backup dentro de Mongo que no se podía consultar desde Mongo. Ahora
 * los documentos se escriben como documentos: la copia es una base normal, se abre en Atlas, se navega,
 * se consulta y se compara con producción sin importar nada. Ya ESTÁ en Atlas.
 *
 * RETENCIÓN: se conserva SOLO LA ÚLTIMA. Las bases anteriores se borran DESPUÉS de que la nueva quedó
 * completa, nunca antes. El histórico largo vive en Dropbox, que guarda las que diga la pantalla.
 */
/** Dónde queda el timestamp, ahora que no entra en el nombre de la base. */
export const COLECCION_MANIFIESTO = "_backup_meta";
/** Cuántos documentos se insertan por lote. */
const LOTE = 1000;
/**
 * La URI donde se clona.
 *
 * Por defecto, el MISMO cluster de la aplicación: la copia es otra base al lado, sin pagar un segundo
 * cluster. `MONGO_URI_BACKUP` existe para apuntar a otro cluster el día que se quiera —ahí sí sería un
 * backup contra desastre—, pero no hace falta configurarla.
 */
export function uriDeBackup() {
    const propia = String(process.env.MONGO_URI_BACKUP || "").trim();
    if (propia)
        return propia;
    const app = String(process.env.MONGO_URI || "").trim();
    return app || null;
}
/** ¿La copia va a otro cluster, o al mismo? Solo para poder decirlo en la pantalla. */
export const esClusterAparte = () => {
    const propia = String(process.env.MONGO_URI_BACKUP || "").trim();
    return !!propia && propia !== String(process.env.MONGO_URI || "").trim();
};
/**
 * El prefijo de las bases de copia.
 *
 * `MONGO_DB_NAME_BACKUP` sigue existiendo para poder cambiarlo, pero con el límite de 38 bytes casi
 * nunca conviene tocarlo: cualquier prefijo más largo que el nombre de la base obliga a recortar y a
 * meter un hash, y el nombre deja de ser legible.
 */
export function prefijoDeBase(baseOrigen) {
    return String(process.env.MONGO_DB_NAME_BACKUP || "").trim() || baseOrigen;
}
/** El nombre de la base de copia para un slot. */
export function nombreDeBaseCopia(baseOrigen, slot) {
    return backupDbName(prefijoDeBase(baseOrigen), slot, limites().maxDbBytes);
}
/** Cuál se va a escribir la próxima vez. Lo muestra la pantalla, con su tamaño. */
export function proximaBaseCopia(baseOrigen, ultimoSlotOk) {
    const base = nombreDeBaseCopia(baseOrigen, siguienteSlot(ultimoSlotOk));
    return { base, bytes: Buffer.byteLength(base, "utf8"), maximo: limites().maxDbBytes };
}
/**
 * Clona la base en una base nueva del cluster de backup y borra las copias anteriores.
 *
 * Lee de la conexión de la aplicación (la que ya está abierta) y escribe en una conexión efímera al
 * destino: esto corre dos veces por día y no justifica sostener un segundo pool abierto todo el tiempo.
 */
export async function clonarEnMongo(baseOrigen, colecciones, ultimoSlotOk) {
    const uri = uriDeBackup();
    if (!uri)
        return { configurado: false, colecciones: 0, documentos: 0, borrados: 0 };
    const origen = mongoose.connection.db;
    if (!origen)
        throw new Error("No hay conexión a MongoDB: no se puede clonar.");
    /*
      SE ESCRIBE EN EL SLOT QUE NO ES EL BUENO. Mientras se llena este, el otro sigue siendo una copia
      completa: en ningún momento el cluster se queda sin ninguna.
    */
    const slot = siguienteSlot(ultimoSlotOk);
    /*
      PREFLIGHT ANTES DE COPIAR NADA. El límite de 38 bytes aparecía a mitad de la copia, como un error
      del driver que nadie puede accionar. Acá se chequea antes, y el mensaje dice qué hacer.
    */
    const { dbName: base, problemas } = preflight({ baseOrigen: prefijoDeBase(baseOrigen), slot, colecciones }, limites());
    if (problemas.length > 0)
        throw new Error(problemas.join(" "));
    const conexion = await mongoose.createConnection(uri, { dbName: base }).asPromise();
    try {
        const destino = conexion.db;
        let documentos = 0;
        for (const nombre of colecciones) {
            const cursor = origen.collection(nombre).find({}, { batchSize: LOTE });
            let lote = [];
            const vaciar = async () => {
                if (lote.length === 0)
                    return;
                // `ordered: false` para que un documento problemático no corte el resto de la colección.
                await destino.collection(nombre).insertMany(lote, { ordered: false });
                documentos += lote.length;
                lote = [];
            };
            for await (const doc of cursor) {
                lote.push(doc);
                if (lote.length >= LOTE)
                    await vaciar();
            }
            await vaciar();
        }
        // El manifiesto va ÚLTIMO: su presencia es la señal de que la copia quedó completa. Y es donde vive
        // el timestamp real, que ya no entra en el nombre de la base.
        await destino.collection(COLECCION_MANIFIESTO).deleteMany({});
        await destino.collection(COLECCION_MANIFIESTO).insertOne(backupMeta({ baseOrigen, slot, colecciones, documentos }));
        /*
          CON DOS SLOTS NO HAY NADA QUE BORRAR: la copia anterior es el otro slot y tiene que quedar viva.
    
          Lo único que se limpia son las bases del esquema VIEJO —las que llevaban la fecha en el nombre—
          que hayan quedado dando vueltas. Y antes de cualquier `dropDatabase` se verifica que el nombre
          sea realmente una copia de ESTA base: en este cluster conviven veinte bases de otros proyectos y
          borrar la equivocada no se deshace.
        */
        let borrados = 0;
        try {
            const { databases } = await conexion.getClient().db().admin().listDatabases();
            const prefijo = prefijoDeBase(baseOrigen);
            for (const d of databases) {
                const n = String(d.name);
                const esViejaConFecha = n.startsWith(`${prefijo}_`) && /_\d{4}-\d{2}-\d{2}_\d{4}$/.test(n);
                // Doble barrera: ni la base de origen, ni un slot vivo, ni nada que no matchee el patrón viejo.
                if (!esViejaConFecha || n === baseOrigen || esBaseDeCopia(n, prefijo, limites().maxDbBytes))
                    continue;
                try {
                    await conexion.getClient().db(n).dropDatabase();
                    borrados++;
                }
                catch (e) {
                    console.error(`[BACKUP] No se pudo borrar la copia vieja ${n}:`, e?.message || e);
                }
            }
        }
        catch {
            // `listDatabases` pide permisos de admin que en Free/Flex no tenemos. No es un problema: con los
            // dos slots no hace falta enumerar nada para funcionar.
        }
        return { configurado: true, base, slot, colecciones: colecciones.length, documentos, borrados };
    }
    finally {
        await conexion.close();
    }
}
