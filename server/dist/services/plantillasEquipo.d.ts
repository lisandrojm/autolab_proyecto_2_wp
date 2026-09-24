import { Types } from "mongoose";
import { PlanDeLote } from "../utils/planDeLote.js";
export declare class ErrorPlantilla extends Error {
    status: number;
    extra?: any;
    constructor(status: number, message: string, extra?: any);
}
/**
 * QUIÉN PIDE Y SOBRE QUÉ PLANTILLAS.
 *
 *  - `personal` (móvil): las de cada supervisor. Sólo las ve, edita y contrata quien las creó.
 *  - `general` (escritorio): las del tenant, sin proyecto: puestos por rol y valores de base. No tienen
 *    personas ni se contratan: en el móvil se COPIAN a una personal («Usar»), en un proyecto.
 *
 * Las plantillas creadas antes de que existieran las generales no tienen `alcance`: son personales.
 */
export interface Acceso {
    tenantId: Types.ObjectId;
    userId: string;
    alcance: "personal" | "general";
}
/** Las plantillas de un proyecto, para la lista (con cuántos integrantes y la última contratación). */
export declare function listarPlantillas(acc: Acceso, projectId: string): Promise<{
    _id: string;
    nombre: any;
    projectId: string;
    alcance: any;
    nombreContrato: any;
    areaShiftAssignments: any;
    inTime: any;
    outTime: any;
    integrantes: any;
    sinAsignar: any;
    ultimaContratacionEl: any;
}[]>;
/** Una plantilla con sus integrantes resueltos a nombre (para el editor). */
export declare function obtenerPlantilla(acc: Acceso, id: string): Promise<any>;
export declare function crearPlantilla(acc: Acceso, body: any): Promise<any>;
export declare function actualizarPlantilla(acc: Acceso, id: string, body: any): Promise<any>;
/** Borrar = dar de baja: los lotes ya contratados siguen apuntando a ella. */
export declare function borrarPlantilla(acc: Acceso, id: string): Promise<void>;
export declare function duplicarPlantilla(acc: Acceso, id: string, nombre?: string): Promise<any>;
/**
 * USAR UNA GENERAL: se copia como plantilla PERSONAL de quien la usa, en su proyecto. Se copian los
 * puestos (sin personas: las generales no tienen) y los valores de base; la empresa, el convenio y el
 * área/turno se completan después en la copia. La general no cambia.
 */
export declare function usarGeneral(acc: Acceso, generalId: string, projectId: string, nombre?: string): Promise<any>;
/**
 * Suma puestos y/o personas. Cada entrada es un PUESTO: su rol (obligatorio si no hay persona) y, si ya se
 * sabe, la persona —sin roles, se toman los de su ficha—. `cantidad` repite un puesto sin asignar
 * («2 cámaras»). Nadie dos veces; los puestos sin asignar sí se repiten.
 */
export declare function agregarIntegrantes(acc: Acceso, id: string, nuevos: any[]): Promise<any>;
/**
 * Cambia lo propio de un integrante. `null` o "" en un campo = volver al valor del equipo. Fijar el importe
 * guarda la escala de ese momento, para avisar si después cambia.
 */
export declare function actualizarIntegrante(acc: Acceso, id: string, integranteId: string, body: any): Promise<any>;
export declare function quitarIntegrante(acc: Acceso, id: string, integranteId: string): Promise<any>;
/**
 * REEMPLAZAR A UN INTEGRANTE por otra persona, para siempre (no es el «¿Reemplazo?» de una solicitud).
 * Se conservan rol/es y lo propio (horario, categoría, importe), y queda anotado a quién reemplazó.
 */
export declare function reemplazarIntegrante(acc: Acceso, id: string, integranteId: string, nuevoUserId: string): Promise<any>;
/**
 * El plan completo. Dos pasadas: la primera resuelve las fechas de cada persona (una puede tener otros
 * días), con eso se buscan sus superposiciones, y la segunda las suma como advertencias.
 */
export declare function planificar(tenantId: Types.ObjectId, p: any, body: any): Promise<PlanDeLote>;
export declare function previewDeContratacion(acc: Acceso, id: string, body: any): Promise<{
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
export declare function contratarPlantilla(acc: Acceso, id: string, body: any): Promise<{
    repetido: boolean;
    loteId: string;
    solicitudIds: any;
    totales: any;
    nombrePlantilla: any;
}>;
