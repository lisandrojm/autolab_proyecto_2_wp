/**
 * El centro de costo con el que viene nombrada la sábana: el número pegado al primer «_», al principio
 * del nombre o después de un prefijo sin «_» que termina en espacio o guion («FZERO SRL - 426_…»).
 * «REC_SUELDO_2026_…» no cuenta como centro: el prefijo lleva «_». Vacío si no hay.
 */
export declare function centroDeCostoDeSabana(nombreArchivo: unknown): string;
export interface VinculoDelRecibo {
    up: {
        _id?: unknown;
        projectId?: unknown;
        contracts?: any[] | null;
        [k: string]: any;
    };
    /** El código del centro de costo del proyecto del vínculo («99»), ya resuelto; "" si no tiene. */
    centroDeCosto: string;
}
export interface ContratoElegido {
    up: VinculoDelRecibo["up"];
    idx: number;
    contrato: any;
    /** Rige hoy (estado VIGENTE, ya arrancó, no terminó). */
    vigente: boolean;
    /** Está en un proyecto del centro de costo de la sábana (false también cuando la sábana no trae centro). */
    enElCentro: boolean;
}
export declare function elegirContratoDelRecibo(vinculos: VinculoDelRecibo[], o: {
    hoy: string;
    centroDeCosto?: string;
}): ContratoElegido | null;
