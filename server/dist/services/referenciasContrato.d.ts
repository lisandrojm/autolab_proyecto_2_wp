import { Types } from "mongoose";
export interface ReferenciasDeContrato {
    bloqueantes: {
        recibos: {
            periodo: string;
            estado: string;
        }[];
        lotesDeRecibos: number;
        renovaciones: number;
        solicitudesDeRenovacion: number;
    };
    informativas: {
        verificacionesArca: number;
        constanciasArca: number;
        logsDeAltas: number;
    };
    totalBloqueantes: number;
    /** Para mostrar: «2 recibos de sueldo (2026-09 firmado, 2026-10 enviado) · 1 renovación». Vacío si no hay. */
    textoBloqueantes: string;
    textoInformativas: string;
}
export declare function referenciasDeContrato(userProjectId: Types.ObjectId | string, idx: number): Promise<ReferenciasDeContrato>;
/**
 * Mueve los recibos de sueldo de un contrato a otro DEL MISMO vínculo (p. ej. quedaron atados al
 * contrato duplicado y hay que anularlo). Filtra por la posición vieja: si algo cambió en el medio, no
 * toca nada que no deba. Devuelve qué movió, para el respaldo/auditoría.
 */
export declare function moverRecibos(userProjectId: Types.ObjectId | string, deIdx: number, aIdx: number): Promise<{
    recibos: string[];
    lotes: string[];
    movidos: number;
    lotesMovidos: number;
}>;
