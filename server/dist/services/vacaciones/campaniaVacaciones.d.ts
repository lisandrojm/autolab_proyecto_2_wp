import { Types } from "mongoose";
import { type ICampaniaVacaciones, type IInvitacionVacaciones } from "../../models/CampaniaVacaciones.js";
import { type IVacation } from "../../models/Vacation.js";
import { type Tramo } from "../../compartido/vacaciones/campania.js";
export declare function cargarCampania(tid: Types.ObjectId, id: string): Promise<import("mongoose").Document<unknown, {}, ICampaniaVacaciones, {}, {}> & ICampaniaVacaciones & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
export declare function crearCampania(tid: Types.ObjectId, actorId: string, body: {
    nombre?: string;
}): Promise<{
    campania: import("mongoose").Document<unknown, {}, ICampaniaVacaciones, {}, {}> & ICampaniaVacaciones & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    };
    alertas: import("../../compartido/vacaciones/campania.js").Alerta[];
}>;
export declare function listarCampanias(tid: Types.ObjectId): Promise<any[]>;
/** El tablero: la campaña, cada invitación con su estado visible y sus alertas, y cuántas hay en cada estado. */
export declare function tablero(tid: Types.ObjectId, id: string): Promise<{
    campania: any;
    invitaciones: any[];
    conteos: Record<string, number>;
    alertas: any[];
    hoy: string;
}>;
/**
 * LA VISTA PREVIA DEL BORRADOR: cuánta gente con días hay por tipo de contrato y qué tipos están
 * deshabilitados. La pantalla hace la cuenta con `resumenDeInvitables` cada vez que cambia la selección,
 * sin volver a pedir nada: la misma regla (`motivoDeNoInvitar`) que usa el lanzamiento.
 */
export declare function vistaPreviaDeInvitacion(tid: Types.ObjectId, id: string): Promise<{
    deshabilitados: string[];
    tiposContratoInvitar: string[];
    porTipo: {
        id: string;
        nombre: string;
        personas: number;
    }[];
    sinContrato: number;
}>;
/** A qué tipos de contrato invita la campaña (vacío = todos los habilitados). Sólo en borrador: lanzada, ya se usó. */
export declare function guardarTiposContrato(tid: Types.ObjectId, id: string, tipos: unknown): Promise<{
    tiposContratoInvitar: string[];
}>;
/**
 * LANZAR: una invitación por cada persona con días (`personasConDias`) cuyo contrato vigente en la empresa
 * de cómputo sea de un tipo que la campaña invita (`motivoDeNoInvitar`; sin tipos elegidos, todos los
 * habilitados). Fecha límite = hoy + plazo. Avisa a cada una por la campanita y deja escrito en la
 * campaña qué tipos se usaron y cuántas quedaron afuera.
 *
 * `tipos`: la selección que tiene la pantalla en ese momento (si viene, se guarda antes de invitar, para
 * que no se lance con una lista distinta de la que se está viendo).
 */
export declare function lanzarCampania(tid: Types.ObjectId, id: string, actorId: string, tipos?: unknown): Promise<{
    invitadas: number;
    excluidas: {
        tipoDeshabilitado: number;
        tipoNoIncluido: number;
        sinContrato: number;
    };
    alertas: import("../../compartido/vacaciones/campania.js").Alerta[];
}>;
/** Recordatorio a quienes todavía pueden elegir (no propusieron). `automatico`: lo manda el barrido. */
export declare function recordar(tid: Types.ObjectId, c: ICampaniaVacaciones, actorId: string | null, filtro?: Record<string, unknown>): Promise<{
    recordadas: number;
}>;
/**
 * EL TRAMO ÚNICO SUGERIDO para quien venció sin elegir: con los días que le quedan HOY, desde hoy +
 * aviso, dentro de la ventana (la de la campaña y la suya), sin tocar días bloqueados por los topes de
 * solapamiento ni sus otras vacaciones. Si ya no le quedan días, queda «sin días pendientes».
 */
export declare function sugerirAsignacion(tid: Types.ObjectId, c: ICampaniaVacaciones, inv: IInvitacionVacaciones): Promise<IInvitacionVacaciones>;
/** Sugiere a todos los vencidos que todavía no tienen la asignación confirmada. */
export declare function sugerirAsignaciones(tid: Types.ObjectId, id: string): Promise<{
    sugeridas: number;
}>;
/** El admin mueve el tramo sugerido: tiene que seguir siendo UNO, con todos los días, y llegar con el aviso. */
export declare function editarAsignacion(tid: Types.ObjectId, id: string, invId: string, t: Tramo, actorId: string): Promise<import("mongoose").Document<unknown, {}, IInvitacionVacaciones, {}, {}> & IInvitacionVacaciones & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
export declare function confirmarAsignaciones(tid: Types.ObjectId, id: string, invIds: string[] | undefined, actorId: string): Promise<{
    confirmadas: number;
    fallas: {
        invitacionId: string;
        nombre: string;
        error: string;
    }[];
}>;
/** No se cierra «perdiendo» días: todos otorgados con aviso, o sin días que otorgar (art. 157). */
export declare function cerrarCampania(tid: Types.ObjectId, id: string, actorId: string): Promise<import("mongoose").Document<unknown, {}, ICampaniaVacaciones, {}, {}> & ICampaniaVacaciones & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
/** El reporte del período: quién tiene días sin gozar, cuántos, y cómo está la notificación. CSV con «;» (Excel en castellano). */
export declare function reporteCsv(tid: Types.ObjectId, id: string): Promise<{
    nombre: string;
    csv: string;
}>;
/** Lo que muestra «Elegí tus vacaciones» en la app. `pendienteDeAccion`: si la tarjeta tiene que estar a la vista. */
export declare function miInvitacion(tid: Types.ObjectId, userId: string): Promise<{
    invitacion: {
        tenantId: Types.ObjectId;
        campaniaId: Types.ObjectId;
        userId: Types.ObjectId;
        nombre: string;
        diasDisponibles: number;
        diasCorridos: boolean;
        ventanaPersona?: {
            enabled: boolean;
            tramos: {
                inicio: string;
                fin: string;
            }[];
        };
        fechaLimite: string;
        estado: import("../../compartido/vacaciones/campania.js").EstadoInvitacion;
        invitadoAt?: Date;
        acuseInvitacionAt?: Date | null;
        propuestaAt?: Date | null;
        tramos: import("../../models/CampaniaVacaciones.js").ITramoInvitacion[];
        rechazo?: {
            motivo?: string;
            at: Date;
        } | null;
        asignacion?: {
            desde: string;
            hasta: string;
            dias: number;
            sugeridaAt?: Date;
            editadaPor?: Types.ObjectId;
            confirmadaPor?: Types.ObjectId;
            confirmadaAt?: Date;
            vacationId?: Types.ObjectId;
            problema?: string | null;
        } | null;
        notificacion?: {
            enviadaAt: Date;
            texto: string;
            pdfUrls: string[];
        } | null;
        acuseOtorgamientoAt?: Date | null;
        recordatorios: {
            at: Date;
            porUserId?: Types.ObjectId | null;
            automatico: boolean;
        }[];
        createdAt: Date;
        updatedAt: Date;
        _id: Types.ObjectId;
        $locals: Record<string, unknown>;
        $op: "save" | "validate" | "remove" | null;
        $where: Record<string, unknown>;
        baseModelName?: string;
        collection: import("mongoose").Collection;
        db: import("mongoose").Connection;
        errors?: import("mongoose").Error.ValidationError;
        id?: any;
        isNew: boolean;
        schema: import("mongoose").Schema;
        __v: number;
    };
    campania: {
        _id: Types.ObjectId;
        nombre: string;
        anio: number;
        ventanaDesde: string;
        ventanaHasta: string;
        avisoMinimoDias: number;
        minDiasPorTramo: number;
        fechaLimite: string;
    };
    estadoVisible: import("../../compartido/vacaciones/campania.js").EstadoVisible;
    diasDisponibles: number;
    diasParaLaFechaLimite: number;
    puedeProponer: boolean;
    primerInicioPosible: string;
    vacaciones: (import("mongoose").FlattenMaps<IVacation> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[];
    pendienteDeAccion: boolean;
    hoy: string;
}>;
/** El acuse de recibo de la invitación: fecha y hora, una sola vez. */
export declare function acusarInvitacion(tid: Types.ObjectId, userId: string): Promise<{
    invitacion: {
        tenantId: Types.ObjectId;
        campaniaId: Types.ObjectId;
        userId: Types.ObjectId;
        nombre: string;
        diasDisponibles: number;
        diasCorridos: boolean;
        ventanaPersona?: {
            enabled: boolean;
            tramos: {
                inicio: string;
                fin: string;
            }[];
        };
        fechaLimite: string;
        estado: import("../../compartido/vacaciones/campania.js").EstadoInvitacion;
        invitadoAt?: Date;
        acuseInvitacionAt?: Date | null;
        propuestaAt?: Date | null;
        tramos: import("../../models/CampaniaVacaciones.js").ITramoInvitacion[];
        rechazo?: {
            motivo?: string;
            at: Date;
        } | null;
        asignacion?: {
            desde: string;
            hasta: string;
            dias: number;
            sugeridaAt?: Date;
            editadaPor?: Types.ObjectId;
            confirmadaPor?: Types.ObjectId;
            confirmadaAt?: Date;
            vacationId?: Types.ObjectId;
            problema?: string | null;
        } | null;
        notificacion?: {
            enviadaAt: Date;
            texto: string;
            pdfUrls: string[];
        } | null;
        acuseOtorgamientoAt?: Date | null;
        recordatorios: {
            at: Date;
            porUserId?: Types.ObjectId | null;
            automatico: boolean;
        }[];
        createdAt: Date;
        updatedAt: Date;
        _id: Types.ObjectId;
        $locals: Record<string, unknown>;
        $op: "save" | "validate" | "remove" | null;
        $where: Record<string, unknown>;
        baseModelName?: string;
        collection: import("mongoose").Collection;
        db: import("mongoose").Connection;
        errors?: import("mongoose").Error.ValidationError;
        id?: any;
        isNew: boolean;
        schema: import("mongoose").Schema;
        __v: number;
    };
    campania: {
        _id: Types.ObjectId;
        nombre: string;
        anio: number;
        ventanaDesde: string;
        ventanaHasta: string;
        avisoMinimoDias: number;
        minDiasPorTramo: number;
        fechaLimite: string;
    };
    estadoVisible: import("../../compartido/vacaciones/campania.js").EstadoVisible;
    diasDisponibles: number;
    diasParaLaFechaLimite: number;
    puedeProponer: boolean;
    primerInicioPosible: string;
    vacaciones: (import("mongoose").FlattenMaps<IVacation> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[];
    pendienteDeAccion: boolean;
    hoy: string;
}>;
/**
 * LA PROPUESTA: valida con las reglas de la campaña (ventana, aviso, tramo mínimo al fraccionar, que
 * sume todos los días) y crea una vacación por tramo, que sube por la jerarquía. Si una no se puede
 * crear (solapamiento con su equipo), no queda ninguna: se propone todo junto o nada.
 */
export declare function proponerFechas(tid: Types.ObjectId, userId: string, tramos: Tramo[]): Promise<{
    invitacion: {
        tenantId: Types.ObjectId;
        campaniaId: Types.ObjectId;
        userId: Types.ObjectId;
        nombre: string;
        diasDisponibles: number;
        diasCorridos: boolean;
        ventanaPersona?: {
            enabled: boolean;
            tramos: {
                inicio: string;
                fin: string;
            }[];
        };
        fechaLimite: string;
        estado: import("../../compartido/vacaciones/campania.js").EstadoInvitacion;
        invitadoAt?: Date;
        acuseInvitacionAt?: Date | null;
        propuestaAt?: Date | null;
        tramos: import("../../models/CampaniaVacaciones.js").ITramoInvitacion[];
        rechazo?: {
            motivo?: string;
            at: Date;
        } | null;
        asignacion?: {
            desde: string;
            hasta: string;
            dias: number;
            sugeridaAt?: Date;
            editadaPor?: Types.ObjectId;
            confirmadaPor?: Types.ObjectId;
            confirmadaAt?: Date;
            vacationId?: Types.ObjectId;
            problema?: string | null;
        } | null;
        notificacion?: {
            enviadaAt: Date;
            texto: string;
            pdfUrls: string[];
        } | null;
        acuseOtorgamientoAt?: Date | null;
        recordatorios: {
            at: Date;
            porUserId?: Types.ObjectId | null;
            automatico: boolean;
        }[];
        createdAt: Date;
        updatedAt: Date;
        _id: Types.ObjectId;
        $locals: Record<string, unknown>;
        $op: "save" | "validate" | "remove" | null;
        $where: Record<string, unknown>;
        baseModelName?: string;
        collection: import("mongoose").Collection;
        db: import("mongoose").Connection;
        errors?: import("mongoose").Error.ValidationError;
        id?: any;
        isNew: boolean;
        schema: import("mongoose").Schema;
        __v: number;
    };
    campania: {
        _id: Types.ObjectId;
        nombre: string;
        anio: number;
        ventanaDesde: string;
        ventanaHasta: string;
        avisoMinimoDias: number;
        minDiasPorTramo: number;
        fechaLimite: string;
    };
    estadoVisible: import("../../compartido/vacaciones/campania.js").EstadoVisible;
    diasDisponibles: number;
    diasParaLaFechaLimite: number;
    puedeProponer: boolean;
    primerInicioPosible: string;
    vacaciones: (import("mongoose").FlattenMaps<IVacation> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[];
    pendienteDeAccion: boolean;
    hoy: string;
}>;
/**
 * LA PERSONA CANCELA SU PROPUESTA (16/11/2026): mientras no esté aprobada (ningún tramo aprobado ni
 * entregado) se cancelan todos sus tramos en juego, se devuelven los días y vuelve a poder elegir. No se
 * edita: para cambiar las fechas, se cancela y se propone de nuevo.
 */
export declare function cancelarPropuesta(tid: Types.ObjectId, userId: string): Promise<{
    invitacion: {
        tenantId: Types.ObjectId;
        campaniaId: Types.ObjectId;
        userId: Types.ObjectId;
        nombre: string;
        diasDisponibles: number;
        diasCorridos: boolean;
        ventanaPersona?: {
            enabled: boolean;
            tramos: {
                inicio: string;
                fin: string;
            }[];
        };
        fechaLimite: string;
        estado: import("../../compartido/vacaciones/campania.js").EstadoInvitacion;
        invitadoAt?: Date;
        acuseInvitacionAt?: Date | null;
        propuestaAt?: Date | null;
        tramos: import("../../models/CampaniaVacaciones.js").ITramoInvitacion[];
        rechazo?: {
            motivo?: string;
            at: Date;
        } | null;
        asignacion?: {
            desde: string;
            hasta: string;
            dias: number;
            sugeridaAt?: Date;
            editadaPor?: Types.ObjectId;
            confirmadaPor?: Types.ObjectId;
            confirmadaAt?: Date;
            vacationId?: Types.ObjectId;
            problema?: string | null;
        } | null;
        notificacion?: {
            enviadaAt: Date;
            texto: string;
            pdfUrls: string[];
        } | null;
        acuseOtorgamientoAt?: Date | null;
        recordatorios: {
            at: Date;
            porUserId?: Types.ObjectId | null;
            automatico: boolean;
        }[];
        createdAt: Date;
        updatedAt: Date;
        _id: Types.ObjectId;
        $locals: Record<string, unknown>;
        $op: "save" | "validate" | "remove" | null;
        $where: Record<string, unknown>;
        baseModelName?: string;
        collection: import("mongoose").Collection;
        db: import("mongoose").Connection;
        errors?: import("mongoose").Error.ValidationError;
        id?: any;
        isNew: boolean;
        schema: import("mongoose").Schema;
        __v: number;
    };
    campania: {
        _id: Types.ObjectId;
        nombre: string;
        anio: number;
        ventanaDesde: string;
        ventanaHasta: string;
        avisoMinimoDias: number;
        minDiasPorTramo: number;
        fechaLimite: string;
    };
    estadoVisible: import("../../compartido/vacaciones/campania.js").EstadoVisible;
    diasDisponibles: number;
    diasParaLaFechaLimite: number;
    puedeProponer: boolean;
    primerInicioPosible: string;
    vacaciones: (import("mongoose").FlattenMaps<IVacation> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[];
    pendienteDeAccion: boolean;
    hoy: string;
}>;
/** El acuse de recibo del aviso por escrito del otorgamiento. */
export declare function acusarOtorgamiento(tid: Types.ObjectId, userId: string): Promise<{
    invitacion: {
        tenantId: Types.ObjectId;
        campaniaId: Types.ObjectId;
        userId: Types.ObjectId;
        nombre: string;
        diasDisponibles: number;
        diasCorridos: boolean;
        ventanaPersona?: {
            enabled: boolean;
            tramos: {
                inicio: string;
                fin: string;
            }[];
        };
        fechaLimite: string;
        estado: import("../../compartido/vacaciones/campania.js").EstadoInvitacion;
        invitadoAt?: Date;
        acuseInvitacionAt?: Date | null;
        propuestaAt?: Date | null;
        tramos: import("../../models/CampaniaVacaciones.js").ITramoInvitacion[];
        rechazo?: {
            motivo?: string;
            at: Date;
        } | null;
        asignacion?: {
            desde: string;
            hasta: string;
            dias: number;
            sugeridaAt?: Date;
            editadaPor?: Types.ObjectId;
            confirmadaPor?: Types.ObjectId;
            confirmadaAt?: Date;
            vacationId?: Types.ObjectId;
            problema?: string | null;
        } | null;
        notificacion?: {
            enviadaAt: Date;
            texto: string;
            pdfUrls: string[];
        } | null;
        acuseOtorgamientoAt?: Date | null;
        recordatorios: {
            at: Date;
            porUserId?: Types.ObjectId | null;
            automatico: boolean;
        }[];
        createdAt: Date;
        updatedAt: Date;
        _id: Types.ObjectId;
        $locals: Record<string, unknown>;
        $op: "save" | "validate" | "remove" | null;
        $where: Record<string, unknown>;
        baseModelName?: string;
        collection: import("mongoose").Collection;
        db: import("mongoose").Connection;
        errors?: import("mongoose").Error.ValidationError;
        id?: any;
        isNew: boolean;
        schema: import("mongoose").Schema;
        __v: number;
    };
    campania: {
        _id: Types.ObjectId;
        nombre: string;
        anio: number;
        ventanaDesde: string;
        ventanaHasta: string;
        avisoMinimoDias: number;
        minDiasPorTramo: number;
        fechaLimite: string;
    };
    estadoVisible: import("../../compartido/vacaciones/campania.js").EstadoVisible;
    diasDisponibles: number;
    diasParaLaFechaLimite: number;
    puedeProponer: boolean;
    primerInicioPosible: string;
    vacaciones: (import("mongoose").FlattenMaps<IVacation> & Required<{
        _id: Types.ObjectId;
    }> & {
        __v: number;
    })[];
    pendienteDeAccion: boolean;
    hoy: string;
}>;
/** Antes de que el admin apruebe una vacación de la campaña: ¿llega el aviso y termina dentro de la ventana? */
export declare function erroresDeOtorgamiento(v: IVacation): Promise<string[]>;
/** Aprobada una vacación de la campaña: si ya están aprobados todos los tramos de la propuesta, queda otorgada y notificada. */
export declare function alAprobarseEnLaCampania(v: IVacation): Promise<void>;
/**
 * Rechazada o cancelada una vacación de la campaña: si la había propuesto la persona, vuelve a elegir esos
 * días (los demás tramos siguen); si la había asignado la empresa, vuelve a quedar para asignar.
 */
export declare function alSalirDeLaCampania(v: IVacation, motivo: string, porLaPersona?: boolean): Promise<void>;
/**
 * Lo que hace el reloj en cada campaña lanzada: la fecha límite vencida pasa a «venció sin elegir» y se
 * le sugiere el tramo único; 2 días antes del vencimiento, un recordatorio automático (uno solo).
 */
export declare function barrerCampania(c: ICampaniaVacaciones): Promise<{
    vencidas: number;
    recordadas: number;
}>;
