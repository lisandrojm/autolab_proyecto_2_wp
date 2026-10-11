import { leerAnclas } from "./anclasNombre.js";
import { MAX_NOMBRE, largoEnBytes } from "./nomenclatura.js";
import { candidatosPorNombre } from "./coincidenciaDeNombre.js";
const esPdf = (e) => !/\.json$/i.test(e.name);
/**
 * El nombre del firmado con el código metido antes del primer «.pdf». Si no entra en `max` bytes se
 * recorta la cola (lo que va después de ese «.pdf»), y si ni así entra, null.
 */
export function nombreConCodigo(nombre, codigo, max = MAX_NOMBRE) {
    const i = nombre.toLowerCase().indexOf(".pdf");
    if (i < 0)
        return null;
    const cabeza = `${nombre.slice(0, i)}_${codigo}`;
    const extension = /\.[a-z0-9]{2,4}$/i.exec(nombre)?.[0] || ".pdf";
    const resto = nombre.slice(i); // ".pdf_ Firma solicitada por …s.pdf" (cola + extensión final)
    const completo = cabeza + resto;
    if (largoEnBytes(completo) <= max)
        return completo;
    // La cola es lo único recortable: queda «cabeza.pdf_ Firma soli….pdf», y como mínimo «cabeza.pdf».
    const cola = resto.slice(0, resto.length - extension.length); // sin la extensión final
    for (let largo = cola.length - 1; largo > 4; largo--) {
        const candidato = cabeza + cola.slice(0, largo) + extension;
        if (largoEnBytes(candidato) <= max)
            return candidato;
    }
    const minimo = cabeza + extension;
    return largoEnBytes(minimo) <= max ? minimo : null;
}
export function planLimpiezaPendbox(firmados, pendbox, max = MAX_NOMBRE) {
    const originales = pendbox.filter(esPdf);
    const nombresEnFirmados = new Set(firmados.map((f) => f.name.toLowerCase()));
    const asignados = new Set();
    const plan = { acciones: [], omitidos: [] };
    for (const firmado of firmados.filter(esPdf)) {
        const codigoDelFirmado = leerAnclas(firmado.name).codigo;
        const candidatos = codigoDelFirmado ? originales.filter((o) => leerAnclas(o.name).codigo === codigoDelFirmado) : candidatosPorNombre(originales, firmado.name);
        if (candidatos.length === 0) {
            plan.omitidos.push({ firmado, motivo: "sin_original" });
            continue;
        }
        if (candidatos.length > 1) {
            plan.omitidos.push({ firmado, motivo: `ambiguo_${candidatos.length}`, candidatos: candidatos.map((c) => c.name) });
            continue;
        }
        const original = candidatos[0];
        if (asignados.has(original.path)) {
            plan.omitidos.push({ firmado, motivo: "original_repetido", candidatos: [original.name] });
            continue;
        }
        const codigo = codigoDelFirmado || leerAnclas(original.name).codigo;
        if (!codigo) {
            plan.omitidos.push({ firmado, motivo: "original_sin_codigo", candidatos: [original.name] });
            continue;
        }
        let renombrarA;
        if (!codigoDelFirmado) {
            const nuevo = nombreConCodigo(firmado.name, codigo, max);
            if (!nuevo) {
                plan.omitidos.push({ firmado, motivo: firmado.name.toLowerCase().includes(".pdf") ? "nombre_largo" : "sin_pdf_en_nombre", candidatos: [original.name] });
                continue;
            }
            if (nombresEnFirmados.has(nuevo.toLowerCase())) {
                plan.omitidos.push({ firmado, motivo: "ya_existe", candidatos: [nuevo] });
                continue;
            }
            renombrarA = nuevo;
            nombresEnFirmados.add(nuevo.toLowerCase());
        }
        asignados.add(original.path);
        plan.acciones.push({ firmado, original, codigo, renombrarA });
    }
    return plan;
}
/** Texto de una línea por acción u omisión, para el log y el script. */
export function describirPlan(plan) {
    const lineas = [];
    for (const a of plan.acciones) {
        if (a.renombrarA)
            lineas.push(`RENOMBRAR  ${a.firmado.name}\n       →   ${a.renombrarA}`);
        lineas.push(`BORRAR     ${a.original.name}
       por  ${a.renombrarA || a.firmado.name}   (${a.codigo})`);
    }
    for (const o of plan.omitidos)
        lineas.push(`OMITIR     ${o.firmado.name}   [${o.motivo}]${o.candidatos?.length ? `  candidatos: ${o.candidatos.join(" | ")}` : ""}`);
    return lineas;
}
