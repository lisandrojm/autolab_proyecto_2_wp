import mongoose from "mongoose";
import zlib from "zlib";
import { EJSON } from "bson";
import { Tenant } from "../models/Tenant.js";
import { getTenantDropboxConfig, listFolder, uploadFile, uploadFileSession, createFolder, deleteEntry } from "./dropboxService.js";
/**
 * BACKUP DE LA BASE, CADA 12 HORAS, A DROPBOX.
 *
 * FORMATO: una CARPETA por backup, y adentro un archivo por colección:
 *
 *   weprodu_production_integration_2026-09-09_0300/
 *     _backup.json          ← manifiesto: qué colecciones, cuántos documentos, cuándo
 *     users.json.gz
 *     userprojects.json.gz
 *     ...
 *
 * Cada `.json.gz` es JSON extendido (EJSON), un documento por línea, comprimido. Ese es EXACTAMENTE
 * el formato que come `mongoimport`, así que cada colección entra en Atlas sin pasos intermedios:
 *
 *   mongoimport --uri "<atlas>" --collection users --gzip --file users.json.gz
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
const EXCLUIDAS = new Set(["sessions"]);
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
 * Vuelca UNA colección a EJSON comprimido, un documento por línea.
 *
 * Se lee con cursor y se escribe respetando la contrapresión del gzip: sin eso, una colección grande
 * entra entera en memoria antes de comprimirse.
 */
async function volcarColeccion(nombre) {
    const db = mongoose.connection.db;
    const gzip = zlib.createGzip({ level: 9 });
    const partes = [];
    gzip.on("data", (c) => partes.push(c));
    const terminado = new Promise((resolve, reject) => {
        gzip.on("end", resolve);
        gzip.on("error", reject);
    });
    const escribir = (linea) => new Promise((resolve, reject) => {
        if (gzip.write(linea))
            return resolve();
        gzip.once("drain", resolve);
        gzip.once("error", reject);
    });
    let documentos = 0;
    const cursor = db.collection(nombre).find({}, { batchSize: 500 });
    for await (const doc of cursor) {
        await escribir(EJSON.stringify(doc) + "\n");
        documentos++;
    }
    gzip.end();
    await terminado;
    return { nombre: `${nombre}.json.gz`, contenido: Buffer.concat(partes), documentos };
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
      El manifiesto va SIN comprimir y con extensión .json a secas, para poder abrirlo desde Dropbox sin
      bajar nada. No termina en .json.gz a propósito: así un `for f in *.json.gz` que importe la carpeta
      entera no lo toma como si fuera una colección.
    */
    const manifiesto = {
        base: db.databaseName,
        fecha: new Date(),
        documentos,
        colecciones: archivos.map((f) => ({ nombre: f.nombre.replace(/\.json\.gz$/, ""), documentos: f.documentos, bytes: f.contenido.length })),
        comoImportar: "mongoimport --uri \"<atlas>\" --collection <coleccion> --gzip --file <coleccion>.json.gz",
    };
    archivos.push({ nombre: "_backup.json", contenido: Buffer.from(JSON.stringify(manifiesto, null, 2)), documentos: 0 });
    return { archivos, documentos };
}
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
        await asegurarCarpeta(tenantId, cfg, CARPETA_BACKUPS);
        await asegurarCarpeta(tenantId, cfg, ruta);
        for (const archivo of archivos)
            await subir(tenantId, cfg, `${ruta}/${archivo.nombre}`, archivo.contenido);
        const retener = Math.max(1, Number(tenant?.integrations?.backup?.retener) || RETENER_DEFAULT);
        const borrados = await limpiarViejos(tenantId, cfg, baseDatos, retener);
        // Se guarda CUÁNDO terminó, no cuándo arrancó: es lo que decide si toca la próxima, y sobrevive a
        // un reinicio del server (con un `setInterval` a secas, cada reinicio corría un backup de más).
        await Tenant.updateOne({ _id: tenant._id }, { $set: { "integrations.backup.ultimoBackupAt": new Date(), "integrations.backup.ultimoError": "" } });
        const bytes = archivos.reduce((a, f) => a + f.contenido.length, 0);
        console.log(`[BACKUP:${disparador}] ${carpeta} · ${archivos.length - 1} colecciones · ${documentos} documentos · ${(bytes / 1024 / 1024).toFixed(1)} MB · ${borrados} viejos borrados`);
        return { carpeta, colecciones: archivos.length - 1, documentos, bytes, borrados };
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
