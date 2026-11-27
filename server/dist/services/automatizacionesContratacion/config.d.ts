/**
 * ═══════════════════════════════════════════════════════════════════════
 * AUTOMATIZACIONES DE CONTRATACIÓN (27/11/2026, pedido del usuario): la configuración de cada una
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Dos relojes, por tenant, apagados por defecto (se prenden desde su bandeja):
 *   · GENERACIÓN DE DOCUMENTOS (paso 3): cada N minutos genera lo que falte de lo que está en «Envío de
 *     documentación» y lo manda a firmar («Para Firmar»). Ver `generacionDocumentos.ts`.
 *   · VALIDACIÓN DEL CUIT (paso 2, Constancia de CUIT): cada N minutos consulta al padrón de ARCA los
 *     contratos de constancia de CUIT sin validar, archiva y avanza. Ver `validacionCuit.ts`.
 *
 * Viven en `Tenant.integrations.automatizacionesContratacion.<clave>` con lo mismo que las otras tareas
 * del servidor: si está activa, cada cuánto, cuándo corrió por última vez (que además hace de candado
 * entre procesos), qué hizo y el último error. Puro: sin base, para probar con node:test.
 */
export type ClaveAutomatizacion = "generacionDocumentos" | "validacionCuit";
export declare const CLAVES: ClaveAutomatizacion[];
export interface ConfigAutomatizacion {
    activa: boolean;
    cadaMinutos: number;
}
/** Lo que se guarda en el tenant (todo opcional: un tenant de antes no tiene nada). */
export interface AutomatizacionGuardada extends Partial<ConfigAutomatizacion> {
    ultimaCorridaAt?: Date | string | null;
    ultimaCorrida?: any;
    ultimoError?: string | null;
}
export declare const BASE = "integrations.automatizacionesContratacion";
/** Las frecuencias que ofrece la pantalla (minutos). */
export declare const FRECUENCIAS_MINUTOS: readonly [10, 15, 30, 60, 120, 240, 480, 720, 1440];
export declare const POR_DEFECTO: Record<ClaveAutomatizacion, ConfigAutomatizacion>;
export declare const TITULO: Record<ClaveAutomatizacion, string>;
/** La configuración efectiva: lo guardado completado con lo de siempre. */
export declare function configDe(guardado: AutomatizacionGuardada | null | undefined, clave: ClaveAutomatizacion): ConfigAutomatizacion;
/** Lo que llega de la pantalla, validado. Sólo cambian los campos que vienen. */
export declare function validarCambios(body: any): {
    ok: true;
    cambios: Partial<ConfigAutomatizacion>;
} | {
    ok: false;
    error: string;
};
/** ¿Le toca correr? Activa y pasó la frecuencia desde la última corrida (o nunca corrió). */
export declare function leToca(cfg: ConfigAutomatizacion, ultimaCorridaAt: Date | string | null | undefined, ahora?: Date): boolean;
/** Cuándo vuelve a correr, para la pantalla. `null` si está apagada. */
export declare function proximaCorrida(cfg: ConfigAutomatizacion, ultimaCorridaAt: Date | string | null | undefined, ahora?: Date): Date | null;
/** Un contrato nombrado en el resumen de una corrida: quién, dónde y qué pasó. */
export interface ItemDeCorrida {
    persona: string;
    proyecto: string;
    motivo: string;
}
