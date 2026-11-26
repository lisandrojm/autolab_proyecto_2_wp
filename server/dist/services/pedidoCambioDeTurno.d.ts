import { Types } from "mongoose";
import { type ResultadoValidacion } from "./cambioDeTurno.js";
export interface ContextoAplicacion {
    tenantId: Types.ObjectId;
    /** Quién dispara (el aprobador, o nadie si es el cron). */
    porUserId?: string;
    hoy?: string;
}
type Movimiento = "movido" | "ya_estaba" | "no_estaba";
/**
 * ANTES DE APROBAR: el contexto pudo cambiar desde que se pidió (la movieron de turno, le aprobaron
 * vacaciones encima). Se revalida sin la anticipación. Si falla, la ruta contesta 422 y NO aprueba.
 */
export declare function revalidarAlAprobar(order: any, category: any, ctx: ContextoAplicacion): Promise<ResultadoValidacion>;
/** ¿Este pedido ya está en condiciones de aplicarse? Aprobado, firmado si el tipo firma, y con la fecha llegada. */
export declare function listoParaAplicar(order: any, category: any, hoy: string): boolean;
/**
 * APLICAR SI CORRESPONDE. Lo llaman la aprobación, la confirmación de firma y el cron. Escribe el equipo y
 * anota en `metadata.cambioTurno` (`aplicado` o `fallo`); el PEDIDO LO GUARDA QUIEN LLAMA (las rutas ya
 * tienen el documento abierto y lo guardan después; el cron guarda acá mismo con `guardar: true`).
 * Devuelve qué pasó, o null si no correspondía.
 */
export declare function aplicarSiCorresponde(order: any, category: any, ctx: ContextoAplicacion, opciones?: {
    guardar?: boolean;
}): Promise<Movimiento | "fallo" | null>;
/** Con `fechaHasta` vencida y el cambio aplicado: devolver a la persona a su turno original. */
export declare function revertirSiCorresponde(order: any, category: any, ctx: ContextoAplicacion, opciones?: {
    guardar?: boolean;
}): Promise<Movimiento | null>;
/**
 * EL BARRIDO DIARIO (lo llama `cambioTurnoCronService.ts`): en todos los tenants, aplicar los cambios cuya
 * fecha llegó y revertir los temporales vencidos. Devuelve cuántos de cada cosa, para el log.
 */
export declare function barridoDiarioDeCambiosDeTurno(hoy?: string): Promise<{
    aplicados: number;
    revertidos: number;
    fallos: number;
}>;
export {};
