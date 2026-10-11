import { ArchivoConNombre } from "./coincidenciaDeNombre.js";
/**
 * CUANDO VUELVE EL FIRMADO, EL ORIGINAL SALE DE PENDBOX. La decisión, SIN Dropbox ni base: es lo que
 * se testea. La ejecución está en `services/limpiezaPendboxService.ts`.
 *
 * El circuito es Outbox («Para Firmar») → Pendbox («Enviado a la firma») → Requested signatures
 * («Firmados»). El mail de Dropbox Sign mueve Outbox → Pendbox; el firmado aparece en Requested
 * signatures; y el original quedaba en Pendbox para siempre, con «Enviado a la firma» mostrándolo.
 *
 * Por cada firmado:
 *   · Se busca SU original en Pendbox. Con código («ID-000012») en el nombre, el del mismo código y
 *     nada más. Sin código, el archivo cuyo nombre (sin extensión ni «_ID-NNNNNN») es el comienzo del
 *     nombre del firmado seguido de un separador: la misma regla que el aviso por mail
 *     (`candidatosPorNombre`). Cero o más de un candidato: no se hace nada y se dice por qué. Nunca
 *     se adivina por persona y período.
 *   · Si el firmado no trae código, se renombra insertando el del original justo antes del primer
 *     «.pdf». Lo que Dropbox Sign le agregó después (« Firma solicitada por …») no se toca, salvo que
 *     el nombre pase `MAX_NOMBRE`: entonces se recorta esa cola, nunca un campo ancla.
 *   · Recién con el firmado con código, se borra el original. Quien ejecuta sólo borra si el renombre
 *     terminó bien (`borrarSoloSi`).
 */
export type MotivoOmision = "sin_original" | `ambiguo_${number}` | "original_sin_codigo" | "original_repetido" | "sin_pdf_en_nombre" | "nombre_largo" | "ya_existe";
export interface AccionLimpieza {
    firmado: ArchivoConNombre;
    original: ArchivoConNombre;
    codigo: string;
    /** Nuevo nombre del firmado, si hay que renombrarlo. Sin esto, ya tenía el código. */
    renombrarA?: string;
}
export interface OmisionLimpieza {
    firmado: ArchivoConNombre;
    motivo: MotivoOmision;
    candidatos?: string[];
}
export interface PlanLimpieza {
    acciones: AccionLimpieza[];
    omitidos: OmisionLimpieza[];
}
/**
 * El nombre del firmado con el código metido antes del primer «.pdf». Si no entra en `max` bytes se
 * recorta la cola (lo que va después de ese «.pdf»), y si ni así entra, null.
 */
export declare function nombreConCodigo(nombre: string, codigo: string, max?: number): string | null;
export declare function planLimpiezaPendbox(firmados: ArchivoConNombre[], pendbox: ArchivoConNombre[], max?: number): PlanLimpieza;
/** Texto de una línea por acción u omisión, para el log y el script. */
export declare function describirPlan(plan: PlanLimpieza): string[];
