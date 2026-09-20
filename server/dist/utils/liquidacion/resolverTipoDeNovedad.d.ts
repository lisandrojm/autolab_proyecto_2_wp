import { Types } from "mongoose";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUE NO ENTRE UN RENGLÓN MÁS SIN `typeId`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `attendance.typeId` guarda de qué TIPO es cada renglón, por id. Antes el tipo viajaba sólo como
 * texto en `absenceReason`, y por eso hoy hay 7.938 renglones sin id: cuando alguien renombra un
 * tipo en el ABM, todos los partes viejos quedan hablando de algo que ya no se llama así.
 *
 * Backfillear los viejos no alcanza. Si el alta sigue guardando sólo el texto, en tres semanas hay
 * otros ocho mil. Por eso esto corre EN CADA ESCRITURA, antes de guardar:
 *
 *   · Si el renglón ya trae `typeId`, se valida que sea un tipo real del tenant.
 *   · Si no lo trae pero trae `absenceReason`, se resuelve por coincidencia EXACTA del nombre.
 *   · Si no se puede resolver, se RECHAZA el guardado con el motivo. No se guarda a medias.
 *
 * Los renglones sin motivo —los presentes— no necesitan tipo y pasan sin más.
 *
 * SE RESUELVE EN EL SERVER Y NO SE EXIGE AL CLIENTE porque la app mobile manda hoy sólo el texto, y
 * exigirle el id obligaría a esperar una versión nueva en los teléfonos para poder cargar un parte.
 */
export interface ResultadoDeResolucion {
    /** Los renglones con `typeId` puesto donde hacía falta. */
    attendance: any[];
    /** Los motivos que no se pudieron resolver, con cuántos renglones cada uno. */
    sinResolver: {
        motivo: string;
        renglones: number;
    }[];
}
export declare function resolverTiposDeNovedad(tenantId: Types.ObjectId, attendance: any[]): Promise<ResultadoDeResolucion>;
