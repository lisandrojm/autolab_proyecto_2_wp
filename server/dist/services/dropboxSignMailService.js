import { ImapFlow } from "imapflow";
import { Tenant } from "../models/Tenant.js";
import { decryptSecret } from "../utils/secretCrypto.js";
import { leerAnclas, mismoDocumento } from "../utils/anclasNombre.js";
import { resolverCarpetaPorProposito, resolverProposito } from "../utils/estadoCarpetas.js";
import { getTenantDropboxConfig, listFolder, moveEntry } from "./dropboxService.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { Info } from "../models/Info.js";
import { fechaISO } from "../utils/contratoVigencia.js";
import { aplicarTransicion } from "./estadoTransicionAutomaticaService.js";
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
 *  2. De ese nombre saca quién es (CUIL o email) y de qué período habla (ver `leerAnclas`).
 *  3. Busca en "Outbox" el sobre entero de esa persona y período (contrato, release y alta: ver
 *     `documentosDelAvisoEnOutbox`). Si no hay nada, no hace nada: sin respaldo en Outbox el aviso
 *     no se puede atribuir a un documento propio (puede ser de otra cuenta o de un reenvío).
 *  4. Si el documento ya está en "Pendbox", no lo vuelve a mover. Los avisos se repiten (reenvíos,
 *     recordatorios, resumen diario), así que el chequeo evita trabajo al pedo.
 *  5. Mueve esos PDF de Outbox a Pendbox —no se genera ningún archivo extra— y pasa el contrato al
 *     estado de Pendbox («Enviado a la firma») en el momento, sin esperar al escaneo de carpetas.
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
 * Los campos obligatorios de la nomenclatura que están dentro del nombre del archivo: CUIT, email,
 * documento y las fechas del período (ver `leerAnclas`). Dropbox Sign reemplaza algunos caracteres
 * del nombre original, así que se buscan esos datos sueltos en lugar de intentar reconstruir el
 * nombre completo. Por eso el "@" viaja escrito como `-ARROBA-`: es una palabra, y las letras
 * atraviesan esa transformación intactas.
 *
 * Se mantiene el nombre viejo de la función porque es como se la conoce en los comentarios de todo
 * el circuito; lo que cambió es que ahora lee también el email y las fechas, y que las expresiones
 * son las mismas que usa el escaneo de carpetas en vez de una copia.
 */
export const extraerIdentidadDeArchivo = leerAnclas;
/** Solo alfanumérico y en minúsculas: el asunto trae el nombre con caracteres ya transformados. */
const normalizarNombre = (v) => String(v || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]/g, "");
/**
 * Ubica en Outbox el PDF al que se refiere el aviso. El nombre del asunto NO se puede comparar
 * carácter a carácter: Dropbox Sign reemplaza símbolos del original. Por eso se matchea por los
 * campos obligatorios de la nomenclatura —quién (CUIT o email) y de qué período—, que atraviesan esa
 * transformación intactos, y recién después por el nombre normalizado a solo alfanumérico. Si queda
 * más de un candidato, devuelve null: nunca adivina.
 *
 * EL CUIT SOLO NO ALCANZA, y era lo que se comparaba antes. Una persona con dos documentos en Outbox
 * —un contrato y su renovación, dos períodos distintos— daba dos candidatos con el mismo CUIT, y el
 * aviso se descartaba entero: el contrato se quedaba para siempre en "Para Firmar" pese a haberse
 * enviado. Las fechas son obligatorias en la nomenclatura justamente para desempatar esto.
 */
export function buscarEnOutbox(entries, archivo, ident) {
    // No se exige extensión: los documentos generados por el sistema quedan en Outbox SIN ".pdf"
    // (solo se descartan los JSON, que son los archivos de control del propio circuito).
    const pdfs = entries.filter((e) => e.tag === "file" && !/\.json$/i.test(e.name));
    const objetivo = normalizarNombre(archivo);
    // Alcanza con UNO de los dos identificadores. El email es el que siempre está: hay personas sin
    // CUIL, y sus archivos quedaban sin nada con que reconocerse.
    if (ident.cuit || ident.email) {
        const porAnclas = pdfs.filter((e) => mismoDocumento(ident, leerAnclas(e.name)));
        if (porAnclas.length === 1)
            return porAnclas[0];
        if (porAnclas.length > 1) {
            // Mismo CUIT y mismo período: es un contrato y su release, o dos copias del mismo documento.
            // Los campos obligatorios no los distinguen —el `{{tipo}}` no es obligatorio— así que decide
            // el nombre completo, que sí lo trae. Si tampoco alcanza, se prefiere no mover nada.
            const exacto = porAnclas.filter((e) => normalizarNombre(e.name) === objetivo);
            return exacto.length === 1 ? exacto[0] : null;
        }
        // Cero por anclas: puede ser un archivo viejo, de antes de que el período fuera obligatorio.
        // Se sigue al nombre en vez de rendirse acá.
    }
    const porNombre = pdfs.filter((e) => normalizarNombre(e.name) === objetivo);
    return porNombre.length === 1 ? porNombre[0] : null;
}
/**
 * TODOS los documentos del aviso que están en Outbox: el sobre entero.
 *
 * «Enviar a firmar» manda juntos el contrato, su release y el alta, pero el aviso de Dropbox Sign
 * nombra UNO solo —el título de la solicitud, que además es editable: llegan títulos como
 * «<archivo>-Frame Firma Digital»—. Buscar ese único archivo dejaba el resto en Outbox, y si el
 * nombrado era el alta el contrato ni siquiera avanzaba (el escaneo de carpetas no mueve un contrato
 * por su alta). Así que se mueve todo lo de esa persona y ese período.
 *
 * Por persona (CUIL o email) Y período: sin fechas en el aviso no hay forma de saber cuál de sus
 * documentos es, y ahí solo se acepta un candidato único. Sin anclas, por nombre: igual, o el
 * archivo cuyo nombre es el PRINCIPIO del título (el título le agregó un sufijo).
 */
export function documentosDelAvisoEnOutbox(entries, archivo, ident) {
    const pdfs = entries.filter((e) => e.tag === "file" && !/\.json$/i.test(e.name));
    if (ident.cuit || ident.email) {
        const porAnclas = pdfs.filter((e) => mismoDocumento(ident, leerAnclas(e.name)));
        if (porAnclas.length > 0 && (ident.fechas.length > 0 || porAnclas.length === 1))
            return porAnclas;
    }
    const objetivo = normalizarNombre(archivo);
    const exactos = pdfs.filter((e) => normalizarNombre(e.name) === objetivo);
    if (exactos.length === 1)
        return exactos;
    // El piso de largo evita que un nombre cortito («contrato») sea «el principio» de cualquier título.
    const prefijos = pdfs.filter((e) => {
        const n = normalizarNombre(e.name);
        return n.length >= 20 && objetivo.startsWith(n);
    });
    return prefijos.length === 1 ? prefijos : [];
}
/**
 * El contrato del aviso: la persona (CUIL, si no email) y el período del nombre.
 *
 * Solo si queda UNO. Con dos contratos de la misma persona en el mismo período no se adivina: el
 * escaneo de carpetas lo va a resolver después con el nombre de cada archivo.
 */
async function contratoDelAviso(tenantId, ident) {
    if (ident.fechas.length === 0)
        return null;
    const cuit = String(ident.cuit || "").replace(/\D/g, "");
    const filtroPersona = cuit.length === 11 ? { "metadata.cuit": { $in: [cuit, `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`] } } : ident.email ? { email: new RegExp(`^${ident.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") } : null;
    if (!filtroPersona)
        return null;
    const personas = await User.find({ tenantId, ...filtroPersona }).select("_id").lean();
    if (personas.length === 0)
        return null;
    const ups = await UserProject.find({ userId: { $in: personas.map((p) => p._id) } });
    const compacta = (v) => fechaISO(v).replace(/-/g, "");
    const candidatos = [];
    for (const up of ups) {
        (up.contracts || []).forEach((c, idx) => {
            const alta = compacta(c.fecha_alta_contrato);
            const baja = compacta(c.fecha_baja_contrato);
            if (alta && ident.fechas.includes(alta) && (!baja || ident.fechas.includes(baja)))
                candidatos.push({ up, idx });
        });
    }
    return candidatos.length === 1 ? candidatos[0] : null;
}
/**
 * Pasa el contrato al estado de Pendbox («Enviado a la firma») EN EL MOMENTO.
 *
 * El estado destino es el que tiene configurada la carpeta Pendbox (Configuración → Documentos →
 * Dropbox): no se escribe el nombre a mano. `aplicarTransicion` solo avanza, nunca retrocede, así que
 * es seguro repetirlo en cada lectura. Devuelve el texto para el log.
 */
async function avanzarContratoDelAviso(tenantId, ident) {
    try {
        const { estado } = await resolverProposito("pendbox");
        const destino = estado ? await Info.findOne({ type: "estado-empleado", name: estado }) : null;
        if (!destino)
            return " No hay un estado con la carpeta Pendbox configurada: el estado no cambió.";
        const contrato = await contratoDelAviso(tenantId, ident);
        if (!contrato)
            return " No se pudo identificar un único contrato de esa persona y período: el estado no cambió.";
        const r = await aplicarTransicion(contrato.up, contrato.idx, destino);
        return r.aplicada ? ` El contrato pasó a «${destino.name}».` : r.motivo === "ya_estaba" ? ` El contrato ya estaba en «${destino.name}».` : "";
    }
    catch (e) {
        return ` No se pudo cambiar el estado: ${e?.message || e}`;
    }
}
/**
 * ¿Ese documento ya está en Pendbox? Se compara por nombre normalizado y, si no, por los campos
 * obligatorios de la nomenclatura: el archivo real suele tener un nombre distinto al del asunto
 * (Dropbox Sign transforma símbolos y el título de la solicitud es editable), así que el nombre solo
 * no alcanza para reconocerlo.
 *
 * ACÁ EL CUIT SOLO ERA UN FALSO POSITIVO. La condición era "hay algún archivo en Pendbox cuyo nombre
 * contenga este CUIT", y con eso el SEGUNDO documento de una persona nunca se movía: el aviso de la
 * renovación se daba por duplicado porque el contrato anterior ya estaba ahí. Se descartaba en
 * silencio y quedaba registrado como "ya estaba" — la peor forma de perder un envío, porque el log
 * dice que todo salió bien.
 */
export function yaEstaEnPendbox(entries, archivo, ident) {
    const objetivo = normalizarNombre(archivo);
    return entries.some((e) => {
        if (e.tag !== "file")
            return false;
        if (normalizarNombre(e.name) === objetivo)
            return true;
        return mismoDocumento(ident, leerAnclas(e.name));
    });
}
/**
 * Por qué falló el IMAP, en palabras que sirvan para arreglarlo.
 *
 * `imapflow` tira SIEMPRE «Command failed» cuando el servidor contesta NO/BAD: el motivo real viene
 * aparte, en `responseText` (lo que dijo el servidor) y `authenticationFailed`. Mostrando solo el
 * `message`, la pantalla decía «Command failed» igual para una contraseña rechazada que para
 * cualquier otra cosa, y no había por dónde empezar.
 *
 * El caso que más pasa tiene nombre propio: Gmail no acepta la contraseña de la cuenta por IMAP,
 * pide una «contraseña de aplicación». No se manda nunca `executedCommand`: en un LOGIN lleva la
 * contraseña.
 */
export function motivoFalloImap(e) {
    const texto = String(e?.responseText || "").trim();
    const codigo = String(e?.serverResponseCode || "").trim();
    const credenciales = e?.authenticationFailed === true || /AUTHENTICATIONFAILED|Invalid credentials|Web login required|Application-specific password/i.test(`${codigo} ${texto}`);
    if (credenciales) {
        return `El servidor rechazó el usuario o la contraseña${texto ? ` («${texto}»)` : ""}. Con Gmail no sirve la contraseña de la cuenta: hay que crear una «contraseña de aplicación» (Cuenta de Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones) y pegar esa, de 16 letras, en «Contraseña de la casilla». También tiene que estar habilitado IMAP en la configuración de Gmail.`;
    }
    const base = String(e?.message || e || "error desconocido");
    return texto ? `${base}: ${codigo ? `[${codigo}] ` : ""}${texto}` : base;
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
    const pendbox = await resolverCarpetaPorProposito("pendbox");
    const outbox = await resolverCarpetaPorProposito("outbox");
    const client = new ImapFlow({
        host: String(cfg.imapHost),
        port: Number(cfg.imapPort) || 993,
        secure: cfg.imapSecure !== false,
        auth: { user: String(cfg.imapUser || cfg.email), pass: decryptSecret(cfg.imapPasswordEnc) },
        logger: false,
    });
    // Sin este listener, un corte de la conexión (Gmail cierra sockets ociosos) emite un `error` que
    // nadie escucha, y en Node eso es una excepción no manejada que tumba el proceso entero.
    client.on("error", (e) => console.warn("[DROPBOX-SIGN-MAIL] Error de la conexión IMAP:", motivoFalloImap(e)));
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
                    // Ya movido en una corrida anterior: no se mueve de nuevo, pero el estado se intenta igual
                    // (un sobre movido a mano, o antes de que esto cambiara el estado, quedaba sin avanzar).
                    if (yaEstaEnPendbox(enPendbox, archivo, ident)) {
                        duplicados++;
                        const estado = await avanzarContratoDelAviso(tenantId, ident);
                        logs.push({ resultado: "duplicado", asunto, archivo, cuit: ident.cuit, documento: ident.documento, detalle: `El documento ya estaba en Pendbox; no se vuelve a mover.${estado}` });
                        continue;
                    }
                    // Sin documentos en Outbox no hay nada propio al que atribuir el aviso (puede ser de otra
                    // cuenta o un reenvío). No se archiva nada; si aparecen después, la próxima corrida los
                    // toma, porque el aviso se sigue encontrando mientras esté dentro de la ventana.
                    const sobre = documentosDelAvisoEnOutbox(enOutbox, archivo, ident);
                    if (sobre.length === 0) {
                        sinArchivoEnOutbox++;
                        // El detalle nombra los datos que SE BUSCARON, no solo el CUIT: si el aviso trae un
                        // período y ningún archivo de Outbox lo tiene, decir "no hay ninguno con este CUIL"
                        // manda a buscar el problema al lado equivocado.
                        const periodo = ident.fechas.length > 0 ? ` del período ${ident.fechas.join(" a ")}` : "";
                        const quien = ident.cuit ? `del CUIL ${ident.cuit}` : ident.email ? `de ${ident.email}` : "";
                        const pistas = quien ? `No hay ningún archivo en Outbox ${quien}${periodo}.` : "El título del aviso no trae CUIL, email ni documento, y ningún archivo de Outbox coincide por nombre.";
                        logs.push({ resultado: "sin-archivo", asunto, archivo, cuit: ident.cuit, documento: ident.documento, detalle: `${pistas} Outbox tiene ${enOutbox.filter((e) => e.tag === "file").length} archivo(s).` });
                        continue;
                    }
                    // El sobre entero pasa de Outbox a Pendbox (contrato, release y alta). Los listados en
                    // memoria se actualizan para que un aviso repetido de esta misma corrida caiga en el
                    // chequeo de duplicado sin volver a pedirle las carpetas a Dropbox.
                    for (const pdf of sobre) {
                        const destinoPdf = `${pendbox.replace(/\/$/, "")}/${pdf.name}`;
                        await moveEntry(tenantId, dropboxCfg, pdf.path, destinoPdf);
                        movidos++;
                        enOutbox = enOutbox.filter((e) => e.path !== pdf.path);
                        enPendbox.push({ tag: "file", name: pdf.name, path: destinoPdf });
                    }
                    const estado = await avanzarContratoDelAviso(tenantId, ident);
                    logs.push({
                        resultado: "archivado",
                        asunto,
                        archivo: sobre.map((p) => p.name).join(" · "),
                        cuit: ident.cuit,
                        documento: ident.documento,
                        detalle: `${sobre.length === 1 ? "El PDF se movió" : `Se movieron ${sobre.length} PDF`} de Outbox a Pendbox.${estado}`,
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
        console.warn("[DROPBOX-SIGN-MAIL] Falló la casilla:", motivoFalloImap(e));
        return { ok: false, detalle: `No se pudo leer la casilla: ${motivoFalloImap(e)}`, avisos, movidos, duplicados, sinArchivoEnOutbox, logs };
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
