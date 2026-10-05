import { extraerTextoPdf, normalizarCuit } from "./constanciaPdf.js";
const aIso = (ddmmaaaa) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(ddmmaaaa || "").trim());
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};
/** Lee los datos de la constancia desde su texto. Puro. */
export function leerConstanciaTrabajador(textoCrudo) {
    const texto = String(textoCrudo || "").replace(/\r/g, "");
    const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
    const iTitulo = lineas.findIndex((l) => /^CONSTANCIA DEL TRABAJADOR$/i.test(l));
    const uno = (re) => (re.exec(texto)?.[1] || "").trim();
    return {
        tipo: iTitulo >= 0 ? (lineas[iTitulo + 1] || "").toLowerCase() : "",
        // El CUIT del empleador es el que va en la línea «Empleador:»; el CUIL, el de «CUIL:».
        empleadorCuit: normalizarCuit(uno(/Empleador:\s*CUIT:\s*([\d-]{11,13})/i)),
        cuil: normalizarCuit(uno(/(?:^|\n)\s*CUIL:\s*([\d-]{11,13})/i)),
        apellidoNombre: uno(/Apellido y nombre:\s*([^\n]+)/i),
        fechaInicio: aIso(uno(/Fecha Inicio:\s*(\d{2}\/\d{2}\/\d{4})/i)),
        fechaCese: aIso(uno(/Fecha Cese:\s*(\d{2}\/\d{2}\/\d{4})/i)),
        clave: uno(/Clave:\s*([A-Z]{0,3}\s*\d{6,})/i).replace(/\s+/g, ""),
        nroTramite: uno(/N[úu]mero de registro de tr[áa]mite\s*(\d{6,})/i),
    };
}
export const leerConstanciaTrabajadorPdf = async (buffer) => leerConstanciaTrabajador(await extraerTextoPdf(buffer));
/**
 * Por qué esta constancia NO es el alta de ese contrato. Vacío = coincide en todo.
 *
 * Las cuatro cosas que se piden: que diga Alta, y que el CUIL, el CUIT de la empleadora y la fecha
 * de inicio sean los del contrato. Un dato que no se pudo leer cuenta como que no coincide: sin
 * poder comprobarlo, el PDF queda para revisar y no se envía ni se archiva.
 */
export function problemasDeConstancia(c, esperado) {
    const out = [];
    const cuil = normalizarCuit(String(esperado.cuil ?? ""));
    const cuit = normalizarCuit(String(esperado.empleadorCuit ?? ""));
    const inicio = String(esperado.fechaInicio ?? "").slice(0, 10);
    if (!c.tipo)
        out.push("No es una «Constancia del trabajador» de ARCA (no se encontró el título).");
    else if (c.tipo !== "alta")
        out.push(`Es una constancia de «${c.tipo}», no de Alta.`);
    if (!c.cuil)
        out.push("No se pudo leer el CUIL de la constancia.");
    else if (c.cuil !== cuil)
        out.push(`El CUIL de la constancia (${c.cuil}) no es el de la persona del contrato (${cuil || "sin CUIL"}).`);
    if (!c.empleadorCuit)
        out.push("No se pudo leer el CUIT del empleador de la constancia.");
    else if (c.empleadorCuit !== cuit)
        out.push(`El CUIT del empleador de la constancia (${c.empleadorCuit}) no es el de la Empresa Contrato (${cuit || "sin CUIT"}).`);
    if (!c.fechaInicio)
        out.push("No se pudo leer la fecha de inicio de la constancia.");
    else if (c.fechaInicio !== inicio)
        out.push(`La fecha de inicio de la constancia (${c.fechaInicio}) no es la del contrato (${inicio || "sin fecha"}).`);
    return out;
}
