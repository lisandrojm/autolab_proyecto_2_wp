import { Types } from "mongoose";
import { ValoracionSugerida } from "../utils/valoracionPorBruto.js";
/**
 * Sugerencia para un conjunto de categorías del catálogo, por su `_id`: lo que el formulario tiene
 * tildado. La regla necesita el grupo entero —«la más barata» es relativa a las otras—, por eso se
 * pide por conjunto y no de a una.
 */
export declare function sugerirPorBruto(tenantId: Types.ObjectId | string, categoriaIds: string[]): Promise<Record<string, ValoracionSugerida>>;
export interface CambioCategoria {
    categoriaId: number;
    nombre: string;
    convenio: string;
    bruto: number | null;
    antes: string | null;
    despues: string | null;
    motivo?: string;
}
export interface PlanFuncion {
    funcionId: string;
    funcion: string;
    cambios: CambioCategoria[];
}
export interface PlanValoracion {
    niveles: Array<{
        _id: string;
        name: string;
        orden: number | null;
        color: string;
    }>;
    funciones: PlanFuncion[];
    /** Funciones que ya tenían categorías valoradas y no se tocan (sin `incluirValoradas`). */
    salteadas: string[];
    operaciones: any[];
}
/**
 * Qué cambiaría en cada función si se aplicara la regla. NO escribe.
 *
 * Sin `incluirValoradas`, las funciones que ya tienen alguna categoría valorada se saltean: eso lo
 * hizo alguien a propósito, o lo hizo la regla antes. Con él, se alinean todas —también se limpia lo
 * que la regla deja sin valorar—.
 */
export declare function planValoracionPorBruto(tenantId: Types.ObjectId | string, { incluirValoradas }?: {
    incluirValoradas?: boolean;
}): Promise<PlanValoracion>;
/** Escribe un plan. Devuelve cuántas categorías cambiaron. */
export declare function aplicarPlan(plan: PlanValoracion): Promise<number>;
