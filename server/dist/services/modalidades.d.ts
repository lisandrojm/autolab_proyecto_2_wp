import { Types } from "mongoose";
/** Las que trae una productora que todavía no cargó ninguna. Presencial es la por defecto. */
export declare const MODALIDADES_INICIALES: {
    name: string;
    orden: number;
    esDefault: boolean;
}[];
/**
 * Siembra las modalidades iniciales si el tenant no tiene NINGUNA (ni siquiera apagadas): si borró o
 * renombró alguna, eso fue una decisión suya y no se le vuelve a poner. `upsert` por nombre para que
 * dos pedidos simultáneos no choquen contra el índice único.
 */
export declare function asegurarModalidades(tenantId: Types.ObjectId | string): Promise<void>;
/** La modalidad por defecto del tenant (la marcada; si no hay marcada, la primera activa por orden). */
export declare function modalidadPorDefecto(tenantId: Types.ObjectId | string): Promise<{
    _id: Types.ObjectId;
    name: string;
} | null>;
/**
 * Qué modalidad se guarda en un contrato que llega de un formulario.
 *
 * Vacío → la por defecto (la regla: «por defecto, presencial»). Un id tiene que ser de ESTE tenant;
 * apagada se acepta sólo si es la que el contrato ya tenía (editar un contrato viejo no puede
 * obligar a cambiársela).
 */
export declare function modalidadParaGuardar(tenantId: Types.ObjectId | string, bruto: unknown, anteriorId?: unknown): Promise<{
    modalidadId: Types.ObjectId | null;
    nombre_modalidad: string;
} | {
    error: string;
}>;
/** Al arrancar el server: cada productora (menos superadmin) queda con sus modalidades iniciales. */
export declare function asegurarModalidadesEnTodos(): Promise<void>;
