import { type PlantillaReconocible } from "../plantillaDelContrato.js";
export interface TipoDelCatalogo {
    _id: string;
    name: string;
}
export interface PlantillaConTipo extends PlantillaReconocible {
    /** El tipo de contrato del catálogo al que pertenece la plantilla. */
    contratoId?: unknown;
    contratoIds?: unknown[];
}
export interface ContratoConTipo {
    contrato_id?: unknown;
    nombre_contrato?: string | null;
    tipo_contrato_id?: unknown;
}
/** El `_id` del tipo del catálogo de este contrato, o `null` si no se puede saber. */
export declare function tipoDelCatalogo(c: ContratoConTipo, catalogo: TipoDelCatalogo[], plantillas?: PlantillaConTipo[]): string | null;
/** Una regla de «Visibilidad por tipo de Contrato»: la nueva trae el tipo del catálogo; las viejas, el número de FRAME. */
export interface ReglaDeVisibilidad {
    tipoContratoId?: string | null;
    contractId?: unknown;
    contractName?: string | null;
    vacationsEnabled?: boolean;
}
/**
 * El tipo del catálogo al que se refiere una regla. Una vieja (sólo número y nombre de FRAME) se traduce como un
 * contrato importado: por su nombre, y si no, por la plantilla con ese número.
 */
export declare const tipoDeLaRegla: (r: ReglaDeVisibilidad, catalogo: TipoDelCatalogo[], plantillas?: PlantillaConTipo[]) => string | null;
/** Los tipos del catálogo que «Visibilidad por tipo de Contrato» deja sin vacaciones. */
export declare function tiposSinVacaciones(reglas: ReglaDeVisibilidad[] | null | undefined, catalogo: TipoDelCatalogo[], plantillas?: PlantillaConTipo[]): string[];
