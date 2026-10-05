/**
 * APLICAR UNA PARITARIA: PROPONER, NUNCA DECIDIR.
 *
 * Un tramo paritario dice "+4,8 % sobre mayo". Con eso se puede armar la escala nueva en un segundo,
 * y por eso existe este módulo: hoy la única forma de mover una escala es tipear 12 grupos a mano o
 * subir un Excel con importes absolutos.
 *
 * PERO EL PORCENTAJE NO REPRODUCE EL ACTA AL CENTAVO. Verificado con el acta de abril y junio 2026:
 *
 *   - Los BÁSICOS sí cierran exacto: 1.132.832,62 × 1,048 = 1.187.208,59, que es el básico de junio
 *     tal como está cargado. Los 12 grupos se mueven con el mismo factor.
 *   - Los ADICIONALES no: de los siete, seis dan un centavo de diferencia contra el acta (Antigüedad
 *     10.086,75 × 1,048 = 10.570,91 y el acta dice 10.570,92). Sólo Exteriores coincide.
 *
 * O sea que el acta no redondea como redondea una multiplicación, o los negociadores acordaron cifras
 * y no un porcentaje. En cualquier caso, la conclusión de diseño es la misma: **lo que sale de acá es
 * una PROPUESTA editable**. El endpoint de preview la devuelve, la pantalla la deja corregir fila por
 * fila, y lo que se guarda es lo que la persona confirmó. Nada de esto escribe en la base.
 */
import { calcularEscalaGrupo, redondearCentavos, TOLERANCIA_CENTAVO } from "./escalaCalculo.js";
/** Aplicar un porcentaje a un importe. 4,8 se pasa como `4.8`. */
export const aumentar = (monto, porcentaje) => redondearCentavos(Number(monto || 0) * (1 + Number(porcentaje || 0) / 100));
/**
 * La escala nueva a partir de un porcentaje sobre el básico.
 *
 * El aumento se aplica **al básico y nada más**: el % adicional (B) es del grupo y no se negocia en
 * cada tramo, y presentismo y total son consecuencia. Escalar los cuatro importes por separado da
 * resultados distintos y desalinea la escala de su propia cuenta.
 *
 * Cuando el convenio no tiene B cargado, no hay cuenta de dónde derivar: ahí sí se escala cada importe
 * y se deja un aviso, porque el resultado es una estimación y quien lo confirma tiene que saberlo.
 */
export function proponerEscala(filas, porcentaje, esperado = [], tolerancia = TOLERANCIA_CENTAVO) {
    const porGrupo = new Map(esperado.map((e) => [String(e.grupo ?? ""), e]));
    return filas.map((f) => {
        const basicoPropuesto = aumentar(f.basico, porcentaje);
        const avisos = [];
        let propuesta;
        if (f.adicionalPct == null) {
            avisos.push("El convenio no tiene % adicional cargado: se escaló cada importe por separado. Revisar antes de confirmar.");
            propuesta = {
                basico: basicoPropuesto,
                adicionalPct: 0,
                presentismoPct: Number(f.presentismoPct ?? 0),
                adicionalMonto: aumentar(Number(f.adicionalMonto || 0), porcentaje),
                presentismoMonto: aumentar(Number(f.presentismoMonto || 0), porcentaje),
                total: aumentar(Number(f.total || 0), porcentaje),
                netoSugerido: aumentar(Number(f.neto || 0), porcentaje),
            };
        }
        else {
            propuesta = calcularEscalaGrupo({ basico: basicoPropuesto, adicionalPct: f.adicionalPct, presentismoPct: f.presentismoPct, netoFactor: f.netoFactor });
        }
        const esp = porGrupo.get(String(f.grupo ?? ""));
        if (esp?.basico != null) {
            const delta = redondearCentavos(Number(esp.basico) - basicoPropuesto);
            if (Math.abs(delta) >= tolerancia)
                avisos.push(`El básico del acta (${esp.basico}) difiere en ${delta} del que da el porcentaje.`);
        }
        if (esp?.total != null) {
            const delta = redondearCentavos(Number(esp.total) - propuesta.total);
            if (Math.abs(delta) >= tolerancia)
                avisos.push(`El total del acta (${esp.total}) difiere en ${delta} del calculado.`);
        }
        return { grupo: f.grupo, basicoActual: redondearCentavos(f.basico), basicoPropuesto, totalActual: f.total == null ? null : redondearCentavos(f.total), propuesta, avisos };
    });
}
/**
 * Los mismos importes, aumentados. Sirve para los adicionales y para el capítulo de pequeñas empresas.
 *
 * `esperado` permite cotejar contra el acta: es lo que hace visible que seis de los siete adicionales
 * no se reproducen con el porcentaje. Sin `esperado` no hay avisos, y está bien — cuando se aplica un
 * tramo nuevo todavía no hay acta con qué comparar.
 */
export function proponerMontos(valores, porcentaje, esperado = [], tolerancia = TOLERANCIA_CENTAVO) {
    const llave = (clave, grupo) => `${clave}|${grupo ?? ""}`;
    const porClave = new Map(esperado.map((e) => [llave(e.clave, e.grupo), e.monto]));
    return valores.map((v) => {
        if (v.monto == null)
            return { ...v, montoPropuesto: null, avisos: ["Sin importe vigente: no hay de dónde sacar el aumento."] };
        const montoPropuesto = aumentar(v.monto, porcentaje);
        const avisos = [];
        const esp = porClave.get(llave(v.clave, v.grupo));
        if (esp != null) {
            const delta = redondearCentavos(esp - montoPropuesto);
            if (Math.abs(delta) >= tolerancia)
                avisos.push(`El acta dice ${esp} (${delta > 0 ? "+" : ""}${delta} contra el porcentaje).`);
        }
        return { ...v, montoPropuesto, avisos };
    });
}
/**
 * Los porcentajes de un acuerdo escalonado, encadenados.
 *
 * El acuerdo 2025-2026 de 634/11 son dos tramos acumulativos (+9,5 % y +4,8 %) que el acta resume
 * como 14,76 % total: 1,095 × 1,048 = 1,14756. La cuenta va acá para no tener el número 14,76
 * escrito a mano en ningún lado, que es como se desactualiza.
 */
export function porcentajeAcumulado(porcentajes) {
    const factor = porcentajes.reduce((acc, p) => acc * (1 + Number(p || 0) / 100), 1);
    return Math.round((factor - 1) * 1000000) / 10000;
}
