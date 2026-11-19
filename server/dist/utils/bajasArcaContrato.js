/**
 * LAS BAJAS DE ARCA SOBRE EL CONTRATO, PERSISTIDAS (etapa 3, paso 2; decisión del usuario del 18/11).
 *
 * Hasta acá la baja de ARCA se aplicaba EN MEMORIA al validar (`bajaDeArcaQueAplica`): la validación veía
 * cerrado a Becerini, pero el contrato seguía sin baja y todo lo que lo lee directo (la fila del equipo,
 * la antigüedad, los recibos, las renovaciones) lo veía abierto. Esto decide qué se ESCRIBE en el contrato.
 *
 * Sólo con EVIDENCIA FUERTE: la relación de ARCA de la misma persona (CUIL), la misma empleadora (CUIT de
 * la empresa del contrato) y la misma fecha de inicio EXACTA que el alta del contrato. En el espejo esa
 * terna es única (índice), así que no hay dos candidatas. Sin CUIL, sin empleadora, sin CUIT o sin esa
 * relación, no se escribe nada: no se deduce.
 *
 * Con la relación encontrada:
 *   baja_nueva            el contrato no tiene baja y ARCA sí                      → SE ESCRIBE la de ARCA
 *   baja_anterior         ARCA terminó ANTES que la baja del contrato, por un hecho
 *                         (renuncia, despido, acuerdo…)                            → SE ESCRIBE la de ARCA
 *   arca_por_tramos       ARCA terminó antes, pero tiene OTRAS relaciones de la misma persona y empleadora
 *                         dentro del período del contrato: se declaró por tramos (jornadas día por día,
 *                         Uzquiano, Raffa). Escribirla recortaría el contrato a su primer tramo  → no
 *   arca_plazo_mas_corto  ARCA terminó antes por «vencimiento de plazo»: ARCA declaró un período más
 *                         corto que el contrato (Sarli: plazo fijo de junio vencido en ARCA el 01/06).
 *                         Suele ser un error de la declaración, y el contrato tiene sueldo del mes   → no
 *   arca_posterior        ARCA terminó DESPUÉS que la baja del contrato (las jornadas: casi siempre un
 *                         día después)                                              → no
 *   arca_abierta          el contrato terminó y en ARCA sigue abierta: falta la baja EN ARCA          → no
 *   (nada)                coinciden, o los dos abiertos
 * Puro.
 */
import { fechaISO as fechaTexto } from "./contratoVigencia.js";
/** `fechaISO` acepta texto; algunas fechas pueden estar guardadas como Date. */
const fechaISO = (v) => (v instanceof Date ? (Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10)) : fechaTexto(v));
const diaSiguiente = (f) => {
    const d = new Date(`${f}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
};
export function cambioDeBajaSegunArca(contrato, cuil, cuit, relaciones, hoy) {
    if (contrato?.estadoContrato === "ANULADO")
        return null;
    const alta = fechaISO(contrato?.fecha_alta_contrato);
    if (!alta || cuil.length !== 11 || cuit.length !== 11)
        return null;
    const r = relaciones.find((x) => x.cuil === cuil && x.empleadoraCuit === cuit && x.inicio === alta);
    if (!r)
        return null;
    const baja = fechaISO(contrato?.fecha_baja_contrato);
    const base = { bajaContrato: baja, finArca: r.fin || "", situacionBaja: String(r.situacionBaja || "").trim() };
    if (r.fin && !baja) {
        // Sin baja: si la misma empleadora lo vuelve a declarar al día siguiente, ARCA lo lleva por tramos
        // consecutivos (Barbona: trimestres seguidos) y el fin del primero no es el fin de la relación.
        const siguiente = diaSiguiente(r.fin);
        if (relaciones.some((x) => x !== r && x.cuil === cuil && x.empleadoraCuit === cuit && x.inicio === siguiente))
            return { tipo: "arca_por_tramos", aplicar: false, ...base };
        return { tipo: "baja_nueva", aplicar: true, ...base };
    }
    if (r.fin && baja && r.fin < baja) {
        const otraAdentro = relaciones.some((x) => x !== r && x.cuil === cuil && x.empleadoraCuit === cuit && x.inicio > r.fin && x.inicio <= baja);
        if (otraAdentro)
            return { tipo: "arca_por_tramos", aplicar: false, ...base };
        if (/vencimiento/i.test(base.situacionBaja))
            return { tipo: "arca_plazo_mas_corto", aplicar: false, ...base };
        return { tipo: "baja_anterior", aplicar: true, ...base };
    }
    if (r.fin && baja && r.fin > baja)
        return { tipo: "arca_posterior", aplicar: false, ...base };
    // Abierta en ARCA y el contrato ya terminó: falta presentar la baja en ARCA (no al revés).
    if (!r.fin && baja && baja < hoy)
        return { tipo: "arca_abierta", aplicar: false, ...base };
    return null;
}
/** El valor a guardar, con el mismo formato que el alta del contrato (texto «AAAA-MM-DD» o ISO con hora). */
export function bajaConFormatoDelAlta(fin, alta) {
    return typeof alta === "string" && /T\d{2}:/.test(alta) ? `${fin}T00:00:00.000Z` : fin;
}
