/**
 * EL CONSOLIDADO DE NOVEDADES: de la base a la entrada de la regla (`utils/consolidadoNovedades.ts`).
 *
 * Junta, para un período y uno o más proyectos: los partes con su asistencia, los contratos de todo el
 * que tenga vínculo con el proyecto o figure en un parte, y los catálogos para poner nombres (áreas,
 * turnos, empresas, categorías, tipos de contrato, motivos, feriados, centro de costo). La regla es pura
 * y está testeada aparte; acá sólo se resuelven ids y nombres. Nada se escribe.
 *
 * Es por proyecto a propósito: una persona sin ningún parte en el mes es una alerta, y sin proyecto que
 * la acote serían las 1.500 personas del tenant.
 */
import { Types } from "mongoose";
import { type Consolidado } from "../utils/consolidadoNovedades.js";
export interface ProyectoDelConsolidado {
    id: string;
    nombre: string;
    cliente: string;
    /** «426 - La Nacion» (código y descripción del catálogo Tango). */
    centroCosto: string;
    /** Las dos columnas de la planilla de liquidación: CC («426») y Descripción («La Nacion»). */
    centroCostoCodigo: string;
    centroCostoDescripcion: string;
}
export interface ConsolidadoNovedades extends Consolidado {
    desde: string;
    hasta: string;
    proyectos: ProyectoDelConsolidado[];
    feriados: {
        fecha: string;
        nombre: string;
    }[];
    motivos: string[];
    totales: {
        resumen: number;
        detalle: number;
        partes: number;
        revisar: number;
    };
}
export declare function armarConsolidado(tenantId: Types.ObjectId, o: {
    desde: string;
    hasta: string;
    proyectoIds: string[];
}): Promise<ConsolidadoNovedades>;
