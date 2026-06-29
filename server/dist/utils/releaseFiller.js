import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
/**
 * Rellena una plantilla .docx reemplazando las variables `{variable}` por los
 * valores del objeto `data`. Las variables no presentes en `data` se reemplazan
 * por una cadena vacía (nullGetter), de modo que el render nunca falla por
 * placeholders desconocidos.
 */
export function fillDocxTemplate(content, data) {
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => "",
    });
    doc.render(data);
    return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}
/** Formatea una fecha (ISO o dd/mm/yyyy) a dd/mm/yyyy. Devuelve "" si es inválida. */
export function formatDateAr(s) {
    if (!s)
        return "";
    if (typeof s === "string" && /^\d{2}\/\d{2}\/\d{4}/.test(s))
        return s.slice(0, 10);
    const d = new Date(s);
    if (isNaN(d.getTime()))
        return typeof s === "string" ? s : "";
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
