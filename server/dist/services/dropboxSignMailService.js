import { ImapFlow } from "imapflow";
import { Tenant } from "../models/Tenant.js";
import { decryptSecret } from "../utils/secretCrypto.js";
import { normalizarCuit } from "../utils/constanciaPdf.js";
import { resolverCarpetaPorPatron } from "../utils/estadoCarpetas.js";
import { getTenantDropboxConfig, listFolder, moveEntry } from "./dropboxService.js";
/**
 * Detección de "documento enviado a firmar" leyendo la casilla de correo.
 *
 * Dropbox Sign (en el plan actual) no avisa por API qué contratos ya se mandaron a firmar, pero sí
 * copia por mail a quien se ponga en CC. Por eso el instructivo de "Para Firmar" pide agregar la
 * casilla configurada acá en CC: ese mail es la ÚNICA señal de que el envío ocurrió.
 *
 * La casilla la usan personas, así que el job es de solo lectura sobre el correo: no marca nada como
 * leído ni mueve mensajes. Busca por asunto dentro de una ventana de días y lo que evita reprocesar
 * es el JSON ya archivado en Pendbox.
 *
 * Qué hace por cada aviso encontrado:
 *  1. Lee del ASUNTO el nombre del documento ("Se inició el proceso de firma de <archivo>").
 *  2. De ese nombre saca el CUIL/documento (la nomenclatura de `buildDocFileName`).
 *  3. Busca ese documento en "Outbox". Si no está, no hace nada: sin respaldo en Outbox el aviso no
 *     se puede atribuir a un documento propio (puede ser de otra cuenta o de un reenvío).
 *  4. Si el documento ya está en "Pendbox", lo saltea. Los avisos se repiten (reenvíos,
 *     recordatorios, resumen diario), así que el chequeo evita trabajo al pedo.
 *  5. Mueve el PDF de Outbox a Pendbox. Ese movimiento es el ÚNICO efecto: no se genera ningún
 *     archivo extra. Es lo que hace avanzar el contrato de "Para Firmar" a "Enviado a la firma" y
 *     deja "Para Firmar" solo con lo que todavía no se envió.
 */
/**
 * Términos con los que se le pide la búsqueda al servidor IMAP. Van sin acentos a propósito: el
 * SEARCH de IMAP es sensible al charset y "inició" puede fallar según el servidor. El filtro fino
 * lo hace igual `extraerArchivoDeAsunto` sobre cada asunto encontrado.
 */
const TERMINOS_BUSQUEDA = ["proceso de firma", "signature request"];
/** Ventana hacia atrás que se revisa en cada corrida. */
const DIAS_ATRAS = 30;
/** Tope de mensajes por corrida, para no barrer una bandeja enorme si la ventana trae de más. */
const MAX_MENSAJES = 300;
/** Asuntos que manda Dropbox Sign al iniciar el circuito de firma (ES/EN). */
const ASUNTO_ENVIO = [/se inici[oó] el proceso de firma de\s+(.+)$/i, /you (?:were|have been) added to a signature request[:\s]+(.+)$/i, /signature request(?:ed)? (?:from|for)[:\s]+(.+)$/i];
/** Nombre del documento tal como aparece en el asunto del aviso. "" si el asunto no es de envío. */
export function extraerArchivoDeAsunto(asunto) {
    const limpio = String(asunto || "")
        .replace(/^(re|rv|fwd?)\s*:\s*/gi, "")
        .trim();
    for (const re of ASUNTO_ENVIO) {
        const m = re.exec(limpio);
        if (m?.[1])
            return m[1].trim().replace(/\.pdf$/i, "");
    }
    return "";
}
/**
 * CUIL y documento que van dentro del nombre del archivo (ver `buildIdentidadTag`). Dropbox Sign
 * reemplaza algunos caracteres del nombre original (p. ej. la "@" del mail por "_"), así que se
 * buscan los tokens etiquetados en lugar de intentar reconstruir el nombre completo.
 */
export function extraerIdentidadDeArchivo(nombreArchivo) {
    const cuil = /CUIL-(\d{11})/i.exec(nombreArchivo);
    const doc = /(DNI|CI|LE|LC|PAS|DOC)-([A-Za-z0-9]+)/i.exec(nombreArchivo);
    // Respaldo para los archivos viejos, anteriores a las etiquetas: un CUIT suelto de 11 dígitos.
    const suelto = !cuil ? /(?<!\d)(\d{2}-?\d{8}-?\d)(?!\d)/.exec(nombreArchivo) : null;
    return {
        cuit: cuil ? cuil[1] : suelto ? normalizarCuit(suelto[1]) : "",
        tipoDoc: doc ? doc[1].toUpperCase() : "",
        documento: doc ? doc[2] : "",
    };
}
/** Solo alfanumérico y en minúsculas: el asunto trae el nombre con caracteres ya transformados. */
const normalizarNombre = (v) => String(v || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]/g, "");
/**
 * Ubica en Outbox el PDF al que se refiere el aviso. El nombre del asunto NO se puede comparar
 * carácter a carácter: Dropbox Sign reemplaza símbolos del original (la "@" del mail pasa a "_").
 * Por eso se matchea por el bloque CUIL/documento —que es estable— y recién después por el nombre
 * normalizado a solo alfanumérico. Si hay más de un candidato, devuelve null: nunca adivina.
 */
export function buscarEnOutbox(entries, archivo, ident) {
    // No se exige extensión: los documentos generados por el sistema quedan en Outbox SIN ".pdf"
    // (solo se descartan los JSON, que son los archivos de control del propio circuito).
    const pdfs = entries.filter((e) => e.tag === "file" && !/\.json$/i.test(e.name));
    if (ident.cuit) {
        const porCuit = pdfs.filter((e) => e.name.includes(ident.cuit));
        const conDoc = ident.documento ? porCuit.filter((e) => e.name.includes(ident.documento)) : [];
        if (conDoc.length === 1)
            return conDoc[0];
        if (porCuit.length === 1)
            return porCuit[0];
        if (porCuit.length > 1)
            return null;
    }
    const objetivo = normalizarNombre(archivo);
    const porNombre = pdfs.filter((e) => normalizarNombre(e.name) === objetivo);
    return porNombre.length === 1 ? porNombre[0] : null;
}
/**
 * ¿Ese documento ya está en Pendbox? Se compara por nombre normalizado y, sobre todo, por CUIL: el
 * archivo real suele tener un nombre distinto al del asunto (Dropbox Sign transforma símbolos y el
 * título de la solicitud es editable), así que el nombre solo no alcanza para reconocerlo.
 */
export function yaEstaEnPendbox(entries, archivo, ident) {
    const objetivo = normalizarNombre(archivo);
    return entries.some((e) => {
        if (e.tag !== "file")
            return false;
        if (normalizarNombre(e.name) === objetivo)
            return true;
        return Boolean(ident.cuit) && e.name.includes(ident.cuit);
    });
}
/**
 * Lee la casilla del tenant y archiva en Pendbox un JSON por cada aviso de envío a firmar.
 * `soloPrueba` conecta y cuenta los avisos sin escribir nada (para el botón "Probar" de la config).
 */
export async function leerCasillaDropboxSign(tenantId, soloPrueba = false) {
    const tenant = await Tenant.findById(tenantId).lean();
    const cfg = tenant?.integrations?.dropboxSign || {};
    const vacio = { avisos: 0, movidos: 0, duplicados: 0, sinArchivoEnOutbox: 0, logs: [] };
    if (!cfg.email || !cfg.imapHost || !cfg.imapPasswordEnc) {
        return { ok: false, detalle: "La casilla no está configurada (faltan correo, servidor o contraseña).", ...vacio };
    }
    if (!soloPrueba && !cfg.enabled) {
        return { ok: false, detalle: "La lectura automática está desactivada.", ...vacio };
    }
    const dropboxCfg = getTenantDropboxConfig(tenant);
    const pendbox = await resolverCarpetaPorPatron([/pendbox/i]);
    const outbox = await resolverCarpetaPorPatron([/outbox/i]);
    const client = new ImapFlow({
        host: String(cfg.imapHost),
        port: Number(cfg.imapPort) || 993,
        secure: cfg.imapSecure !== false,
        auth: { user: String(cfg.imapUser || cfg.email), pass: decryptSecret(cfg.imapPasswordEnc) },
        logger: false,
    });
    let avisos = 0;
    let movidos = 0;
    let duplicados = 0;
    let sinArchivoEnOutbox = 0;
    const errores = [];
    const logs = [];
    // Ambas carpetas se listan una sola vez y se mantienen en memoria: un aviso archivado agrega su
    // JSON a `enPendbox` y saca el PDF de `enOutbox`, así los avisos repetidos de la misma corrida
    // (Dropbox Sign manda recordatorios y resúmenes) también caen en el chequeo de duplicado.
    let enOutbox = [];
    let enPendbox = [];
    if (!soloPrueba && dropboxCfg) {
        try {
            if (outbox)
                enOutbox = ((await listFolder(tenantId, dropboxCfg, outbox, true)).entries || []);
            if (pendbox)
                enPendbox = ((await listFolder(tenantId, dropboxCfg, pendbox, true)).entries || []);
        }
        catch (e) {
            return { ok: false, detalle: `No se pudieron leer las carpetas de Dropbox: ${e?.message || e}`, ...vacio };
        }
    }
    try {
        await client.connect();
        const lock = await client.getMailboxLock("INBOX");
        try {
            // La búsqueda es por ASUNTO dentro de una ventana de días, NO por "no leído": esta casilla la
            // usan personas, y si alguien abre el aviso antes que el job, el flag \Seen lo haría invisible
            // para siempre. Lo que evita reprocesar es el JSON ya archivado en Pendbox, y por eso tampoco
            // se tocan los flags del mensaje: la bandeja queda tal como la dejó su dueño.
            const desde = new Date(Date.now() - DIAS_ATRAS * 24 * 60 * 60 * 1000);
            const encontrados = new Set();
            for (const termino of TERMINOS_BUSQUEDA) {
                const r = await client.search({ subject: termino, since: desde }, { uid: true });
                for (const u of r || [])
                    encontrados.add(u);
            }
            // De más viejo a más nuevo: si un documento tiene varios avisos, gana el primero.
            const uids = [...encontrados].sort((a, b) => a - b).slice(0, MAX_MENSAJES);
            for (const uid of uids) {
                const msg = await client.fetchOne(String(uid), { envelope: true }, { uid: true });
                const asunto = msg?.envelope?.subject || "";
                const archivo = extraerArchivoDeAsunto(asunto);
                if (!archivo) {
                    // Vino del SEARCH pero no es un aviso de envío (p. ej. "Fulano firmó...", resumen diario).
                    logs.push({ resultado: "ignorado", asunto, detalle: "El asunto no es un aviso de envío a firmar." });
                    continue;
                }
                avisos++;
                if (soloPrueba)
                    continue;
                if (!dropboxCfg || !pendbox) {
                    errores.push("Dropbox no está conectado o falta la carpeta Pendbox");
                    logs.push({ resultado: "error", asunto, archivo, detalle: "Dropbox no está conectado o falta la carpeta Pendbox." });
                    continue;
                }
                // Fuera del try para que el log de error también pueda informar de qué persona se trataba.
                const ident = extraerIdentidadDeArchivo(archivo);
                try {
                    // Ya movido en una corrida anterior: se sigue de largo.
                    if (yaEstaEnPendbox(enPendbox, archivo, ident)) {
                        duplicados++;
                        logs.push({ resultado: "duplicado", asunto, archivo, cuit: ident.cuit, documento: ident.documento, detalle: "El documento ya estaba en Pendbox; no se vuelve a mover." });
                        continue;
                    }
                    // Sin PDF en Outbox no hay documento propio al que atribuir el aviso (puede ser de otra
                    // cuenta o un reenvío). No se archiva nada; si el PDF aparece después, la próxima corrida
                    // lo toma, porque el aviso se sigue encontrando mientras esté dentro de la ventana.
                    const pdf = buscarEnOutbox(enOutbox, archivo, ident);
                    if (!pdf) {
                        sinArchivoEnOutbox++;
                        const pistas = ident.cuit ? `No hay ningún archivo en Outbox que contenga el CUIL ${ident.cuit}.` : "El título del aviso no trae CUIL ni documento, y ningún archivo de Outbox coincide por nombre.";
                        logs.push({ resultado: "sin-archivo", asunto, archivo, cuit: ident.cuit, documento: ident.documento, detalle: `${pistas} Outbox tiene ${enOutbox.filter((e) => e.tag === "file").length} archivo(s).` });
                        continue;
                    }
                    // Único efecto sobre Dropbox: el PDF pasa de Outbox a Pendbox. Eso es lo que hace avanzar
                    // el contrato de "Para Firmar" a "Enviado a la firma"; no se genera ningún archivo extra.
                    await moveEntry(tenantId, dropboxCfg, pdf.path, `${pendbox.replace(/\/$/, "")}/${pdf.name}`);
                    movidos++;
                    // Los listados en memoria se actualizan para que un aviso repetido de esta misma corrida
                    // caiga en el chequeo de duplicado sin volver a pedirle las carpetas a Dropbox.
                    enOutbox = enOutbox.filter((e) => e.path !== pdf.path);
                    enPendbox.push({ tag: "file", name: pdf.name, path: `${pendbox.replace(/\/$/, "")}/${pdf.name}` });
                    logs.push({
                        resultado: "archivado",
                        asunto,
                        archivo: pdf.name,
                        cuit: ident.cuit,
                        documento: ident.documento,
                        detalle: "El PDF se movió de Outbox a Pendbox.",
                    });
                }
                catch (e) {
                    errores.push(`${archivo}: ${e?.message || e}`);
                    logs.push({ resultado: "error", asunto, archivo, cuit: ident?.cuit, documento: ident?.documento, detalle: String(e?.message || e) });
                }
            }
        }
        finally {
            lock.release();
        }
        await client.logout();
    }
    catch (e) {
        return { ok: false, detalle: `No se pudo leer la casilla: ${e?.message || e}`, avisos, movidos, duplicados, sinArchivoEnOutbox, logs };
    }
    const detalle = soloPrueba
        ? `Conexión OK. ${avisos} aviso(s) de envío en los últimos ${DIAS_ATRAS} días.`
        : [
            `${avisos} aviso(s) leídos`,
            `${movidos} PDF movido(s) de Outbox a Pendbox`,
            duplicados ? `${duplicados} ya estaban en Pendbox` : "",
            sinArchivoEnOutbox ? `${sinArchivoEnOutbox} sin PDF en Outbox` : "",
        ]
            .filter(Boolean)
            .join(" · ") + (errores.length ? ` · ${errores.length} con error: ${errores.slice(0, 3).join(" | ")}` : "");
    return { ok: errores.length === 0, detalle, avisos, movidos, duplicados, sinArchivoEnOutbox, logs };
}
/**
 * Update de Mongo que deja registrada una lectura. La corrida se suma al historial solo si encontró
 * algo o si falló: el job corre cada 5 minutos y guardar las corridas vacías llenaría el documento
 * del tenant sin aportar nada. Se conservan las últimas 50, de la más reciente a la más vieja.
 */
export function registrarLectura(r) {
    const update = {
        $set: {
            "integrations.dropboxSign.lastCheckAt": new Date(),
            "integrations.dropboxSign.lastCheckOk": r.ok,
            "integrations.dropboxSign.lastCheckDetalle": r.detalle,
        },
    };
    if (r.logs.length > 0 || !r.ok) {
        update.$push = {
            "integrations.dropboxSign.lastCheckHistorial": {
                $each: [{ at: new Date(), ok: r.ok, detalle: r.detalle, logs: r.logs }],
                $position: 0,
                $slice: 50,
            },
        };
    }
    return update;
}
/** Corre la lectura para todos los tenants que la tengan activada (lo usa el scheduler). */
export async function leerCasillasDeTodosLosTenants() {
    const tenants = await Tenant.find({ "integrations.dropboxSign.enabled": true }).select("_id").lean();
    for (const t of tenants) {
        try {
            const r = await leerCasillaDropboxSign(String(t._id));
            await Tenant.updateOne({ _id: t._id }, registrarLectura(r));
        }
        catch (e) {
            console.error(`[DROPBOX-SIGN-MAIL] tenant ${t._id}:`, e?.message || e);
        }
    }
}
/** Cada cuánto se revisa la casilla (mismo orden de magnitud que el escaneo de carpetas). */
const TICK_MS = 5 * 60 * 1000;
/** Arranca el chequeo periódico de la casilla (lo llama server.ts al levantar). */
export const initDropboxSignMailScheduler = () => {
    console.log("[DROPBOX-SIGN-MAIL] Initializing scheduler...");
    setTimeout(() => {
        leerCasillasDeTodosLosTenants().catch((err) => console.error("[DROPBOX-SIGN-MAIL] Initial tick error:", err));
    }, 20 * 1000);
    setInterval(() => {
        leerCasillasDeTodosLosTenants().catch((err) => console.error("[DROPBOX-SIGN-MAIL] Interval tick error:", err));
    }, TICK_MS);
};
