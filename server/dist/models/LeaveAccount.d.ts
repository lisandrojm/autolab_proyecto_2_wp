import { Document, Types, Model } from "mongoose";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNA CUENTA DE DÍAS: el banco de un tipo de saldo (vacaciones, compensatorios…)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hasta acá cada tipo de novedad era una etiqueta sin consecuencia: cargar «Compensatorios» dejaba
 * el día marcado y nada más. Los días que alguien se ganaba trabajando un feriado y los que se
 * tomaba después vivían en la cabeza de quien llevaba la cuenta, o en una planilla aparte.
 *
 * Una cuenta dice QUÉ se acumula y CÓMO se acredita. Lo que la mueve —las novedades— se configura
 * del otro lado, en los `effects` del tipo (ver `models/RequestConfig.ts`).
 *
 * NO TODOS LOS TIPOS DE NOVEDAD TIENEN CUENTA. «Cambios de turno» no acumula nada; «Enfermedad»
 * tiene un tope pero no un banco. Crear una cuenta para cada tipo sería inventar saldos que nadie
 * lleva.
 *
 * EL SALDO NO ESTÁ ACÁ. Se calcula sumando los movimientos (ver `models/LeaveLedger.ts`). Esta
 * colección es la definición de la cuenta, no su estado.
 */
/** Un tramo de la escala por antigüedad: «de 5 a 10 años, 21 días». `hastaAnios: null` es el último. */
export interface ITramoAntiguedad {
    desdeAnios: number;
    hastaAnios: number | null;
    dias: number;
}
export interface ILeaveAccount extends Document {
    tenantId: Types.ObjectId;
    /**
     * Con qué la nombra el código (`VACACIONES`, `COMPENSATORIO`). No cambia nunca: los movimientos
     * viejos y los scripts la referencian por acá, y renombrarla los dejaría apuntando a la nada.
     * El nombre visible sí se puede cambiar cuando quieran.
     */
    code: string;
    name: string;
    description?: string;
    order: number;
    isActive: boolean;
    unit: "dias" | "horas";
    accrual: {
        /**
         * Cómo se acredita.
         *
         *   · `anual_fijo`     — la misma cantidad cada período.
         *   · `por_antiguedad` — según la escala de `antiguedadTramos`.
         *   · `por_evento`     — sólo cuando pasa algo que lo genera (trabajar un feriado). No hay
         *                        acreditación automática: la acredita el motor de efectos.
         *   · `manual`         — el sistema NO calcula nada y lo cargado a mano es la única verdad.
         *                        Es el modo con el que arranca Vacaciones mientras la antigüedad de la
         *                        gente no esté resuelta: un cálculo que se sabe incorrecto es peor que
         *                        no calcular.
         */
        mode: "anual_fijo" | "por_antiguedad" | "por_evento" | "manual";
        diasAnuales?: number;
        antiguedadTramos?: ITramoAntiguedad[];
        /** Contra qué se corta el período: el año calendario o el aniversario de ingreso de cada uno. */
        periodo: "calendario" | "aniversario_ingreso";
    };
    carryover: {
        permite: boolean;
        maxDias?: number;
        venceEnMeses?: number;
    };
    /** Si se puede quedar en rojo. Con `false`, consumir de más se avisa; nunca se bloquea en silencio. */
    allowNegative: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const LeaveAccount: Model<ILeaveAccount>;
