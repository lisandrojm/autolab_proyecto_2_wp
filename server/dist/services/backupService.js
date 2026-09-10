import mongoose from "mongoose";
import { EJSON } from "bson";
import { Tenant } from "../models/Tenant.js";
import { getTenantDropboxConfig, listFolder, uploadFile, uploadFileSession, createFolder, deleteEntry } from "./dropboxService.js";
import { clonarEnMongo } from "./backupDestinoMongo.js";
/**
 * BACKUP DE LA BASE, CADA 12 HORAS, A DROPBOX.
 *
 * FORMATO: una CARPETA por backup, y adentro un archivo por colección:
 *
 *   weprodu_production_integration_2026-09-09_0300/
 *     _backup.json          ← manifiesto: qué colecciones, cuántos documentos, cuándo
 *     users.json
 *     userprojects.json
 *     ...
 *
 * Cada `.json` es JSON extendido (EJSON), un documento por línea, SIN comprimir. Ese es EXACTAMENTE
 * el formato que come `mongoimport`, así que cada colección entra en Atlas sin pasos intermedios:
 *
 *   mongoimport --uri "<atlas>" --collection users --file users.json
 *
 * SIN COMPRIMIR A PROPÓSITO: un `.json` se abre, se busca y se lee tal cual desde Dropbox o desde
 * cualquier editor, sin descomprimir nada primero. Se paga en tamaño —texto plano es varias veces un
 * `.gz`— y en que es más probable cruzar el tope de 150 MB del endpoint simple de Dropbox; de eso se
 * encarga `uploadFileSession`, que sube por partes.
 *
 * Antes esto era un solo archivo con todas las colecciones concatenadas y líneas marcadoras entre
 * medio. Se podía restaurar con un script propio, pero NO era importable: `mongoimport` importa a una
 * colección por vez y se atraganta con cualquier línea que no sea un documento.
 *
 * EJSON y no JSON pelado porque conserva los tipos: un `ObjectId` vuelve a ser `ObjectId` y una fecha
 * vuelve a ser `Date`. Con JSON común, las referencias entre colecciones se restauran como strings, que
 * es lo mismo que no tener backup.
 *
 * POR QUÉ NO `mongodump`: necesita `mongodb-database-tools` instalado en el servidor, y en el VPS no
 * está garantizado. Si falta, el job fallaría cada doce horas sin que nadie se entere. Esto usa la
 * conexión que el server ya tiene abierta y no depende de nada instalado. Para IMPORTAR sí hace falta
 * `mongoimport`, pero eso se corre desde la máquina de quien restaura, no desde el VPS.
 */
/** Carpeta en Dropbox. Es la que muestra el tab «DDBB» de Documentos. */
export const CARPETA_BACKUPS = "/WEPRODU/DDBB";
/** Cada cuánto se PREGUNTA si toca un backup. No es la frecuencia de la copia: esa la define el
 *  tenant y se lee en cada vuelta, así que cambiarla desde la pantalla no necesita reiniciar el server. */
const TICK_MS = 15 * 60 * 1000;
/** Valores por defecto, para un tenant que nunca tocó la pantalla de configuración. */
export const INTERVALO_HORAS_DEFAULT = 12;
export const RETENER_DEFAULT = 14;
/** Opciones que ofrece la pantalla. Se validan también en el server: el front no es la única puerta. */
export const INTERVALOS_VALIDOS = [6, 12, 24, 48];
/** Arriba de esto, Dropbox rechaza el endpoint simple (su tope real es 150 MB). */
const TOPE_SUBIDA_SIMPLE = 140 * 1024 * 1024;
/** Colecciones que NO se respaldan: son caché reconstruible y de las que más pesan. */
const EXCLUIDAS = new Set([
    "sessions",
    /*
      Las colecciones de GridFS del destino de backup. `uriDeBackup()` ya rechaza que el destino sea la
      misma base que la aplicación, así que en teoría nunca aparecen acá; se excluyen igual porque el
      costo es cero y la falla sería fea: el dump se respaldaría a sí mismo y cada copia sería más grande
      que la anterior, en potencia, hasta reventar.
    */
    "backups.files",
    "backups.chunks",
]);
let corriendo = false;
/** ¿Hay un backup en curso? Lo usa el endpoint para no arrancar uno encima. */
export const backupEnCurso = () => corriendo;
/** "2026-09-09_0300" — ordena alfabéticamente igual que cronológicamente, de lo que depende la retención. */
function selloDeTiempo(d = new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
export function nombreDeCarpeta(baseDatos, fecha = new Date()) {
    return `${baseDatos}_${selloDeTiempo(fecha)}`;
}
/**
 * Vuelca UNA colección a EJSON, un documento por línea (NDJSON), sin comprimir.
 *
 * Se lee con cursor para no traer la colección entera de la base de un saque, aunque el archivo
 * resultante sí se arma completo en memoria antes de subirlo: es el mismo compromiso que ya había, y
 * lo que evita sostener una subida por streaming contra Dropbox.
 */
async function volcarColeccion(nombre) {
    const db = mongoose.connection.db;
    const lineas = [];
    let documentos = 0;
    const cursor = db.collection(nombre).find({}, { batchSize: 500 });
    for await (const doc of cursor) {
        /*
          CANÓNICO Y NO RELAJADO. Es la diferencia entre una copia fiel y una copia parecida.
    
          En modo relajado los números se escriben tal cual (`42`, `9007199254740993`) y al leerlos vuelven
          como `double` de JavaScript. Probado con un `Long` real: 9007199254740993 vuelve como
          ...992 — un dígito distinto, en silencio. También se pierde si un campo era Int32 o Double.
    
          En canónico cada valor lleva su tipo (`{"$numberLong":"9007199254740993"}`), así que un ObjectId
          vuelve ObjectId, una fecha vuelve Date y un entero vuelve entero. Es más verboso de leer, y es el
          precio de que un backup sea un backup.
    
          `mongoimport` lee las dos formas —es JSON extendido v2 en los dos casos—, así que la importación
          directa a Atlas sigue funcionando igual.
        */
        lineas.push(EJSON.stringify(doc, { relaxed: false }));
        documentos++;
    }
    // Un solo `join` al final en vez de concatenar en cada vuelta: con colecciones de miles de
    // documentos, sumar strings de a uno copia el acumulado entero cada vez.
    return { nombre: `${nombre}.json`, contenido: Buffer.from(lineas.length > 0 ? lineas.join("\n") + "\n" : "", "utf8"), documentos };
}
/** Todas las colecciones de la base, cada una en su archivo, más el manifiesto. */
export async function generarArchivos() {
    const db = mongoose.connection.db;
    if (!db)
        throw new Error("No hay conexión a MongoDB: no se puede generar el backup.");
    const info = await db.listCollections().toArray();
    const nombres = info
        .map((c) => String(c.name))
        .filter((n) => !n.startsWith("system.") && !EXCLUIDAS.has(n))
        .sort();
    const archivos = [];
    for (const nombre of nombres)
        archivos.push(await volcarColeccion(nombre));
    const documentos = archivos.reduce((a, f) => a + f.documentos, 0);
    /*
      El manifiesto se llama `_backup.json` con guion bajo adelante: ordena primero en cualquier listado,
      y es lo que permite salteárselo al importar la carpeta entera (`for f in *.json` tiene que excluirlo,
      porque no es una colección).
    */
    const manifiesto = {
        base: db.databaseName,
        fecha: new Date(),
        documentos,
        colecciones: archivos.map((f) => ({ nombre: f.nombre.replace(/\.json$/, ""), documentos: f.documentos, bytes: f.contenido.length })),
        comoImportar: "mongoimport --uri \"<atlas>\" --collection <coleccion> --file <coleccion>.json",
    };
    archivos.push({ nombre: "_backup.json", contenido: Buffer.from(JSON.stringify(manifiesto, null, 2)), documentos: 0 });
    return { archivos, documentos };
}
/** Los nombres de colección de una tanda de archivos, sin el manifiesto. */
const nombresDeColecciones = (archivos) => archivos.filter((f) => f.nombre !== "_backup.json").map((f) => f.nombre.replace(/\.json$/, ""));
/** Usa la subida simple, o la de sesión si el archivo pasa el tope del endpoint simple. */
async function subir(tenantId, cfg, ruta, contenido) {
    if (contenido.length <= TOPE_SUBIDA_SIMPLE)
        return uploadFile(tenantId, cfg, ruta, contenido);
    return uploadFileSession(tenantId, cfg, ruta, contenido);
}
/**
 * Qué carpetas de backup sobran.
 *
 * Se ordena por el NOMBRE, no por la fecha que reporta Dropbox: el nombre lleva el sello de cuándo se
 * generó el dump, mientras que la fecha de Dropbox es cuándo terminó de subirse. Con una subida lenta o
 * un reintento, las dos no coinciden.
 *
 * Solo mira CARPETAS que empiezan con el nombre de la base: si alguien deja otra cosa acá, la retención
 * no se la lleva puesta.
 */
export function elegirParaBorrar(entries, baseDatos, retener = RETENER_DEFAULT) {
    const backups = entries
        .filter((e) => e.tag === "folder" && e.name.startsWith(`${baseDatos}_`))
        .sort((a, b) => b.name.localeCompare(a.name));
    return backups.slice(retener);
}
async function limpiarViejos(tenantId, cfg, baseDatos, retener) {
    const { entries } = await listFolder(tenantId, cfg, CARPETA_BACKUPS, true);
    let borrados = 0;
    for (const viejo of elegirParaBorrar(entries, baseDatos, retener)) {
        try {
            await deleteEntry(tenantId, cfg, viejo.path);
            borrados++;
        }
        catch (e) {
            console.error(`[BACKUP] No se pudo borrar ${viejo.name}:`, e?.message || e);
        }
    }
    return borrados;
}
/** Crea la carpeta si no existe. Que ya exista es el caso normal y no es un error. */
async function asegurarCarpeta(tenantId, cfg, ruta) {
    try {
        await createFolder(tenantId, cfg, ruta);
    }
    catch {
        // Ya existe.
    }
}
/**
 * Una corrida completa: dump, subida y limpieza.
 *
 * El backup es de la BASE, que es una sola, así que se sube a UN tenant: el primero que tenga Dropbox
 * conectado. Subirlo a todos sería el mismo archivo repetido en varias cuentas.
 *
 * `disparador` solo va al log, para poder distinguir la corrida automática de una forzada a mano.
 */
export async function correrBackup(disparador = "cron") {
    if (corriendo)
        throw new Error("Ya hay un backup en curso.");
    corriendo = true;
    try {
        const tenants = await Tenant.find({ "integrations.dropbox.refreshTokenEnc": { $exists: true } }).sort({ createdAt: 1 });
        const tenant = tenants.find((t) => !!getTenantDropboxConfig(t));
        if (!tenant) {
            console.warn("[BACKUP] Ningún tenant tiene Dropbox conectado: no hay dónde guardar el backup.");
            return null;
        }
        if (tenants.length > 1)
            console.warn(`[BACKUP] Hay ${tenants.length} tenants con Dropbox; se usa el primero (${tenant._id}).`);
        const cfg = getTenantDropboxConfig(tenant);
        const tenantId = String(tenant._id);
        const baseDatos = mongoose.connection.db?.databaseName || "weprodu";
        const { archivos, documentos } = await generarArchivos();
        const carpeta = nombreDeCarpeta(baseDatos);
        const ruta = `${CARPETA_BACKUPS}/${carpeta}`;
        const bytes = archivos.reduce((a, f) => a + f.contenido.length, 0);
        const retener = Math.max(1, Number(tenant?.integrations?.backup?.retener) || RETENER_DEFAULT);
        /*
          LOS DOS DESTINOS SE INTENTAN POR SEPARADO, y el que falla no se lleva puesto al otro.
    
          Que Dropbox esté caído no es motivo para no guardar la copia en el Mongo de backup, ni al revés.
          Y cada uno limpia lo viejo solo si LO SUYO salió bien: una copia nueva a medias nunca puede costar
          la copia anterior, que es la que todavía sirve.
        */
        const dropbox = { ok: false };
        let borrados = 0;
        try {
            await asegurarCarpeta(tenantId, cfg, CARPETA_BACKUPS);
            await asegurarCarpeta(tenantId, cfg, ruta);
            // El manifiesto va ÚLTIMO —es el último del array—, así que su presencia es la señal de que la
            // copia está completa. Una carpeta sin `_backup.json` es una copia a medias.
            for (const archivo of archivos)
                await subir(tenantId, cfg, `${ruta}/${archivo.nombre}`, archivo.contenido);
            borrados = await limpiarViejos(tenantId, cfg, baseDatos, retener);
            dropbox.ok = true;
        }
        catch (e) {
            dropbox.error = String(e?.message || e);
            console.error(`[BACKUP:${disparador}] Dropbox falló:`, dropbox.error);
        }
        const mongo = { ok: false, configurado: false };
        try {
            // Se clona desde la base, no desde los `.json` ya generados: escribir los documentos tal cual
            // deja una base normal, navegable desde Atlas, en vez de archivos que habría que importar.
            const r = await clonarEnMongo(baseDatos, nombresDeColecciones(archivos), tenant?.integrations?.backup?.ultimoSlotOk, tenant?.integrations?.backup?.ultimaBaseCopia);
            mongo.ok = true;
            mongo.configurado = r.configurado;
            mongo.base = r.base;
            mongo.slot = r.slot;
            mongo.documentos = r.documentos;
            mongo.borrados = r.borrados;
        }
        catch (e) {
            mongo.error = String(e?.message || e);
            console.error(`[BACKUP:${disparador}] Mongo de backup falló:`, mongo.error);
        }
        if (!dropbox.ok && !mongo.ok)
            throw new Error(`La copia no quedó en ningún destino. Dropbox: ${dropbox.error} · Mongo: ${mongo.error}`);
        /*
          `ultimoBackupAt` se escribe SIEMPRE que la copia haya quedado en algún lado, aunque un destino
          falle. Es el reloj que espacia las corridas: si no se escribiera ante un fallo parcial, el
          scheduler reintentaría cada 15 minutos y estaría recorriendo la base entera cuatro veces por hora.
          Que algo falló se dice en `ultimoError`, que la pantalla muestra en rojo.
        */
        const fallos = [dropbox.ok ? "" : `Dropbox: ${dropbox.error}`, mongo.ok ? "" : `Mongo de backup: ${mongo.error}`].filter(Boolean).join(" · ");
        const cambios = { "integrations.backup.ultimoBackupAt": new Date(), "integrations.backup.ultimoError": fallos };
        /*
          El slot bueno solo se mueve si el clon TERMINÓ bien. Si falló a mitad, el slot que sigue siendo la
          copia completa es el anterior — marcar el nuevo dejaría a la próxima corrida escribiendo encima de
          la única copia sana.
        */
        if (mongo.ok && mongo.slot) {
            cambios["integrations.backup.ultimoSlotOk"] = mongo.slot;
            cambios["integrations.backup.ultimaBaseCopia"] = mongo.base;
        }
        await Tenant.updateOne({ _id: tenant._id }, { $set: cambios });
        console.log(`[BACKUP:${disparador}] ${carpeta} · ${archivos.length - 1} colecciones · ${documentos} documentos · ${(bytes / 1024 / 1024).toFixed(1)} MB · ` +
            `dropbox=${dropbox.ok ? `ok (${borrados} viejos borrados)` : "FALLÓ"} · mongo=${mongo.ok ? (mongo.configurado ? `ok → ${mongo.base} (${mongo.documentos} docs, ${mongo.borrados} bases viejas borradas)` : "sin configurar") : "FALLÓ"}`);
        return { carpeta, colecciones: archivos.length - 1, documentos, bytes, borrados, dropbox, mongo };
    }
    finally {
        corriendo = false;
    }
}
/**
 * Arranca el scheduler. Cada 12 horas, y una primera corrida a los 5 minutos de levantar.
 *
 * No arranca al instante a propósito: el server recién levantado está atendiendo el primer tráfico, y
 * un recorrido completo de la base compite justo ahí.
 */
export const initBackupScheduler = () => {
    console.log(`[BACKUP] Scheduler iniciado (revisa cada ${TICK_MS / 60000} min) → ${CARPETA_BACKUPS}`);
    const tick = async () => {
        try {
            // Una base grande puede tardar más que el intervalo, o puede haber uno forzado a mano en curso.
            // Sin esta guarda, dos corridas se pisarían y dejarían dos carpetas del mismo momento.
            if (corriendo)
                return;
            const tenant = await Tenant.findOne({ "integrations.dropbox.refreshTokenEnc": { $exists: true } }).sort({ createdAt: 1 }).lean();
            if (!tenant)
                return;
            const horas = Math.max(1, Number(tenant?.integrations?.backup?.intervaloHoras) || INTERVALO_HORAS_DEFAULT);
            const ultimo = tenant?.integrations?.backup?.ultimoBackupAt ? new Date(tenant.integrations.backup.ultimoBackupAt).getTime() : 0;
            if (ultimo && Date.now() - ultimo < horas * 60 * 60 * 1000)
                return;
            await correrBackup("cron");
        }
        catch (e) {
            const mensaje = String(e?.message || e);
            console.error("[BACKUP] Falló la corrida:", mensaje);
            // Queda registrado en el tenant para poder mostrarlo en la pantalla: un backup que falla de
            // madrugada, si solo va al log del VPS, no se entera nadie.
            try {
                await Tenant.updateOne({ "integrations.dropbox.refreshTokenEnc": { $exists: true } }, { $set: { "integrations.backup.ultimoError": mensaje } });
            }
            catch {
                // Si ni siquiera se puede escribir el error, ya quedó en el log de arriba.
            }
        }
    };
    setTimeout(() => void tick(), 5 * 60 * 1000);
    setInterval(() => void tick(), TICK_MS);
};
