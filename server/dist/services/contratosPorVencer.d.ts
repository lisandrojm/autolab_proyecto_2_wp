import { Types } from "mongoose";
/** Con cuánta anticipación aparece un contrato: una semana antes de su fecha de baja. */
export declare const DIAS_DE_AVISO = 7;
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
export declare function listarContratosPorVencer(tenantId: Types.ObjectId | string, userId: string, hoy?: string): Promise<ContratoPorVencer[]>;
