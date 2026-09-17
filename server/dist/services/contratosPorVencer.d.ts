import { Types } from "mongoose";
/** Con cuánta anticipación aparece un contrato, si no se pide otra cosa: una semana antes de su baja. */
export declare const DIAS_DE_AVISO = 7;
/** Hasta dónde se puede estirar la ventana desde el filtro del móvil. */
export declare const DIAS_DE_AVISO_MAX = 60;
export interface ContratoPorVencer {
    userProjectId: string;
    userId: string;
    nombre: string;
    projectId: string;
    proyectoNombre: string;
    clienteNombre: string;
    areaNombre: string;
    turnoNombre: string;
    rolFrame: string;
    contrato: string;
    horario: string;
    fechaAlta: string;
    fechaBaja: string;
    diasRestantes: number;
    motivo: "supervisa" | "coordina";
    renovacionRechazada: boolean;
    plantilla: {
        firstName: string;
        lastName: string;
        metadata: Record<string, any>;
    };
}
/**
 * Cómo puede estar escrita, en día/mes/año, una fecha de la ventana: con "/" o "-", y con o sin cero
 * adelante en el día y el mes. Son las formas que `fechaISO` acepta además de la ISO.
 */
export declare const variantesDMY: (desde: string, dias: number) => string[];
export declare function olvidarContratosPorVencer(): void;
export declare function listarContratosPorVencer(tenantId: Types.ObjectId | string, userId: string, hoy?: string, dias?: number): Promise<ContratoPorVencer[]>;
