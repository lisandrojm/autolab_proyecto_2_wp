/**
 * VALIDACIÓN AUTOMÁTICA DEL CUIT EN ARCA (paso 2 › Constancia de CUIT, 27/11/2026): lo que hace el
 * botón «Validar Masivo» de Trámite impositivo, sin que nadie lo apriete.
 *
 * Una corrida toma, del tenant, cada contrato que está en un estado impositivo de constancia de CUIT y
 * decide por su validación guardada:
 *   · nunca consultado, o activo pero sin archivar → se consulta al padrón (`consultarPadronDeContratos`:
 *     guarda el resultado, archiva el JSON si da activo y avanza a «Envío de documentación»);
 *   · activo y archivado pero todavía ahí → se avanza (`avanzarConstanciasArchivadas`);
 *   · inactivo o desconocido → se vuelve a consultar UNA vez por día: ARCA no cambia de un minuto al otro
 *     y el webservice no es para golpearlo;
 *   · sin CUIT válido, o sin empleadora (sin ella el comprobante no se puede archivar) → queda para una
 *     persona, y se nombra en el resumen.
 */
import { Types } from "mongoose";
import { ItemDeCorrida } from "./config.js";
export interface ResumenValidacionCuit {
    fecha: Date;
    /** Contratos en Constancia de CUIT que se miraron. */
    revisados: number;
    /** CUITs consultados al padrón en esta corrida. */
    consultados: number;
    activos: number;
    inactivos: number;
    desconocidos: number;
    /** Pasaron a «Envío de documentación» (o a Contratos, si su tipo no firma nada). */
    avanzados: number;
    /** Inactivos o desconocidos consultados hace menos de un día: se esperan. */
    esperando: number;
    /** Sin CUIT válido o sin empleadora: quedan para una persona. */
    paraResolver: ItemDeCorrida[];
    errores: ItemDeCorrida[];
}
export declare function correrValidacionCuit(tenantObjectId: Types.ObjectId, log?: (l: string) => void): Promise<ResumenValidacionCuit>;
