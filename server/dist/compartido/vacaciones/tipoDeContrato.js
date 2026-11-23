/**
 * EL TIPO DE CONTRATO DE UN CONTRATO, DEL CATÁLOGO (23/11/2026).
 *
 * Vacaciones (la campaña de goce y «Visibilidad por tipo de Contrato») elegía por `contracts.tipo_contrato_id`, el
 * número de la plantilla de FRAME. Los contratos creados en WeProdu tienen ahí un 0 —y su tipo real en
 * `contrato_id`—, así que todos caían en el mismo cajón: en la lista aparecía un segundo «Tiempo Indeterminado» que
 * eran en realidad Jornadas, Plazos fijos y Servicios juntos, y la regla «Jornada sin vacaciones» no alcanzaba a las
 * Jornadas cargadas en WeProdu. Ahora el tipo es el del catálogo (`contratos`, por su `_id`), resuelto acá:
 *
 *   1. `contrato_id`, si está en el catálogo (todo lo creado en WeProdu).
 *   2. El nombre del contrato contra el catálogo (`buscarTipoContrato`: tolera el sufijo de la empleadora de FRAME,
 *      «Jornada 2030 S.R.L.» → «Jornada»).
 *   3. La plantilla (`plantillaDelContrato`, por nombre o por su número si es > 0) → el tipo al que apunta.
 *
 * Puro: lo usan el server (saldos, campaña, perfil) y las pruebas.
 */
import { buscarTipoContrato } from "../arca/afipCompleteness.js";
import { plantillaDelContrato } from "../plantillaDelContrato.js";
/** El `_id` del tipo del catálogo de este contrato, o `null` si no se puede saber. */
export function tipoDelCatalogo(c, catalogo, plantillas = []) {
    const ids = new Set(catalogo.map((t) => String(t._id)));
    const directo = c.contrato_id ? String(c.contrato_id) : "";
    if (directo && ids.has(directo))
        return directo;
    const porNombre = buscarTipoContrato(catalogo, c.nombre_contrato);
    if (porNombre)
        return String(porNombre._id);
    const plantilla = plantillaDelContrato({ nombre_contrato: c.nombre_contrato, tipo_contrato_id: c.tipo_contrato_id }, plantillas);
    const deLaPlantilla = plantilla ? [plantilla.contratoId, ...(plantilla.contratoIds || [])].map((x) => (x ? String(x) : "")).find((x) => ids.has(x)) : undefined;
    return deLaPlantilla || null;
}
/**
 * El tipo del catálogo al que se refiere una regla. Una vieja (sólo número y nombre de FRAME) se traduce como un
 * contrato importado: por su nombre, y si no, por la plantilla con ese número.
 */
export const tipoDeLaRegla = (r, catalogo, plantillas = []) => r.tipoContratoId ? String(r.tipoContratoId) : tipoDelCatalogo({ nombre_contrato: r.contractName, tipo_contrato_id: r.contractId }, catalogo, plantillas);
/** Los tipos del catálogo que «Visibilidad por tipo de Contrato» deja sin vacaciones. */
export function tiposSinVacaciones(reglas, catalogo, plantillas = []) {
    const fuera = new Set();
    for (const r of reglas || []) {
        if (r?.vacationsEnabled !== false)
            continue;
        const t = tipoDeLaRegla(r, catalogo, plantillas);
        if (t)
            fuera.add(t);
    }
    return [...fuera].sort();
}
