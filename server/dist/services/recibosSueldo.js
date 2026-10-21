import fs from "fs";
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
import { agruparPaginas, leerRecibo } from "../utils/reciboDeSueldo.js";
import { normalizarCuit } from "../utils/constanciaPdf.js";
import { getContratoActivo, hoyArgentina } from "../utils/contratoVigencia.js";
import { nombreArchivoDocumento } from "./nomenclaturaService.js";
import { getTenantDropboxConfig, uploadFile } from "./dropboxService.js";
import { resolverCarpetaPorProposito } from "../utils/estadoCarpetas.js";
import { leerAnclas } from "../utils/anclasNombre.js";
import { abrirOcr, ocrDeImagen, renderizarPagina } from "../utils/ocrPaginas.js";
/**
 * RECIBOS DE SUELDO (Contratación › Recibos de sueldo, 20/10/2026).
 *
 * Se sube la sábana (un PDF con todos los recibos del mes, de a dos páginas por persona). El lote nace
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
/** Crea el lote, guarda la sábana y dispara la lectura en segundo plano. Devuelve el lote «leyendo». */
export async function procesarSabana(tenantId, subidoPor, nombreArchivo, buffer, paginasPorRecibo = 2) {
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
    const lote = new LoteRecibosSueldo({
        tenantId,
        nombreArchivo,
        subidoPor: subidoPor && Types.ObjectId.isValid(subidoPor) ? new Types.ObjectId(subidoPor) : null,
        paginas: total,
        paginasPorRecibo,
        estadoLote: "leyendo",
        progreso: { leidas: 0, total },
    });
    const dir = dirDelLote(lote);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "sabana.pdf"), buffer);
    lote.sabanaUrl = `/storage/${tenantId}/recibos-sueldo/${lote._id}/sabana.pdf`;
    await lote.save();
    // Sin `await`: la respuesta vuelve ya; la pantalla sigue el avance por `progreso`.
    void leerLote(lote, buffer).catch(async (e) => {
        console.error(`[RECIBOS-SUELDO] Falló la lectura del lote ${lote._id}:`, e);
        await LoteRecibosSueldo.updateOne({ _id: lote._id }, { $set: { estadoLote: "error", error: e?.message || String(e) } }).catch(() => { });
    });
    return lote;
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
                const { texto: leido, confianza } = await ocrDeImagen(ocr, await renderizarPagina(parser, i + 1));
                // El OCR va primero (es lo que trae los datos); la capa de texto, después (trae los rótulos).
                texto = `${leido}\n\n[Texto del PDF — OCR con confianza ${confianza}%]\n${texto}`;
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
    const porCuil = await usuariosPorCuil(lote.tenantId, [...new Set(leidos.map((g) => g.datos.cuil).filter(Boolean))]);
    const contratoDe = new Map();
    for (const u of porCuil.values())
        contratoDe.set(String(u._id), await personaYContrato(lote.tenantId, u._id));
    const dir = dirDelLote(lote);
    const periodos = new Map();
    const recibos = [];
    for (const [n, g] of leidos.entries()) {
        const archivo = `${String(n + 1).padStart(3, "0")}.pdf`;
        fs.writeFileSync(path.join(dir, archivo), await extraerPaginas(sabana, g.paginas));
        const u = g.datos.cuil ? porCuil.get(g.datos.cuil) : null;
        const contrato = u ? contratoDe.get(String(u._id)) : null;
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
            estado: u && contrato?.userProjectId ? "listo" : "sin_persona",
            error: u && !contrato?.userProjectId ? "La persona no tiene un contrato vigente en ningún proyecto." : !g.datos.cuil ? "No se encontró un CUIL en el texto del recibo." : !u ? "No hay ninguna persona con ese CUIL en la plataforma." : "",
        });
    }
    const periodo = [...periodos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    await LoteRecibosSueldo.updateOne({ _id: lote._id }, { $set: { recibos, periodo, estadoLote: "listo", "progreso.leidas": textos.length } });
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
export async function enviarAFirmar(lote, reciboIds) {
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
    const r = await LoteRecibosSueldo.updateOne({ tenantId, "recibos.codigo": codigo, "recibos.estado": "enviado" }, { $set: { "recibos.$.estado": "firmado", "recibos.$.firmadoEl": new Date() } });
    return r.modifiedCount > 0;
}
/** Todo lo que se leyó del PDF, para descargar como JSON y revisar qué entendió el lector. */
export function exportacionDelLote(lote) {
    return {
        lote: { id: String(lote._id), archivo: lote.nombreArchivo, paginas: lote.paginas, paginasPorRecibo: lote.paginasPorRecibo, periodo: lote.periodo, estado: lote.estadoLote, subido: lote.createdAt },
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
