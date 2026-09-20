import type { IMemosoftEffect } from "../../models/RequestConfig.js";
import type { Evento } from "./normalizar.js";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ETAPA 2 — DE EVENTO A LÍNEAS DE CONCEPTO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Toma un hecho —"fulano faltó por enfermedad el 12 de agosto"— y lo convierte en las líneas que
 * van a terminar en el archivo: concepto, parámetro y número.
 *
 * TRES REGLAS QUE NO SE NEGOCIAN:
 *
 *   1. Si no hay efecto configurado, NO SALE NADA. Una ausencia sin motivo no se transforma en
 *      "Inasistencia Injustificada" por descarte: va al anexo. Descartar es adivinar, y acá
 *      adivinar le descuenta el día a alguien.
 *
 *   2. Lo que el mapeo marca como `manual` tampoco sale solo. Existe para decir "esto se liquida,
 *      pero el número no está en el parte": queda anotado para que una persona lo cargue.
 *
 *   3. Las horas extra sin discriminar NO se reparten. Ver `heSinDiscriminar` en `normalizar.ts`.
 *
 * ES PURA: recibe los efectos ya resueltos y no toca Mongo.
 */
export interface Linea {
    /** De qué evento salió. Es la trazabilidad, y es requisito: sin esto una línea no se puede explicar. */
    eventoId: string;
    userId: string;
    apellidoYNombre: string;
    legajo: string | null;
    empresaId: string | null;
    ccCodigo: string | null;
    regimen: string | null;
    fecha: string;
    conceptoCodigo: string;
    par1: number;
    par2: number;
    /** Por qué se emitió: el motivo, o la regla global que la generó. */
    origen: string;
}
export type MotivoDeExclusion = "sin_efecto_configurado" | "efecto_manual" | "horas_extra_sin_discriminar" | "sin_legajo" | "sin_empresa" | "sin_regimen" | "sin_centro_de_costo" | "presente_sin_regla_base";
export interface Exclusion {
    eventoId: string;
    userId: string;
    apellidoYNombre: string;
    fecha: string;
    motivo: MotivoDeExclusion;
    detalle: string;
}
/** Las reglas que no dependen del motivo de la novedad. Ver `models/ActivityLogGeneralConfig.ts`. */
export interface ReglasGlobales {
    horasExtra?: {
        codigo50?: string | null;
        codigo100?: string | null;
        param: "par1" | "par2";
        unidad: string;
    } | null;
    /**
     * EL JORNAL DEL QUE VINO A TRABAJAR Y NO PASÓ NADA.
     *
     * No estaba en el pedido y el archivo no cierra sin esto: los renglones "presente, sin novedad"
     * son la mayoría —5.456 de los 7.920 de la historia—, y un jornalero cobra POR DÍA TRABAJADO. Sin
     * una regla acá, la liquidación de los jornaleros sale casi vacía.
     *
     * Va sin valor por defecto: hasta que RRHH lo configure, esos días no generan nada y la corrida
     * lo dice en una sola línea del resumen, no en 5.456 excepciones.
     */
    jornalBase?: {
        codigo?: string | null;
        param: "par1" | "par2";
        soloRegimen?: string | null;
    } | null;
}
export interface ResultadoDeCodificacion {
    lineas: Linea[];
    exclusiones: Exclusion[];
}
export declare function codificarEvento(evento: Evento, efectosDelMotivo: IMemosoftEffect[], globales: ReglasGlobales, 
/** El motivo está marcado como "no liquida nada". Ver `RequestConfig.memosoftNoLiquida`. */
motivoNoLiquida?: boolean): ResultadoDeCodificacion;
