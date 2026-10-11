import { Types } from "mongoose";
import { type AfipCatalogs } from "../../compartido/arca/afipCompleteness.js";
/**
 * PRESENTACIÓN AUTOMÁTICA DE LAS ALTAS EN ARCA: cada día a las 14 h (hora argentina) se presentan las
 * altas tempranas cuyo contrato EMPIEZA ese día. Si nadie hace nada, cada alta sale sola el día de su
 * alta. Lo que no está completo no se presenta y queda con su motivo en «Presentaciones Automáticas».
 *
 * EL REGISTRO LO ARMA EL MISMO CÓDIGO QUE LA PANTALLA (`compartido/arca`), con los mismos catálogos que
 * carga Contratos (`useCatalogosArca`) y la misma fila que devuelve `contracts-overview`. Después pasa
 * por `arrancarCorridaAltas`, que lo vuelve a cotejar contra la base como a cualquier presentación manual.
 *
 * Sólo contratos creados en WeProdu (Solicitudes o «Agregar miembro»): los importados no se gestionan
 * desde Contratos y no se presentan solos.
 */
export declare const HORA_PRESENTACION = 14;
/** El momento en que la automática presenta el alta de esa fecha. Argentina no tiene horario de verano. */
export declare const momentoDePresentacion: (fecha: string) => Date;
/** Hora argentina actual (0-23), sin depender de la zona del VPS. */
export declare const horaArgentina: (d?: Date) => number;
/** Los catálogos de ARCA tal como los recibe la pantalla (pasados por JSON: ids como texto). */
export declare function catalogosArca(): Promise<AfipCatalogs>;
export interface CandidatoAlta {
    userProjectId: string;
    contractIndex: number;
    userId: string;
    nombre: string;
    cuil: string;
    proyecto: string;
    cliente: string;
    tipoContrato: string;
    fechaAlta: string;
    fechaBaja: string;
    empresa: {
        _id: string;
        razonSocial: string;
    } | null;
    /** Momento en que la automática lo presenta (fecha de alta, 14 h), ISO. */
    momento: string;
    /** Se puede presentar tal como está. */
    presentable: boolean;
    /** Por qué no, si no se puede. */
    motivo: string;
    /** El registro de 85, si está completo. */
    registro: string | null;
}
/**
 * Las altas tempranas pendientes de presentar del tenant, con su registro armado o el motivo por el
 * que no se puede. `desde`/`hasta` acotan por fecha de alta; `soloContrato` busca uno puntual.
 */
export declare function candidatosDeAlta(tenantObjectId: Types.ObjectId, opts?: {
    desde?: string;
    hasta?: string;
    soloContrato?: {
        userProjectId: string;
        contractIndex: number;
    };
}): Promise<CandidatoAlta[]>;
export interface ResultadoEmpresa {
    empresa: string;
    enviados: number;
    enSeco?: boolean;
    error?: string;
}
/**
 * Presenta los candidatos, una corrida por empleadora (en ARCA se entra con el CUIT de cada una), en
 * fila: cada corrida espera a que termine la anterior. Si hay otra corrida de ARCA en curso (una
 * validación de obras sociales, una presentación manual), espera a que se libere.
 */
export declare function presentarCandidatos(o: {
    tenantId: string;
    tenantObjectId: Types.ObjectId;
    usuarioId?: string;
    candidatos: CandidatoAlta[];
    automatica: boolean;
}): Promise<ResultadoEmpresa[]>;
/** La corrida de las 14 h de UN tenant: las altas de hoy. Devuelve el resumen que se guarda. */
export declare function correrPresentacionDelDia(tenantId: string, tenantObjectId: Types.ObjectId): Promise<{
    fecha: string;
    dia: string;
    empresas: ResultadoEmpresa[];
    omitidos: {
        nombre: string;
        cuil: string;
        empresa: string;
        motivo: string;
    }[];
}>;
