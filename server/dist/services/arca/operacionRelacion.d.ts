/**
 * EL CONTEXTO DE UNA OPERACIÓN SOBRE UNA RELACIÓN LABORAL EN ARCA (20/11/2026): el contrato, la persona, la
 * empleadora, lo que el espejo de Relaciones Laborales sabe de esa relación y la tabla de situaciones de baja. Con
 * eso arma el PLAN (`reglasOperacionRelacion.ts`) sin tocar ARCA. Lo usan la ruta `/arca/operaciones/plan`, la
 * corrida (`corridaOperacionRelacion.ts`) y el script `operarRelacionArca.ts`.
 *
 * El contrato se nombra por su `contratoKey` cuando la tiene; si no, por su posición, y en los dos casos se
 * comprueba que la posición resuelta sea un contrato operable (no una lápida) de un proyecto del tenant.
 *
 * MODO «SIN CONTRATO» (22/11/2026): una relación de ARCA que ningún contrato de WeProdu explica (las altas viejas
 * hechas a mano) se nombra por la relación misma —empleadora, CUIL y fecha de inicio— y se opera igual. No hay
 * contrato donde guardar el resultado: las marcas que impiden mandar dos veces lo mismo salen del registro de
 * operaciones (`registroOperaciones.ts`). Si la relación SÍ tiene un contrato, este modo se niega: se opera desde él.
 */
import { Types } from "mongoose";
import { type ContratoParaOperar, type DatosOperacion, type PlanOperacion, type RelacionEspejo, type TipoOperacion } from "./reglasOperacionRelacion.js";
export declare class OperacionInvalida extends Error {
    plan?: PlanOperacion;
    status: number;
    constructor(message: string, plan?: PlanOperacion);
}
export interface ReferenciaContrato {
    userProjectId: string;
    contratoKey?: string | null;
    contractIndex?: number | null;
    /** Modo «sin contrato»: la relación de ARCA misma, cuando no hay `userProjectId`. */
    relacion?: {
        empleadoraCuit: string;
        cuil: string;
        fechaInicio: string;
    } | null;
}
export interface ResumenContratoOperable {
    userProjectId: string;
    contratoKey: string | null;
    posicion: number;
    nombre_contrato: string;
    alta: string;
    baja: string;
    nombre_empresa_contrato: string;
    estadoContrato: string;
    marcas: {
        alta: any;
        baja: any;
        modificacion: any;
        anulacion: any;
    };
}
export interface ContextoOperacion {
    /** `null` en modo «sin contrato». */
    up: any;
    idx: number;
    contrato: any;
    contratoKey: string | null;
    /** La relación no tiene contrato en WeProdu: el resultado no se guarda en ninguno, sólo en el registro. */
    sinContrato: boolean;
    /** Empleadora + CUIL + fecha de inicio: la identidad de la relación en el registro de operaciones. */
    claveRelacion: string;
    persona: {
        userId: string;
        nombre: string;
        cuil: string;
    };
    empresa: {
        _id: string;
        cuit: string;
        razonSocial: string;
    };
    espejo: RelacionEspejo | null;
    paraReglas: ContratoParaOperar;
    resumen: ResumenContratoOperable;
}
/** La tabla de situaciones de baja, como la ve la pantalla: código y descripción. */
export declare function situacionesDeBaja(): Promise<Array<{
    codigo: string;
    descripcion: string;
}>>;
/** La relación del contrato en el espejo de Relaciones Laborales (misma empleadora, CUIL y fecha de inicio exacta). */
export declare function espejoDe(tenantObjectId: Types.ObjectId, empleadoraCuit: string, cuil: string, alta: string): Promise<RelacionEspejo | null>;
export declare function contextoDeOperacion(tenantObjectId: Types.ObjectId, ref: ReferenciaContrato): Promise<ContextoOperacion>;
export interface PlanConContexto {
    plan: PlanOperacion;
    hoy: string;
    contexto: {
        persona: ContextoOperacion["persona"];
        empresa: ContextoOperacion["empresa"];
        contrato: ResumenContratoOperable;
        espejo: RelacionEspejo | null;
        situacionTexto?: string;
        sinContrato: boolean;
    };
    /** Lo que la corrida necesita y no viaja a la pantalla. */
    ctx: ContextoOperacion;
}
/** El plan de una operación: qué se mandaría y si se puede, SIN tocar ARCA. */
export declare function planOperacion(tenantObjectId: Types.ObjectId, o: {
    op: TipoOperacion;
    ref: ReferenciaContrato;
    datos: DatosOperacion;
}): Promise<PlanConContexto>;
