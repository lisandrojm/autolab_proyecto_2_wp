import { Info } from "../models/Info.js";
function nombreDeCarpeta(path) {
    return (path || "").split("/").filter(Boolean).pop() || "";
}
function matchTodos(texto, patrones) {
    return patrones.every((p) => p.test(texto));
}
function textoDeCarpeta(c) {
    return `${c.detalle || ""} ${nombreDeCarpeta(c.dropboxCarpeta)}`;
}
async function estadosConTransicion() {
    const estados = await Info.find({ type: "estado-empleado", "data.transicionAutomatica.carpetas.0": { $exists: true } })
        .select("name data.transicionAutomatica")
        .lean();
    return estados.map((e) => ({ name: e.name, carpetas: (e?.data?.transicionAutomatica?.carpetas || []) }));
}
/** Path de la PRIMERA carpeta (de cualquier estado) cuyo nombre o nota matcheen TODOS los patrones. */
export async function resolverCarpetaPorPatron(patrones) {
    for (const estado of await estadosConTransicion()) {
        const match = estado.carpetas.find((c) => matchTodos(textoDeCarpeta(c), patrones));
        if (match?.dropboxCarpeta)
            return match.dropboxCarpeta;
    }
    return null;
}
/** Nombre del ESTADO cuya transición automática incluye alguna carpeta que matchee TODOS los
 *  patrones de al menos uno de los grupos dados (cada grupo = un trámite de origen distinto). */
export async function resolverEstadoPorCarpetas(gruposDePatrones) {
    for (const estado of await estadosConTransicion()) {
        const algunaMatchea = estado.carpetas.some((c) => {
            const texto = textoDeCarpeta(c);
            return gruposDePatrones.some((patrones) => matchTodos(texto, patrones));
        });
        if (algunaMatchea)
            return estado.name;
    }
    return null;
}
