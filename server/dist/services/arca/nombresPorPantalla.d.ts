import { Renombre } from "./nombreArca.js";
export interface ResultadoNombresPantalla {
    /** Los que se pudieron corregir con el nombre de la pantalla. */
    renombrados: Renombre[];
    /** CUIL a los que la pantalla les confirmó el nombre (haya cambiado o no). */
    confirmados: string[];
    /** Se intentó y no se pudo, con el motivo. */
    sinResolver: Array<{
        cuit: string;
        motivo: string;
    }>;
    /** No se intentó nada, y por qué. Vacío = se intentó. */
    motivoSinIntentar?: string;
}
export declare function nombresPorPantalla(opts: {
    tenantId: string;
    tenantObjectId: any;
    cuits: string[];
}): Promise<ResultadoNombresPantalla>;
