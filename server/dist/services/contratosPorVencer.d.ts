import { Types } from "mongoose";
/** Con cuánta anticipación aparece un contrato, si no se pide otra cosa: una semana antes de su baja. */
export declare const DIAS_DE_AVISO = 7;
/** Hasta dónde se puede estirar la ventana desde el filtro del móvil. */
export declare const DIAS_DE_AVISO_MAX = 60;
export interface ContratoPorVencer {
    userProjectId: string;
    /**
     * LA POSICIÓN DEL CONTRATO EN `UserProject.contracts`. Es su identidad.
     *
     * Los contratos son subdocumentos SIN `_id`, así que nombrarlos es nombrar su posición — lo mismo
     * que ya hacen editar, descargar y subir documentación (ver `GET /users/:id/contracts`, que manda
     * el array en el orden de la base justamente por esto).
     *
     * Antes se los nombraba por (asignación, fecha de baja), dando por sentado que dos contratos de la
     * misma asignación no terminan el mismo día. En la base hay 515 pares que lo desmienten: la
     * pantalla dibujaba dos filas con la misma clave y decidir sobre una resolvía la otra.
     */
    indice: number;
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
export declare function listarContratosPorVencer(tenantId: Types.ObjectId | string, userId: string, hoy?: string, dias?: number, vencidos?: boolean): Promise<ContratoPorVencer[]>;
