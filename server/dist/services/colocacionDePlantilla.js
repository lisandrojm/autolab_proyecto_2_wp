import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { DocumentoGenerado } from "../models/DocumentoGenerado.js";
import { colocacionDesdeMarcas, vecesFirmaEnPlantilla } from "../compartido/reglasColocacionFirma.js";
import { textoDelPdf } from "./dropboxSignBot/pdfTexto.js";
import { leerAnclas } from "../utils/anclasNombre.js";
/** Ubica la firma en el PDF. Tira si la plantilla la declara y no está. `null` = la plantilla no declara firma. */
export async function capturarFirmaDePlantilla(cuerpo, buffer, plantilla) {
    const veces = vecesFirmaEnPlantilla(cuerpo);
    if (veces === 0)
        return { colocacion: null };
    const paginas = await textoDelPdf(buffer);
    if (!paginas || paginas.length === 0)
        throw new Error(`No se pudo leer el PDF generado con la plantilla «${plantilla.nombre}» para ubicar la firma: no se generó el documento.`);
    const r = colocacionDesdeMarcas(paginas, veces);
    if (r.ok === false) {
        throw new Error(`La plantilla «${plantilla.nombre}» declara firma con {{firma}}, pero ${r.motivo}. Revisá en el ABM que {{firma}} esté escrita así y en el texto visible del contenido. No se generó el documento.`);
    }
    return {
        colocacion: {
            origen: "plantilla",
            plantillaTipo: plantilla.tipo,
            plantillaId: plantilla.id,
            plantillaNombre: plantilla.nombre,
            plantillaVersion: plantilla.version,
            pagina: r.pagina,
            totalPaginas: r.totalPaginas,
            campo: r.campo,
            linea: r.linea,
            paginaSize: r.paginaSize,
            sha256: sha256(buffer),
            avisos: r.avisos,
        },
    };
}
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");
/**
 * La guarda con el documento, por su código (el del nombre del archivo). Sin código no hay a qué
 * atarla: el documento sale igual y el bot cae al camino por ancla.
 */
export async function guardarFirmaDelDocumento(tenantId, filename, captura) {
    if (!captura.colocacion)
        return;
    const { codigo } = leerAnclas(filename);
    if (!codigo || !Types.ObjectId.isValid(tenantId))
        return;
    await DocumentoGenerado.updateOne({ tenantId: new Types.ObjectId(tenantId), codigo }, { $set: { colocacionFirma: { ...captura.colocacion, capturadaAt: new Date() } } }).catch((e) => console.warn(`[FIRMA-PLANTILLA] No se pudo guardar la posición de la firma de ${codigo}:`, e?.message || e));
}
export async function probarFirmaDePlantilla(contenido, membrete) {
    const veces = vecesFirmaEnPlantilla(contenido);
    if (veces === 0)
        return { declara: false, ok: false, motivo: "La plantilla no tiene {{firma}}: el bot va a buscar dónde firmar por las reglas por rótulo del nombre del archivo.", avisos: [], enviable: false };
    const { buildDocPdf, getDummyDocVariables } = await import("../utils/documentPdf.js");
    const buffer = await buildDocPdf(contenido, getDummyDocVariables(), membrete);
    const paginas = await textoDelPdf(buffer);
    if (!paginas?.length)
        return { declara: true, ok: false, motivo: "No se pudo leer el PDF de prueba.", avisos: [], enviable: false };
    const r = colocacionDesdeMarcas(paginas, veces);
    if (r.ok === false)
        return { declara: true, ok: false, motivo: `Tiene {{firma}}, pero ${r.motivo}.`, avisos: [], enviable: false };
    const { renderizarPaginaPng } = await import("./dropboxSignBot/ocrAnclas.js");
    const { png, ancho, alto } = await renderizarPaginaPng(buffer, r.pagina, 1.5);
    const enviable = r.pagina === 1 || r.pagina === r.totalPaginas;
    return { declara: true, ok: true, pagina: r.pagina, totalPaginas: r.totalPaginas, campo: r.campo, paginaSize: r.paginaSize, avisos: r.avisos, enviable, imagen: { base64: png.toString("base64"), ancho, alto } };
}
