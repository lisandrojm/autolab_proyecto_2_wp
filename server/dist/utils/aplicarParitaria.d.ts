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
import { EscalaCalculada } from "./escalaCalculo.js";
/** Aplicar un porcentaje a un importe. 4,8 se pasa como `4.8`. */
export declare const aumentar: (monto: number, porcentaje: number) => number;
export interface FilaEscalaActual {
    /** `null` para convenios sin grupos (la escala vive en la categoría). */
    grupo: number | null;
    /** A vigente. */
    basico: number;
    /** B. `null` = el convenio no usa % adicional y los montos se escalan de a uno. */
    adicionalPct?: number | null;
    presentismoPct?: number | null;
    netoFactor?: number | null;
    /** Importes vigentes, para mostrar "actual → propuesto" y para el caso sin B. */
    adicionalMonto?: number | null;
    presentismoMonto?: number | null;
    total?: number | null;
    neto?: number | null;
}
export interface FilaEscalaPropuesta {
    grupo: number | null;
    basicoActual: number;
    basicoPropuesto: number;
    totalActual: number | null;
    /** La escala completa que resulta del básico nuevo. */
    propuesta: EscalaCalculada;
    /** Diferencias contra lo que se esperaba (si se pasó un acta para cotejar). */
    avisos: string[];
}
/** Lo que dice el acta para ese grupo, cuando se la tiene a mano y se quiere cotejar la propuesta. */
export interface EsperadoDelActa {
    grupo: number | null;
    basico?: number | null;
    total?: number | null;
}
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
export declare function proponerEscala(filas: FilaEscalaActual[], porcentaje: number, esperado?: EsperadoDelActa[], tolerancia?: number): FilaEscalaPropuesta[];
export interface MontoActual {
    /** Identificador para mostrar y para cotejar: el código del adicional, o "semana9hsLunVie". */
    clave: string;
    nombre?: string;
    /** `null` = todos los grupos. */
    grupo?: number | null;
    monto: number | null;
}
export interface MontoPropuesto extends MontoActual {
    montoPropuesto: number | null;
    avisos: string[];
}
/**
 * Los mismos importes, aumentados. Sirve para los adicionales y para el capítulo de pequeñas empresas.
 *
 * `esperado` permite cotejar contra el acta: es lo que hace visible que seis de los siete adicionales
 * no se reproducen con el porcentaje. Sin `esperado` no hay avisos, y está bien — cuando se aplica un
 * tramo nuevo todavía no hay acta con qué comparar.
 */
export declare function proponerMontos(valores: MontoActual[], porcentaje: number, esperado?: Array<{
    clave: string;
    grupo?: number | null;
    monto: number;
}>, tolerancia?: number): MontoPropuesto[];
/**
 * Los porcentajes de un acuerdo escalonado, encadenados.
 *
 * El acuerdo 2025-2026 de 634/11 son dos tramos acumulativos (+9,5 % y +4,8 %) que el acta resume
 * como 14,76 % total: 1,095 × 1,048 = 1,14756. La cuenta va acá para no tener el número 14,76
 * escrito a mano en ningún lado, que es como se desactualiza.
 */
export declare function porcentajeAcumulado(porcentajes: number[]): number;
