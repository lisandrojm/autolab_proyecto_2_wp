import { codigoPuesto } from "../compartido/puestosDesempenados.js";
export const PUESTOS_POR_CONVENIO = [
    { cct: "0102/90", nombre: "ACTORES", puesto: "2455" },
    { cct: "0322/75", nombre: "ACTORES", puesto: "2455" },
    { cct: "0634/11", nombre: "TELEVISIÓN", puesto: "4132" },
];
const limpio = (v) => String(v ?? "").trim();
export function planPuestoPorConvenio(o) {
    const deseados = o.deseados || PUESTOS_POR_CONVENIO;
    const activos = new Set([...o.puestosActivos].map(codigoPuesto).filter(Boolean));
    const porCct = new Map(o.convenios.map((c) => [limpio(c.externalId), c]));
    const plan = { aplicar: [], yaEstaban: [], respetados: [], puestosFaltantes: [], conveniosFaltantes: [], sinDefault: [] };
    /** cct → puesto con el que queda después de aplicar el plan. */
    const queda = new Map([...porCct].map(([cct, c]) => [cct, codigoPuesto(c.puestoDesempenadoDefault)]));
    for (const d of deseados) {
        const cct = limpio(d.cct);
        const puesto = codigoPuesto(d.puesto);
        if (!puesto || !activos.has(puesto)) {
            const previo = plan.puestosFaltantes.find((p) => p.puesto === (puesto || limpio(d.puesto)));
            if (previo)
                previo.ccts.push(cct);
            else
                plan.puestosFaltantes.push({ puesto: puesto || limpio(d.puesto), ccts: [cct] });
            continue;
        }
        const convenio = porCct.get(cct);
        if (!convenio) {
            plan.conveniosFaltantes.push(cct);
            continue;
        }
        const actual = codigoPuesto(convenio.puestoDesempenadoDefault);
        if (actual === puesto)
            plan.yaEstaban.push({ cct, puesto });
        else if (actual && !o.pisar)
            plan.respetados.push({ cct, actual, deseado: puesto });
        else {
            plan.aplicar.push({ cct, nombre: limpio(convenio.name) || d.nombre, de: actual, a: puesto });
            queda.set(cct, puesto);
        }
    }
    for (const u of o.enUso || []) {
        const cct = limpio(u.cct);
        if (!cct || queda.get(cct))
            continue;
        plan.sinDefault.push({ cct, nombre: limpio(porCct.get(cct)?.name), contratos: u.contratos, categorias: u.categorias });
    }
    plan.sinDefault.sort((a, b) => b.contratos - a.contratos || a.cct.localeCompare(b.cct));
    return plan;
}
