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
 *  - `general` (escritorio): las del tenant, sin proyecto, sin áreas y sin equipos: puestos por rol que
 *    en el móvil se COPIAN a una personal («Usar»). No se contratan.
 */
export interface Acceso {
    tenantId: Types.ObjectId;
    userId: string;
    alcance: "personal" | "general";
}
/** El puesto tal como lo ocupa ESE equipo: lo del puesto, pisado por las condiciones del equipo. */
export declare function puestoEnEquipo(puesto: any, asignacion: any): any;
/** Las plantillas para la lista: las personales del proyecto; las generales, todas. */
export declare function listarPlantillas(acc: Acceso, projectId: string): Promise<{
    _id: string;
    nombre: any;
    projectId: string;
    alcance: any;
    nombreContrato: string;
    puestos: any;
    equipos: any;
    ultimaContratacionEl: any;
}[]>;
/** Una plantilla con sus puestos y sus equipos, las personas resueltas a nombre (para el editor). */
export declare function obtenerPlantilla(acc: Acceso, id: string): Promise<any>;
/** Una plantilla nueva. Las personales nacen con un equipo vacío («Equipo 1») para ir asignando gente. */
export declare function crearPlantilla(acc: Acceso, body: any): Promise<any>;
export declare function actualizarPlantilla(acc: Acceso, id: string, body: any): Promise<any>;
/** Borrar = dar de baja: los lotes ya contratados siguen apuntando a ella. */
export declare function borrarPlantilla(acc: Acceso, id: string): Promise<void>;
export declare function duplicarPlantilla(acc: Acceso, id: string, nombre?: string): Promise<any>;
/**
 * USAR UNA GENERAL: se copia como plantilla PERSONAL de quien la usa, en su proyecto: los puestos por
 * rol (con su horario y sus días, si los tienen) y un equipo vacío. La empresa, el convenio y el área y
 * turno de cada puesto se completan en la copia. La general no cambia.
 */
export declare function usarGeneral(acc: Acceso, generalId: string, projectId: string, nombre?: string): Promise<any>;
/**
 * Suma puestos. Cada entrada es un rol con sus datos (área y turno, horario, días…); `cantidad` lo repite
 * («2 cámaras»). Con `userId`, además la persona queda asignada en el equipo (`equipoId`, o el primero).
 */
export declare function agregarPuestos(acc: Acceso, id: string, nuevos: any[], equipoId?: string): Promise<any>;
/**
 * Cambia un puesto. `null` o "" = sin ese dato. Fijar el importe guarda la escala de ese momento, para
 * avisar si después cambia.
 */
export declare function actualizarPuesto(acc: Acceso, id: string, puestoId: string, body: any): Promise<any>;
/** Saca un puesto (y a quien lo ocupaba en cada equipo). */
export declare function quitarPuesto(acc: Acceso, id: string, puestoId: string): Promise<any>;
/** Un equipo nuevo, vacío o copiando otro —personas y condiciones propias— («Semana B» a partir de «Semana A»). */
export declare function crearEquipo(acc: Acceso, id: string, nombre: string, copiarDeId?: string): Promise<any>;
export declare function renombrarEquipo(acc: Acceso, id: string, equipoId: string, nombre: string): Promise<any>;
export declare function borrarEquipo(acc: Acceso, id: string, equipoId: string): Promise<any>;
/**
 * Quién ocupa un puesto en un equipo. `userId: null` lo deja sin asignar (las condiciones propias del
 * puesto en el equipo, si tiene, se conservan). Si ya había alguien, queda anotado a quién reemplazó
 * (informativo, y para sugerir «¿Cubre a X?» al contratar). La misma persona PUEDE ocupar otro puesto
 * del equipo: si se pisan, el equipo lo avisa (`avisos`), no se bloquea.
 */
export declare function asignarPuesto(acc: Acceso, id: string, equipoId: string, puestoId: string, userId: string | null): Promise<any>;
/**
 * Las CONDICIONES PROPIAS de un puesto en un equipo: área y turno, horario, días, tipo de contrato,
 * categoría, importe, comentario. Se manda el puesto como debería quedar en este equipo y se guarda sólo
 * lo que difiere del puesto. `restablecer: true` vuelve a las del puesto.
 */
export declare function condicionesEnEquipo(acc: Acceso, id: string, equipoId: string, puestoId: string, body: any): Promise<any>;
/**
 * SACAR UN PUESTO DE UN EQUIPO (o volver a usarlo). Armado el equipo, los puestos que no usa se sacan
 * de ESE equipo: no se asignan, no se contratan, no cuentan. Siguen en la plantilla de puestos para los
 * demás equipos. Se conserva quién lo ocupaba y sus condiciones, por si se vuelve a usar.
 */
export declare function usoDelPuestoEnEquipo(acc: Acceso, id: string, equipoId: string, puestoId: string, excluido: boolean): Promise<any>;
/**
 * Los planes de VARIOS equipos de la plantilla contratados juntos («Contratar todos»), o de uno. Dos
 * pasadas: la primera resuelve las fechas de cada persona, con eso se buscan sus superposiciones —con
 * lo que ya tiene en la base y con sus OTROS puestos de esta misma contratación, de cualquier equipo—,
 * y la segunda las suma como advertencias.
 */
export declare function planificarVarios(tenantId: Types.ObjectId, p: any, bodies: any[]): Promise<PlanDeLote[]>;
/** El plan de un equipo. */
export declare function planificar(tenantId: Types.ObjectId, p: any, body: any): Promise<PlanDeLote>;
export declare function previewDeContratacion(acc: Acceso, id: string, body: any): Promise<{
    filas: {
        fechasTrabajadas: string[];
        desde: string;
        hasta: string;
        comentarios: string;
        nombreContrato: string;
        porDiasSueltos: boolean;
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
 * Con `guardarEnEquipo`, lo cambiado «sólo esta vez» queda también en el equipo elegido.
 */
export declare function contratarPlantilla(acc: Acceso, id: string, body: any): Promise<{
    repetido: boolean;
    loteId: string;
    solicitudIds: any;
    totales: any;
    nombrePlantilla: any;
}>;
/** «CONTRATAR TODOS»: el preview de varios equipos a la vez (cada uno con sus fechas). */
export declare function previewDeVarios(acc: Acceso, id: string, body: any): Promise<{
    equipos: {
        filas: {
            fechasTrabajadas: string[];
            desde: string;
            hasta: string;
            comentarios: string;
            nombreContrato: string;
            porDiasSueltos: boolean;
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
        equipoId: string;
    }[];
}>;
/** «CONTRATAR TODOS»: todos los equipos pedidos, TODO O NADA, un lote por equipo. */
export declare function contratarVarios(acc: Acceso, id: string, body: any): Promise<{
    repetido: boolean;
    lotes: {
        loteId: string;
        solicitudIds: any;
        totales: any;
        nombrePlantilla: any;
    }[];
}>;
