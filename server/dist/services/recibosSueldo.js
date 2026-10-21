import fs from "fs";
import { createHash } from "crypto";
import path from "path";
import { Types } from "mongoose";
import { PDFDocument } from "pdf-lib";
import { PDFParse } from "pdf-parse";
import { LoteRecibosSueldo } from "../models/LoteRecibosSueldo.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { Project } from "../models/Project.js";
import { Tenant } from "../models/Tenant.js";
import { DocumentoGenerado } from "../models/DocumentoGenerado.js";
import { ReciboSueldoEnviado } from "../models/ReciboSueldoEnviado.js";
import { agruparPaginas, leerRecibo, normalizarNombre } from "../utils/reciboDeSueldo.js";
import { normalizarCuit } from "../utils/constanciaPdf.js";
import { getContratoActivo, hoyArgentina } from "../utils/contratoVigencia.js";
import { nombreArchivoDocumento } from "./nomenclaturaService.js";
import { getTenantDropboxConfig, uploadFile } from "./dropboxService.js";
import { resolverCarpetaPorProposito } from "../utils/estadoCarpetas.js";
import { leerAnclas } from "../utils/anclasNombre.js";
import { abrirOcr, ocrDePagina } from "../utils/ocrPaginas.js";
import { bloquesDelTxt, decodificarTxt, leerTxtDeRecibos } from "../utils/reciboTxtMemosoft.js";
import { emparejarSabanas } from "../utils/emparejarSabanas.js";
/**
 * RECIBOS DE SUELDO (Contratación › Recibos de sueldo, 20/10/2026).
 *
 * Se sube la sábana (un PDF con todos los recibos del mes, de a dos páginas por persona) y, si se tiene,
 * el TXT que MEMOSOFT exporta con ella: con el TXT los datos salen de ahí, sin OCR y sin errores de
 * lectura (el bloque N del TXT es la página N del PDF, que sólo se parte). Sin TXT, el lote nace
 * en el acto, «leyendo», y la lectura sigue en segundo plano: se saca el texto de cada página y, si no
 * trae el CUIL (los recibos de MEMOSOFT dibujan los datos como trazos), se la renderiza y se le hace
 * OCR. Con el texto de cada página se parte la sábana en un recibo por persona (`agruparPaginas`),
 * cada recibo se guarda como PDF propio y se asocia a la persona por su CUIL y a su contrato que rige.
 * Después, el mismo circuito que los contratos: el PDF va al Outbox de Dropbox con la nomenclatura
 * «Recibos de sueldo» y vuelve firmado, reconocido por su código.
 *
 * Los archivos viven en `storage/<tenant>/recibos-sueldo/<lote>/` (fuera del repo), servidos como el
 * resto de `/storage`. Multi-tenant: todo filtra por `tenantId`.
 */
export class ErrorRecibos extends Error {
    status;
    constructor(msg, status = 400) {
        super(msg);
        this.status = status;
    }
}
const RAIZ_STORAGE = path.join(process.cwd(), "storage");
const nombreDe = (u) => `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || u?.email || "";
const dirDelLote = (lote) => path.join(RAIZ_STORAGE, String(lote.tenantId), "recibos-sueldo", String(lote._id));
/** El texto de cada página, en orden. Lanza si el archivo no es un PDF legible. */
async function textosPorPagina(parser) {
    const res = await parser.getText();
    const paginas = [...(res.pages || [])].sort((a, b) => a.num - b.num);
    return paginas.map((p) => p.text || "");
}
/** Un PDF nuevo con sólo esas páginas (base 0) de la sábana. */
async function extraerPaginas(sabana, indices) {
    const doc = await PDFDocument.create();
    const copiadas = await doc.copyPages(sabana, indices);
    for (const p of copiadas)
        doc.addPage(p);
    return Buffer.from(await doc.save());
}
/**
 * La persona y su contrato que rige, para un CUIL. Si la persona está en varios proyectos, el
 * contrato vigente más reciente; sin ninguno vigente, nada: un recibo no se asocia a un contrato
 * terminado hace meses.
 */
async function personaYContrato(tenantId, userId) {
    const vinculos = await UserProject.find({ userId }).lean();
    const hoy = hoyArgentina();
    let mejor = null;
    for (const up of vinculos) {
        const c = getContratoActivo(up.contracts || [], hoy);
        if (!c)
            continue;
        const idx = (up.contracts || []).indexOf(c);
        const alta = String(c.fecha_alta_contrato || "");
        if (!mejor || alta > mejor.alta)
            mejor = { up, idx, alta };
    }
    if (!mejor)
        return { userProjectId: null, projectId: null, contractIndex: null, nombreProyecto: "" };
    const proyecto = await Project.findOne({ _id: mejor.up.projectId, tenantId }).select("name").lean();
    return { userProjectId: mejor.up._id, projectId: mejor.up.projectId, contractIndex: mejor.idx, nombreProyecto: proyecto?.name || mejor.up.nombre_proyecto || "" };
}
/** Las personas del tenant por CUIL normalizado (el guardado puede traer guiones). */
async function usuariosPorCuil(tenantId, cuils) {
    if (cuils.length === 0)
        return new Map();
    const usuarios = await User.find({ tenantId, "metadata.cuit": { $exists: true, $ne: "" }, "metadata.sinCuit": { $ne: true } }).select("firstName lastName email metadata.cuit").lean();
    const m = new Map();
    for (const u of usuarios) {
        const c = normalizarCuit(u.metadata?.cuit);
        if (c && cuils.includes(c) && !m.has(c))
            m.set(c, u);
    }
    return m;
}
/**
 * Cuando el OCR no leyó el CUIL pero sí «APELLIDO, Nombres»: la persona cuyo apellido y primer nombre
 * coinciden, si es UNA sola. Se marca aparte (`asociadoPorNombre`) para que se revise antes de enviar:
 * es un respaldo, no la regla. Las tildes no cuentan (el OCR las pierde).
 */
async function usuarioPorNombre(tenantId, nombreLeido) {
    const m = /^([^,]+),\s*(.+)$/.exec(normalizarNombre(nombreLeido));
    if (!m)
        return null;
    const apellido = m[1].trim();
    const primerNombre = m[2].trim().split(" ")[0];
    if (!apellido || !primerNombre)
        return null;
    const candidatos = await User.find({ tenantId, "metadata.isSolicitud": { $ne: true } }).select("firstName lastName email metadata.cuit").lean();
    const mismoNombre = (u) => normalizarNombre(u.firstName).split(" ")[0] === primerNombre;
    const iguales = candidatos.filter((u) => normalizarNombre(u.lastName) === apellido && mismoNombre(u));
    if (iguales.length === 1)
        return iguales[0];
    if (iguales.length > 1)
        return null;
    // El OCR cambia una letra del apellido («VORIO» por «YORIO»): se admite UNA de diferencia, con el mismo primer nombre.
    if (apellido.length < 5)
        return null;
    const parecidos = candidatos.filter((u) => mismoNombre(u) && distancia1(normalizarNombre(u.lastName), apellido));
    return parecidos.length === 1 ? parecidos[0] : null;
}
/** ¿Difieren en una sola letra (cambiada, de más o de menos)? */
function distancia1(a, b) {
    if (a === b)
        return false;
    if (Math.abs(a.length - b.length) > 1)
        return false;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i])
        i++;
    if (a.length === b.length)
        return a.slice(i + 1) === b.slice(i + 1);
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
/**
 * Crea el lote y guarda la sábana. Con el TXT de MEMOSOFT lee los datos de ahí en el acto y devuelve el
 * lote «listo»; sin TXT dispara la lectura por OCR en segundo plano y lo devuelve «leyendo».
 */
export async function procesarSabana(tenantId, subidoPor, nombreArchivo, buffer, paginasPorRecibo = 2, txt) {
    let total = 0;
    try {
        const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        total = doc.getPageCount();
    }
    catch (e) {
        throw new ErrorRecibos(`No se pudo leer el PDF: ${e?.message || e}`);
    }
    if (total === 0)
        throw new ErrorRecibos("El PDF no tiene páginas.");
    // El TXT se valida antes de crear nada: tiene que traer una hoja por cada página del PDF.
    const deTxt = txt ? leerTxtDeRecibos(decodificarTxt(txt.buffer)) : null;
    if (deTxt) {
        if (deTxt.recibos.length === 0)
            throw new ErrorRecibos("El TXT no tiene recibos de MEMOSOFT (no se encontró ninguna hoja «ORIGINAL … APELLIDO Y NOMBRES»).");
        if (deTxt.bloques.length !== total)
            throw new ErrorRecibos(`El TXT trae ${deTxt.bloques.length} hojas (${deTxt.recibos.length} recibos) y el PDF ${total} páginas: no parecen de la misma liquidación. Subí el TXT y el PDF que exportó MEMOSOFT juntos.`);
    }
    const lote = new LoteRecibosSueldo({
        tenantId,
        nombreArchivo,
        subidoPor: subidoPor && Types.ObjectId.isValid(subidoPor) ? new Types.ObjectId(subidoPor) : null,
        paginas: total,
        paginasPorRecibo,
        estadoLote: "leyendo",
        progreso: { leidas: 0, total },
        fuente: deTxt ? "txt" : "ocr",
        nombreTxt: txt?.nombre || "",
    });
    const dir = dirDelLote(lote);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "sabana.pdf"), buffer);
    lote.sabanaUrl = `/storage/${tenantId}/recibos-sueldo/${lote._id}/sabana.pdf`;
    if (txt) {
        fs.writeFileSync(path.join(dir, "recibos.txt"), txt.buffer);
        lote.txtUrl = `/storage/${tenantId}/recibos-sueldo/${lote._id}/recibos.txt`;
    }
    await lote.save();
    if (deTxt) {
        // Sin OCR: unos segundos aunque sean cientos de recibos, así que se hace en el acto.
        try {
            const sabana = await PDFDocument.load(buffer, { ignoreEncryption: true });
            await armarRecibos(lote, sabana, deTxt.recibos.map((r) => ({ paginas: r.hojas, texto: r.texto, datos: r.datos })));
        }
        catch (e) {
            await LoteRecibosSueldo.updateOne({ _id: lote._id }, { $set: { estadoLote: "error", error: e?.message || String(e) } }).catch(() => { });
            throw e;
        }
        return lote;
    }
    // Sin `await`: la respuesta vuelve ya; la pantalla sigue el avance por `progreso`.
    void leerLote(lote, buffer).catch(async (e) => {
        console.error(`[RECIBOS-SUELDO] Falló la lectura del lote ${lote._id}:`, e);
        await LoteRecibosSueldo.updateOne({ _id: lote._id }, { $set: { estadoLote: "error", error: e?.message || String(e) } }).catch(() => { });
    });
    return lote;
}
/**
 * SUBIDA MASIVA: todas las sábanas PDF y sus TXT de una vez. Cada TXT se empareja con su PDF (por nombre
 * y, si no, por cantidad de páginas: ver `utils/emparejarSabanas.ts`) y cada par es un lote, como si se
 * hubiera subido solo. Lo que no tiene pareja no se sube y se informa: un PDF solo se lee por OCR, que es
 * lento y menos preciso, así que se sube aparte a propósito.
 */
export async function procesarVarios(tenantId, subidoPor, archivos, paginasPorRecibo = 2) {
    const omitidos = [];
    const pdfs = [];
    const txts = [];
    const porNombre = new Map();
    // El mismo archivo bajado dos veces («… (1).pdf»): se sube una sola vez.
    const vistos = new Map();
    for (const a of archivos) {
        const huella = createHash("sha1").update(a.buffer).digest("hex");
        if (porNombre.has(a.nombre) || vistos.has(huella)) {
            omitidos.push({ archivo: a.nombre, motivo: `Repetido: es el mismo archivo que «${vistos.get(huella) || a.nombre}».` });
            continue;
        }
        vistos.set(huella, a.nombre);
        porNombre.set(a.nombre, a.buffer);
        if (/\.pdf$/i.test(a.nombre)) {
            try {
                pdfs.push({ nombre: a.nombre, paginas: (await PDFDocument.load(a.buffer, { ignoreEncryption: true })).getPageCount() });
            }
            catch (e) {
                omitidos.push({ archivo: a.nombre, motivo: `No se pudo leer el PDF: ${e?.message || e}` });
            }
        }
        else if (/\.txt$/i.test(a.nombre))
            txts.push({ nombre: a.nombre, hojas: bloquesDelTxt(decodificarTxt(a.buffer)).length });
        else
            omitidos.push({ archivo: a.nombre, motivo: "No es un PDF ni un TXT." });
    }
    const e = emparejarSabanas(pdfs, txts);
    for (const p of e.pdfsSinTxt)
        omitidos.push({ archivo: p, motivo: "No vino su TXT. Para leerlo por OCR, subilo solo." });
    for (const t of e.txtsSinPdf)
        omitidos.push({ archivo: t.nombre, motivo: t.motivo });
    const lotes = [];
    for (const par of e.pares) {
        try {
            const lote = await procesarSabana(tenantId, subidoPor, par.pdf, porNombre.get(par.pdf), paginasPorRecibo, { nombre: par.txt, buffer: porNombre.get(par.txt) });
            lotes.push({ loteId: String(lote._id), pdf: par.pdf, txt: par.txt, recibos: (lote.recibos || []).length, por: par.por });
        }
        catch (err) {
            omitidos.push({ archivo: `${par.pdf} + ${par.txt}`, motivo: err?.message || String(err) });
        }
    }
    return { lotes, omitidos };
}
/**
 * La lectura en sí. Texto de cada página y, si no trae un CUIL de persona, OCR de su imagen. El
 * avance se guarda página a página para que se vea desde la pantalla.
 */
async function leerLote(lote, buffer) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    let ocr = null;
    const textos = [];
    try {
        const capa = await textosPorPagina(parser);
        for (let i = 0; i < capa.length; i++) {
            let texto = capa[i];
            if (!leerRecibo(texto).cuil) {
                if (!ocr)
                    ocr = await abrirOcr();
                const { texto: leido, pasadas } = await ocrDePagina(ocr, parser, i + 1, (t) => !leerRecibo(t).cuil);
                // El OCR va primero (es lo que trae los datos); la capa de texto, después (trae los rótulos).
                texto = `${leido}\n\n[OCR: ${pasadas.join(" + ")}. Texto del PDF:]\n${texto}`;
            }
            textos.push(texto);
            await LoteRecibosSueldo.updateOne({ _id: lote._id }, { $set: { "progreso.leidas": i + 1 } });
        }
    }
    finally {
        await parser.destroy().catch(() => { });
        if (ocr)
            await ocr.terminate().catch(() => { });
    }
    const sabana = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const grupos = agruparPaginas(textos, lote.paginasPorRecibo);
    const leidos = grupos.map((paginas) => ({ paginas, texto: paginas.map((i) => textos[i]).join("\n\n----- página siguiente -----\n\n") })).map((g) => ({ ...g, datos: leerRecibo(g.texto) }));
    await armarRecibos(lote, sabana, leidos);
}
/**
 * Con lo leído de cada recibo (por OCR o del TXT): guarda su PDF con sus páginas, busca a la persona por
 * CUIL (o por nombre, si no hay CUIL) y su contrato que rige, y deja el lote «listo».
 */
async function armarRecibos(lote, sabana, leidos) {
    const fuente = lote.fuente === "txt" ? "El TXT" : "El OCR";
    const porCuil = await usuariosPorCuil(lote.tenantId, [...new Set(leidos.map((g) => g.datos.cuil).filter(Boolean))]);
    const contratoDe = new Map();
    const contratoDeUsuario = async (u) => {
        if (!contratoDe.has(String(u._id)))
            contratoDe.set(String(u._id), await personaYContrato(lote.tenantId, u._id));
        return contratoDe.get(String(u._id));
    };
    const dir = dirDelLote(lote);
    const periodos = new Map();
    const recibos = [];
    for (const [n, g] of leidos.entries()) {
        const archivo = `${String(n + 1).padStart(3, "0")}.pdf`;
        fs.writeFileSync(path.join(dir, archivo), await extraerPaginas(sabana, g.paginas));
        let u = g.datos.cuil ? porCuil.get(g.datos.cuil) : null;
        let porNombre = false;
        if (!u && !g.datos.cuil && g.datos.nombre) {
            u = await usuarioPorNombre(lote.tenantId, g.datos.nombre);
            porNombre = !!u;
        }
        const contrato = u ? await contratoDeUsuario(u) : null;
        if (g.datos.periodo)
            periodos.set(g.datos.periodo, (periodos.get(g.datos.periodo) || 0) + 1);
        recibos.push({
            paginas: g.paginas.map((i) => i + 1),
            datos: g.datos,
            textoCrudo: g.texto,
            archivoUrl: `/storage/${lote.tenantId}/recibos-sueldo/${lote._id}/${archivo}`,
            userId: u?._id || null,
            nombreUsuario: u ? nombreDe(u) : "",
            ...(contrato || { userProjectId: null, projectId: null, contractIndex: null, nombreProyecto: "" }),
            asociadoPorNombre: porNombre,
            estado: u && contrato?.userProjectId ? "listo" : "sin_persona",
            error: u && !contrato?.userProjectId ? "La persona no tiene un contrato vigente en ningún proyecto." : porNombre ? `${fuente} no trajo el CUIL: se asoció por apellido y nombre. Revisá que sea la persona antes de enviar.` : !g.datos.cuil ? "No se encontró un CUIL en el texto del recibo." : !u ? "No hay ninguna persona con ese CUIL en la plataforma." : "",
        });
    }
    const periodo = [...periodos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    const set = { recibos, periodo, estadoLote: "listo", "progreso.leidas": lote.paginas };
    await LoteRecibosSueldo.updateOne({ _id: lote._id }, { $set: set });
    // También en memoria: quien llamó (la subida masiva) cuenta los recibos del lote que tiene en la mano.
    lote.set({ recibos, periodo, estadoLote: "listo" });
}
/**
 * VOLVER A LEER UN RECIBO: su PDF (las páginas ya separadas) pasa otra vez por OCR, a más resolución
 * que la lectura del lote (4× la página entera, y el encabezado a 4× si falta el CUIL), se releen los
 * datos y se vuelve a buscar a la persona por CUIL o por nombre. La persona elegida a mano se respeta.
 */
export async function releerRecibo(lote, reciboId) {
    const r = lote.recibos.id(reciboId);
    if (!r)
        throw new ErrorRecibos("Recibo no encontrado.", 404);
    if (r.estado === "enviado" || r.estado === "firmado")
        throw new ErrorRecibos("Ese recibo ya se envió a firmar: no se vuelve a leer.", 409);
    if (lote.fuente === "txt")
        throw new ErrorRecibos("Los datos de este lote salen del TXT de MEMOSOFT: no hace falta volver a leerlos.", 409);
    const archivo = path.join(RAIZ_STORAGE, String(r.archivoUrl || "").replace(/^\/storage\//, ""));
    if (!r.archivoUrl || !fs.existsSync(archivo))
        throw new ErrorRecibos("El PDF de ese recibo ya no está en el servidor.", 404);
    const parser = new PDFParse({ data: new Uint8Array(fs.readFileSync(archivo)) });
    const ocr = await abrirOcr();
    const textos = [];
    try {
        const capa = await textosPorPagina(parser);
        for (let i = 0; i < capa.length; i++) {
            const { texto, pasadas } = await ocrDePagina(ocr, parser, i + 1, (t) => !leerRecibo(t).cuil, true);
            textos.push(`${texto}\n\n[Relectura — OCR: ${pasadas.join(" + ")}. Texto del PDF:]\n${capa[i]}`);
        }
    }
    finally {
        await parser.destroy().catch(() => { });
        await ocr.terminate().catch(() => { });
    }
    const texto = textos.join("\n\n----- página siguiente -----\n\n");
    const datos = leerRecibo(texto);
    r.textoCrudo = texto;
    r.datos = datos;
    if (!r.asignadoAMano) {
        let u = datos.cuil ? (await usuariosPorCuil(lote.tenantId, [datos.cuil])).get(datos.cuil) : null;
        let porNombre = false;
        if (!u && !datos.cuil && datos.nombre) {
            u = await usuarioPorNombre(lote.tenantId, datos.nombre);
            porNombre = !!u;
        }
        const contrato = u ? await personaYContrato(lote.tenantId, u._id) : null;
        r.userId = u?._id || null;
        r.nombreUsuario = u ? nombreDe(u) : "";
        r.userProjectId = contrato?.userProjectId || null;
        r.projectId = contrato?.projectId || null;
        r.contractIndex = contrato?.contractIndex ?? null;
        r.nombreProyecto = contrato?.nombreProyecto || "";
        r.asociadoPorNombre = porNombre;
        r.estado = u && contrato?.userProjectId ? "listo" : "sin_persona";
        r.error = u && !contrato?.userProjectId ? "La persona no tiene un contrato vigente en ningún proyecto." : porNombre ? "El OCR no leyó el CUIL: se asoció por apellido y nombre. Revisá que sea la persona antes de enviar." : !datos.cuil ? "No se encontró un CUIL en el texto del recibo." : !u ? "No hay ninguna persona con ese CUIL en la plataforma." : "";
    }
    lote.markModified("recibos");
    await lote.save();
}
/** Asigna a mano la persona de un recibo (y su contrato que rige). */
export async function asignarPersona(lote, reciboId, userId) {
    const r = lote.recibos.id(reciboId);
    if (!r)
        throw new ErrorRecibos("Recibo no encontrado.", 404);
    if (r.estado === "enviado" || r.estado === "firmado")
        throw new ErrorRecibos("Ese recibo ya se envió a firmar: no se cambia la persona.", 409);
    if (!Types.ObjectId.isValid(userId))
        throw new ErrorRecibos("Persona inválida.");
    const u = await User.findOne({ _id: userId, tenantId: lote.tenantId }).select("firstName lastName email").lean();
    if (!u)
        throw new ErrorRecibos("Persona no encontrada.", 404);
    const contrato = await personaYContrato(lote.tenantId, u._id);
    r.userId = u._id;
    r.nombreUsuario = nombreDe(u);
    r.userProjectId = contrato.userProjectId;
    r.projectId = contrato.projectId;
    r.contractIndex = contrato.contractIndex;
    r.nombreProyecto = contrato.nombreProyecto;
    r.asignadoAMano = true;
    r.estado = contrato.userProjectId ? "listo" : "sin_persona";
    r.error = contrato.userProjectId ? "" : "La persona no tiene un contrato vigente en ningún proyecto.";
    lote.markModified("recibos");
    await lote.save();
}
/**
 * Manda los recibos al Outbox de Dropbox, uno por uno, con la nomenclatura «Recibos de sueldo» (tipo
 * interno "Contrato") del contrato que rige. El código del documento queda marcado como recibo de
 * sueldo para que, al volver firmado, el escaneo de carpetas marque el recibo y NO mueva el estado del
 * contrato (ver `estadoDropboxCronService`).
 */
export async function enviarAFirmar(lote, reciboIds, enviadoPor) {
    const tenant = await Tenant.findById(lote.tenantId).lean();
    const cfg = getTenantDropboxConfig(tenant);
    if (!cfg)
        throw new ErrorRecibos("Dropbox no está conectado para esta organización.");
    const outbox = await resolverCarpetaPorProposito("outbox");
    if (!outbox)
        throw new ErrorRecibos('No hay ninguna carpeta de Dropbox configurada como "Outbox" en Documentos → Configurar transición automática.');
    const carpeta = outbox.replace(/\/$/, "");
    const elegidos = lote.recibos.filter((r) => (!reciboIds || reciboIds.includes(String(r._id))) && r.estado === "listo");
    let enviados = 0;
    const fallidos = [];
    const quien = enviadoPor && Types.ObjectId.isValid(enviadoPor) ? await User.findById(enviadoPor).select("firstName lastName email").lean() : null;
    for (const r of elegidos) {
        try {
            const [user, up] = await Promise.all([User.findOne({ _id: r.userId, tenantId: lote.tenantId }).lean(), UserProject.findById(r.userProjectId).lean()]);
            const contract = up?.contracts?.[r.contractIndex ?? -1];
            if (!user || !up || !contract)
                throw new Error("La persona o su contrato ya no están.");
            const nombre = `${await nombreArchivoDocumento({ tenantId: lote.tenantId, tipo: "Contrato", user, up, contract, periodo: r.datos?.periodo || lote.periodo || undefined })}.pdf`;
            const buffer = fs.readFileSync(path.join(RAIZ_STORAGE, r.archivoUrl.replace(/^\/storage\//, "")));
            await uploadFile(String(lote.tenantId), cfg, `${carpeta}/${nombre}`, buffer);
            const codigo = leerAnclas(nombre).codigo;
            // El registro del código sabe que es un recibo: al volver firmado no mueve el contrato.
            if (codigo)
                await DocumentoGenerado.updateOne({ tenantId: lote.tenantId, codigo }, { $set: { clase: "recibo_sueldo", loteRecibosId: lote._id, reciboId: r._id } });
            r.estado = "enviado";
            r.enviadoEl = new Date();
            r.nombreEnviado = nombre;
            r.codigo = codigo;
            r.error = "";
            enviados++;
            // El registro permanente de lo enviado. Si falla, el envío ya se hizo: se avisa en el log y el
            // historial lo completa la próxima vez que se consulte (`completarHistorial`, desde el lote).
            await registrarEnviado(lote, r, quien).catch((e) => console.error(`[RECIBOS-SUELDO] No se registró el envío del recibo ${r._id}:`, e));
        }
        catch (e) {
            const motivo = e?.response?.data ? JSON.stringify(e.response.data) : e?.message || String(e);
            r.error = motivo;
            fallidos.push({ reciboId: String(r._id), motivo });
        }
    }
    lote.markModified("recibos");
    await lote.save();
    return { enviados, fallidos };
}
/** Borra el lote y sus PDFs. Sólo si ningún recibo salió a firmar. */
export async function eliminarLote(lote) {
    if (lote.recibos.some((r) => r.estado === "enviado" || r.estado === "firmado"))
        throw new ErrorRecibos("Este lote tiene recibos ya enviados a firmar: no se borra.", 409);
    fs.rmSync(dirDelLote(lote), { recursive: true, force: true });
    await lote.deleteOne();
}
/** Marca como firmado el recibo cuyo código volvió a la carpeta de firmados. Lo llama el escaneo de Dropbox. */
export async function marcarReciboFirmado(tenantId, codigo) {
    const ahora = new Date();
    const r = await LoteRecibosSueldo.updateOne({ tenantId, "recibos.codigo": codigo, "recibos.estado": "enviado" }, { $set: { "recibos.$.estado": "firmado", "recibos.$.firmadoEl": ahora } });
    const h = await ReciboSueldoEnviado.updateOne({ tenantId, codigo, estado: "enviado" }, { $set: { estado: "firmado", firmadoEl: ahora } });
    return r.modifiedCount > 0 || h.modifiedCount > 0;
}
/** La foto de un recibo enviado, para el registro permanente (`ReciboSueldoEnviado`). */
function filaDelHistorial(lote, r, quien) {
    const datos = JSON.parse(JSON.stringify(r.datos || {}));
    return {
        tenantId: lote.tenantId,
        loteId: lote._id,
        reciboId: r._id,
        nombreSabana: lote.nombreArchivo || "",
        nombreTxt: lote.nombreTxt || "",
        fuente: lote.fuente || "ocr",
        paginas: [...(r.paginas || [])],
        periodo: datos.periodo || lote.periodo || "",
        userId: r.userId || null,
        nombreUsuario: r.nombreUsuario || "",
        userProjectId: r.userProjectId || null,
        projectId: r.projectId || null,
        contractIndex: r.contractIndex ?? null,
        nombreProyecto: r.nombreProyecto || "",
        asignadoAMano: !!r.asignadoAMano,
        datos,
        archivoUrl: r.archivoUrl || "",
        nombreEnviado: r.nombreEnviado || "",
        codigo: r.codigo || "",
        enviadoEl: r.enviadoEl || new Date(),
        ...(quien ? { enviadoPor: quien._id, nombreEnviadoPor: nombreDe(quien) } : {}),
        estado: r.estado === "firmado" ? "firmado" : "enviado",
        firmadoEl: r.firmadoEl || null,
    };
}
/** Guarda (o actualiza, si se reenvió) la fila del recibo en el registro de enviados. */
async function registrarEnviado(lote, r, quien) {
    await ReciboSueldoEnviado.updateOne({ loteId: lote._id, reciboId: r._id }, { $set: filaDelHistorial(lote, r, quien) }, { upsert: true });
}
/**
 * Completa el registro con los recibos enviados que todavía no están: los que salieron antes de que
 * existiera el registro, o aquéllos cuyo registro falló al enviar. Sólo agrega lo que falta y pone al día
 * el «firmado»; no pisa lo que ya está.
 */
export async function completarHistorial(tenantId) {
    const lotes = await LoteRecibosSueldo.find({ tenantId, "recibos.estado": { $in: ["enviado", "firmado"] } }).select("-recibos.textoCrudo");
    let agregados = 0;
    for (const lote of lotes) {
        for (const r of lote.recibos) {
            if (r.estado !== "enviado" && r.estado !== "firmado")
                continue;
            const fila = filaDelHistorial(lote, r);
            const res = await ReciboSueldoEnviado.updateOne({ loteId: lote._id, reciboId: r._id }, { $setOnInsert: fila }, { upsert: true });
            if (res.upsertedCount)
                agregados++;
            else if (r.estado === "firmado")
                await ReciboSueldoEnviado.updateOne({ loteId: lote._id, reciboId: r._id, estado: "enviado" }, { $set: { estado: "firmado", firmadoEl: r.firmadoEl || new Date() } });
        }
    }
    return agregados;
}
/** El registro de enviados, más nuevos primero, con filtros por período, estado y texto. */
export async function listarEnviados(tenantId, f) {
    const filtro = { tenantId };
    if (f.periodo && /^\d{4}-\d{2}$/.test(f.periodo))
        filtro.periodo = f.periodo;
    if (f.estado === "enviado" || f.estado === "firmado")
        filtro.estado = f.estado;
    const q = String(f.q || "").trim();
    if (q) {
        const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        const digitos = q.replace(/\D/g, "");
        filtro.$or = [{ nombreUsuario: re }, { "datos.nombre": re }, { "datos.legajo": re }, { nombreProyecto: re }, { codigo: re }, { "datos.tarea": re }, { "datos.categoria": re }, ...(digitos.length >= 3 ? [{ "datos.cuil": new RegExp(digitos) }] : [])];
    }
    const porPagina = Math.min(500, Math.max(1, f.porPagina || 100));
    const pagina = Math.max(1, f.pagina || 1);
    const [items, total, periodos] = await Promise.all([
        ReciboSueldoEnviado.find(filtro).select("-datos.conceptos").sort({ enviadoEl: -1, _id: -1 }).skip((pagina - 1) * porPagina).limit(porPagina).lean(),
        ReciboSueldoEnviado.countDocuments(filtro),
        ReciboSueldoEnviado.distinct("periodo", { tenantId }),
    ]);
    return { items, total, pagina, porPagina, periodos: periodos.filter(Boolean).sort().reverse() };
}
/** Todo lo que se leyó del PDF, para descargar como JSON y revisar qué entendió el lector. */
export function exportacionDelLote(lote) {
    return {
        lote: { id: String(lote._id), archivo: lote.nombreArchivo, fuente: lote.fuente, txt: lote.nombreTxt || undefined, paginas: lote.paginas, paginasPorRecibo: lote.paginasPorRecibo, periodo: lote.periodo, estado: lote.estadoLote, subido: lote.createdAt },
        recibos: lote.recibos.map((r) => ({
            paginas: r.paginas,
            datos: r.datos,
            persona: r.userId ? { id: String(r.userId), nombre: r.nombreUsuario, proyecto: r.nombreProyecto, asignadoAMano: !!r.asignadoAMano } : null,
            estado: r.estado,
            error: r.error || undefined,
            enviado: r.nombreEnviado ? { nombre: r.nombreEnviado, codigo: r.codigo, el: r.enviadoEl } : undefined,
            textoCrudo: r.textoCrudo,
        })),
    };
}
