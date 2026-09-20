import { Document, Types } from "mongoose";
/**
 * QUÉ LE HACE UN TIPO DE NOVEDAD A UNA CUENTA DE DÍAS.
 *
 * Es el puente entre el hecho y el banco: «Compensatorios» consume de la cuenta COMPENSATORIO,
 * «Horas extras y feriados» la acredita. Un tipo puede no tener ninguno —«Cambios de turno» no
 * mueve nada— o tener varios.
 *
 * `condition` deja que el mismo tipo haga o no haga según el día: acreditar sólo si fue feriado,
 * por ejemplo. Vacía, el efecto se aplica siempre.
 */
export interface ILeaveEffect {
    accountId: Types.ObjectId;
    /** `debit` consume días de la cuenta; `credit` los acredita. */
    direction: "debit" | "credit";
    /** Sobre qué se calcula: el día entero, las horas cargadas, o una cantidad fija. */
    basis: "dia" | "hora" | "fijo";
    /** Multiplicador. 1 es «uno por uno»; 1.5 o 2 sirven para feriados o nocturnidad. */
    factor: number;
    cantidadFija?: number;
    rounding: "none" | "up" | "down" | "half";
    condition?: {
        esFeriado?: boolean;
        esDiaNoLaborable?: boolean;
    };
}
export interface IRequestConfig extends Document {
    tenantId: Types.ObjectId;
    name: string;
    order: number;
    requiresReplacement: boolean;
    isActive: boolean;
    visibility: "all" | "specific";
    allowedProjectIds: Types.ObjectId[];
    /** Qué cuentas mueve este tipo. Vacío = no mueve ninguna (ver `ILeaveEffect`). */
    effects: ILeaveEffect[];
    /**
     * TOPE SIN BANCO: para lo que tiene un máximo pero no acumula saldo, como Enfermedad.
     *
     * Con `accion: 'avisar'` se deja cargar y se avisa; con `'bloquear'`, no se deja. Avisar es lo
     * razonable por defecto: quien carga la novedad rara vez es quien decide la excepción.
     */
    limit?: {
        enabled: boolean;
        maxPorPeriodo?: number;
        periodo?: "calendario" | "aniversario_ingreso";
        accion?: "avisar" | "bloquear";
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const RequestConfig: import("mongoose").Model<IRequestConfig, {}, {}, {}, Document<unknown, {}, IRequestConfig, {}, {}> & IRequestConfig & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
