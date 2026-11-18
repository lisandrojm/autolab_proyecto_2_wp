import { Types } from "mongoose";
import type { HuellaDeReferencia } from "../utils/referenciasCorridas.js";
export interface RefPorPosicion {
    coleccion: string;
    _id: Types.ObjectId;
    /** Para las que viven en un array (logs, lotes): el nombre del array. */
    arreglo?: string;
    userProjectId: Types.ObjectId;
    indice: number | null;
    /** El campo de la posición (en `users`, con su ruta). */
    campoIndice: string;
    huella: HuellaDeReferencia;
    /** Para el listado. */
    texto: string;
}
export declare const SIN_CLAVE: {
    $in: any[];
};
/** Las referencias que todavía no tienen clave (lo único que miran el backfill y la reubicación). */
export declare function leerReferencias(): Promise<RefPorPosicion[]>;
/** Los contratos de cada vínculo, con lo que hace falta para comparar huellas. */
export declare function contratosDe(ids: Types.ObjectId[]): Promise<Map<string, any[]>>;
/** El campo de la clave y el del vínculo, según la colección. */
export declare const campoClave: (coleccion: string) => "contratoKey" | "metadata.renovacionDe.contratoKey";
export declare const campoVinculo: (coleccion: string) => "userProjectId" | "metadata.renovacionDe.userProjectId";
