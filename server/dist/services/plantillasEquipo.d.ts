import { Types } from "mongoose";
import { PlanDeLote } from "../utils/planDeLote.js";
export declare class ErrorPlantilla extends Error {
    status: number;
    extra?: any;
    constructor(status: number, message: string, extra?: any);
}
/** Las plantillas de un proyecto, para la lista (con cuántos integrantes y la última contratación). */
export declare function listarPlantillas(tenantId: Types.ObjectId, projectId: string): Promise<{
    _id: string;
    nombre: any;
    projectId: string;
    nombreContrato: any;
    areaShiftAssignments: any;
    inTime: any;
    outTime: any;
    integrantes: any;
    ultimaContratacionEl: any;
}[]>;
/** Una plantilla con sus integrantes resueltos a nombre (para el editor). */
export declare function obtenerPlantilla(tenantId: Types.ObjectId, id: string): Promise<any>;
export declare function crearPlantilla(tenantId: Types.ObjectId, creadorId: string, body: any): Promise<any>;
export declare function actualizarPlantilla(tenantId: Types.ObjectId, id: string, body: any): Promise<any>;
/** Borrar = dar de baja: los lotes ya contratados siguen apuntando a ella. */
export declare function borrarPlantilla(tenantId: Types.ObjectId, id: string): Promise<void>;
export declare function duplicarPlantilla(tenantId: Types.ObjectId, creadorId: string, id: string, nombre?: string): Promise<any>;
/** Suma personas (una o varias). Sin roles, se toman los de su ficha. Nadie dos veces. */
export declare function agregarIntegrantes(tenantId: Types.ObjectId, id: string, nuevos: any[]): Promise<any>;
/**
 * Cambia lo propio de un integrante. `null` o "" en un campo = volver al valor del equipo. Fijar el importe
 * guarda la escala de ese momento, para avisar si después cambia.
 */
export declare function actualizarIntegrante(tenantId: Types.ObjectId, id: string, integranteId: string, body: any): Promise<any>;
export declare function quitarIntegrante(tenantId: Types.ObjectId, id: string, integranteId: string): Promise<any>;
/**
 * REEMPLAZAR A UN INTEGRANTE por otra persona, para siempre (no es el «¿Reemplazo?» de una solicitud).
 * Se conservan rol/es y lo propio (horario, categoría, importe), y queda anotado a quién reemplazó.
 */
export declare function reemplazarIntegrante(tenantId: Types.ObjectId, id: string, integranteId: string, nuevoUserId: string): Promise<any>;
/**
 * El plan completo. Dos pasadas: la primera resuelve las fechas de cada persona (una puede tener otros
 * días), con eso se buscan sus superposiciones, y la segunda las suma como advertencias.
 */
export declare function planificar(tenantId: Types.ObjectId, p: any, body: any): Promise<PlanDeLote>;
export declare function previewDeContratacion(tenantId: Types.ObjectId, id: string, body: any): Promise<{
    filas: {
        fechasTrabajadas: string[];
        desde: string;
        hasta: string;
        comentarios: string;
        integranteId: string;
        userId: string;
        nombre: string;
        excluido: boolean;
        categoriaSatId: string;
        categoriaNombre: string;
        inTime: string;
        outTime: string;
        jornadas: number;
        importes: import("../compartido/jornadas.js").Importes;
        origenImporte: "puntual" | "plantilla" | "escala" | "servicios";
        errores: string[];
        advertencias: string[];
        superposicionHorario: boolean;
    }[];
    totales: {
        personas: number;
        jornadas: number;
        importe: number;
        conErrores: number;
        conAdvertencias: number;
    };
    errores: string[];
}>;
/**
 * CONTRATAR: revalida TODO (no confía en el preview que vio el cliente) y, sin errores, crea las N
 * solicitudes + el lote en una transacción. Con la misma `idempotencyKey` devuelve el lote ya creado.
 */
export declare function contratarPlantilla(tenantId: Types.ObjectId, creadorId: string, id: string, body: any): Promise<{
    repetido: boolean;
    loteId: string;
    solicitudIds: any;
    totales: any;
    nombrePlantilla: any;
}>;
