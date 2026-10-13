import { Types } from "mongoose";
import { type OrigenRelacionArca } from "../../models/RelacionLaboralArca.js";
import type { RelacionLaboralTxt } from "../../compartido/arca/relacionesLaboralesTxt.js";
import { type ModoCarga } from "../../utils/versionRelacionArca.js";
import { type AntiguedadArcaResumen } from "../../compartido/antiguedadTexto.js";
/**
 * LA PERSISTENCIA DE LAS RELACIONES LABORALES DE ARCA Y DE LA ANTIGÜEDAD. Lo único que toca Mongo
 * en este módulo; las decisiones (qué versión gana, cuánto suma la antigüedad) están en
 * `utils/versionRelacionArca.ts` y `utils/antiguedadArca.ts`, puras y con tests.
 *
 * `guardarRelaciones` es idempotente: escribe por la clave natural (tenant, empleadora, CUIL,
 * fecha de inicio), no escribe lo que ya está igual, y correrlo N veces sobre los mismos TXT
 * deja la base igual que una vez. Se lee lo existente en UNA consulta por lote y se escribe con
 * UN `bulkWrite`: con ~90 KB/s desde Atlas (ver memoria «Latencia = bytes»), ida y vuelta por
 * fila serían veinte minutos para el seed.
 */
/** "2021-03-31" → medianoche UTC de ese día. Las fechas del TXT no tienen hora. */
export declare const fechaUtc: (iso: string) => Date;
export declare const isoDe: (d: Date | null | undefined) => string | null;
export interface ResultadoGuardado {
    nuevas: number;
    actualizadas: number;
    /** De las actualizadas, cuántas cerraron una relación que estaba abierta. */
    bajasAplicadas: number;
    sinCambios: number;
    /** Versiones que llegaron pero perdieron contra la guardada (sólo en seed). */
    conservadas: number;
    /** Los CUIL cuyas filas se escribieron: son los que hay que recalcular. */
    cuilsTocados: Set<string>;
}
export declare function guardarRelaciones(o: {
    tenantId: Types.ObjectId;
    empleadoraCuit: string;
    empleadoraCompanyId?: Types.ObjectId | null;
    filas: RelacionLaboralTxt[];
    origen: OrigenRelacionArca;
    modo: ModoCarga;
    ahora?: Date;
    /** Cuenta qué haría, sin escribir. */
    dryRun?: boolean;
}): Promise<ResultadoGuardado>;
/**
 * Recalcula `AntiguedadArca` para esos CUIL (una fila por empleadora + la global), con el «hoy» que
 * se le pasa. Devuelve cuántas filas escribió. Si un CUIL ya no tiene relaciones, borra sus filas.
 */
export declare function recalcularAntiguedad(tenantId: Types.ObjectId, cuils: Iterable<string>, hoy: string, dryRun?: boolean): Promise<number>;
/**
 * La antigüedad según ARCA de un conjunto de personas, por CUIL (fila global: todas las empleadoras),
 * lista para viajar a una pantalla. Quien no está en ARCA no aparece en el mapa. Una sola consulta.
 */
export declare function antiguedadArcaPorCuil(tenantId: Types.ObjectId, cuils: Iterable<string>): Promise<Map<string, AntiguedadArcaResumen>>;
/**
 * Los CUIL con alguna relación abierta: su antigüedad crece un día por día, así que el sync diario
 * los recalcula aunque ARCA no haya informado nada nuevo de ellos.
 */
export declare function cuilsConRelacionAbierta(tenantId: Types.ObjectId): Promise<string[]>;
