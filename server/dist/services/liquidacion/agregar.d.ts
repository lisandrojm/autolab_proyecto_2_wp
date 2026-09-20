import type { Linea } from "./codificar.js";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ETAPA 3 — SUMAR EL PERÍODO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Memosoft quiere UNA fila por (legajo, concepto) en el mes, no una por día. Veinte días de jornal
 * son una fila con 20, no veinte filas con 1.
 *
 * CADA FILA GUARDA DE QUÉ EVENTOS SALIÓ. No es un extra: es lo único que permite contestar "¿por
 * qué acá dice 17 y no 18?" sin volver a correr todo y comparar a ojo. Un número agregado sin sus
 * partes es imposible de auditar, y alguien va a preguntar.
 *
 * ES PURA.
 */
export interface LineaAgregada {
    empresaId: string | null;
    ccCodigo: string | null;
    regimen: string | null;
    legajo: string | null;
    apellidoYNombre: string;
    userId: string;
    conceptoCodigo: string;
    par1: number;
    par2: number;
    /** Los eventos que componen este número, en orden de fecha. */
    eventIds: string[];
    /** Cuántos días distintos lo componen. Sirve para ver de una si un 22 salió de 22 días o de 3. */
    dias: number;
    origenes: string[];
}
export declare function agregarLineas(lineas: Linea[]): LineaAgregada[];
/**
 * EN QUÉ HOJA DEL ARCHIVO VA CADA FILA.
 *
 * El nombre imita el del archivo que hacen hoy a mano: "2030 CC426 La Nación", "FZERO CC703 JSA",
 * y los jornaleros con su sufijo. Se arma acá y no al serializar para que la agrupación y el nombre
 * no se puedan desincronizar.
 */
export declare function hojaDe(linea: LineaAgregada, nombreEmpresa: string, nombreCC?: string | null): string;
