import { Types } from "mongoose";
import { OrigenCalificacion } from "../models/Calificacion.js";
export interface ResumenCalificacion {
    /** 0 a 5, con un decimal. 0 = sin calificaciones. */
    promedio: number;
    cantidad: number;
}
/**
 * Lo que manda el formulario, validado: estrellas 1, 2, 4 o 5, y comentario opcional.
 * Devuelve el error en texto para mostrarlo tal cual.
 */
export declare function leerCalificacion(body: any): {
    estrellas: number;
    comentario?: string;
} | {
    error: string;
};
export declare function nombreDeUsuario(userId: string): Promise<string>;
/** Promedio y cantidad de cada persona pedida. Quien no tiene ninguna no viene en el mapa. */
export declare function resumenDeCalificaciones(tenantId: Types.ObjectId, userIds: string[]): Promise<Record<string, ResumenCalificacion>>;
/** Todas las de una persona, la más nueva primero, con el proyecto resuelto a nombre. */
export declare function historialDeCalificaciones(tenantId: Types.ObjectId, userId: string): Promise<{
    promedio: number;
    cantidad: number;
    calificaciones: {
        _id: string;
        estrellas: any;
        comentario: any;
        origen: any;
        decision: any;
        proyectoNombre: any;
        fechaBajaContrato: any;
        calificadoPorNombre: any;
        createdAt: any;
    }[];
}>;
/** Una calificación nueva. Nunca pisa otra (salvo las de fin de contrato: ver `calificarFinDeContrato`). */
export declare function crearCalificacion(datos: {
    tenantId: Types.ObjectId;
    userId: string;
    estrellas: number;
    comentario?: string;
    origen: Exclude<OrigenCalificacion, "fin_contrato">;
    projectId?: string;
    solicitudId?: string;
    calificadoPor: string;
}): Promise<import("mongoose").Document<unknown, {}, import("../models/Calificacion.js").ICalificacion, {}, {}> & import("../models/Calificacion.js").ICalificacion & {
    _id: Types.ObjectId;
} & {
    __v: number;
}>;
/**
 * La calificación de un contrato que termina, al decidir renovarlo o dejarlo vencer. Una por contrato:
 * si ya había una (se calificó, se abrió la renovación y no se mandó), se corrige esa.
 */
export declare function calificarFinDeContrato(datos: {
    tenantId: Types.ObjectId;
    contrato: {
        userId: string;
        projectId: string;
        userProjectId: string;
        fechaBaja: string;
    };
    estrellas: number;
    comentario?: string;
    decision: "renovar" | "dejar_vencer";
    calificadoPor: string;
}): Promise<void>;
/**
 * ¿Puede quien pregunta calificar (o ver las calificaciones) de la gente de este proyecto desde Equipos?
 * Lo mismo que le muestra Equipos: el proyecto que supervisa (es su responsable) o en el que coordina
 * algún área/turno.
 */
export declare function tieneAlCargoElProyecto(tenantId: Types.ObjectId, userId: string, projectId: string): Promise<boolean>;
/** ¿La persona es del proyecto? Se califica a la gente del equipo, no a cualquiera del tenant. */
export declare function esDelProyecto(tenantId: Types.ObjectId, userId: string, projectId: string): Promise<boolean>;
