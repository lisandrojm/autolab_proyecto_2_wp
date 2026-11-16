import { esContratoVigente, fechaISO, hoyArgentina } from "./contratoVigencia.js";
export function contratoVigenteDeComputo(contratos, claveDeComputo, hoy = hoyArgentina()) {
    const clave = (c) => `${fechaISO(c.fecha_alta_contrato)}|${String(c.fecha_carga || "")}`;
    let mejor = null;
    for (const c of contratos || []) {
        if (!esContratoVigente(c, hoy))
            continue;
        if (claveDeComputo !== null && c.claveEmpresa !== claveDeComputo)
            continue;
        if (!mejor || clave(c) >= clave(mejor))
            mejor = c;
    }
    return mejor;
}
